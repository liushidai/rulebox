## MODIFIED Requirements

### Requirement: 追加数据项
系统 SHALL 提供 `POST /api/configs/{name}/items` 端点。请求体 `items` MUST 为对象数组，每个对象包含 `value`（字符串）和可选的 `description`（字符串）。

#### Scenario: 成功追加对象数组
- **WHEN** 发送 `POST /api/configs/adblock/items` with body `{"items": [{"value": ".example.com", "description": "广告"}]}` 和有效 ADMIN_TOKEN
- **THEN** 返回 200，数据项被追加，包含描述信息

#### Scenario: 描述字段可选
- **WHEN** 请求体仅包含 value：`{"items": [{"value": ".example.com"}]}`
- **THEN** 系统自动将 description 设为空字符串 `""`

### Requirement: 删除数据项
系统 SHALL 提供 `DELETE /api/configs/{name}/items` 端点。请求体 `items` MUST 为对象数组，每个对象包含 `value` 字段。

#### Scenario: 按 value 删除项
- **WHEN** 发送 `DELETE /api/configs/adblock/items` with body `{"items": [{"value": ".example.com"}]}` 和有效 ADMIN_TOKEN
- **THEN** 对应 value 的数据项被移除
