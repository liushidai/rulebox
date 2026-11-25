/**
 * src/web/logic.js 纯函数单元测试
 * 覆盖批量文本拆分与行号、校验错误映射与原因翻译、分页计算、请求体上限预检与请求序号
 */

import { describe, expect, test } from 'bun:test';
import {
  createRequestTracker,
  exceedsBodyLimit,
  mapValidationErrors,
  pagination,
  parseBatch,
  translateValidationReason,
} from '../src/web/logic.js';

describe('parseBatch', () => {
  test('去掉首尾空白并丢弃空行，保留真实行号', () => {
    const result = parseBatch('a.com\n\n  b.com  \n   \n c.com');

    expect(result.items).toEqual([
      { value: 'a.com', description: '' },
      { value: 'b.com', description: '' },
      { value: 'c.com', description: '' },
    ]);
    expect(result.lineNumbers).toEqual([1, 3, 5]);
  });

  test('空行在开头时行号仍从 1 起并按文本框行计数', () => {
    const result = parseBatch('\ninvalid');

    expect(result.items).toEqual([{ value: 'invalid', description: '' }]);
    expect(result.lineNumbers).toEqual([2]);
  });

  test('支持 CRLF 与 CR 换行', () => {
    const result = parseBatch('a.com\r\nb.com\rc.com\n');

    expect(result.items.map((item) => item.value)).toEqual([
      'a.com',
      'b.com',
      'c.com',
    ]);
    expect(result.lineNumbers).toEqual([1, 2, 3]);
  });

  test('统一描述应用到每一条规则', () => {
    const result = parseBatch('a.com\nb.com', '广告');

    expect(result.items).toEqual([
      { value: 'a.com', description: '广告' },
      { value: 'b.com', description: '广告' },
    ]);
  });

  test('只有空行时返回空数组', () => {
    expect(parseBatch('   \n\n\t\n')).toEqual({ items: [], lineNumbers: [] });
  });

  test('空文本或非字符串输入返回空数组', () => {
    expect(parseBatch('')).toEqual({ items: [], lineNumbers: [] });
    expect(parseBatch(undefined)).toEqual({ items: [], lineNumbers: [] });
  });

  test('保留行内空白，只裁剪首尾', () => {
    const result = parseBatch('  DOMAIN,a.com,proxy  ');

    expect(result.items[0].value).toBe('DOMAIN,a.com,proxy');
  });
});

describe('mapValidationErrors', () => {
  const lineNumbers = [2, 3, 5, 8, 9];

  test('把 0 起的错误序号映射回文本框真实行号', () => {
    const details = [
      { index: 0, value: 'bad', reason: 'Invalid domain format: bad' },
      { index: 2, value: 'x', reason: 'Invalid IP address: x' },
    ];

    expect(mapValidationErrors(details, lineNumbers)).toEqual([
      {
        line: 2,
        value: 'bad',
        reason: '域名格式不正确，只能包含字母、数字、连字符和点',
      },
      { line: 5, value: 'x', reason: 'IP 地址格式不正确' },
    ]);
  });

  test('过滤越界、负数、非整数与非对象条目', () => {
    const details = [
      { index: 5, value: 'oob', reason: 'Invalid domain format' },
      { index: -1, value: 'neg', reason: 'Invalid domain format' },
      { index: 1.5, value: 'float', reason: 'Invalid domain format' },
      { index: 1, value: 'ok', reason: 'Invalid domain format' },
      null,
      'nope',
    ];

    expect(mapValidationErrors(details, lineNumbers)).toEqual([
      {
        line: 3,
        value: 'ok',
        reason: '域名格式不正确，只能包含字母、数字、连字符和点',
      },
    ]);
  });

  test('非数组输入返回空数组', () => {
    expect(mapValidationErrors(undefined, lineNumbers)).toEqual([]);
    expect(mapValidationErrors([], undefined)).toEqual([]);
  });

  test('value 缺失时以空字符串兜底', () => {
    expect(
      mapValidationErrors([{ index: 0, reason: 'Invalid domain format' }], [1]),
    ).toEqual([
      {
        line: 1,
        value: '',
        reason: '域名格式不正确，只能包含字母、数字、连字符和点',
      },
    ]);
  });

  test('未识别的原因原样显示', () => {
    const details = [{ index: 0, value: 'x', reason: 'Something brand new' }];

    expect(mapValidationErrors(details, lineNumbers)[0]).toEqual({
      line: 2,
      value: 'x',
      reason: 'Something brand new',
    });
  });
});

