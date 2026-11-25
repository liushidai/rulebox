import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import { ConfigIndex } from '../src/lib/index';

test('首次加载时创建尚不存在的多级数据目录和空索引', () => {
  const root = mkdtempSync(join(tmpdir(), 'rulebox-index-'));
  try {
    const dataDir = join(root, 'nested', 'data');
    new ConfigIndex(dataDir).load();
    expect(parse(readFileSync(join(dataDir, 'index.yaml'), 'utf-8'))).toEqual({ configs: [] });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
