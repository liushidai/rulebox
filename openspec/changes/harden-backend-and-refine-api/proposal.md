## Why

安全加固时声称的保护措施有三项从未生效或与规格不符：限流钩子因为作用域不对从未执行；请求体上限拦不住超限请求，超限后返回 500；CORS 依赖已安装但没有接线。请求日志记录的状态码也不准确，还把 `VIEW_TOKEN` 明文写了进去。与此同时，规则项接口需要支撑即将新增的 Web 管理页，但它不支持分页，「删除规则」的返回值不准，对不存在的配置操作还会在磁盘上留下孤儿文件。

## What Changes

- **限流生效**：钩子改为全局作用域；按真实客户端 IP 计数；`X-Forwarded-For` 仅在新增环境变量 `TRUST_PROXY=true` 时采信，且取最后一项；静态页面、预检请求与健康检查不计数；超限返回 429 并带 `Retry-After`。
- **BREAKING** **请求体上限生效**：在读取和解析请求体之前拦截。携带请求体的请求（`POST`、`PUT`、`PATCH`、`DELETE`）声明长度超过 1MB 时返回 413；使用分块传输、不声明长度时返回 411。此前不带长度声明的请求体会被完整读入。无请求体的请求不受影响。
- **非法请求体返回 400**：无法解析的 JSON 从 500 改为 400。
- **CORS 接线**：按现有规格启用 `@elysiajs/cors`，并明确预检须放行 `Authorization` 与 `Content-Type` 请求头。
- **请求日志修正**：记录真实状态码与耗时；只记录路径，不记录查询串。
- **BREAKING** **删除规则接口修正**：`removed` 改为实际删除条数；对不存在的配置操作返回 404，且不再产生孤儿 `.yaml` 文件。现有规格本来就要求 404，此前是实现与规格不符。
- **规则项分页与搜索**：`GET /api/configs/{name}/items` 新增可选参数 `page`、`pageSize`、`q`，响应新增 `total`、`page`、`pageSize`；不传 `page` 时仍返回全部，保持兼容。
- **规则集列表附带条数**：`GET /api/configs` 的每一项新增 `item_count`。
- **新增订阅链接接口**：`GET /api/configs/{name}/subscription` 返回该规则集的订阅地址（相对地址，含 `VIEW_TOKEN`），需要 `ADMIN_TOKEN`。
- **规格同步**：YAML 响应的 `Content-Type` 规格由 `application/yaml` 改为实际的 `text/yaml`。仅改规格，行为不变。
- **测试同步**：集成测试改为使用与生产相同的中间件装配；收紧「413 或 500」「400 或 500」「静默成功」这类迁就现状的断言；`package.json` 的 `test` 脚本由模板占位改为 `bun test`。

## Capabilities

### New Capabilities
- `rate-limiting`: 按客户端 IP 的请求限流，涵盖计数规则、IP 识别、可信代理、豁免路径与超限响应。
- `request-body-limit`: 请求体约束，涵盖大小上限、拒绝长度不明的分块请求体、无法解析的请求体。

### Modified Capabilities
- `config-items-management`: 「获取配置数据项」支持分页与搜索并返回总数；「删除数据项」返回实际删除条数，配置不存在时返回 404 且不落盘。
- `config-management`: 「获取配置列表」每一项附带规则条数。
- `yaml-config-serving`: 新增「获取订阅链接」要求；「获取 YAML 配置」的 `Content-Type` 改为 `text/yaml`。
- `cors-and-logging`: 「CORS 支持」明确预检放行的请求头；「请求日志」记录真实状态码与耗时，且不含查询串。

## Impact

- **源码**：
  - `src/index.ts`：中间件装配顺序、CORS、日志、错误映射。
  - `src/lib/rateLimit.ts`、`src/lib/bodyLimit.ts`：重写生效逻辑。
  - `src/lib/store.ts`：规则项查询（分页、搜索、计数），删除规则的实际条数与存在性检查。
  - `src/modules/configs.ts`、`src/schema.ts`：分页参数、响应模型、订阅链接接口。
  - `tests/integration.test.ts`：改用真实中间件装配，更新受影响的断言。
- **依赖**：无新增，`@elysiajs/cors` 已在依赖中。
- **配置**：新增环境变量 `TRUST_PROXY`（默认 `false`），需同步 `README.md`、`.env.example`、`docker-compose.yml`。
- **使用方**：
  - mihomo 只受限流影响。限流是首次真正生效，上线后需要观察日志中是否出现 429。
  - 以分块传输（`Transfer-Encoding: chunked`）发送请求体的客户端将收到 411。浏览器 `fetch` 和 curl 默认都带 `Content-Length`，不受影响。
  - 依赖 `removed` 等于请求条数、或依赖「对不存在的配置删规则返回 200」的客户端会受影响。
- **文档**：`README.md` 的接口表和环境变量表需更新。
