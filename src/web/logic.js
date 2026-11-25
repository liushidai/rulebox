/**
 * RuleBox Web 管理界面的纯逻辑模块
 * 只包含纯函数，不接触 DOM，可同时被浏览器（ES 模块）与 bun test 引用
 */

/** 请求体上限：1 MiB，与后端 bodyLimit 保持一致 */
const BODY_LIMIT_BYTES = 1024 * 1024;

/** 默认每页条数 */
const DEFAULT_PAGE_SIZE = 20;

/**
 * 校验原因英文前缀到中文文案的映射表
 * 依据后端 validator.ts 实际返回的 reason 文案整理，较长的前缀放在前面
 */
const VALIDATION_REASON_PREFIXES = Object.freeze([
  ['Invalid domain format', '域名格式不正确，只能包含字母、数字、连字符和点'],
  ['Invalid domain pattern', '域名格式不正确，只能包含字母、数字、连字符和点'],
  ['Invalid domain after prefix', '前缀 +. 后面的域名不合法'],
  ['Invalid wildcard position in', '通配符 * 必须独占一段，例如 *.example.com'],
  ['Missing CIDR prefix', '缺少前缀长度，应写成 1.2.3.0/24'],
  ['Invalid IPv4 prefix', '前缀长度应在 0 到 32 之间'],
  ['Invalid IPv6 prefix', '前缀长度应在 0 到 128 之间'],
  ['Invalid IP address', 'IP 地址格式不正确'],
  ['Missing comma in classical rule', '缺少逗号，格式应为「类型，值」'],
  ['Unknown rule type', '不支持的规则类型'],
  ['Missing value for rule type', '缺少规则值'],
  ['Invalid port number', '端口应在 1 到 65535 之间'],
  // 以下为 validator.ts 中存在、设计表格未单列的原因
  ['Empty domain value', '规则值为空'],
  ['Empty CIDR value', '规则值为空'],
  ['Empty classical rule', '规则值为空'],
  ['Invalid CIDR prefix', '前缀长度不是数字'],
  ['Unknown config type', '不支持的规则集类型'],
]);

/**
 * 把后端返回的英文校验原因按前缀翻译成中文
 * 无法识别（或不是字符串）时原样返回，不影响功能
 * @param {unknown} reason 后端原因
 * @returns {string} 中文文案或原始原因
 */
export function translateValidationReason(reason) {
  if (typeof reason !== 'string') {
    return reason === undefined || reason === null ? '' : String(reason);
  }

  // IP-CIDR 的校验错误会再包一层，先翻译内层原因
  const ipCidrWrapper = 'Invalid IP-CIDR value: ';
  if (reason.startsWith(ipCidrWrapper)) {
    return `IP-CIDR 的值不合法：${translateValidationReason(
      reason.slice(ipCidrWrapper.length),
    )}`;
  }

  for (const [prefix, text] of VALIDATION_REASON_PREFIXES) {
    if (reason.startsWith(prefix)) {
      return text;
    }
  }

  return reason;
}

/**
 * 拆分批量添加的文本
 * 每行一条规则，去掉首尾空白并丢弃空行，同时记录每条规则在文本框中的真实行号
 * @param {string} text 文本框内容
 * @param {string} description 可选的统一描述
 * @returns {{ items: Array<{ value: string, description: string }>, lineNumbers: number[] }}
 *          items 为提交给接口的数组，lineNumbers 为对应的 1 起真实行号
 */
export function parseBatch(text, description = '') {
  const lines = (typeof text === 'string' ? text : String(text ?? '')).split(
    /\r\n|\r|\n/,
  );
  const unifiedDescription = typeof description === 'string' ? description : '';

  const items = [];
  const lineNumbers = [];

  lines.forEach((line, index) => {
    const value = line.trim();
    if (!value) return;

    items.push({ value, description: unifiedDescription });
    // 行号从 1 起，且包含被跳过的空行
    lineNumbers.push(index + 1);
  });

  return { items, lineNumbers };
}

/**
 * 把后端校验错误的数组下标映射回文本框的真实行号
 * 后端 details 元素形如 { index, value, reason }，index 从 0 起；
 * 下标越界或不是整数的条目会被过滤
 * @param {Array<{ index: number, value: string, reason: string }>} details
 * @param {number[]} lineNumbers parseBatch 返回的行号数组
 * @returns {Array<{ line: number, value: string, reason: string }>}
 */
export function mapValidationErrors(details, lineNumbers) {
  if (!Array.isArray(details) || !Array.isArray(lineNumbers)) return [];

  const errors = [];

  for (const detail of details) {
    if (!detail || typeof detail !== 'object') continue;

    const { index, value, reason } = detail;
    if (!Number.isInteger(index) || index < 0 || index >= lineNumbers.length) {
      continue;
    }

    const line = lineNumbers[index];
    if (!Number.isInteger(line) || line < 1) continue;

    errors.push({
      line,
      value: typeof value === 'string' ? value : '',
      reason: translateValidationReason(reason),
    });
  }

  return errors;
}

/**
 * 计算分页信息
 * 页码越界时夹取到 [1, pageCount] 区间；total 为 0 时 first 与 last 均为 0
 * @param {number} total 总条数
 * @param {number} page 请求页码（从 1 起）
 * @param {number} pageSize 每页条数，默认 20
 * @returns {{ page: number, pageCount: number, first: number, last: number }}
 */
export function pagination(total, page, pageSize = DEFAULT_PAGE_SIZE) {
  const safeTotal = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0;
  const size = Number.isFinite(pageSize)
    ? Math.max(1, Math.floor(pageSize))
    : DEFAULT_PAGE_SIZE;

  // 空列表也至少算 1 页，与设计中的 max(1, ceil(total / pageSize)) 一致
  const pageCount = Math.max(1, Math.ceil(safeTotal / size));

  const requested = Number.isFinite(page) ? Math.floor(page) : 1;
  const current = Math.min(pageCount, Math.max(1, requested));

  if (safeTotal === 0) {
    return { page: 1, pageCount, first: 0, last: 0 };
  }

  return {
    page: current,
    pageCount,
    first: (current - 1) * size + 1,
    last: Math.min(safeTotal, current * size),
  };
}

/**
 * 判断文本的 UTF-8 字节数是否超过 1 MiB
 * 恰好 1 MiB 不算超过
 * @param {string} text 文本框内容
 * @returns {boolean}
 */
export function exceedsBodyLimit(text) {
  const value = typeof text === 'string' ? text : String(text ?? '');
  return new TextEncoder().encode(value).length > BODY_LIMIT_BYTES;
}

/**
 * 创建请求序号跟踪器
 * 每次发起请求前调用 next() 取得新序号，响应返回时用 isCurrent(id) 判断是否仍然是最新请求
 * @returns {{ next: () => number, isCurrent: (id: number) => boolean }}
 */
export function createRequestTracker() {
  let latest = 0;

  return {
    next() {
      latest += 1;
      return latest;
    },
    isCurrent(id) {
      return id === latest;
    },
  };
}
