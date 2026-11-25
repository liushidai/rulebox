/**
 * ConfigStore - 内存缓存 + 文件系统原子操作
 * 与 ConfigIndex 协同工作，管理配置数据和元数据
 */

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml, serializeYaml, type ConfigItem, type YamlConfig } from './yaml';
import { ConfigIndex, type CatalogEntry, type ConfigType } from './index';
import { LockMap } from './lock';

/** 默认每页条数（仅在传了 page 时生效） */
export const DEFAULT_PAGE_SIZE = 100;

/** 数据项查询参数 */
export interface QueryItemsOptions {
  /** 页码，从 1 开始；不传时返回全部数据项 */
  page?: number;
  /** 每页条数，默认 100，仅在传了 page 时生效 */
  pageSize?: number;
  /** 关键字，不区分大小写匹配 value 或 description */
  q?: string;
}

/** 数据项查询结果 */
export interface QueryItemsResult {
  /** 本页数据项（未传 page 时为全部） */
  items: ConfigItem[];
  /** 筛选后的数据项总条数 */
  total: number;
}

export class ConfigStore {
  private cache: Map<string, ConfigItem[]> = new Map();
  private dataDir: string;
  private index: ConfigIndex;
  private lockMap: LockMap = new LockMap();

  /**
   * 配置名安全验证：防止路径遍历攻击
   * 仅允许字母、数字、下划线、连字符
   */
  private validateConfigName(name: string): void {
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      throw new Error('INVALID_CONFIG_NAME');
    }
  }

  constructor(dataDir: string, index: ConfigIndex) {
    this.dataDir = dataDir;
    this.index = index;

    // 确保数据目录存在
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }
  }

  /**
   * 启动时从 index.yaml 加载所有配置到内存
   * 对每个 entry.name 进行安全校验，防止路径遍历
   */
  loadAll(): void {
    const entries = this.index.listAll();

    for (const entry of entries) {
      // 安全校验：防止恶意篡改的 index.yaml 导致路径遍历
      if (!/^[a-zA-Z0-9_-]+$/.test(entry.name)) {
        console.warn(`⚠️ 跳过非法配置名: ${entry.name}`);
        continue;
      }

      const filePath = join(this.dataDir, `${entry.name}.yaml`);
      if (existsSync(filePath)) {
        const content = readFileSync(filePath, 'utf-8');
        const config = parseYaml(content);
        this.cache.set(entry.name, config.items);
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
  getConfig(name: string): ConfigItem[] | undefined {
    this.validateConfigName(name);
    return this.cache.get(name);
  }

  /**
   * 获取配置元数据
   */
  getEntry(name: string): CatalogEntry | undefined {
    this.validateConfigName(name);
    return this.index.get(name);
  }

  /**
   * 查询配置的数据项（先筛选后分页）
   * 不传 page 时返回全部数据项；不传 pageSize 时使用默认值 100
   */
  queryItems(name: string, options: QueryItemsOptions = {}): QueryItemsResult {
    this.validateConfigName(name);

    const all = this.cache.get(name) ?? [];
    const keyword = options.q?.toLowerCase();
    const filtered = keyword
      ? all.filter(
          (item) =>
            item.value.toLowerCase().includes(keyword) ||
            (item.description ?? '').toLowerCase().includes(keyword),
        )
      : all;

    const total = filtered.length;

    // 未传 page：返回全部，保持存储顺序
    if (options.page === undefined) {
      return { items: filtered.slice(), total };
    }

    const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
    const start = (options.page - 1) * pageSize;
    return {
      items: filtered.slice(start, start + pageSize),
      total,
    };
  }

  /**
   * 获取配置的数据项条数（空配置集为 0）
   */
  countItems(name: string): number {
    this.validateConfigName(name);
    return this.cache.get(name)?.length ?? 0;
  }

  /**
   * 检查配置是否存在
   */
  exists(name: string): boolean {
    this.validateConfigName(name);
    return this.index.exists(name);
  }

  /**
   * 创建新配置（含元数据）
   */
  createConfig(name: string, type: ConfigType, description: string = ''): void {
    this.validateConfigName(name);
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
    this.validateConfigName(name);
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
    this.validateConfigName(oldName);
    this.validateConfigName(newName);
    if (!this.exists(oldName)) {
      throw new Error('CONFIG_NOT_FOUND');
    }

    if (this.exists(newName)) {
      throw new Error('CONFIG_ALREADY_EXISTS');
    }

    const items = this.cache.get(oldName)!;

    // 1. 先将数据写入新文件（避免缓存中间状态）
    this.writeToFile(newName, items);
    // 2. 再删除旧文件
    const oldPath = join(this.dataDir, `${oldName}.yaml`);
    if (existsSync(oldPath)) {
      unlinkSync(oldPath);
    }

    // 3. 更新内存缓存（先设置新，再删除旧，保证中间不会丢失）
    this.cache.set(newName, items);
    this.cache.delete(oldName);

    // 4. 更新 index
    this.index.update(oldName, { name: newName });
  }

  /**
   * 更新配置的 description（仅修改元数据）
   */
  updateConfigDescription(name: string, description: string): void {
    this.validateConfigName(name);
    if (!this.exists(name)) {
      throw new Error('CONFIG_NOT_FOUND');
    }

    // 只更新 index.yaml 中的元数据，不触及 payload yaml 文件
    this.index.update(name, { description });
  }

  /**
   * 追加数据项（带磁盘读取 + 最新覆盖去重 + 锁机制）
   * 锁内检查配置是否存在，不存在时抛 CONFIG_NOT_FOUND，避免检查与加锁之间的时间窗
   */
  async addItems(name: string, newItems: ConfigItem[]): Promise<void> {
    this.validateConfigName(name);
    let lockError: Error | undefined;

    await this.lockMap.acquire(name, async () => {
      // 锁内检查配置是否存在，防止路由层检查后配置被并发删除
      if (!this.index.exists(name)) {
        lockError = new Error('CONFIG_NOT_FOUND');
        return;
      }

      // 从磁盘读取最新状态
      const filePath = join(this.dataDir, `${name}.yaml`);
      let currentItems: ConfigItem[] = [];
      
      if (existsSync(filePath)) {
        const content = readFileSync(filePath, 'utf-8');
        const config = parseYaml(content);
        currentItems = config.items;
      }

      // 构建 value → description 映射，最新的覆盖旧的
      const itemMap = new Map<string, string>();
      for (const item of currentItems) {
        itemMap.set(item.value, item.description);
      }

      // 应用新 items（覆盖重复 value 的描述）
      for (const item of newItems) {
        itemMap.set(item.value, item.description);
      }

      // 转换回数组
      const merged: ConfigItem[] = Array.from(itemMap.entries()).map(([value, description]) => ({
        value,
        description,
      }));

      // 更新内存和磁盘
      this.cache.set(name, merged);
      this.writeToFile(name, merged);
    });

    if (lockError) {
      throw lockError;
    }
  }

  /**
   * 删除数据项（基于 value 匹配删除 + 锁机制）
   * 锁内检查配置是否存在，不存在时抛 CONFIG_NOT_FOUND，确保不落盘
   * @returns 实际被删除的条数（请求中重复或不存在的 value 不计入）
   */
  async removeItems(name: string, itemsToRemove: string[]): Promise<number> {
    this.validateConfigName(name);
    let removed = 0;
    let lockError: Error | undefined;

    await this.lockMap.acquire(name, async () => {
      // 锁内检查配置是否存在，不存在时抛错且不写文件
      if (!this.index.exists(name)) {
        lockError = new Error('CONFIG_NOT_FOUND');
        return;
      }

      // 从磁盘读取最新状态
      const filePath = join(this.dataDir, `${name}.yaml`);
      let currentItems: ConfigItem[] = [];
      
      if (existsSync(filePath)) {
        const content = readFileSync(filePath, 'utf-8');
        const config = parseYaml(content);
        currentItems = config.items;
      }

      const removeSet = new Set(itemsToRemove);
      const filtered = currentItems.filter((item) => !removeSet.has(item.value));
      removed = currentItems.length - filtered.length;

      // 更新内存和磁盘
      this.cache.set(name, filtered);
      this.writeToFile(name, filtered);
    });

    if (lockError) {
      throw lockError;
    }

    return removed;
  }

  /**
   * 原子写入文件：先写 .tmp，再 rename
   */
  private writeToFile(name: string, items: ConfigItem[]): void {
    const config: YamlConfig = { items };
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
