## ADDED Requirements

### Requirement: OpenClaw Skill 集成
系统 SHALL 提供 `skills/rulebox/SKILL.md` 文件，使 OpenClaw AI Agent 能够通过自然语言管理 RuleBox 规则。

Skill MUST 支持以下操作：创建配置集、添加规则到配置、从配置移除规则、查看配置列表/详情、重命名配置集、修改配置描述、删除配置集。

Skill MUST 通过 `skills.entries.rulebox.config` 读取配置信息（url 和 adminToken），首次使用时引导用户通过 CLI 命令配置。

#### Scenario: Skill 触发 - 添加规则
- **WHEN** 用户说 "添加 google.com 到 proxy"
- **THEN** Agent 调用 POST /api/configs/proxy/items 接口

#### Scenario: Skill 触发 - 移除规则
- **WHEN** 用户说 "从 proxy 删掉 google.com"
- **THEN** Agent 调用 DELETE /api/configs/proxy/items 接口

#### Scenario: Skill 触发 - 创建配置
- **WHEN** 用户说 "新建一个 adblock 配置"
- **THEN** Agent 调用 POST /api/configs 接口

#### Scenario: 首次配置引导
- **WHEN** Agent 发现 skills.entries.rulebox.config 未配置
- **THEN** 引导用户运行 openclaw config set 命令配置 url 和 adminToken

#### Scenario: 错误处理 - 配置不存在
- **WHEN** API 返回 404
- **THEN** Agent 提示用户配置不存在，建议先创建配置

#### Scenario: 错误处理 - Token 无效
- **WHEN** API 返回 401/403
- **THEN** Agent 提示用户检查 adminToken 配置