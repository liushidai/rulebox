/**
 * TypeBox 验证模型定义
 */

import { t } from 'elysia';
import { CONFIG_TYPES } from './lib/index';

// --- 配置项结构 ---
export const ConfigItemSchema = t.Object({
  value: t.String({
    description: '配置项的值',
  }),
  description: t.Optional(
    t.String({
      maxLength: 500,
      description: '配置项的描述信息（可选，用于 DELETE 时可不传）',
    }),
  ),
});

// --- 配置名验证 ---
export const ConfigNamePattern = /^[a-zA-Z0-9_-]+$/;

export const CreateConfigBody = t.Object({
  name: t.String({
    pattern: ConfigNamePattern.source,
    description: '配置名称，仅允许字母、数字、下划线和连字符',
  }),
  type: t.Enum(
    CONFIG_TYPES,
    {
      description: '配置类型：classical, domain, 或 ipcidr',
    },
  ),
  description: t.Optional(
    t.String({
      maxLength: 500,
      description: '配置描述（可选），最多 500 字符',
    }),
  ),
});

export const RenameConfigBody = t.Object({
  newName: t.String({
    pattern: ConfigNamePattern.source,
    description: '新配置名称，仅允许字母、数字、下划线和连字符',
  }),
});

export const UpdateDescriptionBody = t.Object({
  description: t.String({
    minLength: 0,
    maxLength: 500,
    description: '新的配置描述，最多 500 字符',
  }),
});

// --- 数据项验证 ---
export const ItemsBody = t.Object({
  items: t.Array(ConfigItemSchema, {
    description: '数据项数组，每个项包含 value 和 description',
  }),
});

// --- 响应模型 ---
export const ConfigEntrySchema = t.Object({
  name: t.String(),
  type: t.String(),
  description: t.String(),
  created_at: t.String(),
  item_count: t.Number({ description: '该配置集的数据项条数' }),
});

export const ConfigListResponse = t.Object({
  configs: t.Array(ConfigEntrySchema),
});

// --- 数据项查询参数 ---
export const ItemsQuery = t.Object({
  page: t.Optional(
    t.Numeric({
      minimum: 1,
      multipleOf: 1,
      description: '页码，从 1 开始；不传时返回全部数据项',
    }),
  ),
  pageSize: t.Optional(
    t.Numeric({
      minimum: 1,
      maximum: 1000,
      multipleOf: 1,
      description: '每页条数，1 到 1000，默认 100；仅在传了 page 时生效',
    }),
  ),
  q: t.Optional(
    t.String({
      maxLength: 200,
      description: '关键字，不区分大小写匹配 value 或 description',
    }),
  ),
});

export const ConfigItemsResponse = t.Object({
  name: t.String(),
  type: t.String(),
  description: t.String(),
  created_at: t.String(),
  items: t.Array(ConfigItemSchema),
  total: t.Number({ description: '筛选后的数据项总条数' }),
  page: t.Optional(t.Number({ description: '当前页码，仅在传了 page 时返回' })),
  pageSize: t.Optional(t.Number({ description: '每页条数，仅在传了 page 时返回' })),
});

export const DeleteItemsResponse = t.Object({
  removed: t.Number({ description: '实际被删除的条数' }),
  from: t.String(),
});

export const SubscriptionResponse = t.Object({
  name: t.String(),
  url: t.String({ description: '根相对订阅地址，带 VIEW_TOKEN' }),
});
