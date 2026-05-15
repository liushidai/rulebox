## Why

当前 RuleBox 配置创建后无法修改 description，只能重建，用户体验不佳。同时缺少 OpenClaw Skill 集成，AI Agent 无法直接管理规则，限制了自动化能力。

## What Changes

- 新增 PATCH /api/configs/:name 接口，支持仅修改配置 description
- 创建 skills/rulebox/SKILL.md，让 OpenClaw AI Agent 可以通过自然语言管理规则
- 改造 README.md 为人类和 AI 双版本，包含 Docker Compose 部署和 Skill 安装指引

## Capabilities

### New Capabilities
- `config-description-patch`: 支持修改已有配置的 description 元数据
- `openclaw-skill-integration`: OpenClaw AI Agent 集成，支持自然语言规则管理

### Modified Capabilities
- `config-items-management`: PATCH 接口扩展配置管理操作
- `config-management`: 新增修改 description 的配置管理能力

## Impact

- 新增 API 端点: PATCH /api/configs/:name
- 新增文件: skills/rulebox/SKILL.md
- 修改文件: README.md (全面改造)
- 修改文件: src/schema.ts, src/lib/store.ts, src/modules/configs.ts (PATCH 接口实现)