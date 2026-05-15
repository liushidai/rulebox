# RuleBox

mihomo/clash rule-providers YAML 托管服务。通过简单的 REST API 管理规则配置，支持 AI Agent 自动化管理。

---

## 🎯 功能特性

- **规则配置管理**: 创建、删除、重命名配置集
- **规则项管理**: 添加/删除规则项（域名、IP、关键词等）
- **类型校验**: 支持 classical、domain、ipcidr 三种规则类型
- **描述支持**: 为配置和规则项添加描述信息
- **并发安全**: 按配置名加锁，保证数据一致性
- **AI Agent 集成**: 支持 OpenClaw 等 AI Agent 通过自然语言管理规则

---

## 🚀 快速开始（人类用户）

### 前提条件

- [Bun](https://bun.sh/) 运行时
- 或使用 Docker Compose

### 本地开发

```bash
# 克隆仓库
git clone https://github.com/liushidai/rulebox.git
cd rulebox

# 安装依赖
bun install

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，设置 VIEW_TOKEN 和 ADMIN_TOKEN

# 启动服务
bun run src/index.ts
```

### Docker Compose 部署

```bash
# 克隆仓库
git clone https://github.com/liushidai/rulebox.git
cd rulebox

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，至少设置以下变量：
#   VIEW_TOKEN=your-view-token
#   ADMIN_TOKEN=your-admin-token
#   PORT=8080

# 启动服务
docker compose up -d
```

服务启动后：
- API 地址: `http://localhost:8080`
- Swagger 文档: `http://localhost:8080/swagger`
- 健康检查: `http://localhost:8080/health`

---

## 🤖 AI Agent 安装指南

> 此部分面向 AI Agent（如 OpenClaw），用于自动化部署和配置 RuleBox。

### 部署流程

1. **克隆仓库**
   ```bash
   git clone https://github.com/liushidai/rulebox.git
   cd rulebox
   ```

2. **配置 Token 并启动服务**
   
   a. 生成或获取 Token：
      - 方案 A：用户直接提供已有的 Token
      - 方案 B：AI 使用 `openssl rand -hex 16` 命令自动生成随机 Token
   
   b. 将 Token 写入项目目录下的 `.env` 文件：
   ```env
   VIEW_TOKEN=rulebox-view-$(openssl rand -hex 16)
   ADMIN_TOKEN=rulebox-admin-$(openssl rand -hex 16)
   PORT=8080
   DATA_DIR=/data
   ENABLE_SWAGGER=false
   ```
  
   c. 启动服务：
      ```bash
      docker compose up -d
      ```

3. **验证部署**
   ```bash
   curl http://localhost:8080/health
   # 应返回: {"status":"ok"}
   ```

### Skill 安装流程

1. **复制 Skill 到 OpenClaw workspace**
   ```bash
   mkdir -p ~/.openclaw/workspace/skills/rulebox
   cp -r skills/rulebox/* ~/.openclaw/workspace/skills/rulebox/
   ```

2. **写入 Skill 配置文件**
   
   **关键**：此文件用于 Agent 认证，Token 必须与上一步 `.env` 中**完全一致**。
   
   请在项目路径 `~/.openclaw/workspace/skills/rulebox/rulebox.json` 中创建/覆盖以下内容：
   ```json
   {
     "url": "http://localhost:8080",
     "adminToken": "<替换为步骤 2b 生成的 ADMIN_TOKEN>",
     "viewToken": "<替换为步骤 2b 生成的 VIEW_TOKEN>"
   }
   ```

   **执行验证**：
   写入后，请运行 `cat ~/.openclaw/workspace/skills/rulebox/rulebox.json` 检查。
   *确保输出结果中包含真实的随机 Token 字符串，而不是占位符文本。*

3. **验证 Skill 加载**
   ```bash
   openclaw skills list
   ```

4. **重启 OpenClaw 或创建新会话**
   ```bash
   /new
   ```

---

## 📖 API 文档

### 主要接口

| 方法   | 路径                            | 说明             | 认证         |
|--------|---------------------------------|------------------|--------------|
| GET    | `/:name.yaml`                   | 获取 YAML 配置   | VIEW_TOKEN   |
| GET    | `/api/configs`                  | 列出所有配置     | ADMIN_TOKEN  |
| POST   | `/api/configs`                  | 创建新配置       | ADMIN_TOKEN  |
| DELETE | `/api/configs/:name`            | 删除配置         | ADMIN_TOKEN  |
| PATCH  | `/api/configs/:name/rename`     | 重命名配置       | ADMIN_TOKEN  |
| PATCH  | `/api/configs/:name`            | 修改配置描述     | ADMIN_TOKEN  |
| GET    | `/api/configs/:name/items`      | 获取规则项       | ADMIN_TOKEN  |
| POST   | `/api/configs/:name/items`      | 添加规则项       | ADMIN_TOKEN  |
| DELETE | `/api/configs/:name/items`      | 删除规则项       | ADMIN_TOKEN  |

---

## 🔧 环境变量

| 变量名            | 说明                           | 必填 |
|-------------------|--------------------------------|------|
| `VIEW_TOKEN`      | 查看 YAML 配置的 Token         | 是   |
| `ADMIN_TOKEN`     | 管理配置的 Token               | 是   |
| `PORT`            | 服务端口（默认 8080）          | 否   |
| `DATA_DIR`        | 数据存储目录（默认 ./data）    | 否   |
| `ENABLE_SWAGGER`  | 是否启用 Swagger 文档（默认 false） | 否   |

---

## 📝 使用示例

### 创建配置集

```bash
curl -X POST http://localhost:8080/api/configs \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "adblock", "type": "domain", "description": "拦截广告"}'
```

### 添加规则

```bash
curl -X POST http://localhost:8080/api/configs/adblock/items \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"items": [{"value": "ad.example.com", "description": "广告域名"}]}'
```

### 获取 YAML 配置（mihomo 兼容）

```bash
curl http://localhost:8080/adblock.yaml?token=$VIEW_TOKEN
```