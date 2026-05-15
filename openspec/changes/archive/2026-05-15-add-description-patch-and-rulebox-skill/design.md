## Context

RuleBox 当前已具备完整的配置 CRUD 和数据项管理能力，但存在两个缺口：
1. 配置创建后无法修改 description，只能删除重建
2. 缺少 OpenClaw Skill 集成，AI Agent 无法直接管理规则

## Goals / Non-Goals

**Goals:**
- 支持修改已有配置的 description 元数据
- 创建 OpenClaw Skill 使 AI Agent 能通过自然语言管理规则
- 改造 README 为人类和 AI 双版本，包含部署和安装指引

**Non-Goals:**
- 不修改配置的 type（仅支持 description）
- 不包含 RuleBox 部署管理功能
- 不实现全量覆盖 items 接口

## Decisions

### 1. PATCH /api/configs/:name 路由位置

**决策**: 放在 PATCH /:name/rename 之后
**理由**: Elysia 按定义顺序匹配，/:name/rename 更具体优先，不会冲突
**备选**: 独立模块 - 过度设计，增加维护成本

### 2. Skill 认证配置方式

**决策**: 使用 openclaw.json 的 skills.entries.rulebox.config 存储
**理由**: 持久化、Agent 自动读取、支持 CLI 配置命令
**备选**: 环境变量 - 生命周期短，不适合持久化

### 3. README 双版本设计

**决策**: 单一 README 文件，通过清晰分区服务两类读者
**理由**: 维护成本低，避免文档不同步
**备选**: 独立 AI-README.md - 增加维护负担

## Risks / Trade-offs

- [路由冲突风险] → PATCH /:name 和 /:name/rename 顺序敏感，需确保 rename 在前
- [Skill 配置复杂度] → 首次使用需引导用户配置，增加学习成本
- [README 维护] → 双版本内容需保持同步，但通过分区设计降低风险