/**
 * RuleBox 应用装配
 * 生产入口与测试共用同一份中间件装配，避免测试与生产行为漂移
 *
 * 装配顺序：CORS → 请求守卫（限流、请求体约束，均为 onRequest）
 *          → 请求日志（mapResponse）→ 错误处理 → 路由模块 → /health
 */

import { Elysia, ElysiaCustomStatusResponse } from 'elysia';
import { cors } from '@elysiajs/cors';
import { swagger } from '@elysiajs/swagger';

import type { AppConfig } from './config';
import type { ConfigStore } from './lib/store';
import { createAuth } from './modules/auth';
import { createYamlModule } from './modules/yaml';
import { createConfigsModule } from './modules/configs';
import { createWebModule } from './modules/web';
import { createRateLimitHandler, type RateLimitOptions } from './lib/rateLimit';
import { createBodyLimitHandler } from './lib/bodyLimit';

export interface BuildAppOptions {
  /** 应用配置（含 TRUST_PROXY） */
  config: AppConfig;
  /** 已初始化并加载完成的存储 */
  store: ConfigStore;
  /** 限流参数，仅供测试调小；生产省略即取默认值 */
  rateLimit?: RateLimitOptions;
  /** 是否挂载 Swagger；省略时沿用 ENABLE_SWAGGER=true 的生产行为 */
  enableSwagger?: boolean;
}

/**
 * 输出一行请求日志
 * 只记录路径，不记录查询串（避免 VIEW_TOKEN 进入日志）
 */
function logRequest(
  request: Request,
  status: number | string,
  startedAt: number,
): void {
  const timestamp = new Date().toISOString();
  const path = new URL(request.url).pathname;
  const duration = Math.max(0, Date.now() - startedAt);
  console.log(
    `${timestamp} ${request.method} ${path} ${status} ${duration}ms`,
  );
}

/**
 * 从响应中解析真实状态码
 * Response 取 status；ElysiaCustomStatusResponse 取 code；其余取 set.status
 */
function resolveResponseStatus(
  response: unknown,
  setStatus: number | string | undefined,
): number | string {
  if (response instanceof Response) {
    return response.status;
  }
  if (response instanceof ElysiaCustomStatusResponse) {
    return response.code as number | string;
  }
  if (typeof setStatus === 'number') {
    return setStatus;
  }
  return 200;
}

/**
 * 构造应用实例
 */
export function buildApp({
  config,
  store,
  rateLimit,
  enableSwagger = process.env.ENABLE_SWAGGER === 'true',
}: BuildAppOptions) {
  const auth = createAuth(config);

  // 记录每个请求的起始时间，用于计算耗时（每个应用实例独立）
  const requestStartedAt = new WeakMap<Request, number>();

  // 守卫拒绝时不会经过 mapResponse，需自行记录日志
  const logRejection = (request: Request, status: number) => {
    logRequest(request, status, requestStartedAt.get(request) ?? Date.now());
  };

  const rateLimitHandler = createRateLimitHandler({
    ...rateLimit,
    trustProxy: rateLimit?.trustProxy ?? config.TRUST_PROXY,
    // 守卫层统一接管拒绝日志；调用方可另加自己的回调
    onReject: (request, status) => {
      logRejection(request, status);
      rateLimit?.onReject?.(request, status);
    },
  });

  const bodyLimitHandler = createBodyLimitHandler({
    onReject: logRejection,
  });

  const app = new Elysia()

    // 1. CORS：允许所有来源，不携带凭据（API 用请求头 Token 鉴权）
    .use(
      cors({
        origin: '*',
        credentials: false,
        // 预检必须放行 Authorization 与 Content-Type
        allowedHeaders: ['authorization', 'content-type'],
        // 只暴露实际用到的响应头，避免回显请求头列表
        exposeHeaders: ['retry-after'],
      }),
    )

    // 2. 计时（必须早于守卫，守卫拒绝时也要能算出耗时）
    .onRequest(({ request }) => {
      requestStartedAt.set(request, Date.now());
    })

    // 3. 请求守卫：限流 → 请求体约束，均在解析与鉴权之前
    .onRequest((ctx) => rateLimitHandler({ request: ctx.request, server: ctx.server }))
    .onRequest((ctx) => bodyLimitHandler({ request: ctx.request }))

    // 4. 请求日志：拿到真实状态码，原样返回响应
    .mapResponse(({ request, response, set }: any) => {
      logRequest(
        request,
        resolveResponseStatus(response, set.status),
        requestStartedAt.get(request) ?? Date.now(),
      );
      return response;
    })

    // 5. 全局错误处理
    .onError(({ error, code, set }) => {
      switch (code) {
        case 'VALIDATION':
          set.status = 400;
          return {
            error: 'invalid request body',
            code: 'VALIDATION_ERROR',
          };
        case 'PARSE':
          // 无法解析的请求体属于客户端错误
          set.status = 400;
          return {
            error: 'malformed request body',
            code: 'PARSE_ERROR',
          };
        case 'NOT_FOUND':
          set.status = 404;
          return {
            error: 'not found',
            code: 'ROUTE_NOT_FOUND',
          };
        default:
          // 处理 store 层抛出的业务错误（如 INVALID_CONFIG_NAME）
          if (error instanceof Error && error.message === 'INVALID_CONFIG_NAME') {
            set.status = 400;
            return {
              error: 'invalid config name',
              code: 'INVALID_CONFIG_NAME',
            };
          }
          set.status = 500;
          console.error(`${new Date().toISOString()} ERROR:`, error);
          return {
            error: 'internal server error',
            code: 'INTERNAL_ERROR',
          };
      }
    })

    // 6. Swagger：API 文档（默认关闭）
    .use(
      enableSwagger
        ? swagger({
            path: '/swagger',
            documentation: {
              info: {
                title: 'RuleBox API',
                version: '1.0.50',
                description: 'mihomo/clash rule-providers YAML 托管服务',
              },
            },
          })
        : undefined,
    )

    // 7. 路由模块
    // 页面托管必须先于 YAML 路由注册：YAML 的 GET /:fileName 会截走所有单段路径
    .use(createWebModule())
    .use(createYamlModule({ store, auth }))
    .use(
      createConfigsModule({
        store,
        auth,
        viewToken: config.VIEW_TOKEN,
      }),
    )

    // 8. 健康检查
    .get('/health', () => ({ status: 'ok' }));

  return app;
}
