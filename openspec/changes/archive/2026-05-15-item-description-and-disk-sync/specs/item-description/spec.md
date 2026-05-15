## ADDED Requirements

### Requirement: 数据项描述支持
配置项 SHALL 支持 `value` 和 `description` 两个字段。`value` 为规则字符串，`description` 为可选的描述文本。

#### Scenario: 创建带描述的配置项
- **WHEN** 请求 `POST /api/configs/:name/items` 携带 `{ "items": [{ "value": ".example.com", "description": "广告域名" }] }`
- **THEN** 配置项被保存，内部包含描述信息

#### Scenario: 查询配置项返回描述
- **WHEN** 请求 `GET /api/configs/:name/items`
- **THEN** 返回的每项包含 `value` 和 `description` 字段

### Requirement: 重复值覆盖描述
当新提交的数据项 `value` 与现有项冲突时，系统 MUST 使用最新的 `description` 覆盖旧描述。

#### Scenario: 更新已存在项的描述
- **WHEN** 已有项 `{ value: ".example.com", description: "旧描述" }`，新请求提交 `{ value: ".example.com", description: "新描述" }`
- **THEN** 该项的描述被更新为 "新描述"
