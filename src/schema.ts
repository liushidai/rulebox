/**
 * TypeBox 验证模型定义
 */

import { t } from 'elysia';

// --- 配置名验证 ---
export const ConfigNamePattern = /^[a-zA-Z0-9_-]+$/;

// --- 配置类型验证 ---
export const ConfigTypeValues = ['classical', 'domain', 'ipcidr'] as const;
export type ConfigType = typeof ConfigTypeValues[number];

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

// --- 数据项验证 ---
export const ItemsBody = t.Object({
  items: t.Union([
    t.Array(t.String()),
    t.String(),
  ], {
    description: '数据项，可以是字符串数组或单个字符串',
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
  items: t.Array(t.String()),
});

export const ErrorResponse = t.Object({
  error: t.String(),
  code: t.String(),
});
