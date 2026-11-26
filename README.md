# RuleBox

RuleBox 托管 mihomo/Clash 规则订阅。可以在浏览器中管理规则集，也可以直接调用 REST API。

---

## 🎯 功能特性

- **规则配置管理**: 创建、删除、重命名配置集
- **规则项管理**: 分页搜索、批量添加、删除规则和编辑描述
- **类型校验**: 支持 classical、domain、ipcidr 三种规则类型
- **描述支持**: 为配置和规则项添加描述信息
- **并发安全**: 按配置名加锁，保证数据一致性
- **订阅链接**: 从管理页复制可供 mihomo/Clash 拉取的 YAML 地址

---

## 🚀 快速开始

### 使用 GHCR 镜像部署

部署服务器只需要 Docker 和 Docker Compose，不必克隆源码。从 [GitHub Packages](https://github.com/liushidai/rulebox/pkgs/container/rulebox) 选择一个已发布的镜像标签，然后在同一个目录创建 `.env` 和 `compose.yaml`。

`.env`（将示例镜像地址替换为实际发布的地址，并用 `openssl rand -hex 32` 分别生成两个不同的令牌）：

```dotenv
RULEBOX_IMAGE=ghcr.io/liushidai/rulebox:20261126-1435-42-1
ADMIN_TOKEN=替换为管理令牌
VIEW_TOKEN=替换为订阅令牌
```

`compose.yaml`：

```yaml
services:
  rulebox:
    image: ${RULEBOX_IMAGE:?请填写镜像地址}
    ports:
      - "8080:8080"
    environment:
      ADMIN_TOKEN: ${ADMIN_TOKEN:?请填写管理令牌}
      VIEW_TOKEN: ${VIEW_TOKEN:?请填写订阅令牌}
    volumes:
      - ./data:/data
    restart: unless-stopped
```

```bash
docker compose pull
docker compose up -d
```

启动后打开 `http://localhost:8080/`，输入管理令牌登录。健康检查地址是 `http://localhost:8080/health`。

公开镜像可直接拉取；私有镜像需先用有读取权限的账号和带 `read:packages` 权限的 GitHub 个人访问令牌登录 `ghcr.io`。升级或回滚时，改 `.env` 里的 `RULEBOX_IMAGE` 后重新执行上面两条命令；保留 `./data`，不要删除数据目录。

### 本地开发

需要 [Bun](https://bun.sh/)。仓库自带的 `docker-compose.yml` 仍用于从源码构建，不会拉取 GHCR 镜像。

```bash
git clone https://github.com/liushidai/rulebox.git
cd rulebox
bun install
cp .env.example .env
# 编辑 .env，分别设置管理令牌和订阅令牌
bun run src/index.ts
```

---

## Web 管理

选中规则集后，可以搜索规则、批量添加或修改单条规则描述。批量提交时每行输入一条；如果有不合法的规则，整批不会写入，原文会保留，点击错误列表可以跳到对应行。「订阅链接」会生成当前访问地址下的 YAML 链接。

登录令牌记在当前浏览器；在共享设备上用完请退出登录。远程访问应使用 HTTPS。订阅链接包含 `VIEW_TOKEN`，只应交给需要拉取配置的客户端。

支持 Chrome 105+、Firefox 110+ 和 Safari 16+，界面跟随系统的浅色或深色模式。

---

## 📖 API 文档

### 主要接口

| 方法   | 路径                            | 说明             | 认证         |
|--------|---------------------------------|------------------|--------------|
| GET    | `/:name.yaml`                   | 获取 YAML 配置   | VIEW_TOKEN   |
| GET    | `/api/configs`                  | 列出配置及各自的规则条数，可按 `type` 筛选 | ADMIN_TOKEN |
| POST   | `/api/configs`                  | 创建新配置       | ADMIN_TOKEN  |
| DELETE | `/api/configs/:name`            | 删除配置         | ADMIN_TOKEN  |
| PATCH  | `/api/configs/:name/rename`     | 重命名配置       | ADMIN_TOKEN  |
| PATCH  | `/api/configs/:name`            | 修改配置描述     | ADMIN_TOKEN  |
| GET    | `/api/configs/:name/items`      | 查询规则项，支持分页和搜索 | ADMIN_TOKEN |
| POST   | `/api/configs/:name/items`      | 添加规则项       | ADMIN_TOKEN  |
| DELETE | `/api/configs/:name/items`      | 删除规则项，`removed` 为实际删除数 | ADMIN_TOKEN |
| GET    | `/api/configs/:name/subscription` | 获取带查看 Token 的根相对订阅地址 | ADMIN_TOKEN |

`GET /api/configs` 的每个配置包含 `item_count`。规则查询支持 `page`（从 1 开始）、`pageSize`（1–1000，默认 100）和 `q`（最多 200 个字符，不区分大小写匹配规则值或描述）。响应的 `total` 是筛选后的总数；不传 `page` 仍会返回全部匹配规则。删除请求中的重复值和不存在的值不计入 `removed`。

带请求体的请求应声明 `Content-Length`，且不超过 1 MiB（1,048,576 字节）。无请求体的请求不受影响。

| 状态码 | 说明 |
|--------|------|
| 400 | JSON 无法解析，或请求参数、结构或规则不合法 |
| 403 | Token 缺失或不正确 |
| 404 | 路由或配置集不存在 |
| 409 | 配置集名称冲突 |
| 411 | 不接受未声明长度的分块请求体 |
| 413 | 请求体超过 1 MiB |
| 429 | 请求过于频繁，按响应头 `Retry-After` 指定的秒数等待 |

---

## 🔧 环境变量

| 变量名            | 说明                           | 必填 |
|-------------------|--------------------------------|------|
| `VIEW_TOKEN`      | 查看 YAML 配置的 Token         | 是   |
| `ADMIN_TOKEN`     | 管理配置的 Token               | 是   |
| `PORT`            | 服务端口（默认 8080）          | 否   |
| `DATA_DIR`        | 数据存储目录（默认 `/data`，本地开发示例设为 `./data`） | 否   |
| `ENABLE_SWAGGER`  | 设为 `true` 时启用 `/swagger`（默认关闭） | 否   |
| `TRUST_PROXY`     | 设为 `true` 时采用 `X-Forwarded-For` 最后一项作为限流地址（默认 false） | 否 |

仅当服务位于单层反向代理后、无法被客户端绕过代理直接访问，且代理会正确写入 `X-Forwarded-For` 的最后一项时，才开启 `TRUST_PROXY`。直连或不确定代理行为时保持默认值。

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
curl --get http://localhost:8080/adblock.yaml --data-urlencode "token=$VIEW_TOKEN"
```
