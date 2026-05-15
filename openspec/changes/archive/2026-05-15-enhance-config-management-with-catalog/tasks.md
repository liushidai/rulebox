## 1. 基础设施与索引模块

- [x] 1.1 在 `src/lib/` 下新增 `index.ts`，实现 `ConfigIndex` 类，负责 `index.yaml` 的加载、内存维护与原子写入。
- [x] 1.2 定义 `CatalogEntry` 接口（包含 name, type, description, created_at）。
- [x] 1.3 更新 `src/config.ts` 或相关入口，确保服务启动时加载并校验 `index.yaml`。

## 2. 校验逻辑模块

- [x] 2.1 在 `src/lib/` 下新增 `validator.ts`，实现基础校验函数。
- [x] 2.2 实现 `validateDomainItem(item)`：支持 clash 通配符格式（*.x.com, +.x.com, .x.com 等）。
- [x] 2.3 实现 `validateIpcidrItem(item)`：支持 IPv4/IPv6 CIDR 格式。
- [x] 2.4 实现 `validateClassicalItem(item)`：检查逗号分隔结构及 TYPE 白名单。

## 3. 配置管理逻辑更新

- [x] 3.1 更新 `schema.ts`，在 `CreateConfigBody` 中新增 `type` 和 `description` 字段。
- [x] 3.2 更新 `store.ts` 的 `createConfig` 方法，支持写入元数据并同步更新 `ConfigIndex`。
- [x] 3.3 重构 `addItems` 和 `removeItems` 逻辑，在写入前调用 `validator.ts` 进行校验，失败时抛出详细错误。

## 4. API 路由更新

- [x] 4.1 更新 `POST /api/configs`，接收并处理新字段，校验 type 有效性。
- [x] 4.2 更新 `GET /api/configs`，支持 `?type=` 筛选参数及结构化返回值。
- [x] 4.3 更新 `GET /api/configs/:name/items`，返回包含元数据的完整对象。

## 5. 验证与清理

- [x] 5.1 运行服务并手动测试各种合法/非法 payload 录入场景。
- [x] 5.2 更新 `.gitignore` 确保 `/data/` 及 `index.yaml` 被正确管理。
