## Why

现有的 OpenClaw Skill 要复制目录、手工写入含 Token 的配置文件、重启 Agent 才能用，步骤繁琐，实际很少使用，对应的规格也早已和实现脱节。管理规则更适合直接在浏览器里完成：打开页面，粘贴 Token，即可操作。

## What Changes

- **BREAKING** **移除 OpenClaw Skill 集成**：删除 `skills/rulebox/`（`SKILL.md`、`rulebox.json`）和 `.gitignore` 中的对应条目，删除 README 里的 AI Agent 安装指南和相关描述；规格能力 `openclaw-skill-integration` 整体移除。REST API 保持不变，其它工具仍可直接调用。
- **新增 Web 管理页**：由服务自身在同源提供（`GET /` 与 `GET /assets/*`），使用原生 HTML、CSS、JavaScript，不引入框架、构建步骤或 CDN。
- **登录方式**：在页面粘贴 `ADMIN_TOKEN`，保存在浏览器 `localStorage`，请求时携带 `Authorization: Bearer`；接口返回 403 即视为登录失效。
- **功能**：
  - 规则集：列表（类型筛选、条数）、新建、重命名、改描述、删除。
  - 规则：分页列表与搜索（使用服务端分页）、单条删除、行内改描述、批量添加（整批校验失败时逐行标红并给出原因）。
  - 订阅链接的查看与复制。
- **页面安全**：页面响应带严格 CSP；接口返回和用户输入的内容一律按文本渲染。
- **测试**：页面托管与安全响应头的集成测试；批量文本解析等纯逻辑的单元测试；页面交互用手工验证清单，不引入浏览器自动化。
- **文档**：README 改为以 Web 管理为主的使用说明。

## Capabilities

### New Capabilities
- `web-management-ui`: 浏览器中的规则管理页面，涵盖页面托管与安全响应头、登录与 Token 保存、规则集与规则的全部管理操作、批量添加、订阅链接、错误与状态处理、界面语言与主题。

### Modified Capabilities
- `openclaw-skill-integration`: 「OpenClaw Skill 集成」要求整体移除。

## Impact

- **依赖**：本变更依赖变更 `harden-backend-and-refine-api` 先完成，用到其中的分页与搜索、删除规则的实际条数、订阅链接接口，以及对 `/` 和 `/assets/*` 的限流豁免。
- **新增源码**：`src/modules/web.ts`（页面托管）与 `src/web/`（页面、样式、脚本、纯逻辑模块），并在 `buildApp()` 中注册页面路由；新增对应测试。
- **删除**：`skills/rulebox/`、`.gitignore` 中的相关条目。
- **文档**：`README.md`。
- **使用方**：通过 OpenClaw Skill 管理规则的用户，需要改用 Web 页面或直接调用 REST API。
- **部署**：`Dockerfile` 的 `COPY . .` 已经包含 `src/web/`，不需要改动。
