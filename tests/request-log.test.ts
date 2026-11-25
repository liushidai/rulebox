/**
 * 请求日志测试
 * 直接调用 buildApp() 装配，拦截 console.log 校验日志行的状态码、路径与耗时
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../src/app';
import { ConfigIndex } from '../src/lib/index';
import { ConfigStore } from '../src/lib/store';
import type { AppConfig } from '../src/config';
import type { RateLimitOptions } from '../src/lib/rateLimit';

const ADMIN_TOKEN = 'log-admin-token';
const VIEW_TOKEN = 'log-view-token-very-secret';

interface LogFixtureOptions {
  rateLimit?: RateLimitOptions;
}

/**
 * 本地 fixture：捕获 console.log 输出，并提供请求辅助
 */
function createLogFixture(options: LogFixtureOptions = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'rulebox-log-'));
  const config: AppConfig = {
    VIEW_TOKEN,
    ADMIN_TOKEN,
    PORT: 0,
    DATA_DIR: dataDir,
    TRUST_PROXY: false,
  };
  const index = new ConfigIndex(dataDir);
  index.load();
  const store = new ConfigStore(dataDir, index);
  store.loadAll();

  const app = buildApp({ config, store, rateLimit: options.rateLimit }) as any;
  app.server = {
    requestIP: () => ({ address: '203.0.113.50', family: 'IPv4', port: 1 }),
  };

  const adminHeaders = () => ({ Authorization: `Bearer ${ADMIN_TOKEN}` });

  async function request(
    method: string,
    path: string,
    init: {
      headers?: Record<string, string>;
      body?: unknown;
      rawBody?: string;
    } = {},
  ) {
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

    const response = await app.handle(
      new Request(`http://localhost${path}`, requestInit),
    );
    const text = await response.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // YAML 等非 JSON 响应通过 text 读取
    }

    return { status: response.status, headers: response.headers, body, text };
  }

  return {
    app,
    store,
    dataDir,
    request,
    adminHeaders,
    cleanup: () => rmSync(dataDir, { recursive: true, force: true }),
  };
}

type LogFixture = ReturnType<typeof createLogFixture>;

/** 捕获 console.log 的输出 */
function captureLogs(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.map((arg) => String(arg)).join(' '));
  };
  return {
    lines,
    restore: () => {
      console.log = original;
    },
  };
}

/** 从日志行中解析状态码（形如 ``… GET /path 200 3ms``） */
function parseStatus(line: string): string | undefined {
  const match = line.match(/\s(\d{3})\s+\d+ms$/);
  return match?.[1];
}

let fixture: LogFixture | undefined;

beforeEach(() => {
  fixture = undefined;
});

afterEach(() => {
  fixture?.cleanup();
  fixture = undefined;
});

describe('请求日志', () => {
  test('鉴权失败记录 403，且每行包含时间戳、方法、路径与耗时', async () => {
    const capture = captureLogs();
    try {
      fixture = createLogFixture();
      const res = await fixture.request('GET', '/api/configs');
      expect(res.status).toBe(403);
    } finally {
      capture.restore();
    }

    expect(capture.lines).toHaveLength(1);
    const line = capture.lines[0];
    expect(line).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(line).toContain('GET');
    expect(line).toContain('/api/configs');
    expect(parseStatus(line)).toBe('403');
    expect(line).toMatch(/\d+ms$/);
  });

  test('未命中路由记录 404，且响应体仍是 JSON', async () => {
    const capture = captureLogs();
    let res: Awaited<ReturnType<LogFixture['request']>> | undefined;
    try {
      fixture = createLogFixture();
      res = await fixture.request('GET', '/no/such/route');
    } finally {
      capture.restore();
    }

    expect(res?.status).toBe(404);
    expect(res?.body).toEqual({
      error: 'not found',
      code: 'ROUTE_NOT_FOUND',
    });
    expect(parseStatus(capture.lines[0])).toBe('404');
  });

  test('创建成功记录 201', async () => {
    const capture = captureLogs();
    try {
      fixture = createLogFixture();
      const res = await fixture.request('POST', '/api/configs', {
        headers: fixture.adminHeaders(),
        body: { name: 'log-created', type: 'domain' },
      });
      expect(res.status).toBe(201);
    } finally {
      capture.restore();
    }

    expect(capture.lines).toHaveLength(1);
    expect(parseStatus(capture.lines[0])).toBe('201');
  });

  test('被限流的请求记录 429', async () => {
    const capture = captureLogs();
    try {
      fixture = createLogFixture({ rateLimit: { maxRequests: 0 } });
      const res = await fixture.request('GET', '/api/configs', {
        headers: fixture.adminHeaders(),
      });
      expect(res.status).toBe(429);
    } finally {
      capture.restore();
    }

    expect(capture.lines).toHaveLength(1);
    expect(parseStatus(capture.lines[0])).toBe('429');
  });

  test('被请求体约束拒绝的请求记录 413', async () => {
    const capture = captureLogs();
    try {
      fixture = createLogFixture();
      const res = await fixture.request('POST', '/api/configs', {
        headers: {
          ...fixture.adminHeaders(),
          'content-type': 'application/json',
          'content-length': String(2 * 1024 * 1024),
        },
        rawBody: '{}',
      });
      expect(res.status).toBe(413);
    } finally {
      capture.restore();
    }

    expect(capture.lines).toHaveLength(1);
    expect(parseStatus(capture.lines[0])).toBe('413');
  });

  test('YAML 请求日志只记录路径，不含 token 的值', async () => {
    fixture = createLogFixture();
    await fixture.request('POST', '/api/configs', {
      headers: fixture.adminHeaders(),
      body: { name: 'logged-yaml', type: 'domain' },
    });
    await fixture.request('POST', '/api/configs/logged-yaml/items', {
      headers: fixture.adminHeaders(),
      body: { items: [{ value: 'example.com', description: '' }] },
    });

    const capture = captureLogs();
    try {
      const res = await fixture.request(
        'GET',
        `/logged-yaml.yaml?token=${VIEW_TOKEN}`,
      );
      expect(res.status).toBe(200);
    } finally {
      capture.restore();
    }

    expect(capture.lines).toHaveLength(1);
    const line = capture.lines[0];
    expect(line).toContain('/logged-yaml.yaml');
    expect(parseStatus(line)).toBe('200');
    // 既要排除 token 明文，也要排除查询串本身
    expect(line).not.toContain(VIEW_TOKEN);
    expect(line).not.toContain('token=');
    expect(line).not.toContain('?');
  });

  test('未命中路由的 404 与正常请求各记录一行', async () => {
    const capture = captureLogs();
    try {
      fixture = createLogFixture();
      await fixture.request('GET', '/health');
      await fixture.request('GET', '/missing/route');
    } finally {
      capture.restore();
    }

    expect(capture.lines).toHaveLength(2);
    expect(parseStatus(capture.lines[0])).toBe('200');
    expect(parseStatus(capture.lines[1])).toBe('404');
  });

  test('CORS 预检请求不产生日志', async () => {
    const capture = captureLogs();
    try {
      fixture = createLogFixture();
      const res = await fixture.request('OPTIONS', '/api/configs', {
        headers: {
          Origin: 'https://example.com',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'authorization,content-type',
        },
      });
      expect(res.status).toBe(204);
    } finally {
      capture.restore();
    }

    expect(capture.lines).toHaveLength(0);
  });
});
