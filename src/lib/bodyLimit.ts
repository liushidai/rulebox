/**
 * 请求体约束
 * 在 onRequest 阶段（请求体解析之前）拦截：
 * - 声明 Content-Length 超过上限 → 413
 * - 未声明长度但使用分块传输 → 411
 */

/** 默认请求体上限 1MB */
export const DEFAULT_BODY_LIMIT = 1024 * 1024;

export interface BodyLimitOptions {
  /** 允许的最大请求体字节数，默认 1MB */
  maxSize?: number;
  /** 拒绝请求时的日志回调，由装配层注入 */
  onReject?: (request: Request, status: number) => void;
}

/** 无请求体语义的方法，不受请求体约束影响 */
const BODYLESS_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** 构造 JSON 错误响应 */
function reject(status: number, error: string, code: string): Response {
  return new Response(JSON.stringify({ error, code }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * 创建请求体约束钩子函数
 * 返回的函数直接交给根实例的 onRequest，保证在请求体解析之前执行
 */
export function createBodyLimitHandler(options: BodyLimitOptions = {}) {
  const { maxSize = DEFAULT_BODY_LIMIT, onReject } = options;

  return (ctx: { request: Request }): Response | undefined => {
    const { request } = ctx;

    if (BODYLESS_METHODS.has(request.method)) {
      return undefined;
    }

    const contentLengthHeader = request.headers.get('content-length');

    if (contentLengthHeader !== null) {
      // 非纯数字的长度视为客户端错误，避免用畸形值绕过上限
      if (!/^\d+$/.test(contentLengthHeader.trim())) {
        onReject?.(request, 411);
        return reject(411, 'content-length required', 'LENGTH_REQUIRED');
      }
      const contentLength = Number(contentLengthHeader.trim());
      if (contentLength > maxSize) {
        onReject?.(request, 413);
        return reject(413, 'payload too large', 'PAYLOAD_TOO_LARGE');
      }
      return undefined;
    }

    // 未声明长度且使用分块传输：无法在解析前确认大小，直接拒绝
    // 注意：无请求体的 DELETE 不带 Content-Length 也不带 Transfer-Encoding，不受影响
    if (request.headers.get('transfer-encoding') !== null) {
      onReject?.(request, 411);
      return reject(411, 'content-length required', 'LENGTH_REQUIRED');
    }

    return undefined;
  };
}
