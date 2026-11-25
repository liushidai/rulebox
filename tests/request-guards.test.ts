/**
 * 请求守卫测试：CORS、限流、请求体约束
 * 通过 buildApp() 构造与生产一致的装配，验证本地正常边界
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { buildApp } from '../src/app';
import { ConfigIndex } from '../src/lib/index';
import { ConfigStore } from '../src/lib/store';
import type { AppConfig } from '../src/config';
import type { RateLimitOptions } from '../src/lib/rateLimit';

const ADMIN_TOKEN = 'guard-admin-token';
const VIEW_TOKEN = 'guard-view-token';

interface GuardFixtureOptions {
  trustProxy?: boolean;
  rateLimit?: RateLimitOptions;
}

/**
 * 本地 fixture：构造应用并提供可控客户端 IP 的请求辅助
 * 通过伪造 server.requestIP 模拟不同连接来源
 */
function createGuardFixture(options: GuardFixtureOptions = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'rulebox-guard-'));
  const config: AppConfig = {
    VIEW_TOKEN,
    ADMIN_TOKEN,
    PORT: 0,
    DATA_DIR: dataDir,
    TRUST_PROXY: options.trustProxy ?? false,
  };
  const index = new ConfigIndex(dataDir);
  index.load();
  const store = new ConfigStore(dataDir, index);
  store.loadAll();

  const app = buildApp({
    config,
    store,
    rateLimit: options.rateLimit,
  }) as any;

  // 模拟连接来源地址；测试中可随时切换，模拟不同客户端
  let currentIP = '203.0.113.10';
  app.server = {
    requestIP: () => ({ address: currentIP, family: 'IPv4', port: 12345 }),
  };

  const adminHeaders = () => ({ Authorization: `Bearer ${ADMIN_TOKEN}` });

  async function request(
    method: string,
    path: string,
    init: {
      headers?: Record<string, string>;
      body?: unknown;
      query?: Record<string, string>;
      rawBody?: string;
    } = {},
  ) {
    const url = new URL(`http://localhost${path}`);
    for (const [key, value] of Object.entries(init.query ?? {})) {
      url.searchParams.set(key, value);
    }

    const headers = new Headers(init.headers);
    const requestInit: RequestInit = { method, headers };

    if (init.rawBody !== undefined) {
      requestInit.body = init.rawBody;
    } else if (init.body !== undefined) {
      requestInit.body = JSON.stringify(init.body);
      if (!headers.has('content-type')) {
        headers.set('content-type', 'application/json');
      }
    }

    const response = await app.handle(new Request(url, requestInit));
    const text = await response.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // YAML 等非 JSON 响应通过 text 读取
    }

    return {
      status: response.status,
      headers: response.headers,
      body,
      text,
    };
  }

  return {
    app,
    store,
    dataDir,
    request,
    adminHeaders,
    setIP(ip: string) {
      currentIP = ip;
    },
    cleanup: () => rmSync(dataDir, { recursive: true, force: true }),
  };
}

type GuardFixture = ReturnType<typeof createGuardFixture>;

let fixture: GuardFixture | undefined;

afterEach(() => {
  fixture?.cleanup();
  fixture = undefined;
});

