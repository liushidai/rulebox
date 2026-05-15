## Why

当前 RuleBox 的配置管理过于简单，所有规则项（payload）都作为无类型的字符串数组存储。这导致了几个问题：
1. **没有校验**：用户可能录入错误的 IP/CIDR 或不匹配的域名格式，导致下游代理失败。
2. **缺乏管理**：无法快速识别哪些配置是广告拦截、哪些是代理策略。
3. **筛选困难**：客户端无法按规则类型（domain, ipcidr, classical）批量获取配置。

本提案通过引入 `index.yaml` 索引机制和严格的类型校验，提升服务的健壮性和可用性。

## What Changes

- **新增索引文件**：引入 `index.yaml` 维护所有配置的元数据（type, description, created_at）。
- **类型强制**：创建配置时必填 `type`（classical, domain, ipcidr），不同类型对应不同的校验逻辑。
- **API 筛选增强**：支持 `GET /api/configs?type=domain` 筛选列表。
- **API 响应增强**：列表和详情接口返回元数据字段。
- **规则格式校验**：在追加数据项（items）时，根据配置的 type 执行对应的格式检查。

## Capabilities

### New Capabilities
- `config-indexing`: 引入 index.yaml 维护配置集元数据（名称、类型、描述、时间）。
- `rule-item-validation`: 录入数据项时根据 type 执行相应的格式校验逻辑。
- `config-filtering`: 支持按 type 筛选配置列表。

### Modified Capabilities
- `config-management`: 创建配置必须包含 type/description，列表接口返回结构化数据。
- `file-storage`: 增加 index.yaml 的读写与原子更新逻辑。

## Impact

- **源码**：`src/lib/` 新增 `index.ts`（索引管理）和 `validator.ts`（格式校验）。
- **API**：`POST /api/configs` 接收新字段；`GET /api/configs` 增加筛选参数和返回结构变更。
- **数据**：首次部署时自动生成初始化后的 `index.yaml`。