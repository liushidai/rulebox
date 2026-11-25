## ADDED Requirements

### Requirement: 获取订阅链接
系统 SHALL 提供 `GET /api/configs/{name}/subscription` 端点，返回指定配置集可供 mihomo 拉取的订阅地址。该端点 MUST 要求有效 `ADMIN_TOKEN`。

响应 MUST 包含 `name` 和 `url`。`url` MUST 为根相对地址，格式为 `/{name}.yaml?token={VIEW_TOKEN}`，不包含协议与主机名。

#### Scenario: 成功获取订阅链接
- **WHEN** 发送 `GET /api/configs/adblock/subscription` with 有效 ADMIN_TOKEN
- **THEN** 返回 200，body 为 `{"name": "adblock", "url": "/adblock.yaml?token=<VIEW_TOKEN>"}`

#### Scenario: 使用订阅地址拉取
- **WHEN** 客户端在订阅地址前拼接服务的主机名后发起 `GET` 请求
- **THEN** 得到与 `GET /{name}.yaml?token=<VIEW_TOKEN>` 相同的 YAML 内容

#### Scenario: 配置不存在
- **WHEN** 请求的配置不存在
- **THEN** 返回 404，body 为 `{"error": "config not found", "code": "CONFIG_NOT_FOUND"}`

#### Scenario: 未携带 ADMIN_TOKEN
- **WHEN** 请求未携带有效的 `Authorization: Bearer <ADMIN_TOKEN>`
- **THEN** 返回 403，body 为 `{"error": "forbidden", "code": "FORBIDDEN"}`

## MODIFIED Requirements

### Requirement: 获取 YAML 配置
系统 SHALL 提供 `GET /{name}.yaml` 端点，返回 YAML 格式的规则配置。请求必须携带有效的 `VIEW_TOKEN` 作为 query 参数 `?token=xxx`。

响应 `Content-Type` MUST 为 `text/yaml`，以便浏览器直接以文本查看，同时保持 mihomo 可正常解析。

输出格式 MUST 为 mihomo 兼容的纯净 `payload` 数组，仅包含 value 字符串（不含描述信息）。

#### Scenario: 成功获取配置
- **WHEN** 客户端发送 `GET /adblock.yaml?token=<valid_view_token>`
- **THEN** 返回 200，`Content-Type: text/yaml`，body 为 `payload: ["value1", "value2", ...]` 格式的 YAML

#### Scenario: 配置不存在
- **WHEN** 请求的配置名称不存在
- **THEN** 返回 404，body 为 `{"error": "config not found", "code": "CONFIG_NOT_FOUND"}`

#### Scenario: Token 无效或缺失
- **WHEN** token 参数缺失或值不等于 VIEW_TOKEN
- **THEN** 返回 403，body 为 `{"error": "forbidden", "code": "FORBIDDEN"}`
