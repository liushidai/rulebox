/**
 * 配置管理 API 路由
 * /api/configs/*
 */

import { Elysia, t, status } from 'elysia';
import type { ConfigStore } from '../lib/store';
import type { createAuth } from './auth';
import type { ConfigType } from '../lib/index';
import { validateItem } from '../lib/validator';
import type { ConfigItem } from '../lib/yaml';
import {
  ConfigListResponse,
  ConfigItemsResponse,
  CreateConfigBody,
  RenameConfigBody,
  ItemsBody,
  ConfigNamePattern,
} from '../schema';

interface Props {
  store: ConfigStore;
  auth: ReturnType<typeof createAuth>;
}

// 配置名参数 schema
const NameParam = t.Object({
  name: t.String({ pattern: ConfigNamePattern.source }),
});

// 查询参数 schema
const ListQuery = t.Object({
  type: t.Optional(
    t.Enum({
      classical: 'classical',
      domain: 'domain',
      ipcidr: 'ipcidr',
    }),
  ),
});

export function createConfigsModule({ store, auth }: Props) {
  return new Elysia({ name: 'configs-routes', prefix: '/api/configs' })
    .guard({
      beforeHandle: auth.adminCheck as any,
    })

    // GET /api/configs - 列表（支持 ?type= 筛选）
    .get(
      '/',
      ({ query }) => {
        if (query.type) {
          const entries = store.filterByType(query.type as ConfigType);
          return { configs: entries };
        }
        return { configs: store.listEntries() };
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

    // GET /api/configs/{name}/items - 获取数据项（含元数据）
    .get(
      '/:name/items',
      ({ params: { name } }) => {
        const entry = store.getEntry(name);
        if (!entry) {
          return status(404, {
            error: 'config not found',
            code: 'CONFIG_NOT_FOUND',
          });
        }

        const items = store.getConfig(name) || [];
        return {
          name: entry.name,
          type: entry.type,
          description: entry.description,
          created_at: entry.created_at,
          items,
        };
      },
      {
        params: NameParam,
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

    // DELETE /api/configs/{name}/items - 删除数据项
    .delete(
      '/:name/items',
      async ({ params: { name }, body: { items } }) => {
        try {
          const itemsArray: string[] = items.map(item => item.value);
          await store.removeItems(name, itemsArray);
          return { removed: itemsArray.length, from: name };
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
      },
    );
}
