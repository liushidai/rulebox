## 1. 装配与可测试性

- [x] 1.1 新增 `src/app.ts` 导出 `buildApp()`，按「CORS → 请求守卫 → 请求日志 → 错误处理 → 路由模块 → `/health`」的顺序装配并返回 Elysia 实例；`src/index.ts` 只保留加载配置、初始化索引与存储、调用 `buildApp()`、监听和启动日志
- [x] 1.2 `config.ts` 读取环境变量 `TRUST_PROXY`（仅字符串 `true` 为真，默认 `false`）并加入 `AppConfig`
- [x] 1.3 集成测试改为通过 `buildApp()` 构造应用，删除测试文件里内联的请求体限制和错误处理；测试按能力拆分成多个文件，共用一个构造应用与发起请求的辅助模块
- [x] 1.4 `package.json` 的 `test` 脚本由模板占位改为 `bun test`

## 2. CORS

- [x] 2.1 在装配的最前面注册 `@elysiajs/cors`，配置为 `origin: '*'` 且不允许凭据
- [x] 2.2 测试：跨域请求带 `Access-Control-Allow-Origin: *`；预检返回 204 且 `Access-Control-Allow-Headers` 包含 `authorization` 与 `content-type`；不带 Token 的预检不是 403

## 3. 限流

- [x] 3.1 重写 `rateLimit.ts`：改为全局的 `onRequest` 钩子；每个 IP 15 秒内最多 100 个受计数请求；窗口按该 IP 在窗口内的首次请求计算；`buildApp()` 提供可选的阈值、窗口时长和跟踪上限参数，供测试调小后使用，生产取默认值
- [x] 3.2 实现 IP 识别：默认用 `app.server.requestIP(request)` 并把 `::ffff:` 前缀的地址归一化为 IPv4；`TRUST_PROXY=true` 时取 `X-Forwarded-For` 的最后一项，该头缺失时回退为连接地址
- [x] 3.3 豁免 `/health`、`/`、`/assets/*` 和 `OPTIONS` 请求
- [x] 3.4 超限时返回 429 与 `Retry-After`，并记录一行状态码为 429 的请求日志
- [x] 3.5 测试：第 101 个请求返回 429；不同 IP 互不影响；未启用可信代理时伪造 `X-Forwarded-For` 无效；启用后按最后一项分桶且伪造首项无效；转发头缺失时回退；豁免路径不计数；`Retry-After` 存在；超限判断先于鉴权；窗口结束后计数重置；跟踪条目超过上限时淘汰最久未被访问的条目

## 4. 请求体约束

- [x] 4.1 重写 `bodyLimit.ts`：在 `onRequest` 阶段拦截；除 `GET`、`HEAD`、`OPTIONS` 外，`Content-Length` 超过 1MB 返回 413，未声明长度且带 `Transfer-Encoding` 返回 411；被拒的请求各记录一行请求日志
- [x] 4.2 `onError` 增加 `PARSE` 到 400 的映射，返回 `{"error": "malformed request body", "code": "PARSE_ERROR"}`
- [x] 4.3 测试：2MB 请求返回 413，且未携带 Token 时同样是 413；恰好 1MB 的请求进入正常处理流程；分块请求返回 411；非法 JSON 返回 400；不带请求体的 `DELETE` 不受影响；把「413 或 500」「400 或 500」的旧断言收紧为精确值

## 5. 请求日志

- [x] 5.1 用 `mapResponse` 替换 `onAfterHandle` 来记录日志：状态码依次取 `Response.status`、`ElysiaCustomStatusResponse.code`、`set.status`；输出时间戳、方法、路径、状态码和耗时（毫秒）；只记录路径，不记录查询串
- [x] 5.2 日志钩子原样返回 `response`
- [x] 5.3 测试：拦截 `console.log`，断言 403、404（未命中路由）、201、429、413 各有一行且状态码正确；YAML 请求的日志行不含 token 的值；未命中路由的 404 响应体仍是 JSON；预检请求不产生日志

## 6. 规则项查询与删除

- [x] 6.1 `store.ts` 新增查询方法：支持 `page`、`pageSize`、`q`（匹配 `value` 或 `description`，不区分大小写），先筛选后截取，返回本页数据与筛选后的总数
- [x] 6.2 `removeItems` 在锁内检查配置是否存在，不存在时抛 `CONFIG_NOT_FOUND`，并返回实际删除的条数；`addItems` 在锁内补充同样的存在性检查
- [x] 6.3 `schema.ts` 新增分页查询参数（整数校验用 `multipleOf: 1`，`pageSize` 限定 1 到 1000，`q` 最长 200 个字符）和对应的响应模型
- [x] 6.4 `GET /api/configs/{name}/items` 接入分页与搜索：不传 `page` 时返回全部，且响应不含 `page` 与 `pageSize`
- [x] 6.5 `DELETE /api/configs/{name}/items` 返回 `{ removed: 实际删除条数, from }`
- [x] 6.6 测试：不传 `page` 返回全部；分页与默认 `pageSize`；关键字筛选；筛选与分页叠加；页码越界返回空数组；非法参数返回 400；删除请求含重复值和不存在值时 `removed` 准确；对不存在的配置删除返回 404 且数据目录没有新增文件；改掉「静默成功」的旧断言

## 7. 列表条数与订阅链接

- [x] 7.1 `GET /api/configs` 的每一项新增 `item_count`
- [x] 7.2 新增 `GET /api/configs/{name}/subscription`，返回 `{ name, url }`，其中 `url` 为根相对地址并带 `VIEW_TOKEN`；配置不存在时返回 404
- [x] 7.3 测试：`item_count` 的值（含空规则集为 0）；订阅链接的格式；在订阅链接前拼接主机名可以拉取到 YAML；YAML 响应的 `Content-Type` 为 `text/yaml`；配置不存在返回 404；不带 Token 返回 403

## 8. 文档

- [x] 8.1 更新 `README.md`：接口表补充分页参数、`item_count`、订阅链接和 `removed` 的新语义；错误码表补充 400、411、413、429；说明请求体需要声明长度且不超过 1MB
- [x] 8.2 更新 `README.md` 和 `.env.example` 的环境变量说明：`TRUST_PROXY` 的含义，以及只在一层反向代理且服务不直接对外时开启
- [x] 8.3 `docker-compose.yml` 透传 `TRUST_PROXY` 环境变量

## 9. 整体验证

- [x] 9.1 `bun test` 全部通过
- [x] 9.2 本地启动后手工验证：`/health` 正常；携带 `VIEW_TOKEN` 能拉取到 YAML；连续请求超过阈值后出现 429，且窗口结束后恢复；日志中没有 token 的值
