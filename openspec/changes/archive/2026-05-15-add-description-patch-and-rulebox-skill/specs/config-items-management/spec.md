## MODIFIED Requirements

### Requirement: 修改配置描述
系统 SHALL 提供 `PATCH /api/configs/{name}` 端点，支持修改指定配置的 description 元数据。

请求体 MUST 包含 `description` 字段（字符串类型，允许空字符串）。该操作仅更新 index.yaml 中的元数据，不修改 payload yaml 文件。

#### Scenario: 成功修改描述
- **WHEN** 发送 `PATCH /api/configs/adblock` with body `{"description": "更新后的描述"}` 和有效 ADMIN_TOKEN
- **THEN** 返回 200，body 为 `{"updated": "adblock", "description": "更新后的描述"}`

#### Scenario: 清空描述
- **WHEN** 发送 `PATCH /api/configs/adblock` with body `{"description": ""}` 和有效 ADMIN_TOKEN
- **THEN** 返回 200，description 被清空

#### Scenario: 配置不存在
- **WHEN** 修改不存在的配置描述
- **THEN** 返回 404，body 为 `{"error": "config not found", "code": "CONFIG_NOT_FOUND"}`