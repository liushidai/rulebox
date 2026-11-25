import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createTestApp, adminHeaders } from './helpers/app';

describe('数据项操作测试', () => {
  let fixture: ReturnType<typeof createTestApp>;
  let request: typeof fixture.request;

  beforeEach(() => {
    fixture = createTestApp();
    request = fixture.request;
  });
  afterEach(() => fixture.cleanup());

  describe('POST 添加数据项', () => {
    test('向 domain 配置添加合法域名应成功', async () => {
      await request('POST', '/api/configs', {
        headers: adminHeaders(),
        body: { name: 'items-domain-test', type: 'domain' },
      });
      const res = await request('POST', '/api/configs/items-domain-test/items', {
        headers: adminHeaders(),
        body: {
          items: [
            { value: 'example.com', description: '主域名' },
            { value: '+.google.com', description: '子域名通配' },
            { value: '*.test.com', description: '单级通配' },
          ],
        },
      });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('added', 3);
    });

    test('向 ipcidr 配置添加合法 CIDR 应成功', async () => {
      await request('POST', '/api/configs', {
        headers: adminHeaders(),
        body: { name: 'items-ipcidr-test', type: 'ipcidr' },
      });
      const res = await request('POST', '/api/configs/items-ipcidr-test/items', {
        headers: adminHeaders(),
        body: {
          items: [
            { value: '192.168.1.0/24', description: '内网段' },
            { value: '10.0.0.0/8', description: '大内网' },
            { value: '::1/128', description: 'IPv6 本地' },
          ],
        },
      });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('added', 3);
    });

    test('向 classical 配置添加合法规则应成功', async () => {
      await request('POST', '/api/configs', {
        headers: adminHeaders(),
        body: { name: 'items-classical-test', type: 'classical' },
      });
      const res = await request('POST', '/api/configs/items-classical-test/items', {
        headers: adminHeaders(),
        body: {
          items: [
            { value: 'DOMAIN,example.com', description: '域名规则' },
            { value: 'DOMAIN-SUFFIX,google.com', description: '后缀规则' },
            { value: 'IP-CIDR,192.168.0.0/16', description: 'CIDR规则' },
            { value: 'DST-PORT,443', description: '端口规则' },
            { value: 'GEOSITE,cn', description: 'GeoSite规则' },
            { value: 'GEOIP,cn,no-resolve', description: 'GeoIP规则' },
          ],
        },
      });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('added', 6);
    });

    test('classical 配置添加 MATCH 规则（无逗号）应返回 400', async () => {
      await request('POST', '/api/configs', {
        headers: adminHeaders(),
        body: { name: 'classical-match-test', type: 'classical' },
      });
      // 注意：当前 validator 要求逗号，所以 MATCH 单独使用会失败
      // 这是 validator 实现的行为
      const res = await request('POST', '/api/configs/classical-match-test/items', {
        headers: adminHeaders(),
        body: {
          items: [{ value: 'MATCH', description: '兜底规则' }],
        },
      });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('code', 'VALIDATION_FAILED');
    });

    test('添加重复 value 应覆盖描述', async () => {
      await request('POST', '/api/configs', {
        headers: adminHeaders(),
        body: { name: 'items-dup-test', type: 'domain' },
      });
      // 第一次添加
      await request('POST', '/api/configs/items-dup-test/items', {
        headers: adminHeaders(),
        body: {
          items: [{ value: 'overwrite.com', description: '第一次描述' }],
        },
      });
      // 第二次添加相同 value，不同描述
      await request('POST', '/api/configs/items-dup-test/items', {
        headers: adminHeaders(),
        body: {
          items: [{ value: 'overwrite.com', description: '覆盖描述' }],
        },
      });
      // 验证覆盖
      const getRes = await request('GET', '/api/configs/items-dup-test/items', {
        headers: adminHeaders(),
      });
      expect(getRes.status).toBe(200);
      const items = (getRes.body as any).items;
      // 应该只有一项
      expect(items.length).toBe(1);
      expect(items[0].description).toBe('覆盖描述');
    });

    test('向不存在的配置添加数据项应返回 404', async () => {
      const res = await request('POST', '/api/configs/nonexistent/items', {
        headers: adminHeaders(),
        body: {
          items: [{ value: 'example.com', description: '测试' }],
        },
      });
      expect(res.status).toBe(404);
    });
  });

  describe('数据项格式校验', () => {
    test('domain 配置添加非法域名应返回 400', async () => {
      await request('POST', '/api/configs', {
        headers: adminHeaders(),
        body: { name: 'val-domain-test', type: 'domain' },
      });
      const res = await request('POST', '/api/configs/val-domain-test/items', {
        headers: adminHeaders(),
        body: {
          items: [
            { value: 'valid.com', description: '合法' },
            { value: 'invalid domain!!', description: '非法' },
          ],
        },
      });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('code', 'VALIDATION_FAILED');
      expect((res.body as any).details).toBeDefined();
      expect(Array.isArray((res.body as any).details)).toBe(true);
    });

    test('domain 配置添加空值应返回 400', async () => {
      await request('POST', '/api/configs', {
        headers: adminHeaders(),
        body: { name: 'val-domain-empty', type: 'domain' },
      });
      const res = await request('POST', '/api/configs/val-domain-empty/items', {
        headers: adminHeaders(),
        body: {
          items: [{ value: '', description: '空值' }],
        },
      });
      expect(res.status).toBe(400);
    });

    test('ipcidr 配置添加非法 CIDR 应返回 400', async () => {
      await request('POST', '/api/configs', {
        headers: adminHeaders(),
        body: { name: 'val-ipcidr-test', type: 'ipcidr' },
      });
      // 缺少 CIDR 前缀
      const res = await request('POST', '/api/configs/val-ipcidr-test/items', {
        headers: adminHeaders(),
        body: {
          items: [{ value: '192.168.1.1', description: '缺少前缀' }],
        },
      });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('code', 'VALIDATION_FAILED');
    });

    test('ipcidr 配置添加非法 IPv4 前缀应返回 400', async () => {
      await request('POST', '/api/configs', {
        headers: adminHeaders(),
        body: { name: 'val-ipcidr-prefix', type: 'ipcidr' },
      });
      const res = await request('POST', '/api/configs/val-ipcidr-prefix/items', {
        headers: adminHeaders(),
        body: {
          items: [{ value: '192.168.1.0/33', description: '前缀过大' }],
        },
      });
      expect(res.status).toBe(400);
    });

    test('classical 配置添加缺少逗号的规则应返回 400', async () => {
      await request('POST', '/api/configs', {
        headers: adminHeaders(),
        body: { name: 'val-classical-test', type: 'classical' },
      });
      const res = await request('POST', '/api/configs/val-classical-test/items', {
        headers: adminHeaders(),
        body: {
          items: [{ value: 'DOMAIN example.com', description: '缺少逗号' }],
        },
      });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('code', 'VALIDATION_FAILED');
    });

    test('classical 配置添加未知规则类型应返回 400', async () => {
      await request('POST', '/api/configs', {
        headers: adminHeaders(),
        body: { name: 'val-classical-unknown', type: 'classical' },
      });
      const res = await request('POST', '/api/configs/val-classical-unknown/items', {
        headers: adminHeaders(),
        body: {
          items: [{ value: 'UNKNOWN-TYPE,example.com', description: '未知类型' }],
        },
      });
      expect(res.status).toBe(400);
    });

    test('classical 配置添加非法端口号应返回 400', async () => {
      await request('POST', '/api/configs', {
        headers: adminHeaders(),
        body: { name: 'val-classical-port', type: 'classical' },
      });
      const res = await request('POST', '/api/configs/val-classical-port/items', {
        headers: adminHeaders(),
        body: {
          items: [{ value: 'DST-PORT,99999', description: '端口过大' }],
        },
      });
      expect(res.status).toBe(400);
    });

    test('domain 配置支持通配符格式 +. 前缀', async () => {
      await request('POST', '/api/configs', {
        headers: adminHeaders(),
        body: { name: 'wildcard-plus', type: 'domain' },
      });
      const res = await request('POST', '/api/configs/wildcard-plus/items', {
        headers: adminHeaders(),
        body: {
          items: [{ value: '+.sub.example.com', description: '多级通配符' }],
        },
      });
      expect(res.status).toBe(200);
    });

    test('domain 配置支持通配符格式 . 前缀', async () => {
      await request('POST', '/api/configs', {
        headers: adminHeaders(),
        body: { name: 'wildcard-dot', type: 'domain' },
      });
      const res = await request('POST', '/api/configs/wildcard-dot/items', {
        headers: adminHeaders(),
        body: {
          items: [{ value: '.example.com', description: '.' }],
        },
      });
      expect(res.status).toBe(200);
    });
  });

  describe('DELETE 删除数据项', () => {
    test('删除已存在的数据项应成功', async () => {
      await request('POST', '/api/configs', {
        headers: adminHeaders(),
        body: { name: 'delete-items-test', type: 'domain' },
      });
      // 先添加
      await request('POST', '/api/configs/delete-items-test/items', {
        headers: adminHeaders(),
        body: {
          items: [
            { value: 'keep.com', description: '保留' },
            { value: 'remove.com', description: '删除' },
          ],
        },
      });
      // 删除一项
      const res = await request('DELETE', '/api/configs/delete-items-test/items', {
        headers: adminHeaders(),
        body: {
          items: [{ value: 'remove.com', description: '' }],
        },
      });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('removed', 1);

      // 验证删除结果
      const getRes = await request('GET', '/api/configs/delete-items-test/items', {
        headers: adminHeaders(),
      });
      const items = (getRes.body as any).items;
      expect(items.length).toBe(1);
      expect(items[0].value).toBe('keep.com');
    });

    test('删除不存在的 value 不应报错', async () => {
      await request('POST', '/api/configs', {
        headers: adminHeaders(),
        body: { name: 'delete-missing-item', type: 'domain' },
      });
      const res = await request('DELETE', '/api/configs/delete-missing-item/items', {
        headers: adminHeaders(),
        body: {
          items: [{ value: 'not-exist.com', description: '' }],
        },
      });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('removed', 0);
    });

    test('向不存在的配置删除数据项应返回 404', async () => {
      const res = await request('DELETE', '/api/configs/nonexistent/items', {
        headers: adminHeaders(),
        body: {
          items: [{ value: 'whatever.com', description: '' }],
        },
      });
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('code', 'CONFIG_NOT_FOUND');
    });
  });
});
