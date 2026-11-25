import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createTestApp, adminHeaders } from './helpers/app';

describe('路径安全测试', () => {
  let fixture: ReturnType<typeof createTestApp>;
  let request: typeof fixture.request;

  beforeEach(() => {
    fixture = createTestApp();
    request = fixture.request;
  });
  afterEach(() => fixture.cleanup());

  test('尝试使用路径遍历名称 ../ 应被拒绝', async () => {
    const res = await request('POST', '/api/configs', {
      headers: adminHeaders(),
      body: { name: '../etc/passwd', type: 'domain' },
    });
    expect(res.status).toBe(400);
  });

  test('尝试使用路径遍历名称 .. 应被拒绝', async () => {
    const res = await request('POST', '/api/configs', {
      headers: adminHeaders(),
      body: { name: 'test/../secret', type: 'domain' },
    });
    expect(res.status).toBe(400);
  });

  test('尝试使用含斜杠的名称应被拒绝', async () => {
    const res = await request('POST', '/api/configs', {
      headers: adminHeaders(),
      body: { name: 'foo/bar', type: 'domain' },
    });
    expect(res.status).toBe(400);
  });

  test('尝试使用含空格的名称应被拒绝', async () => {
    const res = await request('POST', '/api/configs', {
      headers: adminHeaders(),
      body: { name: 'name with space', type: 'domain' },
    });
    expect(res.status).toBe(400);
  });

  test('尝试使用含特殊字符的名称应被拒绝', async () => {
    const res = await request('POST', '/api/configs', {
      headers: adminHeaders(),
      body: { name: 'name<script>', type: 'domain' },
    });
    expect(res.status).toBe(400);
  });

  test('尝试使用含点号的名称应被拒绝', async () => {
    const res = await request('POST', '/api/configs', {
      headers: adminHeaders(),
      body: { name: 'name.yaml', type: 'domain' },
    });
    expect(res.status).toBe(400);
  });

  test('通过 GET 请求使用路径遍历名称应被拒绝', async () => {
    const res = await request('GET', '/api/configs/../../../etc/passwd/items', {
      headers: adminHeaders(),
    });
    expect(res.status).toBe(404);
  });

  test('通过 DELETE 请求使用路径遍历名称应被拒绝', async () => {
    const res = await request('DELETE', '/api/configs/../../secret', {
      headers: adminHeaders(),
    });
    expect(res.status).toBe(404);
  });
});
