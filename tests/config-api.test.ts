/**
 * 配置查询、删除与订阅链接的接口测试
 * 覆盖任务 6.6（分页、搜索、删除条数）与 7.3（列表条数、订阅链接）
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { readdirSync } from 'node:fs';
import {
  createTestApp,
  ADMIN_TOKEN,
  VIEW_TOKEN,
  adminHeaders,
} from './helpers/app';

type TestApp = ReturnType<typeof createTestApp>;

/** 分页测试使用的配置集名称 */
const PAGED = 'paged-config';
/** 搜索测试使用的配置集名称 */
const SEARCH = 'search-config';
/** 删除测试使用的配置集名称 */
const DELETE_TARGET = 'delete-config';
/** 订阅链接测试使用的配置集名称 */
const SUB_TARGET = 'sub-config';

/** 生成指定数量的合法域名数据项 */
function makeDomains(count: number, prefix = 'item') {
  return Array.from({ length: count }, (_, i) => ({
    value: `${prefix}${i}.example.com`,
    description: `第 ${i} 条`,
  }));
}

describe('配置查询与订阅接口', () => {
  let ctx: TestApp;
  let request: TestApp['request'];

  beforeAll(async () => {
    ctx = createTestApp();
    request = ctx.request;

    // 分页用配置集：250 条，便于验证分页与默认 pageSize=100
    await request('POST', '/api/configs', {
      headers: adminHeaders(),
      body: { name: PAGED, type: 'domain', description: '分页测试' },
    });
    await request('POST', `/api/configs/${PAGED}/items`, {
      headers: adminHeaders(),
      body: { items: makeDomains(250) },
    });

    // 搜索用配置集：value 与 description 混合命中
    await request('POST', '/api/configs', {
      headers: adminHeaders(),
      body: { name: SEARCH, type: 'domain', description: '搜索测试' },
    });
    await request('POST', `/api/configs/${SEARCH}/items`, {
      headers: adminHeaders(),
      body: {
        items: [
          { value: 'github.com', description: '代码托管' },
          { value: 'gitlab.com', description: 'GitHub 镜像' },
          { value: 'github.io', description: 'GitHub Pages' },
          { value: 'ad1.example.com', description: '' },
          { value: 'ad2.example.com', description: '' },
          { value: 'ad3.example.com', description: '' },
          { value: 'ad4.example.com', description: '' },
          { value: 'ad5.example.com', description: '' },
          { value: 'ad6.example.com', description: '' },
          { value: 'ad7.example.com', description: '' },
          { value: 'ad8.example.com', description: '' },
          { value: 'plain.org', description: 'AD 仅在描述中出现' },
          { value: 'plain.net', description: '' },
        ],
      },
    });

    // 删除用配置集
    await request('POST', '/api/configs', {
      headers: adminHeaders(),
      body: { name: DELETE_TARGET, type: 'domain' },
    });
    await request('POST', `/api/configs/${DELETE_TARGET}/items`, {
      headers: adminHeaders(),
      body: {
        items: [
          { value: 'a.com', description: '' },
          { value: 'b.com', description: '' },
          { value: 'c.com', description: '' },
        ],
      },
    });

    // 订阅链接用配置集
    await request('POST', '/api/configs', {
      headers: adminHeaders(),
      body: { name: SUB_TARGET, type: 'domain' },
    });
    await request('POST', `/api/configs/${SUB_TARGET}/items`, {
      headers: adminHeaders(),
      body: {
        items: [
          { value: 'one.example.com', description: '' },
          { value: 'two.example.com', description: '' },
        ],
      },
    });
  });

  afterAll(() => {
    ctx?.cleanup();
  });

  describe('GET /api/configs/{name}/items 分页与搜索', () => {
    test('不传 page 时返回全部数据项，且不含 page 与 pageSize', async () => {
      const res = await request('GET', `/api/configs/${PAGED}/items`, {
        headers: adminHeaders(),
      });

      expect(res.status).toBe(200);
      const body = res.body as any;
      expect(body.name).toBe(PAGED);
      expect(body.items.length).toBe(250);
      expect(body.total).toBe(250);
      expect(body).not.toHaveProperty('page');
      expect(body).not.toHaveProperty('pageSize');
      // 顺序与存储顺序一致
      expect(body.items[0].value).toBe('item0.example.com');
      expect(body.items[249].value).toBe('item249.example.com');
    });

    test('分页与默认 pageSize：page=2 返回第 101 到第 200 条', async () => {
      const res = await request('GET', `/api/configs/${PAGED}/items`, {
        headers: adminHeaders(),
        query: { page: '2' },
      });

      expect(res.status).toBe(200);
      const body = res.body as any;
      expect(body.items.length).toBe(100);
      expect(body.items[0].value).toBe('item100.example.com');
      expect(body.items[99].value).toBe('item199.example.com');
      expect(body.total).toBe(250);
      expect(body.page).toBe(2);
      expect(body.pageSize).toBe(100);
    });

    test('分页：page=3&pageSize=100 返回第 201 到第 250 条', async () => {
      const res = await request('GET', `/api/configs/${PAGED}/items`, {
        headers: adminHeaders(),
        query: { page: '3', pageSize: '100' },
      });

      expect(res.status).toBe(200);
      const body = res.body as any;
      expect(body.items.length).toBe(50);
      expect(body.items[0].value).toBe('item200.example.com');
      expect(body.items[49].value).toBe('item249.example.com');
      expect(body.total).toBe(250);
      expect(body.page).toBe(3);
      expect(body.pageSize).toBe(100);
    });

    test('关键字筛选不区分大小写，且匹配 description', async () => {
      const res = await request('GET', `/api/configs/${SEARCH}/items`, {
        headers: adminHeaders(),
        query: { q: 'GitHub' },
      });

      expect(res.status).toBe(200);
      const body = res.body as any;
      const values = body.items.map((item: any) => item.value);
      // 两条命中 value，一条命中 description（大小写不同也命中）
      expect(values).toContain('github.com');
      expect(values).toContain('github.io');
      expect(values).toContain('gitlab.com');
      expect(values).not.toContain('plain.org');
      expect(body.total).toBe(3);
      expect(body).not.toHaveProperty('page');
    });

    test('关键字同时匹配 description（不区分大小写）', async () => {
      const res = await request('GET', `/api/configs/${SEARCH}/items`, {
        headers: adminHeaders(),
        query: { q: 'ad' },
      });

      expect(res.status).toBe(200);
      const values = (res.body as any).items.map((item: any) => item.value);
      // 8 条 ad 开头的 value + 1 条 description 含 AD 的 plain.org
      expect(values.length).toBe(9);
      expect(values).toContain('plain.org');
      expect(values).not.toContain('plain.net');
    });

    test('筛选与分页叠加：q=ad&page=2&pageSize=5 返回筛选结果的第 6 到第 10 条', async () => {
      // 先确认筛选后的总数与顺序
      const all = await request('GET', `/api/configs/${SEARCH}/items`, {
        headers: adminHeaders(),
        query: { q: 'ad' },
      });
      expect(all.status).toBe(200);
      const allValues = (all.body as any).items.map((item: any) => item.value);
      expect(allValues.length).toBe(9);

      const res = await request('GET', `/api/configs/${SEARCH}/items`, {
        headers: adminHeaders(),
        query: { q: 'ad', page: '2', pageSize: '5' },
      });

      expect(res.status).toBe(200);
      const body = res.body as any;
      expect(body.total).toBe(9);
      expect(body.page).toBe(2);
      expect(body.pageSize).toBe(5);
      expect(body.items.map((item: any) => item.value)).toEqual(
        allValues.slice(5, 10),
      );
    });

    test('pageSize 仅在传了 page 时生效：只传 pageSize 仍返回全部', async () => {
      const res = await request('GET', `/api/configs/${PAGED}/items`, {
        headers: adminHeaders(),
        query: { pageSize: '10' },
      });

      expect(res.status).toBe(200);
      const body = res.body as any;
      expect(body.items.length).toBe(250);
      expect(body.total).toBe(250);
      expect(body).not.toHaveProperty('page');
      expect(body).not.toHaveProperty('pageSize');
    });

    test('页码越界返回空数组且 total 不变', async () => {
      const res = await request('GET', `/api/configs/${PAGED}/items`, {
        headers: adminHeaders(),
        query: { page: '999' },
      });

      expect(res.status).toBe(200);
      const body = res.body as any;
      expect(body.items).toEqual([]);
      expect(body.total).toBe(250);
      expect(body.page).toBe(999);
    });

    test('空配置集分页返回空数组且 total 为 0', async () => {
      await request('POST', '/api/configs', {
        headers: adminHeaders(),
        body: { name: 'paged-empty-config', type: 'domain' },
      });

      const res = await request('GET', '/api/configs/paged-empty-config/items', {
        headers: adminHeaders(),
        query: { page: '1', pageSize: '10' },
      });

      expect(res.status).toBe(200);
      const body = res.body as any;
      expect(body.items).toEqual([]);
      expect(body.total).toBe(0);
      expect(body.page).toBe(1);
      expect(body.pageSize).toBe(10);
    });

    test('非法分页参数返回 400', async () => {
      const invalidQueries: Array<Record<string, string>> = [
        { page: '0' },
        { page: '1.5' },
        { page: 'abc' },
        { pageSize: '0' },
        { pageSize: '1001' },
        { pageSize: '1.5' },
        { q: 'a'.repeat(201) },
      ];

      for (const query of invalidQueries) {
        const res = await request('GET', `/api/configs/${PAGED}/items`, {
          headers: adminHeaders(),
          query: { page: '1', ...query },
        });
        expect(res.status).toBe(400);
        expect(res.body).toEqual({
          error: 'invalid request body',
          code: 'VALIDATION_ERROR',
        });
      }
    });
  });

  describe('DELETE /api/configs/{name}/items 删除条数', () => {
    test('请求含重复值与不存在值时 removed 只计实际删除条数', async () => {
      // 当前存在 a.com, b.com, c.com
      const res = await request('DELETE', `/api/configs/${DELETE_TARGET}/items`, {
        headers: adminHeaders(),
        body: {
          items: [
            { value: 'a.com' },
            { value: 'zzz.com' },
            { value: 'a.com' },
            { value: 'b.com' },
          ],
        },
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ removed: 2, from: DELETE_TARGET });

      const verify = await request('GET', `/api/configs/${DELETE_TARGET}/items`, {
        headers: adminHeaders(),
      });
      expect((verify.body as any).items.map((item: any) => item.value)).toEqual([
        'c.com',
      ]);
    });

    test('删除不存在的 value 返回 removed 为 0', async () => {
      const res = await request('DELETE', `/api/configs/${DELETE_TARGET}/items`, {
        headers: adminHeaders(),
        body: { items: [{ value: 'nope.com' }] },
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ removed: 0, from: DELETE_TARGET });
    });

    test('从不存在的配置删除返回 404 且数据目录不新增文件', async () => {
      const before = readdirSync(ctx.dataDir).sort();

      const res = await request('DELETE', '/api/configs/ghost-config/items', {
        headers: adminHeaders(),
        body: { items: [{ value: 'whatever.com' }] },
      });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        error: 'config not found',
        code: 'CONFIG_NOT_FOUND',
      });

      const after = readdirSync(ctx.dataDir).sort();
      expect(after).toEqual(before);
      expect(after).not.toContain('ghost-config.yaml');
    });

    test('存储层在锁内检查存在性：直接调用 addItems/removeItems 抛 CONFIG_NOT_FOUND 且不落盘', async () => {
      const before = readdirSync(ctx.dataDir).sort();

      await expect(
        ctx.store.removeItems('ghost-config', ['whatever.com']),
      ).rejects.toThrow('CONFIG_NOT_FOUND');
      await expect(
        ctx.store.addItems('ghost-config', [
          { value: 'whatever.com', description: '' },
        ]),
      ).rejects.toThrow('CONFIG_NOT_FOUND');

      const after = readdirSync(ctx.dataDir).sort();
      expect(after).toEqual(before);
    });
  });

  describe('GET /api/configs 列表条数', () => {
    test('每个配置项带 item_count，空配置集为 0', async () => {
      await request('POST', '/api/configs', {
        headers: adminHeaders(),
        body: { name: 'empty-count-config', type: 'domain' },
      });

      const res = await request('GET', '/api/configs', {
        headers: adminHeaders(),
      });

      expect(res.status).toBe(200);
      const configs = (res.body as any).configs as Array<any>;
      const byName = new Map(configs.map((item) => [item.name, item]));

      expect(byName.get(PAGED)!.item_count).toBe(250);
      expect(byName.get(SEARCH)!.item_count).toBe(13);
      expect(byName.get('empty-count-config')!.item_count).toBe(0);

      // 元数据字段仍然完整
      const paged = byName.get(PAGED)!;
      expect(paged.type).toBe('domain');
      expect(paged.description).toBe('分页测试');
      expect(typeof paged.created_at).toBe('string');
    });

    test('按类型筛选时同样带 item_count', async () => {
      const res = await request('GET', '/api/configs', {
        headers: adminHeaders(),
        query: { type: 'domain' },
      });

      expect(res.status).toBe(200);
      const configs = (res.body as any).configs as Array<any>;
      expect(configs.length).toBeGreaterThan(0);
      for (const config of configs) {
        expect(config.type).toBe('domain');
        expect(typeof config.item_count).toBe('number');
      }
    });
  });

  describe('GET /api/configs/{name}/subscription 订阅链接', () => {
    test('返回根相对地址并带 VIEW_TOKEN', async () => {
      const res = await request('GET', `/api/configs/${SUB_TARGET}/subscription`, {
        headers: adminHeaders(),
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        name: SUB_TARGET,
        url: `/${SUB_TARGET}.yaml?token=${encodeURIComponent(VIEW_TOKEN)}`,
      });
      // 订阅链接含 token，禁止缓存
      expect(res.headers.get('cache-control')).toBe('no-store');
    });

    test('拼接主机名后可拉取到 YAML，且 Content-Type 为 text/yaml', async () => {
      const sub = await request('GET', `/api/configs/${SUB_TARGET}/subscription`, {
        headers: adminHeaders(),
      });
      expect(sub.status).toBe(200);

      const url = (sub.body as any).url as string;
      const res = await request('GET', url);

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('text/yaml');
      expect(res.text).toContain('payload');
      expect(res.text).toContain('one.example.com');
      expect(res.text).toContain('two.example.com');
      // mihomo 兼容格式不包含描述
      expect(res.text).not.toContain('description');
    });

    test('配置不存在返回 404', async () => {
      const res = await request('GET', '/api/configs/ghost-config/subscription', {
        headers: adminHeaders(),
      });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        error: 'config not found',
        code: 'CONFIG_NOT_FOUND',
      });
    });

    test('不带 ADMIN_TOKEN 返回 403', async () => {
      const withoutToken = await request(
        'GET',
        `/api/configs/${SUB_TARGET}/subscription`,
      );
      expect(withoutToken.status).toBe(403);
      expect(withoutToken.body).toEqual({
        error: 'forbidden',
        code: 'FORBIDDEN',
      });

      const withViewToken = await request(
        'GET',
        `/api/configs/${SUB_TARGET}/subscription`,
        { headers: { Authorization: `Bearer ${VIEW_TOKEN}` } },
      );
      expect(withViewToken.status).toBe(403);
    });

    test('通过订阅链接访问时 token 缺失返回 403', async () => {
      const res = await request('GET', `/${SUB_TARGET}.yaml`);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'forbidden', code: 'FORBIDDEN' });
    });

    test('ADMIN_TOKEN 不能作为 VIEW_TOKEN 使用（订阅端点仍按 SPEC 拒绝）', async () => {
      // 订阅接口本身已覆盖，此处确认 token 参数语义独立
      const res = await request('GET', `/${SUB_TARGET}.yaml`, {
        query: { token: ADMIN_TOKEN },
      });
      expect(res.status).toBe(403);
    });
  });
});