describe('translateValidationReason', () => {
  const cases = [
    [
      'Invalid domain format: bad_value',
      '域名格式不正确，只能包含字母、数字、连字符和点',
    ],
    [
      'Invalid domain pattern: *.foo*',
      '域名格式不正确，只能包含字母、数字、连字符和点',
    ],
    ['Invalid domain after prefix: -x', '前缀 +. 后面的域名不合法'],
    ['Invalid wildcard position in: foo*', '通配符 * 必须独占一段，例如 *.example.com'],
    ['Missing CIDR prefix: 1.2.3.4', '缺少前缀长度，应写成 1.2.3.0/24'],
    ['Invalid IPv4 prefix: 33 (must be 0-32)', '前缀长度应在 0 到 32 之间'],
    ['Invalid IPv6 prefix: 129 (must be 0-128)', '前缀长度应在 0 到 128 之间'],
    ['Invalid IP address: 999.1.1.1', 'IP 地址格式不正确'],
    ['Missing comma in classical rule: DOMAIN', '缺少逗号，格式应为「类型，值」'],
    ['Unknown rule type: FOO', '不支持的规则类型'],
    ['Missing value for rule type: DOMAIN', '缺少规则值'],
    ['Invalid port number: 70000', '端口应在 1 到 65535 之间'],
  ];

  for (const [reason, translated] of cases) {
    test(`${reason} → ${translated}`, () => {
      expect(translateValidationReason(reason)).toBe(translated);
    });
  }

  test('未知原因原样返回', () => {
    expect(translateValidationReason('Whatever reason')).toBe('Whatever reason');
  });

  test('空字符串与非字符串输入有确定结果', () => {
    expect(translateValidationReason('')).toBe('');
    expect(translateValidationReason(undefined)).toBe('');
    expect(translateValidationReason(null)).toBe('');
    expect(translateValidationReason(42)).toBe('42');
  });
});

describe('pagination', () => {
  test('47 条规则的第一页', () => {
    expect(pagination(47, 1)).toEqual({
      page: 1,
      pageCount: 3,
      first: 1,
      last: 20,
    });
  });

  test('47 条规则的第二页', () => {
    expect(pagination(47, 2)).toEqual({
      page: 2,
      pageCount: 3,
      first: 21,
      last: 40,
    });
  });

  test('47 条规则的末页', () => {
    expect(pagination(47, 3)).toEqual({
      page: 3,
      pageCount: 3,
      first: 41,
      last: 47,
    });
  });

  test('页码超过末页时夹取到末页', () => {
    expect(pagination(47, 99)).toEqual({
      page: 3,
      pageCount: 3,
      first: 41,
      last: 47,
    });
  });

  test('页码小于 1 或非法时夹取到第 1 页', () => {
    expect(pagination(47, 0)).toEqual({
      page: 1,
      pageCount: 3,
      first: 1,
      last: 20,
    });
    expect(pagination(47, Number.NaN)).toEqual({
      page: 1,
      pageCount: 3,
      first: 1,
      last: 20,
    });
  });

  test('total 为 0 时 first 与 last 为 0，页数为 1', () => {
    expect(pagination(0, 1)).toEqual({
      page: 1,
      pageCount: 1,
      first: 0,
      last: 0,
    });
    expect(pagination(0, 5)).toEqual({
      page: 1,
      pageCount: 1,
      first: 0,
      last: 0,
    });
  });

  test('恰好整除时不多出空页', () => {
    expect(pagination(40, 2)).toEqual({
      page: 2,
      pageCount: 2,
      first: 21,
      last: 40,
    });
  });

  test('支持自定义每页条数', () => {
    expect(pagination(10, 2, 3)).toEqual({
      page: 2,
      pageCount: 4,
      first: 4,
      last: 6,
    });
    expect(pagination(10, 4, 3)).toEqual({
      page: 4,
      pageCount: 4,
      first: 10,
      last: 10,
    });
  });
});

describe('exceedsBodyLimit', () => {
  test('恰好 1MiB 不算超过', () => {
    expect(exceedsBodyLimit('a'.repeat(1024 * 1024))).toBe(false);
  });

  test('超过 1MiB 一个字节即视为超过', () => {
    expect(exceedsBodyLimit('a'.repeat(1024 * 1024 + 1))).toBe(true);
  });

  test('按 UTF-8 字节数计算，中文三字节', () => {
    // 349525 个汉字 = 1048575 字节，未超过
    expect(exceedsBodyLimit('中'.repeat(349525))).toBe(false);
    // 349526 个汉字 = 1048578 字节，超过
    expect(exceedsBodyLimit('中'.repeat(349526))).toBe(true);
  });

  test('空字符串与非字符串输入不超限', () => {
    expect(exceedsBodyLimit('')).toBe(false);
    expect(exceedsBodyLimit(undefined)).toBe(false);
  });
});

describe('createRequestTracker', () => {
  test('序号递增，只有最新的序号有效', () => {
    const tracker = createRequestTracker();
    const first = tracker.next();
    const second = tracker.next();

    expect(first).toBe(1);
    expect(second).toBe(2);
    expect(tracker.isCurrent(first)).toBe(false);
    expect(tracker.isCurrent(second)).toBe(true);
  });

  test('不同跟踪器互不影响', () => {
    const a = createRequestTracker();
    const b = createRequestTracker();

    expect(a.next()).toBe(1);
    expect(b.next()).toBe(1);
    expect(a.isCurrent(1)).toBe(true);
    expect(b.isCurrent(1)).toBe(true);
  });
});
