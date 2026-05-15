/**
 * YAML 解析和序列化封装
 */

import { parse, stringify } from 'yaml';

export interface YamlConfig {
  payload: string[];
}

/**
 * 解析 YAML 字符串为配置对象
 */
export function parseYaml(content: string): YamlConfig {
  const result = parse(content) as Partial<YamlConfig>;
  return {
    payload: Array.isArray(result?.payload) ? result.payload : [],
  };
}

/**
 * 将配置对象序列化为 YAML 字符串
 */
export function serializeYaml(config: YamlConfig): string {
  return stringify(config, {
    lineWidth: 0, // 不折行
  });
}
