## Context

动机见 proposal.md。这里只列约束实现方式的现状。

**现有代码**

- 四个中间件都在 `src/index.ts` 里装配。`rateLimit.ts` 是一个自身没有路由的具名插件；`bodyLimit.ts` 用 `derive` 做检查但从不拒绝；日志挂在 `onAfterHandle`；`@elysiajs/cors` 已安装但未使用。
- `tests/integration.test.ts` 在 `beforeAll` 里自己内联了一份请求体限制和错误处理，与生产装配不是同一份代码。

**框架行为（Elysia 1.4.28、Bun 1.3.14，以下各条均已用一次性脚本实测）**

1. 钩子只对「注册之后」的路由生效；插件内默认作用域的钩子不会作用于父实例或兄弟插件的路由。
2. 请求体解析发生在 `onBeforeHandle` 之前。要赶在解析前拦截，只能用 `onRequest`。
3. `onRequest` 阶段短路的请求不会经过 `mapResponse` 和 `onAfterResponse`。
4. `app.listen()` 返回的是 Elysia 实例。真实连接地址要用 `app.server.requestIP(request)` 获取，钩子里的 `ctx.store` 不含连接信息。
5. `mapResponse` 钩子如果返回 `undefined`，未命中路由的 404 会丢失响应体。
6. `status(404, …)` 的返回值在 `mapResponse` 里是 `ElysiaCustomStatusResponse`，真实状态码在 `code` 属性上，此时 `set.status` 仍是 200。
7. Bun 的 `maxRequestBodySize` 只按 `Content-Length` 拦截，分块请求体会被完整读入。
8. 查询参数用 `t.Numeric` 校验会放行小数，需要加 `multipleOf: 1`。

## Goals / Non-Goals

**Goals:**
- 四项保护按规格真正生效，并且生产行为被集成测试直接覆盖。
- 规则项接口具备分页、搜索和准确的返回值，足以支撑 Web 管理页，不需要回头改接口。
- 不改变存储格式，不需要数据迁移。

**Non-Goals:**
- 不做登录、会话或 Cookie 鉴权。Web 页面由前端自己持有 Token。
- 不做游标分页、排序或模糊匹配。
- 不自动清理数据目录中已经存在的孤儿 `.yaml` 文件。
- 不支持多层代理链的逐跳可信判断。

## Decisions

1. **抽出 `buildApp()`，生产与测试共用同一份装配**
   - 新增 `src/app.ts` 导出 `buildApp()`，按固定顺序装配：CORS → 请求守卫（限流、请求体约束，均为 `onRequest`）→ 请求日志（`mapResponse`）→ `onError` → 路由模块 → `/health`。
   - `src/index.ts` 只负责加载配置、初始化索引与存储、调用 `buildApp()`、监听、打印启动信息。
   - 测试按能力拆成多个文件，各自通过 `buildApp()` 构造应用。
   - 理由：现有测试内联了一份中间件，才出现「测试通过但生产无效」。装配只有一份，这类漂移就不会再发生。
   - 备选：测试里手工按同样顺序装配。仍是两份代码，仍会漂移。

2. **限流：全局 `onRequest` 钩子，按真实连接地址分桶**
   - 计数规则沿用现有实现（每 IP 15 秒 100 次，LRU 上限 1000），只改生效位置和 IP 来源。
   - IP 来源：默认 `app.server.requestIP(request)`，并把 `::ffff:` 前缀的地址归一化为 IPv4；`TRUST_PROXY=true` 时取 `X-Forwarded-For` 的最后一项。
   - 豁免 `/health`、`/`、`/assets/*` 和 `OPTIONS`。超限返回 429 和 `Retry-After`（剩余窗口秒数向上取整）。
   - `buildApp()` 接受可选的阈值、窗口时长和跟踪上限参数，只供测试调小后验证重置与淘汰；生产一律使用默认值。
   - 理由：`onRequest` 是最早的阶段，被拒的请求不消耗解析和鉴权的成本。取最后一项而不是第一项，是因为最后一项由最近一层反向代理写入，客户端无法伪造。
   - 备选：继续采信 `X-Real-IP`、`CF-Connecting-IP`。它们同样是请求头，除非确认代理会覆盖，否则不做假设。

3. **请求体约束：声明长度超限返回 413，分块传输返回 411**
   - 适用于除 `GET`、`HEAD`、`OPTIONS` 外的全部方法，因为 `DELETE` 也带请求体。
   - 不采用「没有 `Content-Length` 就拒绝」：无请求体的 `DELETE /api/configs/{name}` 通常不带这个头，会被误伤。HTTP/1.1 下，有请求体而不声明长度必然使用分块传输，所以用 `Transfer-Encoding` 作判据是精确的。
   - `onError` 增加 `PARSE` 到 400 的映射，并删除现有无效的 `derive` 实现。
   - 理由：见 Context 第 2、7 条。
   - 备选：流式读取并计数，代码更多而收益有限；依赖 Bun 的 `maxRequestBodySize`，它不拦分块请求体。

4. **CORS：`origin: '*'`，不允许凭据**
   - 理由：与规格一致；API 用请求头里的 Token 鉴权，不依赖 Cookie。
   - 备选：反射请求 origin 并允许凭据（插件的默认行为）。如果日后引入 Cookie 会话，「反射任意 origin 加允许凭据」是危险组合，现在就不留这个口子。

