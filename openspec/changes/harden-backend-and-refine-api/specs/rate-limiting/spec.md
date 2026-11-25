## Purpose

对进入服务的请求按客户端 IP 限流，防止针对 Token 的暴力尝试和接口滥用，同时不占用页面静态资源、健康检查与跨域预检的额度。

## ADDED Requirements

### Requirement: 按客户端 IP 限流
系统 SHALL 对每个客户端 IP 独立计数：15 秒窗口内最多 100 个受计数请求，超出时 MUST 返回 429。窗口按该 IP 在窗口内首次请求的时间计算，窗口结束后计数 MUST 重置。

#### Scenario: 窗口内未超限
- **WHEN** 同一客户端 IP 在 15 秒内发送第 1 到第 100 个受计数请求
- **THEN** 这些请求按正常流程处理

#### Scenario: 窗口内超限
- **WHEN** 同一客户端 IP 在 15 秒内发送第 101 个受计数请求
- **THEN** 返回 429，body 为 `{"error": "too many requests", "code": "RATE_LIMITED"}`，并带有 `Retry-After` 响应头，值为距离窗口结束的秒数（向上取整，至少为 1）

#### Scenario: 不同客户端互不影响
- **WHEN** 客户端 A 已被限流，客户端 B 发送请求
- **THEN** 客户端 B 的请求按正常流程处理

#### Scenario: 窗口结束后恢复
- **WHEN** 已被限流的客户端在窗口结束后再次发送请求
- **THEN** 该请求按正常流程处理

#### Scenario: 超限判断先于鉴权
- **WHEN** 已被限流的客户端发送携带有效 `ADMIN_TOKEN` 的请求
- **THEN** 仍返回 429

### Requirement: 豁免请求
以下请求 MUST NOT 计数：健康检查（`GET /health`）、管理页面及其静态资源（`GET /` 与 `/assets/` 下的路径）、CORS 预检请求（`OPTIONS`）。

#### Scenario: 静态资源不占用额度
- **WHEN** 同一客户端 IP 连续 150 次请求 `GET /assets/app.js`
- **THEN** 均不返回 429，随后该 IP 携带有效 `ADMIN_TOKEN` 的 `GET /api/configs` 按正常流程处理

#### Scenario: 健康检查不受限流影响
- **WHEN** 客户端 IP 已被限流
- **THEN** 其 `GET /health` 仍返回 200

### Requirement: 客户端 IP 识别
系统 SHALL 使用连接的对端地址作为客户端 IP，其中 IPv4 映射的 IPv6 地址（`::ffff:a.b.c.d`）MUST 视为对应的 IPv4 地址。

仅当环境变量 `TRUST_PROXY` 为 `true` 时，系统 MUST 改为使用 `X-Forwarded-For` 请求头中的最后一项作为客户端 IP；该请求头缺失时 MUST 回退为连接的对端地址。

#### Scenario: 未启用可信代理时忽略转发头
- **WHEN** `TRUST_PROXY` 未设置或不为 `true`，客户端在 15 秒内已发送 100 个受计数请求，随后携带 `X-Forwarded-For: 9.9.9.9` 再发送请求
- **THEN** 返回 429

#### Scenario: 启用可信代理时按转发头分桶
- **WHEN** `TRUST_PROXY` 为 `true`，经反向代理到达的两个客户端，其 `X-Forwarded-For` 分别为 `10.0.0.1, 10.0.0.2` 与 `10.0.0.3, 10.0.0.4`
- **THEN** 两者分别按 `10.0.0.2` 与 `10.0.0.4` 计数，互不影响

#### Scenario: 启用可信代理时伪造首项无效
- **WHEN** `TRUST_PROXY` 为 `true`，已被限流的客户端（转发头最后一项为 `10.0.0.2`）发送 `X-Forwarded-For: 8.8.8.8, 10.0.0.2`
- **THEN** 仍返回 429

#### Scenario: 启用可信代理但转发头缺失
- **WHEN** `TRUST_PROXY` 为 `true`，请求未携带 `X-Forwarded-For`
- **THEN** 使用连接的对端地址计数

### Requirement: 跟踪条目上限
系统 MUST 限制同时跟踪的客户端 IP 数量（最多 1000 个），超出时 MUST 淘汰最久未被访问的条目。

#### Scenario: 超出跟踪上限
- **WHEN** 已跟踪 1000 个客户端 IP，新的客户端 IP 发送请求
- **THEN** 最久未被访问的条目被移除，新客户端的请求按正常流程处理
