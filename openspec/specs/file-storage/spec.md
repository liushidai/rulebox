## ADDED Requirements

## MODIFIED Requirements

### Requirement: 启动全量加载
服务启动时 MUST 加载 `DATA_DIR/index.yaml` 到内存索引。索引记录每个配置的元数据（name, type, description, created_at）。随后根据索引按需加载对应的 `.yaml` 文件内容到数据缓存。

#### Scenario: 启动时加载索引和配置
- **WHEN** 服务启动且 index.yaml 包含 adblock 和 proxy 的条目
- **THEN** 内存索引包含两条记录，数据缓存加载对应的 yaml 文件内容

#### Scenario: 首次运行（无 index.yaml）
- **WHEN** 服务启动且 index.yaml 不存在
- **THEN** 创建空的 index.yaml，内存索引为空，服务正常启动

#### Scenario: index.yaml 格式错误
- **WHEN** index.yaml 存在但缺少 configs 数组
- **THEN** 服务启动失败，抛出错误

### Requirement: 原子文件写入
配置变更时 MUST 使用原子写入流程：先写入临时文件 `{name}.yaml.tmp`，成功后 rename 覆盖原文件 `{name}.yaml`。

#### Scenario: 正常原子写入
- **WHEN** 新增或修改配置
- **THEN** 先写 .tmp 文件，再 rename 为 .yaml，无半写文件风险

### Requirement: YAML 文件格式
每个配置文件 MUST 为合法 YAML，结构为：
```yaml
payload:
  - item1
  - item2
```

#### Scenario: 写入合法 YAML
- **WHEN** 保存配置到文件
- **THEN** 文件内容为 `payload: [...]` 格式，字符串列表正确序列化

### Requirement: 配置名安全验证
配置名称 MUST 仅允许 `[a-zA-Z0-9_-]+` 字符，防止路径遍历攻击。

#### Scenario: 拒绝非法名称
- **WHEN** 配置名称包含 `/`, `\`, `..`, `.` 等字符
- **THEN** 返回 400 错误
