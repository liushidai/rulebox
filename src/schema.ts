/**
 * TypeBox 验证模型定义
 */

import { t } from 'elysia';

// --- 配置名验证 ---
export const ConfigNamePattern = /^[a-zA-Z0-9_-]+$/;

export const CreateConfigBody = t.Object({
  name: t.String({
    pattern: ConfigNamePattern.source,
    description: '配置名称，仅允许字母、数字、下划线和连字符',
  }),
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
export const ConfigListResponse = t.Object({
  configs: t.Array(t.String()),
});

export const ConfigItemsResponse = t.Object({
  name: t.String(),
  items: t.Array(t.String()),
});

export const ErrorResponse = t.Object({
  error: t.String(),
  code: t.String(),
});
