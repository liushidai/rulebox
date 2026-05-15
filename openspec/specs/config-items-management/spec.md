## ADDED Requirements

### Requirement: 获取配置数据项
系统 SHALL 提供 `GET /api/configs/{name}/items` 端点，返回指定配置集的所有数据项（含 value 和 description）。

#### Scenario: 成功获取数据项
- **WHEN** 发送 `GET /api/configs/adblock/items` with 有效 ADMIN_TOKEN
- **THEN** 返回 200，body 为 `{"name": "adblock", "items": [{"value": "example.com", "description": "广告"}, {"value": "*.tracker.io", "description": ""}]}`

#### Scenario: 配置不存在
- **WHEN** 请求的配置不存在
- **THEN** 返回 404

### Requirement: 追加数据项
系统 SHALL 提供 `POST /api/configs/{name}/items` 端点，向指定配置集追加数据项。

`items` MUST 为对象数组，每个对象包含 `value`（字符串）和 `description`（字符串）。追加时实现"最新覆盖去重"：如果 value 已存在，用新的 description 覆盖旧描述。

#### Scenario: 成功追加对象数组
- **WHEN** 发送 `POST /api/configs/adblock/items` with body `{"items": [{"value": "example.com", "description": "广告"}, {"value": "ads.com", "description": "广告商"}]}` 和有效 ADMIN_TOKEN
- **THEN** 返回 200，数据项被追加

#### Scenario: 描述字段覆盖
- **WHEN** 已有 item `{value: "example.com", description: "旧描述"}`，新请求提交 `{value: "example.com", "description": "新描述"}`
- **THEN** 返回 200，该 item 的描述被更新为"新描述"

#### Scenario: 配置不存在
- **WHEN** 向不存在的配置追加数据
- **THEN** 返回 404

### Requirement: 删除数据项
系统 SHALL 提供 `DELETE /api/configs/{name}/items` 端点，从指定配置集删除数据项。

`items` MUST 为对象数组，每个对象包含 `value` 字段。删除时基于 value 匹配，不在配置中的条目静默忽略。

#### Scenario: 成功删除数据项
- **WHEN** 发送 `DELETE /api/configs/adblock/items` with body `{"items": [{"value": "example.com"}]}` 和有效 ADMIN_TOKEN
- **THEN** 返回 200，指定 value 的数据项被移除

#### Scenario: 删除不存在的条目
- **WHEN** 删除配置中不存在的 value
- **THEN** 返回 200，操作成功，无错误

#### Scenario: 配置不存在
- **WHEN** 从不存在的配置删除数据
- **THEN** 返回 404

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