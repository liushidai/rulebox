import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createTestApp, adminHeaders } from './helpers/app';

describe('完整 CRUD 流程测试', () => {
  let fixture: ReturnType<typeof createTestApp>;
  let request: typeof fixture.request;

  beforeEach(() => {
    fixture = createTestApp();
    request = fixture.request;
  });
  afterEach(() => fixture.cleanup());

  test('创建→添加→查询→更新→重命名→删除的完整流程', async () => {
    // 1. 创建
    let res = await request('POST', '/api/configs', {
      headers: adminHeaders(),
      body: { name: 'full-crud-flow', type: 'domain', description: '完整流程测试' },
    });
    expect(res.status).toBe(201);

    // 2. 添加数据项
    res = await request('POST', '/api/configs/full-crud-flow/items', {
      headers: adminHeaders(),
      body: {
        items: [
          { value: 'flow-test.com', description: '流程测试1' },
          { value: 'flow-test2.com', description: '流程测试2' },
        ],
      },
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('added', 2);

    // 3. 查询数据项
    res = await request('GET', '/api/configs/full-crud-flow/items', {
      headers: adminHeaders(),
    });
    expect(res.status).toBe(200);
    expect((res.body as any).items.length).toBe(2);

    // 4. 更新描述
    res = await request('PATCH', '/api/configs/full-crud-flow', {
      headers: adminHeaders(),
      body: { description: '更新后的描述' },
    });
    expect(res.status).toBe(200);

    // 5. 重命名
    res = await request('PATCH', '/api/configs/full-crud-flow/rename', {
      headers: adminHeaders(),
      body: { newName: 'full-crud-renamed' },
    });
    expect(res.status).toBe(200);

    // 6. 验证重命名后的查询
    res = await request('GET', '/api/configs/full-crud-renamed/items', {
      headers: adminHeaders(),
    });
    expect(res.status).toBe(200);
    expect((res.body as any).name).toBe('full-crud-renamed');

    // 7. 验证旧名称不存在
    res = await request('GET', '/api/configs/full-crud-flow/items', {
      headers: adminHeaders(),
    });
    expect(res.status).toBe(404);

    // 8. 删除
    res = await request('DELETE', '/api/configs/full-crud-renamed', {
      headers: adminHeaders(),
    });
    expect(res.status).toBe(200);

    // 9. 验证已删除
    res = await request('GET', '/api/configs/full-crud-renamed/items', {
      headers: adminHeaders(),
    });
    expect(res.status).toBe(404);
  });
});
