/**
 * 页面托管集成测试
 * 验证 GET / 与 GET /assets/* 的状态码、类型、安全头、缓存头与限流豁免，
 * 以及静态资源路由不影响 YAML 路由
 *
 * 页面与视觉资源由设计专员提供，是正式应用的必需文件；
 * 缺失时资产加载会在 buildApp() 阶段直接报错，因此这里不使用跳过逻辑
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../src/app';
import { ConfigIndex } from '../src/lib/index';
import { ConfigStore } from '../src/lib/store';
import type { AppConfig } from '../src/config';
import type { RateLimitOptions } from '../src/lib/rateLimit';

const ADMIN_TOKEN = 'web-admin-token';
const VIEW_TOKEN = 'web-view-token';

/** 规格要求的 CSP 原文，测试中独立书写，避免与实现互相印证 */
const EXPECTED_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; " +
  "connect-src 'self'; object-src 'none'; base-uri 'none'; " +
  "form-action 'self'; frame-ancestors 'none'";

interface WebFixtureOptions {
  rateLimit?: RateLimitOptions;
}

/** 与生产一致的装配，附带可控客户端 IP 的请求辅助 */
function createWebFixture(options: WebFixtureOptions = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'rulebox-web-'));
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
    requestIP: () => ({ address: '198.51.100.7', family: 'IPv4', port: 1 }),
  };

  async function request(
    method: string,
    path: string,
    headers: Record<string, string> = {},
  ) {
    const response = await app.handle(
      new Request(new URL(`http://localhost${path}`), { method, headers }),
    );
    const text = await response.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // HTML、JS、CSS 等非 JSON 响应通过 text 读取
    }
    return { status: response.status, headers: response.headers, body, text };
  }

  return {
    request,
    adminHeaders: () => ({ Authorization: `Bearer ${ADMIN_TOKEN}` }),
    cleanup: () => rmSync(dataDir, { recursive: true, force: true }),
  };
}

type WebFixture = ReturnType<typeof createWebFixture>;

let fixture: WebFixture | undefined;

afterEach(() => {
  fixture?.cleanup();
  fixture = undefined;
});

/** 校验页面类响应的安全头与缓存头 */
function expectPageHeaders(headers: Headers) {
  expect(headers.get('content-security-policy')).toBe(EXPECTED_CSP);
  expect(headers.get('x-content-type-options')).toBe('nosniff');
  expect(headers.get('referrer-policy')).toBe('no-referrer');
  expect(headers.get('cache-control')).toBe('no-cache');
}

