## REMOVED Requirements

### Requirement: OpenClaw Skill 集成
**Reason**: Skill 的安装与配置步骤繁琐，实际很少使用；规格描述的配置方式（`skills.entries.rulebox.config`）也与实现（读取同目录的 `rulebox.json`）不符。规则管理改由 Web 管理页承担。

**Migration**: 打开 `GET /` 并粘贴 `ADMIN_TOKEN`，使用 Web 管理页。需要自动化的场景直接调用 REST API，接口保持不变。已经安装到 OpenClaw workspace 的 Skill 副本可以手动删除。
