## Context

当前系统使用 `Map<string, string[]>` 缓存配置项，写入操作基于内存状态（内存 → 持久化）。随着业务需求增加，配置项需要支持附加信息（description），且“内存优先”策略在外部文件修改或多实例部署下可能引发不一致。

## Goals / Non-Goals

**Goals:**
- 支持数据项级描述，请求体升级为 `{ value, description }` 结构。
- 实现磁盘优先读写，写操作总是基于当前磁盘最新状态。
- 引入按 name 粒度的异步锁，确保同一配置的写操作串行化。
- `GET /:fileName` 输出保持 mihomo 标准 `payload: [string]` 格式。

**Non-Goals:**
- 不支持旧格式请求体向后兼容。
- 不提供旧数据迁移（未上线，首次部署生成新格式文件）。

## Decisions

1. **按 name 粒度锁（LockMap）**：
   - 不同配置的写操作可以并行，同一配置串行化。
   - 实现：使用 `Map<string, Promise<void>>` 跟踪各 name 的锁状态。
2. **写操作读取磁盘**：
   - 每次 `POST/DELETE items` 首先执行 `readFileSync` 获取最新状态。
   - 理由：确保内存与磁盘绝对一致，防止外部手动编辑导致的数据冲突。
3. **存储格式 vs 输出格式**：
   - YAML 文件内使用 `items: [{value, desc}]`（非 mihomo 标准）。
   - API 输出时自动提取 `payload: items.map(i => i.value)`。
4. **去重策略（最新覆盖）**：
   - 如果请求中的 `value` 与现有项重复，用新的 `description` 覆盖旧描述。
   - 这允许用户通过追加操作更新某条规则的描述。

## Risks / Trade-offs

- [Risk] **频繁磁盘 IO 导致延迟增加**。
  → Mitigation: 规则集管理服务写入频率极低（分钟级），微秒级 IO 可忽略。
- [Risk] **并发请求锁等待**。
  → Mitigation: 锁基于 Promise 队列，同一配置的写入按请求顺序排队，不会丢失数据。