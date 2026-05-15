/**
 * validator.ts - 规则项格式校验
 * 根据配置类型执行相应的格式检查
 */

import type { ConfigType } from '../lib/index';

/**
 * classical 类型支持的 TYPE 白名单
 */
const CLASSICAL_TYPES = new Set([
  // 域名基础
  'DOMAIN',
  'DOMAIN-SUFFIX',
  'DOMAIN-KEYWORD',
  'DOMAIN-WILDCARD',
  'DOMAIN-REGEX',
  'GEOSITE',
  // IP 基础
  'IP-CIDR',
  'IP-CIDR6',
  'IP-SUFFIX',
  'IP-ASN',
  'GEOIP',
  // 来源/入站
  'SRC-GEOIP',
  'SRC-IP-ASN',
  'SRC-IP-CIDR',
  'SRC-IP-SUFFIX',
  'DST-PORT',
  'SRC-PORT',
  'IN-PORT',
  'IN-TYPE',
  'IN-USER',
  'IN-NAME',
  // 进程/用户
  'PROCESS-PATH',
  'PROCESS-NAME',
  'PROCESS-PATH-WILDCARD',
  'PROCESS-PATH-REGEX',
  'PROCESS-NAME-WILDCARD',
  'PROCESS-NAME-REGEX',
  'UID',
  // 网络/其他
  'NETWORK',
  'DSCP',
  'AND',
  'OR',
  'NOT',
  'RULE-SET',
  'SUB-RULE',
  // 兜底
  'MATCH',
]);

/**
 * 校验结果
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * 校验单个规则项
 */
export function validateItem(item: string, type: ConfigType): ValidationResult {
  switch (type) {
    case 'domain':
      return validateDomainItem(item);
    case 'ipcidr':
      return validateIpcidrItem(item);
    case 'classical':
      return validateClassicalItem(item);
    default:
      return { valid: false, error: `Unknown config type: ${type}` };
  }
}

/**
 * 校验 domain 类型规则项
 * 支持 Clash 通配符格式：
 * - *.example.com (通配符 * 匹配一级)
 * - +.example.com (通配符 + 匹配多级)
 * - .example.com (通配符 . 匹配多级前缀)
 * - example.com (纯域名)
 */
