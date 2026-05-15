---
name: rulebox
description: 管理 mihomo/clash rule-providers 规则配置，支持创建规则集、添加/删除规则项、查看配置列表和详情、修改配置描述
metadata: {"openclaw":{"requires":{"config":["rulebox.url","rulebox.adminToken","rulebox.viewToken"]},"emoji":"📦"}}
---

# RuleBox 规则管理

## 触发词映射

用户可能用以下方式表达相同意图：

| 用户表达示例 | 对应操作 |
|-------------|---------|
| "添加 xx 到 yy"<br>"把 xx 加到 yy 里"<br>"yy 加个规则"<br>"yy 加一条" | 添加规则到配置 |
| "从 yy 删掉 xx"<br>"yy 里去掉 xx"<br>"yy 删条规则" | 从配置移除规则 |
| "新建一个 yy"<br>"创建 yy 配置"<br>"加个 yy 规则集" | 创建配置集 |
| "yy 有哪些规则"<br>"看看 yy 里面"<br>"yy 里有什么" | 查看配置详情 |
| "我有哪些配置"<br>"看看有哪些配置集"<br>"列一下配置文件"<br>"有哪些配置文件"<br>"列出当前配置" | 查看配置列表 |
| "yy 改名叫 zz"<br>"yy 重命名为 zz" | 重命名配置集 |
| "yy 的描述改成 xx"<br>"yy 的说明改一下"<br>"改下 yy 的描述" | 修改配置描述 |
| "删掉 yy"<br>"yy 不要了"<br>"移除 yy 配置" | 删除配置集 |

## 操作索引

| 操作 | 方法 | 路径 | 请求体 |
|------|------|------|--------|
| 查看配置列表 | GET | `{url}/api/configs` | - |
| 查看配置详情 | GET | `{url}/api/configs/{name}/items` | - |
| 创建配置集 | POST | `{url}/api/configs` | `{"name", "type", "description"}` |
| 添加规则 | POST | `{url}/api/configs/{name}/items` | `{"items": [{"value", "description"}]}` |
| 移除规则 | DELETE | `{url}/api/configs/{name}/items` | `{"items": [{"value"}]}` |
| 修改描述 | PATCH | `{url}/api/configs/{name}` | `{"description"}` |
| 重命名 | PATCH | `{url}/api/configs/{name}/rename` | `{"newName"}` |
| 删除配置 | DELETE | `{url}/api/configs/{name}` | - |

## 认证

- 写操作: `Authorization: Bearer {adminToken}`
- 读取 YAML: `GET {url}/{name}.yaml?token={viewToken}`

**type 可选值**：`classical` | `domain` | `ipcidr`

当用户询问规则文件地址时，告知：`{url}/{name}.yaml?token={viewToken}`

## 错误处理

| 状态码 | 含义 | 处理方式 |
|--------|------|----------|
| 400 | 请求格式错误 | 告知用户具体错误字段 |
| 401/403 | Token 无效 | 提示检查 adminToken 配置 |
| 404 | 配置不存在 | 建议先创建配置 |
| 409 | 配置已存在 | 提示配置名已被占用 |
| 网络错误 | 无法连接 | 提示检查服务地址和状态 |

## 注意事项

- 配置名仅允许字母、数字、下划线和连字符（`a-zA-Z0-9_-`）
- 追加规则时如果 value 已存在，会用新 description 覆盖旧描述
- 描述可以为空字符串 `""`，表示清空
- 删除不存在的规则项静默忽略"
```

## 错误处理指南

| 状态码 | 含义 | 处理方式 |
|--------|------|----------|
| 400 | 请求格式错误 | 检查请求体格式，告知用户具体错误字段 |
| 401/403 | Token 无效 | 提示用户检查 adminToken 配置是否正确 |
| 404 | 配置不存在 | 提示用户配置不存在，建议先创建配置 |
| 409 | 配置已存在 | 提示用户配置名已被占用 |
| 网络错误 | 无法连接 | 提示用户检查 RuleBox 服务地址和运行状态 |

## 注意事项

- 配置名仅允许字母、数字、下划线和连字符（`a-zA-Z0-9_-`）
- 描述可以为空字符串 `""`，表示清空描述
- 添加规则时，如果格式不符合配置类型，会返回 400 错误
- 删除不存在的规则项不会报错，静默忽略