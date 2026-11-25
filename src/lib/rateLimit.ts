/**
 * 按客户端 IP 的请求限流
 * 以全局 onRequest 钩子运行，在解析请求体与鉴权之前快速拒绝超限请求
 */

/** 限流可调参数（默认值仅供生产使用，测试可调小） */
export interface RateLimitOptions {
  /** 时间窗口（毫秒），默认 15000 */
  windowMs?: number;
  /** 每个窗口内允许的受计数请求数，默认 100 */
  maxRequests?: number;
  /** 同时跟踪的客户端 IP 上限，默认 1000 */
  maxKeys?: number;
  /** 是否采信 X-Forwarded-For 的最后一项，默认 false */
  trustProxy?: boolean;
  /** 当前时间函数，仅用于测试注入 */
  now?: () => number;
  /** 客户端 IP 解析函数，仅用于测试注入或特殊部署环境 */
  clientIP?: (request: Request, server: ServerLike | null) => string;
  /** 拒绝请求时的日志回调，由装配层注入 */
  onReject?: (request: Request, status: number) => void;
}

/** 仅声明本模块用到的服务端能力 */
interface ServerLike {
  requestIP?: (request: Request) => { address: string } | null;
}

/** 单个 IP 的请求记录 */
interface RateLimitRecord {
  count: number;
  windowStart: number;
}

/**
 * 将 IPv4 映射的 IPv6 地址归一化为 IPv4
 * 例如 ::ffff:1.2.3.4 → 1.2.3.4
 */
export function normalizeAddress(address: string): string {
  const trimmed = address.trim();
  if (trimmed.toLowerCase().startsWith('::ffff:')) {
    const ipv4 = trimmed.slice('::ffff:'.length);
    // 避免把 ::ffff:0:0 之类非点分格式误当作 IPv4
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ipv4)) {
      return ipv4;
    }
  }
  return trimmed;
}

/**
 * 解析客户端 IP
 * 默认使用连接的对端地址；仅在 trustProxy 时采信 X-Forwarded-For 的最后一项
 */
export function resolveClientIP(
  request: Request,
  server: ServerLike | null,
  trustProxy: boolean,
): string {
  const connectionIP = server?.requestIP?.(request)?.address ?? 'unknown';

  if (!trustProxy) {
    return normalizeAddress(connectionIP);
  }

  const forwarded = request.headers.get('x-forwarded-for');
  if (!forwarded) {
    return normalizeAddress(connectionIP);
  }

  const parts = forwarded
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length === 0) {
    return normalizeAddress(connectionIP);
  }

  // 最后一项由最近一层反向代理写入，客户端无法伪造
  return normalizeAddress(parts[parts.length - 1]);
}

/** 判断请求是否豁免限流（健康检查、管理页面与其静态资源、CORS 预检） */
export function isRateLimitExempt(method: string, path: string): boolean {
  if (method === 'OPTIONS') return true;
  if (method !== 'GET') return false;
  if (path === '/health' || path === '/') return true;
  return path.startsWith('/assets/');
}

/** 构造限流拒绝响应 */
function tooManyRequests(retryAfterSeconds: number): Response {
  return new Response(
    JSON.stringify({ error: 'too many requests', code: 'RATE_LIMITED' }),
    {
      status: 429,
      headers: {
        'content-type': 'application/json',
        'retry-after': String(retryAfterSeconds),
      },
    },
  );
}

/**
 * 创建限流钩子函数
 * 返回的函数直接交给根实例的 onRequest，从而作用于全部路由
 */
export function createRateLimitHandler(options: RateLimitOptions = {}) {
  const {
    windowMs = 15000,
    maxRequests = 100,
    maxKeys = 1000,
    trustProxy = false,
    now = Date.now,
    clientIP,
    onReject,
  } = options;

  // 跟踪上限至少为 1，避免异常配置导致死循环
  const keyLimit = Math.max(1, maxKeys);

  // Map 的迭代顺序即插入/访问顺序，用于 LRU 淘汰
  const records = new Map<string, RateLimitRecord>();

  /** 淘汰最久未被访问的条目，直到可以插入新键 */
  function evictLRU() {
    while (records.size >= keyLimit) {
      const oldestKey = records.keys().next().value;
      if (oldestKey === undefined) return;
      records.delete(oldestKey);
    }
  }

  return (ctx: {
    request: Request;
    server: ServerLike | null;
  }): Response | undefined => {
    const { request } = ctx;
    const path = new URL(request.url).pathname;

    if (isRateLimitExempt(request.method, path)) {
      return undefined;
    }

    const currentTime = now();
    const ip = clientIP
      ? clientIP(request, ctx.server as ServerLike | null)
      : resolveClientIP(request, ctx.server as ServerLike | null, trustProxy);

    let record = records.get(ip);

    // 记录不存在或窗口已结束：重置窗口，起始时间即该 IP 在窗口内的首次请求时间
    if (!record || currentTime - record.windowStart >= windowMs) {
      if (record) {
        // 已有键先移除，再按要求重新插入，维持 LRU 顺序
        records.delete(ip);
      }
      evictLRU();
      record = { count: 0, windowStart: currentTime };
      records.set(ip, record);
    } else {
      // 命中已有键：移到最新位置
      records.delete(ip);
      records.set(ip, record);
    }

    record.count++;

    if (record.count > maxRequests) {
      const remainingMs = record.windowStart + windowMs - currentTime;
      const retryAfter = Math.max(1, Math.ceil(remainingMs / 1000));
      onReject?.(request, 429);
      return tooManyRequests(retryAfter);
    }

    return undefined;
  };
}
