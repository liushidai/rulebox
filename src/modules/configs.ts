/**
 * 配置管理 API 路由
 * /api/configs/*
 */

import { Elysia, t, status } from 'elysia';
import type { ConfigStore } from '../lib/store';
import type { createAuth } from './auth';
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

export function createConfigsModule({ store, auth }: Props) {
  return new Elysia({ name: 'configs-routes', prefix: '/api/configs' })
    .guard({
      beforeHandle: auth.adminCheck as any,
    })
    .get(
      '/',
      () => {
        return { configs: store.listNames() };
      },
      {
        response: { 200: ConfigListResponse },
      },
    )

    // POST /api/configs - 新增
    .post(
      '/',
      ({ body: { name } }) => {
        try {
          store.createConfig(name);
          return status(201, { created: name });
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
          201: t.Object({ created: t.String() }),
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

    // GET /api/configs/{name}/items - 获取数据项
    .get(
      '/:name/items',
      ({ params: { name } }) => {
        const items = store.getConfig(name);

        if (items === undefined) {
          return status(404, {
            error: 'config not found',
            code: 'CONFIG_NOT_FOUND',
          });
        }

        return { name, items };
      },
      {
        params: NameParam,
        response: {
          200: ConfigItemsResponse,
          404: t.Object({ error: t.String(), code: t.String() }),
        },
      },
    )

    // POST /api/configs/{name}/items - 追加数据项
    .post(
      '/:name/items',
      ({ params: { name }, body: { items } }) => {
        try {
          const itemsArray = Array.isArray(items) ? items : [items];
          store.addItems(name, itemsArray);
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
      },
    )

    // DELETE /api/configs/{name}/items - 删除数据项
    .delete(
      '/:name/items',
      ({ params: { name }, body: { items } }) => {
        try {
          const itemsArray = Array.isArray(items) ? items : [items];
          store.removeItems(name, itemsArray);
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
