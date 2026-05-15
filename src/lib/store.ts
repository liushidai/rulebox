/**
 * ConfigStore - 内存缓存 + 文件系统原子操作
 * 与 ConfigIndex 协同工作，管理配置数据和元数据
 */

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml, serializeYaml, type YamlConfig } from './yaml';
import { ConfigIndex, type CatalogEntry, type ConfigType } from './index';

export class ConfigStore {
  private cache: Map<string, string[]> = new Map();
  private dataDir: string;
  private index: ConfigIndex;

  constructor(dataDir: string, index: ConfigIndex) {
    this.dataDir = dataDir;
    this.index = index;

    // 确保数据目录存在
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }
  }

  /**
   * 获取索引实例
   */
  getIndex(): ConfigIndex {
    return this.index;
  }

  /**
   * 启动时从 index.yaml 加载所有配置到内存
   */
  loadAll(): void {
    const entries = this.index.listAll();

    for (const entry of entries) {
      const filePath = join(this.dataDir, `${entry.name}.yaml`);
      if (existsSync(filePath)) {
        const content = readFileSync(filePath, 'utf-8');
        const config = parseYaml(content);
        this.cache.set(entry.name, config.payload);
      }
    }
  }

  /**
   * 获取配置名称列表（从 index 获取）
   */
  listNames(): string[] {
    return this.index.listAll().map((entry) => entry.name);
  }

  /**
   * 获取所有配置元数据
   */
  listEntries(): CatalogEntry[] {
    return this.index.listAll();
  }

  /**
   * 按类型筛选配置
   */
  filterByType(type: ConfigType): CatalogEntry[] {
    return this.index.findByType(type);
  }

  /**
   * 获取指定配置的数据项
   */
  getConfig(name: string): string[] | undefined {
    return this.cache.get(name);
  }

  /**
   * 获取配置元数据
   */
  getEntry(name: string): CatalogEntry | undefined {
    return this.index.get(name);
  }

  /**
   * 检查配置是否存在
   */
  exists(name: string): boolean {
    return this.index.exists(name);
  }

  /**
   * 创建新配置（含元数据）
   */
  createConfig(name: string, type: ConfigType, description: string = ''): void {
    if (this.exists(name)) {
      throw new Error('CONFIG_ALREADY_EXISTS');
    }

    // 1. 先写 payload yaml 文件（原子写入）
    this.writeToFile(name, []);

    // 2. 写入内存缓存
    this.cache.set(name, []);

    // 3. 更新 index（原子写入）
    const entry: CatalogEntry = {
      name,
      type,
      description,
      created_at: new Date().toISOString(),
    };
    this.index.add(entry);
  }

  /**
   * 删除配置
   */
  deleteConfig(name: string): void {
    if (!this.exists(name)) {
      throw new Error('CONFIG_NOT_FOUND');
    }

    // 1. 删除内存缓存
    this.cache.delete(name);

    // 2. 删除文件
    this.deleteFile(name);

    // 3. 更新 index
    this.index.remove(name);
  }

  /**
   * 重命名配置
   */
  renameConfig(oldName: string, newName: string): void {
    if (!this.exists(oldName)) {
      throw new Error('CONFIG_NOT_FOUND');
    }

    if (this.exists(newName)) {
      throw new Error('CONFIG_ALREADY_EXISTS');
    }

    const items = this.cache.get(oldName)!;

    // 1. 重命名 payload 文件
    const oldPath = join(this.dataDir, `${oldName}.yaml`);
    const newPath = join(this.dataDir, `${newName}.yaml`);
    renameSync(oldPath, newPath);

    // 2. 更新内存缓存
    this.cache.delete(oldName);
    this.cache.set(newName, items);

    // 3. 更新 index
    this.index.update(oldName, { name: newName });
  }

  /**
   * 追加数据项（自动去重）
   */
  addItems(name: string, newItems: string[]): void {
    const items = this.cache.get(name);
    if (items === undefined) {
      throw new Error('CONFIG_NOT_FOUND');
    }

    const existingSet = new Set(items);
    let changed = false;

    for (const item of newItems) {
      if (!existingSet.has(item)) {
        existingSet.add(item);
        changed = true;
      }
    }

    if (changed) {
      const merged = Array.from(existingSet);
      this.cache.set(name, merged);
      this.writeToFile(name, merged);
    }
  }

  /**
   * 删除数据项（不存在的条目静默忽略）
   */
  removeItems(name: string, itemsToRemove: string[]): void {
    const items = this.cache.get(name);
    if (items === undefined) {
      throw new Error('CONFIG_NOT_FOUND');
    }

    const removeSet = new Set(itemsToRemove);
    const filtered = items.filter((item) => !removeSet.has(item));

    this.cache.set(name, filtered);
    this.writeToFile(name, filtered);
  }

  /**
   * 原子写入文件：先写 .tmp，再 rename
   */
  private writeToFile(name: string, payload: string[]): void {
    const config: YamlConfig = { payload };
    const yamlContent = serializeYaml(config);

    const tmpPath = join(this.dataDir, `${name}.yaml.tmp`);
    const finalPath = join(this.dataDir, `${name}.yaml`);

    // 写临时文件
    writeFileSync(tmpPath, yamlContent, 'utf-8');
    // 原子重命名
    renameSync(tmpPath, finalPath);
  }

  /**
   * 删除文件
   */
  private deleteFile(name: string): void {
    const filePath = join(this.dataDir, `${name}.yaml`);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  }
}
