/**
 * YAML 配置获取路由
 * GET /:name.yaml?token=<VIEW_TOKEN>
 */

import { Elysia } from 'elysia';
import type { ConfigStore } from '../lib/store';
import { extractPayload, serializeYaml } from '../lib/yaml';
import { ConfigNamePattern } from '../schema';
import type { createAuth } from './auth';

interface Props {
  store: ConfigStore;
  auth: ReturnType<typeof createAuth>;
}

export function createYamlModule({ store, auth }: Props) {
  return new Elysia({ name: 'yaml-routes' })
    .get('/:fileName', (ctx) => {
      const { fileName } = ctx.params;
      if (!fileName.endsWith('.yaml')) return;

      const name = fileName.replace(/\.yaml$/, '');

      // 验证配置名格式
      if (!name || !ConfigNamePattern.test(name)) {
        ctx.set.status = 400;
        return { error: 'invalid config name', code: 'INVALID_CONFIG_NAME' };
      }

      const items = store.getConfig(name);
      if (!items) {
        ctx.set.status = 404;
        return { error: 'config not found', code: 'CONFIG_NOT_FOUND' };
      }

      ctx.set.headers['content-type'] = 'application/yaml';
      // 输出 mihomo 兼容格式：payload: [string]
      return serializeYaml(extractPayload(items));
    }, {
      beforeHandle: auth.viewCheck as any,
    });
}
