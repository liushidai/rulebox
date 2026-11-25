/**
 * 配置管理 API 路由
 * /api/configs/*
 */

import { Elysia, t, status } from 'elysia';
import { DEFAULT_PAGE_SIZE, type ConfigStore } from '../lib/store';
import type { createAuth } from './auth';
import type { ConfigType } from '../lib/index';
import { validateItem } from '../lib/validator';
import type { ConfigItem } from '../lib/yaml';
import {
  ConfigListResponse,
  ConfigItemsResponse,
  CreateConfigBody,
  RenameConfigBody,
  UpdateDescriptionBody,
  ItemsBody,
  ItemsQuery,
  DeleteItemsResponse,
  SubscriptionResponse,
  ConfigNamePattern,
} from '../schema';
import { CONFIG_TYPES } from '../lib/index';

interface Props {
  store: ConfigStore;
  auth: ReturnType<typeof createAuth>;
  /** VIEW_TOKEN，用于拼装订阅链接 */
  viewToken: string;
}

// 配置名参数 schema
const NameParam = t.Object({
  name: t.String({ pattern: ConfigNamePattern.source }),
});

/**
 * 安全读取配置条数：index.yaml 中若残留非法名称，
 * countItems 会抛 INVALID_CONFIG_NAME，此处降级为 0，避免整个列表 500
 */
function countItemsSafely(store: ConfigStore, name: string): number {
  try {
    return store.countItems(name);
  } catch {
    return 0;
  }
}

// 查询参数 schema
const ListQuery = t.Object({
  type: t.Optional(
    t.Enum(CONFIG_TYPES, {
      description: '配置类型：classical, domain, 或 ipcidr',
    }),
  ),
});

