## ADDED Requirements

### Requirement: 磁盘优先读取策略
系统在执行写操作（追加、删除项）时，MUST 首先从本地 YAML 文件读取当前最新状态，而非依赖内存缓存。

#### Scenario: 写操作读取最新磁盘状态
- **WHEN** 执行 `POST /api/configs/:name/items` 或 `DELETE /api/configs/:name/items`
- **THEN** 系统先读取 `data/:name.yaml`，再基于读取结果进行合并或过滤

### Requirement: 并发锁保护
系统 MUST 实现按配置名（name）粒度的异步锁，同一配置的写操作必须串行执行，不同配置可并行。

#### Scenario: 并发写同一配置
- **WHEN** 两个请求同时尝试修改同一配置的 items
- **THEN** 一个请求先获取锁执行，另一个请求排队等待，不会发生写入竞争

#### Scenario: 不同配置可并行
- **WHEN** 两个请求分别修改不同的配置
- **THEN** 两个请求可以并行执行，互不阻塞

## MODIFIED Requirements

### Requirement: 启动全量加载
服务启动时 MUST 加载 `DATA_DIR/index.yaml` 到内存索引。索引记录每个配置的元数据（name, type, description, created_at）。随后根据索引按需加载对应的 `.yaml` 文件内容到数据缓存。

#### Scenario: 启动时加载索引和配置
- **WHEN** 服务启动且 index.yaml 包含 adblock 和 proxy 的条目
- **THEN** 内存索引包含两条记录，数据缓存加载对应的 yaml 文件内容（items 格式）

#### Scenario: 首次运行（无 index.yaml）
- **WHEN** 服务启动且 index.yaml 不存在
- **THEN** 创建空的 index.yaml，内存索引为空，服务正常启动

#### Scenario: index.yaml 格式错误
- **WHEN** index.yaml 存在但缺少 configs 数组
- **THEN** 服务启动失败，抛出错误

### Requirement: 原子文件写入
配置变更时 MUST 使用原子写入流程：先写入临时文件 `{name}.yaml.tmp`，成功后 rename 覆盖原文件 `{name}.yaml`。写操作完成后同步更新内存缓存。

#### Scenario: 正常原子写入
- **WHEN** 新增或修改配置
- **THEN** 先写 .tmp 文件，再 rename 为 .yaml，无半写文件风险

### Requirement: YAML 文件格式
每个配置文件 MUST 使用以下结构存储（内部格式，非 mihomo 标准）：
```yaml
items:
  - value: .example.com
    description: "广告域名示例"
  - value: "*.google.com"
    description: ""
```

#### Scenario: 写入带描述的结构
- **WHEN** 保存配置到文件
- **THEN** 文件内容为 `items: [{value, description}]` 格式

### Requirement: 配置名安全验证
配置名称 MUST 仅允许 `[a-zA-Z0-9_-]+` 字符，防止路径遍历攻击。

#### Scenario: 拒绝非法名称
- **WHEN** 配置名称包含 `/`, `\`, `..`, `.` 等字符
- **THEN** 返回 400 错误
