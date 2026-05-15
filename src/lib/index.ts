/**
 * ConfigIndex - 配置索引管理
 * 负责 index.yaml 的加载、内存维护与原子写入
 */

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';

/**
 * 配置类型枚举
 */
export type ConfigType = 'classical' | 'domain' | 'ipcidr';

/**
 * 配置类型常量（用于 schema 和路由定义）
 */
export const CONFIG_TYPES = {
  classical: 'classical',
  domain: 'domain',
  ipcidr: 'ipcidr',
} as const;

/**
 * 配置条目元数据
 */
export interface CatalogEntry {
  name: string;
  type: ConfigType;
  description: string;
  created_at: string;
}

/**
 * index.yaml 文件结构
 */
interface IndexFile {
  configs: CatalogEntry[];
}

export class ConfigIndex {
  private entries: Map<string, CatalogEntry> = new Map();
  private dataDir: string;
  private indexPath: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.indexPath = join(dataDir, 'index.yaml');
  }

  /**
   * 启动时加载 index.yaml 到内存
   * 如果文件不存在，创建空索引
   */
  load(): void {
    if (!existsSync(this.indexPath)) {
      // 首次运行，创建空索引
      this.save();
      return;
    }

    const content = readFileSync(this.indexPath, 'utf-8');
    const indexFile = parse(content) as Partial<IndexFile>;

    if (!indexFile.configs || !Array.isArray(indexFile.configs)) {
      throw new Error('index.yaml 格式错误：缺少 configs 数组');
    }

    // 加载到内存 Map
    for (const entry of indexFile.configs) {
      if (entry.name && entry.type) {
        this.entries.set(entry.name, entry as CatalogEntry);
      }
    }
  }

  /**
   * 获取所有配置条目
   */
  listAll(): CatalogEntry[] {
    return Array.from(this.entries.values());
  }

  /**
   * 按类型筛选配置
   */
  findByType(type: ConfigType): CatalogEntry[] {
    return this.listAll().filter((entry) => entry.type === type);
  }

  /**
   * 获取单个配置条目
   */
  get(name: string): CatalogEntry | undefined {
    return this.entries.get(name);
  }

  /**
   * 检查配置是否存在
   */
  exists(name: string): boolean {
    return this.entries.has(name);
  }

  /**
   * 添加配置条目
   */
  add(entry: CatalogEntry): void {
    if (this.entries.has(entry.name)) {
      throw new Error('CONFIG_ALREADY_EXISTS');
    }
    this.entries.set(entry.name, entry);
    this.save();
  }

  /**
   * 删除配置条目
   */
  remove(name: string): void {
    if (!this.entries.has(name)) {
      throw new Error('CONFIG_NOT_FOUND');
    }
    this.entries.delete(name);
    this.save();
  }

  /**
   * 更新配置条目
   */
  update(name: string, changes: Partial<CatalogEntry>): void {
    const entry = this.entries.get(name);
    if (!entry) {
      throw new Error('CONFIG_NOT_FOUND');
    }

    // 如果 name 变更，需要检查冲突
    if (changes.name && changes.name !== name) {
      if (this.entries.has(changes.name)) {
        throw new Error('CONFIG_ALREADY_EXISTS');
      }
      this.entries.delete(name);
      this.entries.set(changes.name, { ...entry, ...changes });
    } else {
      this.entries.set(name, { ...entry, ...changes });
    }

    this.save();
  }

  /**
   * 原子写入 index.yaml
   */
  private save(): void {
    const indexFile: IndexFile = {
      configs: this.listAll(),
    };

    const yamlContent = stringify(indexFile, {
      lineWidth: 0,
    });

    const tmpPath = join(this.dataDir, 'index.yaml.tmp');
    const finalPath = this.indexPath;

    // 写临时文件
    writeFileSync(tmpPath, yamlContent, 'utf-8');
    // 原子重命名
    renameSync(tmpPath, finalPath);
  }
}
