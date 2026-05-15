## ADDED Requirements

### Requirement: 删除配置集
系统 SHALL 提供 `DELETE /api/configs/{name}` 端点，删除指定的配置集及其对应的 `.yaml` 文件和内存缓存。

#### Scenario: 成功删除配置
- **WHEN** 发送 `DELETE /api/configs/adblock` with 有效 ADMIN_TOKEN
- **THEN** 返回 200，对应文件和缓存被移除

#### Scenario: 配置不存在
- **WHEN** 删除不存在的配置
- **THEN** 返回 404，body 为 `{"error": "config not found", "code": "CONFIG_NOT_FOUND"}`

### Requirement: 重命名配置集
系统 SHALL 提供 `PATCH /api/configs/{name}/rename` 端点，重命名指定的配置集。

请求体 MUST 包含 `newName` 字段。重命名会移动 `.yaml` 文件并更新内存缓存 key。

#### Scenario: 成功重命名
- **WHEN** 发送 `PATCH /api/configs/adblock/rename` with body `{"newName": "adblock-v2"}` 和有效 ADMIN_TOKEN
- **THEN** 返回 200，文件被重命名，缓存 key 更新

#### Scenario: 新名称已存在
- **WHEN** 新名称已被其他配置使用
- **THEN** 返回 409，body 为 `{"error": "config already exists", "code": "CONFLICT"}`

#### Scenario: 原配置不存在
- **WHEN** 原配置名称不存在
- **THEN** 返回 404

## MODIFIED Requirements

### Requirement: 新增配置集
系统 SHALL 提供 `POST /api/configs` 端点。请求体 MUST 包含 `name`（字符串），`type`（枚举值：classical, domain, ipcidr），以及可选的 `description`（字符串）。创建成功后在 `index.yaml` 中记录元数据，并生成对应的 `.yaml` 文件，初始内容为 `payload: []`。

#### Scenario: 成功创建配置
- **WHEN** 发送 `POST /api/configs` with body `{"name": "adblock", "type": "domain", "description": "拦截广告"}` 和有效 ADMIN_TOKEN
- **THEN** 返回 201，index.yaml 被更新，对应的 `.yaml` 文件被创建

#### Scenario: 配置已存在
- **WHEN** 尝试创建已存在的配置名称
- **THEN** 返回 409，body 为 `{"error": "config already exists", "code": "CONFLICT"}`

#### Scenario: 缺少必填字段
- **WHEN** 请求体缺少 type 字段
- **THEN** 返回 400 校验错误

### Requirement: 获取配置列表
系统 SHALL 提供 `GET /api/configs` 端点，返回带元数据的列表，支持可选的 `?type=` 筛选参数。

#### Scenario: 成功获取列表
- **WHEN** 发送 `GET /api/configs` with 有效 ADMIN_TOKEN
- **THEN** 返回 200，body 为 `{"configs": [{ "name": "adblock", "type": "domain", "description": "...", "created_at": "..." }]}`

#### Scenario: 按类型筛选
- **WHEN** 发送 `GET /api/configs?type=domain` with 有效 ADMIN_TOKEN
- **THEN** 返回 200，仅包含 type 为 domain 的配置
