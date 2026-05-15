## ADDED Requirements

### Requirement: 配置索引持久化
系统 SHALL 在 `DATA_DIR/index.yaml` 维护一个集中索引文件，包含所有配置的元数据。

#### Scenario: 索引结构
- **WHEN** 系统初始化时
- **THEN** 索引文件应遵循结构：`configs: [{ name, type, description, created_at }]`

### Requirement: 索引生命周期同步
当配置被创建、重命名或删除时，系统 MUST 更新内存中的索引，并原子持久化变更到 `index.yaml`。

#### Scenario: 创建配置更新索引
- **WHEN** 通过 API 创建新配置
- **THEN** 系统在 index.yaml 中添加新条目，包含当前时间戳

#### Scenario: 删除配置移除索引
- **WHEN** 配置被删除
- **THEN** 对应条目从 index.yaml 中移除
