## ADDED Requirements

### Requirement: 域名模式校验
对于类型为 `domain` 的配置，每个 payload 项 MUST 是合法的 Clash 通配符域名。

#### Scenario: 合法通配符域名
- **WHEN** payload 项是 `.example.com` 或 `*.google.com` 或 `test.*.example.com`
- **THEN** 该项通过校验

#### Scenario: 非法通配符域名
- **WHEN** payload 项是 `foo*.bar.com`（`*` 位置非法）或 `..google.com`
- **THEN** 该项校验失败，返回错误信息

### Requirement: IPCIDR 格式校验
对于类型为 `ipcidr` 的配置，每个 payload 项 MUST 是合法的 CIDR 表示法。

#### Scenario: 合法 CIDR
- **WHEN** payload 项是 `192.168.1.0/24`
- **THEN** 该项通过校验

#### Scenario: 非法 CIDR
- **WHEN** payload 项是 `192.168.1.1`（缺少掩码）或 `192.168.1.0/33`（掩码无效）
- **THEN** 该项校验失败，返回错误信息

### Requirement: Classical 格式校验
对于类型为 `classical` 的配置，每个 payload 项 MUST 遵循 `TYPE,VALUE` 结构，其中 TYPE 在 mihomo 白名单中。

#### Scenario: 合法 classical 规则
- **WHEN** payload 项是 `DOMAIN-SUFFIX,google.com` 或 `GEOIP,CN`
- **THEN** 该项通过校验

#### Scenario: 非法 classical 规则
- **WHEN** payload 项是 `INVALID_TYPE,foo` 或 `DOMAIN-SUFFIX`（缺少值）
- **THEN** 该项校验失败，返回错误信息
