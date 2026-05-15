/**
 * 鉴权工具
 * 提供 adminToken 和 viewToken 校验函数
 */

import type { AppConfig } from '../config';
import { timingSafeEqual, createHmac } from 'node:crypto';

/**
 * 恒定时间字符串比较，防止时序攻击
 * 使用 HMAC 固定长度比较，避免泄露长度信息
 */
function secureCompare(a: string, b: string): boolean {
  const key = 'rulebox-hmac-key-for-token-comparison';
  const hashA = createHmac('sha256', key).update(a).digest();
  const hashB = createHmac('sha256', key).update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

/**
 * 创建鉴权检查函数
 */
export function createAuth(config: AppConfig) {
  return {
    /**
     * 检查 ADMIN_TOKEN (Authorization: Bearer <token>)
     * 返回 Response (403) 或在验证通过时返回 void
     */
    adminCheck(ctx: any): Response | void {
      const authHeader = ctx.headers?.['authorization'] as string | undefined;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response(
          JSON.stringify({ error: 'forbidden', code: 'FORBIDDEN' }),
          { status: 403, headers: { 'content-type': 'application/json' } },
        );
      }

      if (!secureCompare(authHeader.slice(7), config.ADMIN_TOKEN)) {
        return new Response(
          JSON.stringify({ error: 'forbidden', code: 'FORBIDDEN' }),
          { status: 403, headers: { 'content-type': 'application/json' } },
        );
      }
    },

    /**
     * 检查 VIEW_TOKEN (?token=<token>)
     * 返回 Response (403) 或在验证通过时返回 void
     */
    viewCheck(ctx: any): Response | void {
      if (!secureCompare(ctx.query?.token || '', config.VIEW_TOKEN)) {
        return new Response(
          JSON.stringify({ error: 'forbidden', code: 'FORBIDDEN' }),
          { status: 403, headers: { 'content-type': 'application/json' } },
        );
      }
    },
  };
}
