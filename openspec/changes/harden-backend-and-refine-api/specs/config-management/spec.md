## MODIFIED Requirements

### Requirement: 获取配置列表
系统 SHALL 提供 `GET /api/configs` 端点，返回带元数据的列表，支持可选的 `?type=` 筛选参数。

列表中的每一项 MUST 包含 `name`、`type`、`description`、`created_at` 和 `item_count`（该配置集的数据项条数）。

#### Scenario: 成功获取列表
- **WHEN** 发送 `GET /api/configs` with 有效 ADMIN_TOKEN
- **THEN** 返回 200，body 为 `{"configs": [{ "name": "adblock", "type": "domain", "description": "拦截广告", "created_at": "2026-05-15T00:00:00.000Z", "item_count": 2 }]}`

#### Scenario: 按类型筛选
- **WHEN** 发送 `GET /api/configs?type=domain` with 有效 ADMIN_TOKEN
- **THEN** 返回 200，仅包含 type 为 domain 的配置

#### Scenario: 空配置集的条数
- **WHEN** 配置集没有任何数据项
- **THEN** 该配置集的 `item_count` 为 0
