import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createTestApp, adminHeaders } from './helpers/app';

describe('配置 CRUD 测试', () => {
  let fixture: ReturnType<typeof createTestApp>;
  let request: typeof fixture.request;

  beforeEach(() => {
    fixture = createTestApp();
    request = fixture.request;
  });
  afterEach(() => fixture.cleanup());

  describe('POST 创建配置', () => {
    test('创建 classical 类型配置应成功', async () => {
      const res = await request('POST', '/api/configs', {
        headers: adminHeaders(),
        body: { name: 'test-classical', type: 'classical' },
      });
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('created', 'test-classical');
      expect(res.body).toHaveProperty('type', 'classical');
    });

    test('创建 domain 类型配置应成功', async () => {
      const res = await request('POST', '/api/configs', {
        headers: adminHeaders(),
        body: { name: 'test-domain', type: 'domain' },
      });
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('created', 'test-domain');
      expect(res.body).toHaveProperty('type', 'domain');
    });

    test('创建 ipcidr 类型配置应成功', async () => {
      const res = await request('POST', '/api/configs', {
        headers: adminHeaders(),
        body: { name: 'test-ipcidr', type: 'ipcidr' },
      });
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('created', 'test-ipcidr');
      expect(res.body).toHaveProperty('type', 'ipcidr');
    });

    test('创建配置时带 description 应保存描述', async () => {
      const res = await request('POST', '/api/configs', {
        headers: adminHeaders(),
        body: {
          name: 'test-with-desc',
          type: 'domain',
          description: '这是一个测试配置',
        },
      });
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('description', '这是一个测试配置');
    });

    test('创建同名配置应返回 409 冲突', async () => {
      // 先创建一个
      await request('POST', '/api/configs', {
        headers: adminHeaders(),
        body: { name: 'duplicate-test', type: 'domain' },
      });
      // 再创建同名
      const res = await request('POST', '/api/configs', {
        headers: adminHeaders(),
        body: { name: 'duplicate-test', type: 'ipcidr' },
      });
      expect(res.status).toBe(409);
      expect(res.body).toHaveProperty('code', 'CONFLICT');
    });

    test('名称含非法字符应返回 400', async () => {
      const res = await request('POST', '/api/configs', {
        headers: adminHeaders(),
        body: { name: 'invalid/name', type: 'domain' },
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET 获取配置列表', () => {
    test('获取所有配置列表', async () => {
      const res = await request('GET', '/api/configs', {
        headers: adminHeaders(),
      });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('configs');
      expect(Array.isArray((res.body as any).configs)).toBe(true);
    });

    test('按 type 过滤配置列表', async () => {
      // 创建不同类型的配置
      await request('POST', '/api/configs', {
        headers: adminHeaders(),
        body: { name: 'filter-domain', type: 'domain' },
      });
      await request('POST', '/api/configs', {
        headers: adminHeaders(),
        body: { name: 'filter-ipcidr', type: 'ipcidr' },
      });
      // 按 domain 过滤
      const res = await request('GET', '/api/configs?type=domain', {
        headers: adminHeaders(),
      });
      expect(res.status).toBe(200);
      const configs = (res.body as any).configs;
      expect(configs.length).toBeGreaterThan(0);
      configs.forEach((c: any) => {
        expect(c.type).toBe('domain');
      });
    });
  });

  describe('GET 获取单个配置详情', () => {
    test('获取存在配置的详细信息', async () => {
      await request('POST', '/api/configs', {
        headers: adminHeaders(),
        body: { name: 'detail-test', type: 'classical', description: '详情测试' },
      });
      await request('POST', '/api/configs/detail-test/items', {
        headers: adminHeaders(),
        body: { items: [{ value: 'DOMAIN,example.com', description: '规则1' }] },
      });

      const res = await request('GET', '/api/configs/detail-test/items', {
        headers: adminHeaders(),
      });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('name', 'detail-test');
      expect(res.body).toHaveProperty('type', 'classical');
      expect(res.body).toHaveProperty('description', '详情测试');
      expect(res.body).toHaveProperty('created_at');
      expect(res.body).toHaveProperty('items');
      expect(Array.isArray((res.body as any).items)).toBe(true);
    });

    test('获取不存在的配置应返回 404', async () => {
      const res = await request('GET', '/api/configs/nonexistent-xyz/items', {
        headers: adminHeaders(),
      });
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('code', 'CONFIG_NOT_FOUND');
    });
  });

  describe('DELETE 删除配置', () => {
    test('删除存在的配置应成功', async () => {
      await request('POST', '/api/configs', {
        headers: adminHeaders(),
        body: { name: 'to-delete', type: 'domain' },
      });
      const res = await request('DELETE', '/api/configs/to-delete', {
        headers: adminHeaders(),
      });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('deleted', 'to-delete');

      // 验证已删除
      const verifyRes = await request('GET', '/api/configs/to-delete/items', {
        headers: adminHeaders(),
      });
      expect(verifyRes.status).toBe(404);
    });

    test('删除不存在的配置应返回 404', async () => {
      const res = await request('DELETE', '/api/configs/nonexistent-config', {
        headers: adminHeaders(),
      });
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('code', 'CONFIG_NOT_FOUND');
    });
  });

  describe('PATCH 重命名配置', () => {
    test('重命名存在的配置应成功', async () => {
      await request('POST', '/api/configs', {
        headers: adminHeaders(),
        body: { name: 'rename-from', type: 'domain' },
      });
      const res = await request('PATCH', '/api/configs/rename-from/rename', {
        headers: adminHeaders(),
        body: { newName: 'rename-to' },
      });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('renamed', 'rename-from');
      expect(res.body).toHaveProperty('to', 'rename-to');

      // 验证新名称存在
      const verifyRes = await request('GET', '/api/configs/rename-to/items', {
        headers: adminHeaders(),
      });
      expect(verifyRes.status).toBe(200);
    });

    test('重命名到已存在的名称应返回 409', async () => {
      await request('POST', '/api/configs', {
        headers: adminHeaders(),
        body: { name: 'rename-conflict-a', type: 'domain' },
      });
      await request('POST', '/api/configs', {
        headers: adminHeaders(),
        body: { name: 'rename-conflict-b', type: 'domain' },
      });
      const res = await request('PATCH', '/api/configs/rename-conflict-a/rename', {
        headers: adminHeaders(),
        body: { newName: 'rename-conflict-b' },
      });
      expect(res.status).toBe(409);
      expect(res.body).toHaveProperty('code', 'CONFLICT');
    });

    test('重命名不存在的配置应返回 404', async () => {
      const res = await request('PATCH', '/api/configs/nonexistent/rename', {
        headers: adminHeaders(),
        body: { newName: 'new-name' },
      });
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('code', 'CONFIG_NOT_FOUND');
    });
  });

  describe('PATCH 更新描述', () => {
    test('更新存在的配置描述应成功', async () => {
      await request('POST', '/api/configs', {
        headers: adminHeaders(),
        body: { name: 'desc-update-test', type: 'domain', description: '旧描述' },
      });
      const res = await request('PATCH', '/api/configs/desc-update-test', {
        headers: adminHeaders(),
        body: { description: '新描述' },
      });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('updated', 'desc-update-test');
      expect(res.body).toHaveProperty('description', '新描述');
    });

    test('更新描述为空字符串应成功', async () => {
      await request('POST', '/api/configs', {
        headers: adminHeaders(),
        body: { name: 'desc-empty-test', type: 'domain', description: '有描述' },
      });
      const res = await request('PATCH', '/api/configs/desc-empty-test', {
        headers: adminHeaders(),
        body: { description: '' },
      });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('description', '');
    });

    test('更新不存在的配置描述应返回 404', async () => {
      const res = await request('PATCH', '/api/configs/nonexistent', {
        headers: adminHeaders(),
        body: { description: '新描述' },
      });
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('code', 'CONFIG_NOT_FOUND');
    });
  });
});
