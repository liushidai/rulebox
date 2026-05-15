/**
 * TypeBox 验证模型定义
 */

import { t } from 'elysia';

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
    {
      classical: 'classical',
      domain: 'domain',
      ipcidr: 'ipcidr',
    },
    {
      description: '配置类型：classical, domain, 或 ipcidr',
    },
  ),
  description: t.Optional(
    t.String({
      description: '配置描述（可选）',
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
});

export const ConfigListResponse = t.Object({
  configs: t.Array(ConfigEntrySchema),
});

export const ConfigItemsResponse = t.Object({
  name: t.String(),
  type: t.String(),
  description: t.String(),
  created_at: t.String(),
  items: t.Array(ConfigItemSchema),
});
