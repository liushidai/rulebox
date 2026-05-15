## ADDED Requirements

### Requirement: 启动全量加载
服务启动时 MUST 扫描 `DATA_DIR` 目录下所有 `.yaml` 文件，加载到内存缓存 `Map<string, string[]>` 中。

#### Scenario: 启动时加载已有配置
- **WHEN** 服务启动且 DATA_DIR 包含 `adblock.yaml` 和 `proxy.yaml`
- **THEN** 内存缓存包含 `adblock` 和 `proxy` 两个 key

#### Scenario: 空数据目录
- **WHEN** 服务启动且 DATA_DIR 为空
- **THEN** 内存缓存为空，服务正常启动

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
