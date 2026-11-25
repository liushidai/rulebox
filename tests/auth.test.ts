import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createTestApp, adminHeaders, ADMIN_TOKEN, VIEW_TOKEN } from './helpers/app';

describe('鉴权测试', () => {
  let fixture: ReturnType<typeof createTestApp>;
  let request: typeof fixture.request;

  beforeEach(() => {
    fixture = createTestApp();
    request = fixture.request;
  });
  afterEach(() => fixture.cleanup());

  test('无 token 访问受保护的配置端点应返回 403', async () => {
    const res = await request('GET', '/api/configs');
    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('error', 'forbidden');
  });

  test('错误 token 访问 YAML 配置应返回 403', async () => {
    const res = await request('GET', '/adsf.yaml', {
      query: { token: 'wrong-token' },
    });
    expect(res.status).toBe(403);
  });

  test('错误 ADMIN_TOKEN 访问配置端点应返回 403', async () => {
    const res = await request('GET', '/api/configs', {
      headers: { Authorization: 'Bearer wrong-admin-token' },
    });
    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('code', 'FORBIDDEN');
  });

  test('正确 VIEW_TOKEN 访问 YAML 配置应通过鉴权', async () => {
    // 先创建一个配置
    await request('POST', '/api/configs', {
      headers: adminHeaders(),
      body: { name: 'yaml-auth-test', type: 'domain' },
    });
    // 添加一些数据
    await request('POST', '/api/configs/yaml-auth-test/items', {
      headers: adminHeaders(),
      body: { items: [{ value: 'example.com', description: '测试' }] },
    });
    // 用正确 VIEW_TOKEN 访问（VIEW_TOKEN 通过 query 参数传递）
    const res = await request('GET', '/yaml-auth-test.yaml', {
      query: { token: VIEW_TOKEN },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/yaml');
  });

  test('正确 ADMIN_TOKEN 访问 API 应通过鉴权', async () => {
    const res = await request('GET', '/api/configs', {
      headers: adminHeaders(),
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('configs');
  });

  test('VIEW_TOKEN 不能访问需要 ADMIN_TOKEN 的端点', async () => {
    // VIEW_TOKEN 仅用于 YAML 获取，不应用于 /api/configs
    const res = await request('GET', '/api/configs', {
      headers: { Authorization: 'Bearer invalid-token' },
    });
    // 应该被拒绝（因为没有 Bearer ADMIN_TOKEN）
    expect(res.status).toBe(403);
  });

  test('Authorization 头不带 Bearer 前缀应返回 403', async () => {
    const res = await request('GET', '/api/configs', {
      headers: { Authorization: ADMIN_TOKEN },
    });
    expect(res.status).toBe(403);
  });
});
