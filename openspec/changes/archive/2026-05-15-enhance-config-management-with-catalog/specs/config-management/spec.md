## MODIFIED Requirements

### Requirement: 新增配置集
系统 SHALL 提供 `POST /api/configs` 端点。请求体 MUST 包含 `name`（字符串），`type`（枚举值：classical, domain, ipcidr），以及可选的 `description`（字符串）。创建成功后在 `index.yaml` 中记录元数据。

#### Scenario: 成功创建配置
- **WHEN** 发送 `POST /api/configs` with body `{"name": "adblock", "type": "domain", "description": "拦截广告"}`
- **THEN** 返回 201，index.yaml 被更新，初始 payload 文件被创建

#### Scenario: 缺少必填字段
- **WHEN** 请求体缺少 type 字段
- **THEN** 返回 400 校验错误

### Requirement: 获取配置列表
系统 SHALL 提供 `GET /api/configs` 端点，返回带元数据的列表，支持可选的 `?type=` 筛选参数。

#### Scenario: 成功获取列表
- **WHEN** 发送 `GET /api/configs`
- **THEN** 返回 200，body 为 `{"configs": [{ "name": "adblock", "type": "domain", "description": "...", "created_at": "..." }]}`