describe('GET / 页面托管', () => {
  test('无 Token 请求返回 200 与 text/html; charset=utf-8', async () => {
    fixture = createWebFixture();
    const res = await fixture.request('GET', '/');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(res.text.length).toBeGreaterThan(0);
  });

  test('响应包含 CSP、nosniff、no-referrer 与 no-cache', async () => {
    fixture = createWebFixture();
    const res = await fixture.request('GET', '/');

    expectPageHeaders(res.headers);
  });

  test('HTML 不含内联脚本、内联样式与内联事件', async () => {
    fixture = createWebFixture();
    const res = await fixture.request('GET', '/');

    // 不存在 <style> 块
    expect(res.text).not.toMatch(/<style[\s>]/i);

    // 所有 script 标签都必须通过 src 外链，且不能带内联内容
    const scriptTags = res.text.match(/<script\b[^>]*>/gi) ?? [];
    expect(scriptTags.length).toBeGreaterThan(0);
    for (const tag of scriptTags) {
      expect(tag).toMatch(/\ssrc="/);
    }
    expect(res.text).not.toMatch(/<script\b[^>]*>[^<]+<\/script>/i);

    // 所有标签内不得出现 style 属性与 on* 事件属性
    const tags: string[] = res.text.match(/<[^>]+>/g) ?? [];
    for (const tag of tags) {
      expect(tag).not.toMatch(/\sstyle\s*=/i);
      expect(tag).not.toMatch(/\son[a-z]+\s*=/i);
    }
  });

  test('HTML 以模块脚本引用 app.js，并引用样式与 favicon', async () => {
    fixture = createWebFixture();
    const res = await fixture.request('GET', '/');
    const tags: string[] = res.text.match(/<[^>]+>/g) ?? [];

    // 脚本必须是以 module 方式加载 /assets/app.js（相对写法 assets/app.js 亦可）
    const script = tags.find(
      (tag) =>
        /^<script\b/i.test(tag) &&
        /\stype="module"/i.test(tag) &&
        /\ssrc="(?:\.\/|\/)?assets\/app\.js"/i.test(tag),
    );
    expect(script).toBeDefined();

    const stylesheet = tags.find(
      (tag) =>
        /^<link\b/i.test(tag) &&
        /\srel="stylesheet"/i.test(tag) &&
        /\shref="(?:\.\/|\/)?assets\/style\.css"/i.test(tag),
    );
    expect(stylesheet).toBeDefined();

    const icon = tags.find(
      (tag) =>
        /^<link\b/i.test(tag) &&
        /\srel="icon"/i.test(tag) &&
        /\shref="(?:\.\/|\/)?assets\/favicon\.svg"/i.test(tag),
    );
    expect(icon).toBeDefined();
  });
});

describe('GET /assets/* 静态资源', () => {
  test('logic.js 以 text/javascript 返回并带安全头', async () => {
    fixture = createWebFixture();
    const res = await fixture.request('GET', '/assets/logic.js');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')?.split(';')[0]).toBe('text/javascript');
    expect(res.text).toContain('export function parseBatch');
    expectPageHeaders(res.headers);
  });

  test('app.js 以 text/javascript 返回', async () => {
    fixture = createWebFixture();
    const res = await fixture.request('GET', '/assets/app.js');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')?.split(';')[0]).toBe('text/javascript');
    expectPageHeaders(res.headers);
  });

  test('style.css 以 text/css 返回', async () => {
    fixture = createWebFixture();
    const res = await fixture.request('GET', '/assets/style.css');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')?.split(';')[0]).toBe('text/css');
    expectPageHeaders(res.headers);
  });

  test('favicon.svg 以 image/svg+xml 返回', async () => {
    fixture = createWebFixture();
    const res = await fixture.request('GET', '/assets/favicon.svg');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/svg+xml');
    expectPageHeaders(res.headers);
  });

  test('未知静态资源返回 404', async () => {
    fixture = createWebFixture();
    const res = await fixture.request('GET', '/assets/nope.js');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not found', code: 'ROUTE_NOT_FOUND' });
  });

  test('目录形式与多段路径不匹配任何资源', async () => {
    fixture = createWebFixture();

    for (const path of ['/assets/', '/assets/sub/app.js', '/assets/app.js/']) {
      const res = await fixture.request('GET', path);
      expect(res.status).toBe(404);
    }
  });

  test('编码后的路径遍历与绝对路径都不会命中资源表', async () => {
    fixture = createWebFixture();

    for (const path of [
      '/assets/%2e%2e%2findex.html',
      '/assets/%2e%2e%2fsrc%2fweb%2flogic.js',
      '/assets/..%2f..%2fpackage.json',
    ]) {
      const res = await fixture.request('GET', path);
      expect(res.status).toBe(404);
      // 不能把任何本地文件内容当作页面或脚本返回
      expect(res.text).not.toContain('export function parseBatch');
      expect(res.text).not.toContain('<!DOCTYPE html');
      expect(res.text).not.toContain('"dependencies"');
    }
  });

  test('未映射到资源表的单段路径仍由 YAML 路由接管', async () => {
    fixture = createWebFixture();

    // 页面内不能出现指向这些地址的链接：它们会落到 YAML 路由的鉴权
    for (const path of ['/index.html', '/app.js', '/favicon.ico']) {
      const res = await fixture.request('GET', path);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'forbidden', code: 'FORBIDDEN' });
    }
  });
});

describe('静态资源与 YAML 路由互不影响', () => {
  test('未携带 VIEW_TOKEN 的 /demo.yaml 仍返回 403', async () => {
    fixture = createWebFixture();
    const res = await fixture.request('GET', '/demo.yaml');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden', code: 'FORBIDDEN' });
  });
});

describe('页面与静态资源的限流豁免', () => {
  test('阈值调小后连续请求 / 与 /assets/* 均返回 200，且不消耗额度', async () => {
    fixture = createWebFixture({ rateLimit: { maxRequests: 1 } });

    // 规格：同一客户端在限流窗口内连续 150 次请求静态资源都应成功
    const paths = ['/', '/assets/app.js', '/assets/logic.js'];
    for (let i = 0; i < 150; i++) {
      const res = await fixture.request('GET', paths[i % paths.length]);
      expect(res.status).toBe(200);
    }

    // 首页与实际脚本各自再取一次，明确断言 200
    expect((await fixture.request('GET', '/')).status).toBe(200);
    expect((await fixture.request('GET', '/assets/app.js')).status).toBe(200);

    // 前面的请求没有消耗额度：第一个带 Token 的受计数请求仍为 200
    expect(
      (await fixture.request('GET', '/api/configs', fixture.adminHeaders())).status,
    ).toBe(200);
    // 第二个才触发限流
    expect(
      (await fixture.request('GET', '/api/configs', fixture.adminHeaders())).status,
    ).toBe(429);
  });
});
