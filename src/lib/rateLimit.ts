import { Elysia } from 'elysia';

/** 限流配置参数 */
interface RateLimitOptions {
  windowMs: number;     // 时间窗口（毫秒）
  maxRequests: number;  // 每个窗口内最大请求数
  maxKeys: number;      // LRU 最大键数量
}

/** 单个 IP 的请求记录 */
interface RateLimitRecord {
  count: number;       // 当前窗口内请求次数
  windowStart: number; // 时间窗口起始时间
}

/**
 * 从请求上下文中提取客户端 IP 地址
 */
function extractClientIP(ctx: any): string {
  // 优先从常见代理/转发 header 中提取
  const headers = ctx.request?.headers;
  if (headers) {
    // x-forwarded-for 可能包含多个 IP，取第一个
    const xForwardedFor = headers.get('x-forwarded-for');
    if (xForwardedFor) {
      return xForwardedFor.split(',')[0].trim();
    }
    const xRealIP = headers.get('x-real-ip');
    if (xRealIP) {
      return xRealIP;
    }
    const cfConnectingIP = headers.get('cf-connecting-ip');
    if (cfConnectingIP) {
      return cfConnectingIP;
    }
  }

  // 尝试从 ctx.store 中获取
  if (ctx.store?.clientAddress) {
    return ctx.store.clientAddress;
  }
  if (ctx.store?.ip) {
    return ctx.store.ip;
  }

  // 兜底
  return 'unknown';
}

/**
 * 创建速率限制中间件
 */
export function createRateLimit(
  options: Partial<RateLimitOptions> = {},
) {
  const {
    windowMs = 15000,
    maxRequests = 100,
    maxKeys = 1000,
  } = options;

  // 使用 Map 存储限流数据（key: IP, value: RateLimitRecord）
  const rateLimitMap = new Map<string, RateLimitRecord>();
  // 使用数组维护插入顺序，用于 LRU 淘汰
  const keyOrder: string[] = [];

  /**
   * LRU 淘汰：当 Map 超过 maxKeys 时，移除最老的条目
   */
  function evictLRU() {
    while (rateLimitMap.size >= maxKeys && keyOrder.length > 0) {
      const oldestKey = keyOrder.shift()!;
      rateLimitMap.delete(oldestKey);
    }
  }

  /**
   * 更新键的访问顺序（移到最新位置）
   */
  function touchKey(key: string) {
    const idx = keyOrder.indexOf(key);
    if (idx !== -1) {
      keyOrder.splice(idx, 1);
    }
    keyOrder.push(key);
  }

  return new Elysia({ name: 'rate-limit' }).onBeforeHandle((ctx) => {
    // 排除健康检查和 Swagger 等公开端点
    const url = new URL(ctx.request.url);
    const path = url.pathname;
    if (path === '/health' || path.startsWith('/swagger')) {
      return undefined;
    }

    const now = Date.now();
    const ip = extractClientIP(ctx);

    let record = rateLimitMap.get(ip);

    // 如果记录不存在或已过期，创建新记录
    if (!record || now - record.windowStart >= windowMs) {
      record = { count: 0, windowStart: now };

      // 新键需要检查 LRU 淘汰
      if (!rateLimitMap.has(ip)) {
        evictLRU();
        keyOrder.push(ip);
      }
    }

    // 更新访问顺序
    touchKey(ip);

    record.count++;

    // 检查是否超过限制
    if (record.count > maxRequests) {
      return new Response(
        JSON.stringify({
          error: 'too many requests',
          code: 'RATE_LIMITED',
        }),
        {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    // 未超限，继续处理
    return undefined;
  });
}
