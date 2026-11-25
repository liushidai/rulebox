## MODIFIED Requirements

### Requirement: CORS 支持
系统 SHALL 允许所有来源的跨域请求：响应 MUST 包含 `Access-Control-Allow-Origin: *`。

#### Scenario: 跨域请求成功
- **WHEN** 浏览器从不同 origin 发起请求
- **THEN** 响应包含 `Access-Control-Allow-Origin: *`

#### Scenario: OPTIONS 预检请求
- **WHEN** 浏览器发送 OPTIONS 预检请求，`Access-Control-Request-Headers` 为 `authorization,content-type`
- **THEN** 返回 204，包含 `Access-Control-Allow-Origin: *`，且 `Access-Control-Allow-Headers` 包含 `authorization` 与 `content-type`

#### Scenario: 预检请求不需要鉴权
- **WHEN** 发送不带 Token 的 `OPTIONS /api/configs`
- **THEN** 返回 204，而不是 403

### Requirement: 请求日志
系统 SHALL 为每个请求输出一行日志（CORS 预检请求除外），包含：时间戳、HTTP 方法、请求路径、响应状态码、耗时（毫秒）。

响应状态码 MUST 为实际返回给客户端的状态码，包括鉴权失败、路由不存在、被限流或请求体约束拒绝的请求，以及业务错误。

日志中的请求路径 MUST NOT 包含查询串。

#### Scenario: 正常请求日志
- **WHEN** 处理 `GET /adblock.yaml?token=<valid_view_token>` 并返回 200
- **THEN** 日志行包含时间戳、`GET`、`/adblock.yaml`、`200` 与耗时，且不包含 `token` 的值

#### Scenario: 鉴权失败的请求
- **WHEN** 请求因 Token 无效被拒绝并返回 403
- **THEN** 日志行中的状态码为 403

#### Scenario: 路由不存在
- **WHEN** 请求不存在的路径并返回 404
- **THEN** 日志行中的状态码为 404

#### Scenario: 创建成功
- **WHEN** `POST /api/configs` 创建成功并返回 201
- **THEN** 日志行中的状态码为 201

#### Scenario: 被限流的请求
- **WHEN** 请求因超过限流阈值被拒绝并返回 429
- **THEN** 日志行中的状态码为 429

#### Scenario: 被请求体约束拒绝的请求
- **WHEN** 请求因超过大小上限被拒绝并返回 413
- **THEN** 日志行中的状态码为 413
