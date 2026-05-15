## MODIFIED Requirements

### Requirement: 存储初始化与索引加载
系统启动时 SHALL 加载 `DATA_DIR/index.yaml` 到内存。如果文件不存在，则视为首次运行并创建初始空索引。

#### Scenario: 正常启动
- **WHEN** 系统启动且 index.yaml 存在
- **THEN** 配置从 index.yaml 加载到内存

#### Scenario: 首次运行
- **WHEN** 系统启动且 index.yaml 不存在
- **THEN** 在内存中创建空索引并保存到磁盘
