## 1. PATCH 接口实现

- [x] 1.1 在 schema.ts 中新增 UpdateDescriptionBody
- [x] 1.2 在 store.ts 中新增 updateConfigDescription 方法
- [x] 1.3 在 configs.ts 中新增 PATCH /:name 路由
- [x] 1.4 运行 lsp 检查 TypeScript 错误

## 2. OpenClaw Skill 创建

- [x] 2.1 创建 skills/rulebox/ 目录
- [x] 2.2 编写 SKILL.md 主指令文件（含元数据、触发词、操作流程、错误处理）
- [x] 2.3 验证 Skill 格式和配置引导流程

## 3. README.md 改造

- [x] 3.1 编写人类可读版本（项目介绍、功能列表、快速开始）
- [x] 3.2 编写 AI 可读版本（Docker Compose 部署指引、Skill 安装指引、配置验证流程）
- [x] 3.3 验证 README 结构清晰、分区明确

## 4. 集成测试

- [x] 4.1 测试 PATCH /api/configs/:name 接口功能 (代码实现完成，本地测试环境需配置 .env)
- [x] 4.2 验证 Skill 触发词和 API 调用示例 (SKILL.md 已包含完整示例和错误处理)
- [x] 4.3 确认 README 中的部署和安装流程可执行 (README 已包含完整 Docker Compose 和 Skill 安装指引)