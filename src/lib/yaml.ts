/**
 * YAML 解析和序列化封装
 */

import { parse, stringify } from 'yaml';

/**
 * 配置项接口，包含值和描述
 */
export interface ConfigItem {
  value: string;
  description: string;
}

/**
 * YAML 文件内部存储格式
 */
export interface YamlConfig {
  items: ConfigItem[];
}

/**
 * mihomo 兼容的输出格式
 */
export interface PayloadConfig {
  payload: string[];
}

/**
 * 解析 YAML 字符串为配置对象
 */
export function parseYaml(content: string): YamlConfig {
  const result = parse(content) as Partial<YamlConfig>;
  return {
    items: Array.isArray(result?.items) ? result.items : [],
  };
}

/**
 * 将配置对象序列化为 YAML 字符串（支持 YamlConfig 和 PayloadConfig）
 */
export function serializeYaml(config: YamlConfig | PayloadConfig): string {
  return stringify(config, {
    lineWidth: 0, // 不折行
    defaultStringType: 'QUOTE_SINGLE', // 强制使用单引号包裹字符串（提升兼容性）
  });
}

/**
 * 将 ConfigItem 数组提取为纯 payload 字符串数组
 * 用于 mihomo 兼容输出
 */
export function extractPayload(items: ConfigItem[]): PayloadConfig {
  return {
    payload: items.map((item) => item.value),
  };
}
