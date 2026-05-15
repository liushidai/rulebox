## Why

RuleBox 当前是一个空的 ElysiaJS Hello World 项目。需要实现完整的 HTTP 服务，用于托管和分发 mihomo/clash 的 rule-providers YAML 文件，提供带 Token 鉴权的 API 实现配置集的增删改查。

用户通过管理 API 管理规则集，mihomo/clash 客户端通过带 Token 参数的 URL 自动拉取规则，无需暴露源站 IP。

## What Changes

- 实现 8 个 API 端点：YAML 配置获取、配置集 CRUD、数据项增删查
- 实现双 Token 鉴权机制（VIEW_TOKEN 用于公开拉取，ADMIN_TOKEN 用于管理操作）
- 实现基于文件系统 (DATA_DIR) + 内存缓存的数据存储层，启动全量加载
- 实现原子文件写入机制，避免半写文件
- 实现 CORS 支持（所有来源）
- 实现请求日志和错误处理
- 添加 OpenAPI/Swagger 文档（开发环境）
- 配置 Docker + docker-compose 部署

## Capabilities

### New Capabilities

- `yaml-config-serving`: 通过带 Token 的 URL 获取 YAML 格式的规则配置
- `config-management`: 配置集的增删改查和重命名
- `config-items-management`: 配置数据项的追加、删除、查询（自动去重）
- `token-authentication`: 双 Token 鉴权机制（VIEW_TOKEN / ADMIN_TOKEN）
- `file-storage`: 基于文件系统的 YAML 存储，支持原子写入和启动加载
- `cors-and-logging`: CORS 跨域支持和请求日志

### Modified Capabilities

<!-- 无已有 spec 需要修改 -->

## Impact

- **代码**: 从零构建约 8-10 个源文件（模块化结构）
- **依赖**: 新增 `yaml`、`@elysiajs/cors`、`@elysiajs/swagger`
- **部署**: 新增 Dockerfile、docker-compose.yml
- **存储**: 运行时生成 data/ 目录存放 .yaml 文件