function validateDomainItem(item: string): ValidationResult {
  // 去除引号（如果用户带了）
  const value = item.replace(/^['"]|['"]$/g, '').trim();

  if (!value) {
    return { valid: false, error: 'Empty domain value' };
  }

  // 通配符 + 或 . 前缀检查
  if (value.startsWith('+.') || value.startsWith('.')) {
    const domain = value.startsWith('+.') ? value.slice(2) : value.slice(1);
    if (!isValidDomain(domain)) {
      return { valid: false, error: `Invalid domain after prefix: ${domain}` };
    }
    return { valid: true };
  }

  // 通配符 * 检查
  if (value.includes('*')) {
    // * 必须是完整的段（前后都是 . 或边界）
    const segments = value.split('.');
    for (const seg of segments) {
      if (seg === '*') continue; // 单独的 * 是合法的
      if (seg.includes('*')) {
        // 如果段内包含 * 但不是单独的 *，则非法（如 foo*.bar）
        return { valid: false, error: `Invalid wildcard position in: ${seg}` };
      }
    }
    // 验证非 * 段是否为有效域名
    const nonWildcardSegments = segments.filter((s) => s !== '*');
    if (nonWildcardSegments.length > 0) {
      const testDomain = nonWildcardSegments.join('.');
      if (!isValidDomain(testDomain)) {
        return { valid: false, error: `Invalid domain pattern: ${value}` };
      }
    }
    return { valid: true };
  }

  // 纯域名检查
  if (!isValidDomain(value)) {
    return { valid: false, error: `Invalid domain format: ${value}` };
  }

  return { valid: true };
}

/**
 * 基础域名格式校验
 */
function isValidDomain(domain: string): boolean {
  if (!domain) return false;

  // 拒绝连续点号
  if (domain.includes('..')) return false;

  // 拒绝开头或结尾的点号
  if (domain.startsWith('.') || domain.endsWith('.')) return false;

  // 基本格式：字母、数字、连字符、点号
  const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/;
  // 允许单字符域名（如 localhost 的简化处理）
  const simpleRegex = /^[a-zA-Z0-9]+$/;

  return domainRegex.test(domain) || simpleRegex.test(domain);
}

/**
 * 校验 ipcidr 类型规则项
 * 支持 IPv4/IPv6 CIDR 格式
 */
function validateIpcidrItem(item: string): ValidationResult {
  const value = item.replace(/^['"]|['"]$/g, '').trim();

  if (!value) {
    return { valid: false, error: 'Empty CIDR value' };
  }

  // 必须包含 /
  if (!value.includes('/')) {
    return { valid: false, error: `Missing CIDR prefix: ${value}` };
  }

  const [ip, prefixStr] = value.split('/');
  const prefix = parseInt(prefixStr, 10);

  if (isNaN(prefix)) {
    return { valid: false, error: `Invalid CIDR prefix: ${prefixStr}` };
  }

  // IPv4 检查
  if (isIPv4(ip)) {
    if (prefix < 0 || prefix > 32) {
      return { valid: false, error: `Invalid IPv4 prefix: ${prefix} (must be 0-32)` };
    }
    return { valid: true };
  }

  // IPv6 检查
  if (isIPv6(ip)) {
    if (prefix < 0 || prefix > 128) {
      return { valid: false, error: `Invalid IPv6 prefix: ${prefix} (must be 0-128)` };
    }
    return { valid: true };
  }

  return { valid: false, error: `Invalid IP address: ${ip}` };
}

/**
 * 检查是否为有效 IPv4 地址
 */
function isIPv4(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;

  for (const part of parts) {
    const num = parseInt(part, 10);
    if (isNaN(num) || num < 0 || num > 255) return false;
    // 拒绝前导零（如 01, 001）
    if (part.length > 1 && part.startsWith('0')) return false;
  }

  return true;
}

/**
 * 检查是否为有效 IPv6 地址（简化检查）
 */
function isIPv6(ip: string): boolean {
  // 基本 IPv6 格式检查
  const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
  return ipv6Regex.test(ip);
}

/**
 * 校验 classical 类型规则项
 * 格式：TYPE,VALUE[,OPTION]
 */
function validateClassicalItem(item: string): ValidationResult {
  const value = item.trim();

  if (!value) {
    return { valid: false, error: 'Empty classical rule' };
  }

  // 必须包含至少一个逗号
  if (!value.includes(',')) {
    return { valid: false, error: `Missing comma in classical rule: ${value}` };
  }

  const parts = value.split(',');
  const ruleType = parts[0].trim().toUpperCase();

  // 检查 TYPE 是否在白名单中
  if (!CLASSICAL_TYPES.has(ruleType)) {
    return { valid: false, error: `Unknown rule type: ${ruleType}` };
  }

  // 检查是否有值（除了 MATCH 类型不需要值）
  if (ruleType !== 'MATCH' && parts.length < 2) {
    return { valid: false, error: `Missing value for rule type: ${ruleType}` };
  }

  // 对某些类型进行额外的基础格式校验
  if ((ruleType === 'IP-CIDR' || ruleType === 'IP-CIDR6' || ruleType === 'SRC-IP-CIDR') && parts.length >= 2) {
    const ipValue = parts[1].trim();
    const ipResult = validateIpcidrItem(ipValue);
    if (!ipResult.valid) {
      return { valid: false, error: `Invalid IP-CIDR value: ${ipResult.error}` };
    }
  }

  if ((ruleType === 'DST-PORT' || ruleType === 'SRC-PORT' || ruleType === 'IN-PORT') && parts.length >= 2) {
    const portStr = parts[1].trim();
    const port = parseInt(portStr, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      return { valid: false, error: `Invalid port number: ${portStr}` };
    }
  }

  return { valid: true };
}
