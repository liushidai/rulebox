/**
 * ConfigStore - 内存缓存 + 文件系统原子操作
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml, serializeYaml, type YamlConfig } from './yaml';

export class ConfigStore {
  private cache: Map<string, string[]> = new Map();
  private dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    // 确保数据目录存在
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }
  }

  /**
   * 启动时全量加载 DATA_DIR 下所有 .yaml 文件到内存
   */
  loadAll(): void {
    const files = readdirSync(this.dataDir).filter((f) => f.endsWith('.yaml'));

    for (const file of files) {
      const name = file.replace(/\.yaml$/, '');
      const filePath = join(this.dataDir, file);
      const content = readFileSync(filePath, 'utf-8');
      const config = parseYaml(content);
      this.cache.set(name, config.payload);
    }
  }

  /**
   * 获取配置名称列表
   */
  listNames(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * 获取指定配置的数据项
   */
  getConfig(name: string): string[] | undefined {
    return this.cache.get(name);
  }

  /**
   * 检查配置是否存在
   */
  exists(name: string): boolean {
    return this.cache.has(name);
  }

  /**
   * 创建空配置
   */
  createConfig(name: string): void {
    if (this.cache.has(name)) {
      throw new Error('CONFIG_ALREADY_EXISTS');
    }

    this.cache.set(name, []);
    this.writeToFile(name, []);
  }

  /**
   * 删除配置
   */
  deleteConfig(name: string): void {
    if (!this.cache.has(name)) {
      throw new Error('CONFIG_NOT_FOUND');
    }

    this.cache.delete(name);
    this.deleteFile(name);
  }

  /**
   * 重命名配置
   */
  renameConfig(oldName: string, newName: string): void {
    if (!this.cache.has(oldName)) {
      throw new Error('CONFIG_NOT_FOUND');
    }

    if (this.cache.has(newName)) {
      throw new Error('CONFIG_ALREADY_EXISTS');
    }

    const items = this.cache.get(oldName)!;
    this.cache.delete(oldName);
    this.cache.set(newName, items);

    // 原子重命名文件
    const oldPath = join(this.dataDir, `${oldName}.yaml`);
    const newPath = join(this.dataDir, `${newName}.yaml`);
    renameSync(oldPath, newPath);
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
