## ADDED Requirements

### Requirement: VIEW_TOKEN 鉴权
系统 SHALL 验证 `GET /{name}.yaml` 请求中的 `token` query 参数。

Token 值 MUST 与环境变量 `VIEW_TOKEN` 完全匹配。

#### Scenario: 有效 VIEW_TOKEN
- **WHEN** 请求包含 `?token=<correct_view_token>`
- **THEN** 请求通过鉴权

#### Scenario: 无效 VIEW_TOKEN
- **WHEN** token 值不匹配或缺失
- **THEN** 返回 403，body 为 `{"error": "forbidden", "code": "FORBIDDEN"}`

### Requirement: ADMIN_TOKEN 鉴权
系统 SHALL 验证管理 API 请求中的 `Authorization` 头。

请求 MUST 携带 `Authorization: Bearer <admin_token>`，token 值 MUST 与环境变量 `ADMIN_TOKEN` 完全匹配。

#### Scenario: 有效 ADMIN_TOKEN
- **WHEN** 请求头包含 `Authorization: Bearer <correct_admin_token>`
- **THEN** 请求通过鉴权

#### Scenario: 无效 ADMIN_TOKEN
- **WHEN** header 缺失、格式错误或值不匹配
- **THEN** 返回 403，body 为 `{"error": "forbidden", "code": "FORBIDDEN"}`

#### Scenario: Bearer 格式错误
- **WHEN** Authorization 头不是 `Bearer <token>` 格式（如 `Basic xxx` 或无前缀）
- **THEN** 返回 403

### Requirement: 环境变量必填
`VIEW_TOKEN` 和 `ADMIN_TOKEN` 环境变量 MUST 在服务启动时存在且非空。

#### Scenario: 缺少必填环境变量
- **WHEN** 启动时 VIEW_TOKEN 或 ADMIN_TOKEN 未设置
- **THEN** 服务拒绝启动，输出错误信息到 stderr
