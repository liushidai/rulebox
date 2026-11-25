import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createTestApp, adminHeaders, VIEW_TOKEN } from './helpers/app';

describe('YAML 输出测试', () => {
  let fixture: ReturnType<typeof createTestApp>;
  let request: typeof fixture.request;

  beforeEach(() => {
    fixture = createTestApp();
    request = fixture.request;
  });
  afterEach(() => fixture.cleanup());

  test('获取 YAML 配置内容格式正确', async () => {
    await request('POST', '/api/configs', {
      headers: adminHeaders(),
      body: { name: 'yaml-output-test', type: 'domain' },
    });
    await request('POST', '/api/configs/yaml-output-test/items', {
      headers: adminHeaders(),
      body: {
        items: [
          { value: 'example.com', description: '示例域名' },
          { value: '+.google.com', description: 'Google 子域名' },
          { value: 'test.org', description: '测试域名' },
        ],
      },
    });
    const res = await request('GET', '/yaml-output-test.yaml', {
      query: { token: VIEW_TOKEN },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/yaml');
    // 验证包含 payload 字段
    expect(res.text).toContain('payload');
  });

  test('YAML 输出为 mihomo 兼容格式 (payload: [string])', async () => {
    await request('POST', '/api/configs', {
      headers: adminHeaders(),
      body: { name: 'mihomo-format-test', type: 'ipcidr' },
    });
    await request('POST', '/api/configs/mihomo-format-test/items', {
      headers: adminHeaders(),
      body: {
        items: [
          { value: '192.168.0.0/16', description: '' },
          { value: '10.0.0.0/8', description: '' },
        ],
      },
    });
    const res = await request('GET', '/mihomo-format-test.yaml', {
      query: { token: VIEW_TOKEN },
    });
    expect(res.status).toBe(200);
    // 验证输出为 payload 数组格式，不包含 description
    expect(res.text).toContain('payload');
    expect(res.text).toContain('192.168.0.0/16');
    expect(res.text).toContain('10.0.0.0/8');
    // mihomo 兼容格式不应包含 description 字段
    expect(res.text).not.toContain('description');
  });

  test('获取不存在的 YAML 配置应返回 404', async () => {
    const res = await request('GET', '/nonexistent-config.yaml', {
      query: { token: VIEW_TOKEN },
    });
    expect(res.status).toBe(404);
  });

  test('YAML 配置无数据项时输出空 payload', async () => {
    await request('POST', '/api/configs', {
      headers: adminHeaders(),
      body: { name: 'empty-yaml-test', type: 'domain' },
    });
    const res = await request('GET', '/empty-yaml-test.yaml', {
      query: { token: VIEW_TOKEN },
    });
    expect(res.status).toBe(200);
    expect(res.text).toContain('payload');
  });

  test('不带 .yaml 后缀的请求不会返回 YAML 内容', async () => {
    // 不带 token 时，viewCheck 返回 403
    const res = await request('GET', '/some-config');
    expect(res.status).toBe(403);

    // 带正确 token 但文件名不是 .yaml 后缀
    // YAML 路由返回 undefined（未匹配），此时响应取决于 Elysia 行为
    const resWithToken = await request('GET', '/some-config', {
      query: { token: VIEW_TOKEN },
    });
    // 确认不返回 YAML 内容
    expect(resWithToken.headers.get('content-type')).not.toBe('text/yaml');
  });
});
