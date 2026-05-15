## ADDED Requirements

### Requirement: 按类型筛选配置
系统 SHALL 支持通过查询参数在列表 API 中按类型筛选配置。

#### Scenario: 按 domain 筛选
- **WHEN** 向 `/api/configs?type=domain` 发送 GET 请求
- **THEN** 仅返回类型为 `domain` 的配置

#### Scenario: 无筛选获取全部列表
- **WHEN** 向 `/api/configs` 发送 GET 请求
- **THEN** 返回所有配置，包含完整元数据
