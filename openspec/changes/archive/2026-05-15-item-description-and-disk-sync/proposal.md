## Why

当前配置项（items）仅支持字符串数组，无法为每条规则添加描述性信息。同时，当前系统采用“内存优先”策略，写操作不总是从磁盘读取最新状态，在多实例或外部修改文件的场景下可能导致不一致。

## What Changes

- **数据项级描述**：每个配置项从纯字符串升级为 `{ value, description }` 对象。
- **文件存储格式变更**：`data/*.yaml` 从 `payload: [string]` 改为 `items: [{value, description}]`（内部存储）。
- **API 格式变更**（BREAKING）：`POST/DELETE /api/configs/:name/items` 请求体从 `{"items": [string]}` 改为 `{"items": [{value, description}]}`.
- **读写策略变更**：写操作改为从磁盘读取当前状态（防缓存不一致）。
- **并发安全**：引入按配置名加锁机制，防止并发写入同一文件。
- **GET /:fileName 输出**：保持纯净 `payload: [string]` 格式（mihomo 兼容）。

## Capabilities

### New Capabilities
- `item-description`: 配置项支持 description 字段，存储与查询均含描述信息。
- `disk-reading-and-locking`: 写操作从磁盘读取最新状态，并实现 name 粒度的并发锁。

### Modified Capabilities
- `config-items-management`: 数据项读写接口升级，支持结构化对象输入。
- `file-storage`: 文件存储格式变更，增加并发安全机制。

## Impact

- **API 兼容性**：旧版 items 数组（纯字符串）将不再被支持。
- **源码**：`src/lib/` 新增 locking 模块，重构 store/yaml 模块。
- **部署前需清空数据**：由于文件格式变更，旧 YAML 文件将无法被新系统解析（开发中未上线，无迁移成本）。