describe('CORS', () => {
  test('跨域请求响应包含 Access-Control-Allow-Origin: *', async () => {
    fixture = createGuardFixture();
    const res = await fixture.request('GET', '/health', {
      headers: { Origin: 'https://example.com' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  test('预检返回 204，并放行 authorization 与 content-type 请求头', async () => {
    fixture = createGuardFixture();
    const res = await fixture.request('OPTIONS', '/api/configs', {
      headers: {
        Origin: 'https://example.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    });

    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const allowed = (res.headers.get('access-control-allow-headers') ?? '').toLowerCase();
    expect(allowed).toContain('authorization');
    expect(allowed).toContain('content-type');
  });

  test('不带 Token 的预检不是 403', async () => {
    fixture = createGuardFixture();
    const res = await fixture.request('OPTIONS', '/api/configs', {
      headers: {
        Origin: 'https://example.com',
        'Access-Control-Request-Method': 'GET',
      },
    });
    expect(res.status).toBe(204);
  });
});

describe('限流', () => {
  test('默认阈值下第 101 个受计数请求返回 429', async () => {
    fixture = createGuardFixture();
    for (let i = 0; i < 100; i++) {
      const res = await fixture.request('GET', '/api/configs');
      expect(res.status).toBe(403);
    }

    const limited = await fixture.request('GET', '/api/configs');
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({
      error: 'too many requests',
      code: 'RATE_LIMITED',
    });
    expect(limited.headers.get('retry-after')).not.toBeNull();
  });

  test('不同客户端 IP 互不影响', async () => {
    fixture = createGuardFixture({ rateLimit: { maxRequests: 1 } });

    fixture.setIP('203.0.113.1');
    expect((await fixture.request('GET', '/api/configs')).status).toBe(403);
    expect((await fixture.request('GET', '/api/configs')).status).toBe(429);

    fixture.setIP('203.0.113.2');
    expect((await fixture.request('GET', '/api/configs')).status).toBe(403);
  });

  test('未启用可信代理时伪造 X-Forwarded-For 无效', async () => {
    fixture = createGuardFixture({
      trustProxy: false,
      rateLimit: { maxRequests: 1 },
    });

    expect((await fixture.request('GET', '/api/configs')).status).toBe(403);
    const spoofed = await fixture.request('GET', '/api/configs', {
      headers: { 'X-Forwarded-For': '9.9.9.9' },
    });
    expect(spoofed.status).toBe(429);
  });

  test('启用可信代理时按最后一项分桶，伪造首项无效', async () => {
    fixture = createGuardFixture({
      trustProxy: true,
      rateLimit: { maxRequests: 1 },
    });

    expect(
      (
        await fixture.request('GET', '/api/configs', {
          headers: { 'X-Forwarded-For': '10.0.0.1, 10.0.0.2' },
        })
      ).status,
    ).toBe(403);

    // 首项不同但最后一项相同，属于同一桶
    expect(
      (
        await fixture.request('GET', '/api/configs', {
          headers: { 'X-Forwarded-For': '8.8.8.8, 10.0.0.2' },
        })
      ).status,
    ).toBe(429);

    // 另一组转发头独立计数
    expect(
      (
        await fixture.request('GET', '/api/configs', {
          headers: { 'X-Forwarded-For': '10.0.0.3, 10.0.0.4' },
        })
      ).status,
    ).toBe(403);
  });

  test('启用可信代理但缺少转发头时回退为连接地址', async () => {
    fixture = createGuardFixture({
      trustProxy: true,
      rateLimit: { maxRequests: 1 },
    });

    expect((await fixture.request('GET', '/api/configs')).status).toBe(403);
    expect((await fixture.request('GET', '/api/configs')).status).toBe(429);
  });

  test('豁免路径与 OPTIONS 不占用额度', async () => {
    fixture = createGuardFixture({ rateLimit: { maxRequests: 1 } });

    // 规格：连续 150 次请求静态资源都不应被限流
    for (let i = 0; i < 150; i++) {
      const asset = await fixture.request('GET', '/assets/app.js');
      expect(asset.status).not.toBe(429);
    }
    for (let i = 0; i < 3; i++) {
      const health = await fixture.request('GET', '/health');
      expect(health.status).toBe(200);
    }
    for (let i = 0; i < 2; i++) {
      const preflight = await fixture.request('OPTIONS', '/api/configs', {
        headers: { Origin: 'https://example.com' },
      });
      expect(preflight.status).toBe(204);
    }

    // 前面的豁免请求没有消耗额度，这个请求仍是第 1 个受计数请求
    expect((await fixture.request('GET', '/api/configs')).status).toBe(403);
  });

  test('已被限流的客户端请求 /health 仍返回 200', async () => {
    fixture = createGuardFixture({ rateLimit: { maxRequests: 0 } });

    expect((await fixture.request('GET', '/api/configs')).status).toBe(429);
    const health = await fixture.request('GET', '/health');
    expect(health.status).toBe(200);
  });

  test('429 响应带 Retry-After，取值在窗口剩余秒数范围内', async () => {
    fixture = createGuardFixture({
      rateLimit: { maxRequests: 1, windowMs: 15000 },
    });

    await fixture.request('GET', '/api/configs');
    const limited = await fixture.request('GET', '/api/configs');
    expect(limited.status).toBe(429);

    const retryAfter = Number(limited.headers.get('retry-after'));
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(15);
  });

  test('超限判断先于鉴权：携带有效 ADMIN_TOKEN 仍返回 429', async () => {
    fixture = createGuardFixture({ rateLimit: { maxRequests: 0 } });
    const res = await fixture.request('GET', '/api/configs', {
      headers: fixture.adminHeaders(),
    });
    expect(res.status).toBe(429);
  });

  test('IPv4 映射的 IPv6 地址与对应 IPv4 归为同一桶', async () => {
    fixture = createGuardFixture({ rateLimit: { maxRequests: 1 } });

    fixture.setIP('::ffff:203.0.113.10');
    expect((await fixture.request('GET', '/api/configs')).status).toBe(403);

    fixture.setIP('203.0.113.10');
    expect((await fixture.request('GET', '/api/configs')).status).toBe(429);
  });

  test('窗口结束后计数重置', async () => {
    let now = 1_000_000;
    fixture = createGuardFixture({
      rateLimit: { maxRequests: 1, windowMs: 15000, now: () => now },
    });

    expect((await fixture.request('GET', '/api/configs')).status).toBe(403);
    expect((await fixture.request('GET', '/api/configs')).status).toBe(429);

    now += 15000;
    expect((await fixture.request('GET', '/api/configs')).status).toBe(403);
  });

  test('跟踪条目超过上限时淘汰最久未被访问的条目', async () => {
    fixture = createGuardFixture({
      rateLimit: { maxRequests: 1, maxKeys: 2 },
    });
    const hit = () => fixture!.request('GET', '/api/configs');

    fixture.setIP('10.1.0.1');
    expect((await hit()).status).toBe(403);
    fixture.setIP('10.1.0.2');
    expect((await hit()).status).toBe(403);

    // 再次访问 10.1.0.1，使其成为最近访问；此时最久未访问的是 10.1.0.2
    fixture.setIP('10.1.0.1');
    expect((await hit()).status).toBe(429);

    // 新 IP 触发淘汰，被淘汰的应是 10.1.0.2
    fixture.setIP('10.1.0.3');
    expect((await hit()).status).toBe(403);

    // 10.1.0.2 若未被淘汰，这里会因计数已达 2 返回 429
    fixture.setIP('10.1.0.2');
    expect((await hit()).status).toBe(403);
  });
});

describe('请求体约束', () => {
  test('声明 2MB 的请求返回 413', async () => {
    fixture = createGuardFixture();
    const payload = 'x'.repeat(2 * 1024 * 1024);
    const res = await fixture.request('POST', '/api/configs', {
      headers: {
        ...fixture.adminHeaders(),
        'content-type': 'application/json',
        'content-length': String(payload.length),
      },
      rawBody: payload,
    });

    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      error: 'payload too large',
      code: 'PAYLOAD_TOO_LARGE',
    });
  });

  test('未携带 Token 的 2MB 请求同样返回 413 而不是 403', async () => {
    fixture = createGuardFixture();
    const payload = 'x'.repeat(2 * 1024 * 1024);
    const res = await fixture.request('POST', '/api/configs', {
      headers: {
        'content-type': 'application/json',
        'content-length': String(payload.length),
      },
      rawBody: payload,
    });
    expect(res.status).toBe(413);
  });

  test('恰好 1MB 的请求进入正常处理流程', async () => {
    fixture = createGuardFixture();
    // 合法 JSON 尾部补空格，使请求体长度恰好等于上限
    const prefix = JSON.stringify({ name: 'exact-limit', type: 'domain' });
    const payload = prefix + ' '.repeat(1024 * 1024 - prefix.length);
    expect(payload.length).toBe(1024 * 1024);

    const res = await fixture.request('POST', '/api/configs', {
      headers: {
        ...fixture.adminHeaders(),
        'content-type': 'application/json',
        'content-length': String(payload.length),
      },
      rawBody: payload,
    });

    expect(res.status).toBe(201);
    expect(fixture.store.exists('exact-limit')).toBe(true);
  });

  test('分块传输且未声明长度的请求返回 411', async () => {
    fixture = createGuardFixture();
    const res = await fixture.request('POST', '/api/configs', {
      headers: {
        ...fixture.adminHeaders(),
        'content-type': 'application/json',
        'transfer-encoding': 'chunked',
      },
    });

    expect(res.status).toBe(411);
    expect(res.body).toEqual({
      error: 'content-length required',
      code: 'LENGTH_REQUIRED',
    });
  });

  test('无法解析的 JSON 返回 400', async () => {
    fixture = createGuardFixture();
    const res = await fixture.request('POST', '/api/configs', {
      headers: {
        ...fixture.adminHeaders(),
        'content-type': 'application/json',
      },
      rawBody: '{bad',
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'malformed request body',
      code: 'PARSE_ERROR',
    });
  });

  test('不带请求体的 DELETE 不受影响', async () => {
    fixture = createGuardFixture();
    await fixture.request('POST', '/api/configs', {
      headers: fixture.adminHeaders(),
      body: { name: 'delete-me', type: 'domain' },
    });

    const res = await fixture.request('DELETE', '/api/configs/delete-me', {
      headers: fixture.adminHeaders(),
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: 'delete-me' });
  });

  test('合法 JSON 但结构不符仍返回 400 校验错误', async () => {
    fixture = createGuardFixture();
    const res = await fixture.request('POST', '/api/configs', {
      headers: fixture.adminHeaders(),
      body: { name: 'missing-type' },
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'invalid request body',
      code: 'VALIDATION_ERROR',
    });
  });
});

/**
 * 真实监听场景
 * 走 Bun 的真实 HTTP 栈，Content-Length 由客户端运行时生成，
 * 用来替换旧集成测试中「413 或 500」「400 或 500」这两个宽松断言。
 */
describe('请求体约束（真实监听）', () => {
  let server: ReturnType<typeof buildApp> | undefined;
  let dataDir: string | undefined;
  let base: string;
  const headers = {
    authorization: `Bearer ${ADMIN_TOKEN}`,
    'content-type': 'application/json',
  };

  afterEach(async () => {
    await (server as any)?.stop();
    server = undefined;
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    dataDir = undefined;
  });

  function listen() {
    dataDir = mkdtempSync(join(tmpdir(), 'rulebox-listen-'));
    const index = new ConfigIndex(dataDir);
    index.load();
    const store = new ConfigStore(dataDir, index);
    store.loadAll();

    const app = buildApp({
      config: {
        VIEW_TOKEN,
        ADMIN_TOKEN,
        PORT: 0,
        DATA_DIR: dataDir,
        TRUST_PROXY: false,
      },
      store,
    });

    app.listen(0);
    server = app;
    base = `http://127.0.0.1:${(app.server as any).port}`;
    return app;
  }

  test('真实 Content-Length 为 2MB 的请求返回 413（精确值）', async () => {
    listen();
    const payload = JSON.stringify({
      name: 'a'.repeat(2 * 1024 * 1024),
      type: 'domain',
    });

    const res = await fetch(`${base}/api/configs`, {
      method: 'POST',
      headers,
      body: payload,
    });

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({
      error: 'payload too large',
      code: 'PAYLOAD_TOO_LARGE',
    });
  });

  test('真实发送的非法 JSON 返回 400（精确值）', async () => {
    listen();
    const res = await fetch(`${base}/api/configs`, {
      method: 'POST',
      headers,
      body: 'this is not json',
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'malformed request body',
      code: 'PARSE_ERROR',
    });
  });

  test('裸 TCP 分块传输请求返回 411（精确值）', async () => {
    listen();
    const port = Number(new URL(base).port);

    const raw = await new Promise<{ status: number; body: string }>(
      (resolve, reject) => {
        const socket = net.connect(port, '127.0.0.1', () => {
          socket.write(
            [
              'POST /api/configs HTTP/1.1',
              'Host: localhost',
              `Authorization: Bearer ${ADMIN_TOKEN}`,
              'Content-Type: application/json',
              'Transfer-Encoding: chunked',
              'Connection: close',
              '',
              '6',
              'hello!',
              '0',
              '',
              '',
            ].join('\r\n'),
          );
        });

        let rawText = '';
        socket.setEncoding('utf-8');
        socket.on('data', (chunk) => {
          rawText += chunk;
        });
        socket.on('close', () => {
          const statusMatch = rawText.match(/^HTTP\/1\.1 (\d{3})/);
          const body = rawText.slice(rawText.indexOf('\r\n\r\n') + 4);
          resolve({ status: Number(statusMatch?.[1]), body });
        });
        socket.on('error', reject);
      },
    );

    expect(raw.status).toBe(411);
    expect(JSON.parse(raw.body)).toEqual({
      error: 'content-length required',
      code: 'LENGTH_REQUIRED',
    });
  });

  test('真实监听的 2MB 请求在未携带 Token 时同样是 413', async () => {
    listen();
    const payload = JSON.stringify({
      name: 'b'.repeat(2 * 1024 * 1024),
      type: 'domain',
    });

    const res = await fetch(`${base}/api/configs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload,
    });

    expect(res.status).toBe(413);
  });
});
