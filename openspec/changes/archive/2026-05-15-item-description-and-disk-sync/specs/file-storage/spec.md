## MODIFIED Requirements

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

### Requirement: GET /:fileName 输出兼容性
系统通过 `GET /:fileName` 提供的 YAML 输出 MUST 为纯净 `payload` 数组，仅包含 `value` 字符串。

#### Scenario: 输出标准 payload
- **WHEN** 请求 `GET /adblock.yaml?token=xxx`
- **THEN** 返回 `payload: ["value1", "value2", ...]`，不含描述信息
