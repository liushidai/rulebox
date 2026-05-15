## ADDED Requirements

### Requirement: 磁盘优先读取策略
系统在执行写操作（追加、删除项）时，MUST 首先从本地 YAML 文件读取当前最新状态，而非依赖内存缓存。

#### Scenario: 写操作读取最新磁盘状态
- **WHEN** 执行 `POST /api/configs/:name/items`
- **THEN** 系统先读取 `data/:name.yaml`，再基于读取结果进行合并

### Requirement: 并发锁保护
系统 MUST 实现按配置名（name）粒度的异步锁，同一配置的写操作必须串行执行。

#### Scenario: 并发写同一配置
- **WHEN** 两个请求同时尝试修改同一配置的 items
- **THEN** 一个请求先获取锁执行，另一个请求排队等待，不会发生写入竞争

#### Scenario: 不同配置可并行
- **WHEN** 两个请求分别修改不同的配置
- **THEN** 两个请求可以并行执行，互不阻塞

### Requirement: 内存与磁盘一致性
写操作完成后，系统 MUST 同步更新内存缓存，并原子写入磁盘文件。

#### Scenario: 写后内存与磁盘一致
- **WHEN** 写操作成功返回
- **THEN** 内存缓存内容与磁盘 `.yaml` 文件内容一致
