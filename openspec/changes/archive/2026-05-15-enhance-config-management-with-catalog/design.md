## Context

当前系统使用 `ConfigStore` 管理 YAML 配置，但仅维护内存 Map 中的 `name → items` 映射。没有集中式的元数据管理，导致类型和描述等信息无法持久化和查询。

## Goals / Non-Goals

**Goals:**
- 引入 `index.yaml` 记录所有配置的元数据（名称、类型、描述、创建时间）。
- 在创建和追加数据项时提供针对性的格式校验（domain/ipcidr/classical）。
- 提供按类型筛选配置的 API 支持。
- 确保双文件（index.yaml 和 payload.yaml）的一致性。

**Non-Goals:**
- 不提供旧数据的自动迁移（因为是首次部署）。
- 不对 `classical` 规则进行极复杂的逻辑校验（如正则表达式编译检查）。

## Decisions

1. **使用 index.yaml 而非 catalog.yaml**：更简洁，符合索引文件的通用认知。
2. **写入顺序**：先写入/更新 payload yaml 文件，成功后再更新 index.yaml。这保证了如果 payload 写入失败，index 不会出现“幽灵引用”。
3. **校验逻辑分离**：创建独立的 `validator.ts`，根据类型导出不同的校验函数，保持 `store.ts` 的纯净。
4. **Classical 校验采用白名单+基础格式检查**：避免过度解析复杂规则（如逻辑运算规则 AND/OR），重点拦截最明显的格式错误。
5. **GET /:fileName 保持纯净输出**：只返回 payload 数组，确保 mihomo 解析兼容。

## Risks / Trade-offs

- [Risk] **index.yaml 损坏导致全量不可读**。
  → Mitigation: 启动加载时如果发现 index.yaml 语法错误或丢失，直接抛出启动错误，要求用户介入（因为尚未上线，手动介入风险低）。
- [Risk] **高并发下的原子写入冲突**。
  → Mitigation: RuleBox 定位为轻量配置服务，单实例部署下，原子 rename 操作已足够。
