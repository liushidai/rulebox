## ADDED Requirements

### Requirement: 获取 YAML 配置
系统 SHALL 提供 `GET /{name}.yaml` 端点，返回 YAML 格式的规则配置。请求必须携带有效的 `VIEW_TOKEN` 作为 query 参数 `?token=xxx`。

响应 `Content-Type` MUST 为 `application/yaml`。

#### Scenario: 成功获取配置
- **WHEN** 客户端发送 `GET /adblock.yaml?token=<valid_view_token>`
- **THEN** 返回 200，`Content-Type: application/yaml`，body 为 `payload: [...]` 格式的 YAML

#### Scenario: 配置不存在
- **WHEN** 请求的配置名称不存在
- **THEN** 返回 404，body 为 `{"error": "config not found", "code": "CONFIG_NOT_FOUND"}`

#### Scenario: Token 无效或缺失
- **WHEN** token 参数缺失或值不等于 VIEW_TOKEN
- **THEN** 返回 403，body 为 `{"error": "forbidden", "code": "FORBIDDEN"}`

### Requirement: 配置名称格式
配置名称 MUST 仅包含字母、数字、下划线和连字符（`[a-zA-Z0-9_-]+`）。

#### Scenario: 合法名称
- **WHEN** 配置名为 `adblock`, `proxy_rules`, `my-config-1`
- **THEN** 请求被接受

#### Scenario: 非法名称
- **WHEN** 配置名为 `ad.block`, `config/name`, `config space`
- **THEN** 返回 400
