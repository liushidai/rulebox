## ADDED Requirements

### Requirement: 新增配置集
系统 SHALL 提供 `POST /api/configs` 端点，创建一个新的空配置集。请求必须携带有效的 `ADMIN_TOKEN`。

请求体 MUST 包含 `name` 字段（字符串）。创建成功后生成对应的 `.yaml` 文件，初始内容为 `payload: []`。

#### Scenario: 成功创建配置
- **WHEN** 发送 `POST /api/configs` with body `{"name": "adblock"}` 和有效 ADMIN_TOKEN
- **THEN** 返回 201，对应的 `.yaml` 文件被创建

#### Scenario: 配置已存在
- **WHEN** 尝试创建已存在的配置名称
- **THEN** 返回 409，body 为 `{"error": "config already exists", "code": "CONFLICT"}`

### Requirement: 获取配置列表
系统 SHALL 提供 `GET /api/configs` 端点，返回所有配置集名称列表。

#### Scenario: 成功获取列表
- **WHEN** 发送 `GET /api/configs` with 有效 ADMIN_TOKEN
- **THEN** 返回 200，body 为 `{"configs": ["adblock", "proxy", "direct"]}`

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