export function createConfigsModule({ store, auth, viewToken }: Props) {
  return new Elysia({ name: 'configs-routes', prefix: '/api/configs' })
    .guard({
      beforeHandle: auth.adminCheck as any,
    })

    // GET /api/configs - 列表（支持 ?type= 筛选，每项附带 item_count）
    .get(
      '/',
      ({ query }) => {
        const entries = query.type
          ? store.filterByType(query.type as ConfigType)
          : store.listEntries();
        return {
          configs: entries.map((entry) => ({
            ...entry,
            // index.yaml 中残留非法名称时按 0 处理，避免整个列表失败
            item_count: countItemsSafely(store, entry.name),
          })),
        };
      },
      {
        query: ListQuery,
        response: { 200: ConfigListResponse },
      },
    )

    // POST /api/configs - 新增（含 type/description）
    .post(
      '/',
      ({ body: { name, type, description } }) => {
        try {
          store.createConfig(name, type as ConfigType, description || '');
          return status(201, {
            created: name,
            type,
            description: description || '',
          });
        } catch (err: any) {
          if (err.message === 'CONFIG_ALREADY_EXISTS') {
            return status(409, {
              error: 'config already exists',
              code: 'CONFLICT',
            });
          }
          throw err;
        }
      },
      {
        body: CreateConfigBody,
        response: {
          201: t.Object({
            created: t.String(),
            type: t.String(),
            description: t.String(),
          }),
          409: t.Object({ error: t.String(), code: t.String() }),
        },
      },
    )

    // DELETE /api/configs/{name} - 删除
    .delete(
      '/:name',
      ({ params: { name } }) => {
        try {
          store.deleteConfig(name);
          return { deleted: name };
        } catch (err: any) {
          if (err.message === 'CONFIG_NOT_FOUND') {
            return status(404, {
              error: 'config not found',
              code: 'CONFIG_NOT_FOUND',
            });
          }
          throw err;
        }
      },
      {
        params: NameParam,
      },
    )

    // PATCH /api/configs/{name}/rename - 重命名
    .patch(
      '/:name/rename',
      ({ params: { name }, body: { newName } }) => {
        try {
          store.renameConfig(name, newName);
          return { renamed: name, to: newName };
        } catch (err: any) {
          if (err.message === 'CONFIG_NOT_FOUND') {
            return status(404, {
              error: 'config not found',
              code: 'CONFIG_NOT_FOUND',
            });
          }
          if (err.message === 'CONFIG_ALREADY_EXISTS') {
            return status(409, {
              error: 'config already exists',
              code: 'CONFLICT',
            });
          }
          throw err;
        }
      },
      {
        params: NameParam,
        body: RenameConfigBody,
      },
    )

    // PATCH /api/configs/{name} - 修改配置描述
    .patch(
      '/:name',
      ({ params: { name }, body: { description } }) => {
        try {
          store.updateConfigDescription(name, description);
          return { updated: name, description };
        } catch (err: any) {
          if (err.message === 'CONFIG_NOT_FOUND') {
            return status(404, {
              error: 'config not found',
              code: 'CONFIG_NOT_FOUND',
            });
          }
          throw err;
        }
      },
      {
        params: NameParam,
        body: UpdateDescriptionBody,
        response: {
          200: t.Object({ updated: t.String(), description: t.String() }),
          404: t.Object({ error: t.String(), code: t.String() }),
        },
      },
    )

    // GET /api/configs/{name}/items - 获取数据项（支持分页与关键字搜索）
    .get(
      '/:name/items',
      ({ params: { name }, query }) => {
        const entry = store.getEntry(name);
        if (!entry) {
          return status(404, {
            error: 'config not found',
            code: 'CONFIG_NOT_FOUND',
          });
        }

        const { items, total } = store.queryItems(name, {
          page: query.page,
          pageSize: query.pageSize,
          q: query.q,
        });

        const base = {
          name: entry.name,
          type: entry.type,
          description: entry.description,
          created_at: entry.created_at,
          items,
          total,
        };

        // 不传 page 时保持向后兼容：响应不含 page 与 pageSize
        if (query.page === undefined) {
          return base;
        }

        return {
          ...base,
          page: query.page,
          pageSize: query.pageSize ?? DEFAULT_PAGE_SIZE,
        };
      },
      {
        params: NameParam,
        query: ItemsQuery,
        response: {
          200: ConfigItemsResponse,
          404: t.Object({ error: t.String(), code: t.String() }),
        },
      },
    )

    // POST /api/configs/{name}/items - 追加数据项（含校验）
    .post(
      '/:name/items',
      async ({ params: { name }, body: { items } }) => {
        const entry = store.getEntry(name);
        if (!entry) {
          return status(404, {
            error: 'config not found',
            code: 'CONFIG_NOT_FOUND',
          });
        }

        // 校验 items 格式，确保 description 始终为字符串
        const itemsArray: ConfigItem[] = (Array.isArray(items) ? items : [items]).map(
          (item) => ({ value: item.value, description: item.description ?? '' }),
        );
        const validationErrors: Array<{ index: number; value: string; reason: string }> = [];

        // 逐项校验
        for (let i = 0; i < itemsArray.length; i++) {
          const result = validateItem(itemsArray[i].value, entry.type as ConfigType);
          if (!result.valid) {
            validationErrors.push({
              index: i,
              value: itemsArray[i].value,
              reason: result.error || 'Unknown error',
            });
          }
        }

        // 如果有校验失败，返回详细错误信息
        if (validationErrors.length > 0) {
          return status(400, {
            error: `Invalid items found at indices: ${validationErrors.map((e) => e.index).join(', ')}`,
            code: 'VALIDATION_FAILED',
            details: validationErrors,
          });
        }

        // 校验通过，追加数据
        try {
          await store.addItems(name, itemsArray);
          return { added: itemsArray.length, to: name };
        } catch (err: any) {
          if (err.message === 'CONFIG_NOT_FOUND') {
            return status(404, {
              error: 'config not found',
              code: 'CONFIG_NOT_FOUND',
            });
          }
          throw err;
        }
      },
      {
        params: NameParam,
        body: ItemsBody,
        response: {
          200: t.Object({ added: t.Number(), to: t.String() }),
          400: t.Object({
            error: t.String(),
            code: t.String(),
            details: t.Array(
              t.Object({
                index: t.Number(),
                value: t.String(),
                reason: t.String(),
              }),
            ),
          }),
          404: t.Object({ error: t.String(), code: t.String() }),
        },
      },
    )

    // DELETE /api/configs/{name}/items - 删除数据项（返回实际删除条数）
    .delete(
      '/:name/items',
      async ({ params: { name }, body: { items } }) => {
        try {
          const itemsArray: string[] = items.map((item) => item.value);
          // removed 为实际删除条数，请求中重复或不存在的 value 不计入
          const removed = await store.removeItems(name, itemsArray);
          return { removed, from: name };
        } catch (err: any) {
          if (err.message === 'CONFIG_NOT_FOUND') {
            return status(404, {
              error: 'config not found',
              code: 'CONFIG_NOT_FOUND',
            });
          }
          throw err;
        }
      },
      {
        params: NameParam,
        body: ItemsBody,
        response: {
          200: DeleteItemsResponse,
          404: t.Object({ error: t.String(), code: t.String() }),
        },
      },
    )

    // GET /api/configs/{name}/subscription - 获取订阅链接（根相对地址，带 VIEW_TOKEN）
    .get(
      '/:name/subscription',
      ({ params: { name }, set }) => {
        const entry = store.getEntry(name);
        if (!entry) {
          return status(404, {
            error: 'config not found',
            code: 'CONFIG_NOT_FOUND',
          });
        }

        // 订阅链接含 VIEW_TOKEN，禁止中间层缓存
        set.headers['cache-control'] = 'no-store';

        // 后端不知道自己的公网地址，故返回根相对地址，由前端拼接 location.origin
        return {
          name: entry.name,
          url: `/${entry.name}.yaml?token=${encodeURIComponent(viewToken)}`,
        };
      },
      {
        params: NameParam,
        response: {
          200: SubscriptionResponse,
          404: t.Object({ error: t.String(), code: t.String() }),
        },
      },
    );
}
