## Purpose

在读取和解析请求体之前拒绝过大的请求，避免服务在鉴权之前处理不受信任的大请求体；并把无法解析的请求体作为客户端错误返回。

## ADDED Requirements

### Requirement: 请求体大小上限
除 `GET`、`HEAD`、`OPTIONS` 外的请求，若声明的 `Content-Length` 超过 1MB（1048576 字节），系统 MUST 返回 413，且 MUST NOT 读取或解析请求体。

#### Scenario: 超过上限
- **WHEN** 客户端发送 `POST /api/configs`，`Content-Length` 为 2097152
- **THEN** 返回 413，body 为 `{"error": "payload too large", "code": "PAYLOAD_TOO_LARGE"}`

#### Scenario: 未超过上限
- **WHEN** 客户端发送 `Content-Length` 为 1048576 的 `POST /api/configs` 请求
- **THEN** 请求进入正常处理流程

#### Scenario: 超限判断先于鉴权
- **WHEN** 客户端未携带 `ADMIN_TOKEN`，发送 `Content-Length` 超过上限的 `POST /api/configs` 请求
- **THEN** 返回 413，而不是 403

#### Scenario: 无请求体的请求不受影响
- **WHEN** 客户端发送不带请求体的 `DELETE /api/configs/{name}`
- **THEN** 请求进入正常处理流程

### Requirement: 拒绝长度不明的请求体
除 `GET`、`HEAD`、`OPTIONS` 外的请求，若未声明 `Content-Length` 且携带 `Transfer-Encoding`（分块传输），系统 MUST 返回 411，且 MUST NOT 读取请求体。

#### Scenario: 分块传输的请求体
- **WHEN** 客户端以 `Transfer-Encoding: chunked` 发送 `POST /api/configs` 请求体，不含 `Content-Length`
- **THEN** 返回 411，body 为 `{"error": "content-length required", "code": "LENGTH_REQUIRED"}`

### Requirement: 无法解析的请求体
请求体声明为 JSON 但内容无法解析时，系统 MUST 返回 400，body 为 `{"error": "malformed request body", "code": "PARSE_ERROR"}`。

#### Scenario: 非法 JSON
- **WHEN** 客户端发送 `POST /api/configs`，`Content-Type: application/json`，请求体为 `{bad`
- **THEN** 返回 400，body 为 `{"error": "malformed request body", "code": "PARSE_ERROR"}`

#### Scenario: 合法但不符合结构的请求体
- **WHEN** 客户端发送 `POST /api/configs`，请求体为合法 JSON 但缺少必填字段
- **THEN** 返回 400，body 为 `{"error": "invalid request body", "code": "VALIDATION_ERROR"}`
