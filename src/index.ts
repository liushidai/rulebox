/**
 * RuleBox - mihomo/clash rule-providers YAML 托管服务
 */

import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { swagger } from '@elysiajs/swagger';

import { loadConfig } from './config';
import { ConfigStore } from './lib/store';
import { createAuth } from './modules/auth';
import { createYamlModule } from './modules/yaml';
import { createConfigsModule } from './modules/configs';

// ---- 加载配置 ----
let appConfig;
try {
  appConfig = loadConfig();
} catch (err: any) {
  console.error(`❌ 启动失败: ${err.message}`);
  process.exit(1);
}

// ---- 初始化数据存储 ----
const store = new ConfigStore(appConfig.DATA_DIR);
store.loadAll();
console.log(`📦 已加载 ${store.listNames().length} 个配置集`);

// ---- 创建鉴权模块 ----
const auth = createAuth(appConfig);

// ---- 创建路由模块 ----
const yamlModule = createYamlModule({ store, auth });
const configsModule = createConfigsModule({ store, auth });

// ---- 组装应用 ----
const app = new Elysia()
  // CORS: 允许所有来源
  .use(cors())

  // Swagger: API 文档
  .use(
    swagger({
      path: '/swagger',
      documentation: {
        info: {
          title: 'RuleBox API',
          version: '1.0.50',
          description: 'mihomo/clash rule-providers YAML 托管服务',
        },
      },
    }),
  )

  // 请求日志
  .onAfterHandle(({ request, set }) => {
    const time = new Date().toISOString();
    const resStatus = typeof set.status === 'number' ? set.status : 200;
    console.log(`${time} ${request.method} ${request.url} ${resStatus}`);
  })

  // 全局错误处理
  .onError(({ error, code, set }) => {
    switch (code) {
      case 'VALIDATION':
        set.status = 400;
        return {
          error: 'invalid request body',
          code: 'VALIDATION_ERROR',
        };
      case 'NOT_FOUND':
        set.status = 404;
        return {
          error: 'not found',
          code: 'ROUTE_NOT_FOUND',
        };
      default:
        set.status = 500;
        console.error(`${new Date().toISOString()} ERROR:`, error);
        return {
          error: 'internal server error',
          code: 'INTERNAL_ERROR',
        };
    }
  })

  // 注册路由模块
  .use(yamlModule)
  .use(configsModule)

  // 健康检查
  .get('/health', () => ({ status: 'ok' }));

// ---- 启动服务 ----
app.listen(appConfig.PORT);

console.log(
  `🦊 RuleBox is running at http://localhost:${appConfig.PORT}`,
);
console.log(
  `📖 Swagger docs at http://localhost:${appConfig.PORT}/swagger`,
);
