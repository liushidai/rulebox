import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createTestApp, adminHeaders } from './helpers/app';

describe('边界和错误处理测试', () => {
  let fixture: ReturnType<typeof createTestApp>;
  let request: typeof fixture.request;

  beforeEach(() => {
    fixture = createTestApp();
    request = fixture.request;
  });
  afterEach(() => fixture.cleanup());

  test('缺少必填字段的请求应返回 400', async () => {
    const res = await request('POST', '/api/configs', {
      headers: adminHeaders(),
      body: { name: 'missing-type' }, // 缺少 type
    });
    expect(res.status).toBe(400);
  });

  test('无效的 type 值应返回 400', async () => {
    const res = await request('POST', '/api/configs', {
      headers: adminHeaders(),
      body: { name: 'invalid-type-test', type: 'invalid_type' },
    });
    expect(res.status).toBe(400);
  });

  test('健康检查端点应返回 ok', async () => {
    const res = await request('GET', '/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  test('空数组添加数据项应成功', async () => {
    await request('POST', '/api/configs', {
      headers: adminHeaders(),
      body: { name: 'empty-items-test', type: 'domain' },
    });
    const res = await request('POST', '/api/configs/empty-items-test/items', {
      headers: adminHeaders(),
      body: { items: [] },
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('added', 0);
  });

  test('不存在的配置操作应返回 404', async () => {
    // GET 不存在配置
    const getRes = await request('GET', '/api/configs/nonexist/items', {
      headers: adminHeaders(),
    });
    expect(getRes.status).toBe(404);

    // PATCH 不存在配置的 rename
    const patchRes = await request('PATCH', '/api/configs/nonexist/rename', {
      headers: adminHeaders(),
      body: { newName: 'new' },
    });
    expect(patchRes.status).toBe(404);

    // DELETE 不存在的配置
    const deleteRes = await request('DELETE', '/api/configs/nonexist', {
      headers: adminHeaders(),
    });
    expect(deleteRes.status).toBe(404);
  });
});