5. **请求日志：以 `mapResponse` 为主，守卫自记为辅**
   - 状态码的取法：`Response` 取 `status`；`ElysiaCustomStatusResponse` 取 `code`；其余取 `set.status`。
   - 钩子必须原样返回 `response`。
   - 限流和请求体约束在拒绝请求时，自己调用同一个日志函数，因为 `onRequest` 短路不经过 `mapResponse`。
   - 只记路径，不记查询串。耗时用 `WeakMap<Request, number>` 在 `onRequest` 记录开始时间。
   - 预检请求由 CORS 插件直接应答，不记录。
   - 备选：保留 `onAfterHandle`。它拿不到真实状态码，正是现状的问题。

6. **分页与搜索在存储层完成，接口保持向后兼容**
   - `ConfigStore` 新增查询方法，入参 `{ page?, pageSize?, q? }`，返回 `{ items, total }`。筛选规则是 `value` 或 `description` 转小写后包含关键字；顺序保持存储顺序；先筛选，后截取。
   - 不传 `page` 时返回全部，并且响应不含 `page` 和 `pageSize`，现有 curl 用法不受影响。
   - 参数校验用 `t.Numeric({ minimum: 1, multipleOf: 1 })`，`pageSize` 上限 1000，`q` 最长 200 个字符。
   - 理由：数据在内存里，筛选是线性扫描，规则条数在万级时仍是毫秒级，不需要索引。
   - 备选：游标分页，接口更复杂而当前规模用不上；只在前端筛选，与分页矛盾。

7. **删除规则：在锁内检查存在性，返回实际条数**
   - `removeItems` 在锁内先判断配置是否存在，不存在就抛 `CONFIG_NOT_FOUND`（路由已映射为 404），确保不落盘。返回值是删除前条数减去删除后条数。
   - `addItems` 在锁内补充同样的检查，消除路由层检查与加锁之间的时间窗。

8. **订阅链接返回根相对地址**
   - `GET /api/configs/{name}/subscription` 返回 `{ name, url: '/{name}.yaml?token=<VIEW_TOKEN>' }`。
   - 理由：后端不知道自己的公网地址，反向代理场景下按 `Host` 头拼接不可靠。前端用 `location.origin` 拼接，并允许编辑。
   - 安全：这个接口把 `VIEW_TOKEN` 交给管理员，而管理员的权限本来就更高。请求日志不记录查询串，`VIEW_TOKEN` 不会因此进入日志。

9. **列表附带 `item_count`**
   - 从内存缓存取每个配置集的条数，开销与配置集数量成正比。左侧列表显示条数时，不必逐个请求详情。

10. **YAML 的 `Content-Type` 规格同步为 `text/yaml`**
    - 自「支持浏览器直接预览」那次提交起，行为已经是 `text/yaml`。本次只同步规格。

## Risks / Trade-offs

- [Risk] 限流首次生效。如果服务在反向代理之后而没有设置 `TRUST_PROXY`，所有客户端共用一个桶。
  → Mitigation: 一层反向代理时设置 `TRUST_PROXY=true`，并在 README 写明。mihomo 按间隔拉取，请求量远低于阈值。上线后观察日志里的 429。
- [Risk] 设置了 `TRUST_PROXY=true`，但服务可以绕过代理被直接访问。
  → Mitigation: 文档注明只在确有反向代理、且服务不直接对外时开启。否则客户端可以伪造 `X-Forwarded-For` 来绕过限流。
- [Risk] 多层代理链（例如 CDN 之后再接 nginx）。`X-Forwarded-For` 的最后一项是倒数第二层代理的地址，所有客户端共用一个桶。
  → Mitigation: 当前不支持，文档注明只适用一层反向代理；有需要时再扩展可信跳数的配置。
- [Risk] 分块上传的客户端会收到 411。
  → Mitigation: 浏览器的 `fetch` 和 curl 默认都带 `Content-Length`，不受影响；README 说明该约束。
- [Risk] 如果将来以 HTTP/2 直连，请求体约束会退化。HTTP/2 没有分块头，不声明长度的流式请求体不会被 411 拦截。
  → Mitigation: 当前服务只以 HTTP/1.1 监听，不启用 HTTP/2。
- [Risk] 日志做法依赖框架行为。
  → Mitigation: 与 `mapResponse` 相关的行为（未命中路由的 404 响应体、`status()` 的 `code`）由集成测试固化，升级 Elysia 时能立即发现回归。
- [Risk] `removed` 的语义和「配置不存在」时的状态码发生变化。
  → Mitigation: 提案已标注 BREAKING。已知的使用方只有即将下线的 skill 和新的 Web 页面。
- [Trade-off] 偏移分页在并发修改时可能让某一条重复出现或被漏掉。
  → 对规则管理场景可以接受，不做快照。

## Migration Plan

1. 如果服务在一层反向代理之后，先设置环境变量 `TRUST_PROXY=true`；直连部署保持不设置。
2. 部署新版本。不涉及存储格式变更，不需要迁移数据。
3. 上线后检查请求日志：确认有日志行、状态码正常，并关注 429、411、413 是否出现。
4. 可选的人工检查：对比数据目录里的 `.yaml` 文件和 `index.yaml`，删除此前因「对不存在的配置删规则」产生的孤儿文件。本次不做自动处理。
5. 回滚：回退到旧版本即可，没有需要撤销的数据变更。
