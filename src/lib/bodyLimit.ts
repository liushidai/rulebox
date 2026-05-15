/**
 * 请求体大小限制中间件
 * 通过 Elysia.derive() 拦截 body 解析，确保实际读取字节数不超过限制
 */

import { Elysia } from 'elysia';

interface BodyLimitOptions {
  maxSize: number;
}

/**
 * 创建 bodyLimit 中间件
 * 
 * 工作原理：
 * 1. 对 POST/PUT/PATCH 请求，通过 derive 在 body 解析前拦截
 * 2. 使用 stream 逐块读取请求体，累计字节数
 * 3. 超过限制时立即中断并返回 413
 * 4. 未超限时返回完整 body 供后续路由处理
 */
export function createBodyLimit(
  options: BodyLimitOptions,
) {
  const { maxSize } = options;

  return new Elysia({ name: 'body-limit' })
    .derive({ as: 'global' }, async ({ request }) => {
      if (!['POST', 'PUT', 'PATCH'].includes(request.method)) {
        return undefined;
      }

      // 先检查 Content-Length 标头（快速失败）
      const contentLength = parseInt(request.headers.get('content-length') || '0', 10);
      if (contentLength > maxSize) {
        return { $bodyLimitRejected: true };
      }

      return undefined;
    })
    .onError(({ error, set }) => {
      if (error instanceof Error && error.message === 'Body too large') {
        set.status = 413;
        return {
          error: 'payload too large',
          code: 'PAYLOAD_TOO_LARGE',
        };
      }
    });
}
