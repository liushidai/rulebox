## 1. 基础模块：锁与数据模型

- [x] 1.1 在 `src/lib/` 下新增 `lock.ts`，实现 `LockMap` 类（按 name 粒度的异步锁）。
- [x] 1.2 更新 `src/lib/yaml.ts`，新增 `ConfigItem` 接口 `{ value: string, description: string }`。
- [x] 1.3 更新解析/序列化逻辑，支持 `items: [{value, description}]` 格式。

## 2. 存储层重构

- [x] 2.1 修改 `ConfigStore.cache` 类型为 `Map<string, ConfigItem[]>`。
- [x] 2.2 修改 `addItems` 方法：接收 `ConfigItem[]`，从磁盘读取最新状态，实现"最新覆盖去重"逻辑。
- [x] 2.3 修改 `removeItems` 方法：基于 `value` 匹配删除。
- [x] 2.4 更新 `writeToFile` 方法，写入 `items` 结构。

## 3. 接口与路由更新

- [x] 3.1 更新 `schema.ts`，`ItemsBody` 改为 `ConfigItem` 对象数组。
- [x] 3.2 更新 `POST /api/configs/:name/items`，适配新请求格式，集成锁机制。
- [x] 3.3 更新 `DELETE /api/configs/:name/items`，适配新请求格式。
- [x] 3.4 更新 `GET /api/configs/:name/items`，返回包含 `value` 和 `description` 的对象数组。
- [x] 3.5 更新 `GET /:fileName` (yaml.ts 模块)，输出时提取为 `payload: items.map(i => i.value)`。
- [x] 3.6 更新 `createConfig`，初始化空 items 结构。

## 4. 验证与文档

- [x] 4.1 运行服务并测试带描述的 items 增删改查。
- [x] 4.2 验证 GET /:fileName 输出符合 mihomo 标准。
- [x] 4.3 验证并发写入同一配置时的锁排队行为。
- [x] 4.4 更新 OpenSpec specs 同步到主目录。
