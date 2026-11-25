## MODIFIED Requirements

### Requirement: 获取配置数据项
系统 SHALL 提供 `GET /api/configs/{name}/items` 端点，返回指定配置集的数据项（含 value 和 description）以及配置集元数据。

响应 MUST 包含 `name`、`type`、`description`、`created_at`、`items` 和 `total`（应用筛选后的数据项总条数）。数据项的顺序 MUST 与存储顺序一致。

端点支持以下可选查询参数：

- `page`：页码，从 1 开始的整数。未传时 MUST 返回全部数据项，且响应中不包含 `page` 与 `pageSize`。
- `pageSize`：每页条数，1 到 1000 的整数，默认 100。仅在传了 `page` 时生效。
- `q`：关键字，最长 200 个字符，不区分大小写。返回 `value` 或 `description` 包含该关键字的数据项。

#### Scenario: 成功获取全部数据项
- **WHEN** 发送 `GET /api/configs/adblock/items` with 有效 ADMIN_TOKEN，且未传 `page`
- **THEN** 返回 200，body 为 `{"name": "adblock", "type": "domain", "description": "拦截广告", "created_at": "2026-05-15T00:00:00.000Z", "items": [{"value": "example.com", "description": "广告"}, {"value": "*.tracker.io", "description": ""}], "total": 2}`

#### Scenario: 分页获取
- **WHEN** 配置集有 250 条数据项，发送 `GET /api/configs/adblock/items?page=3&pageSize=100`
- **THEN** 返回 200，`items` 为第 201 到第 250 条，`total` 为 250，`page` 为 3，`pageSize` 为 100

#### Scenario: 默认每页条数
- **WHEN** 配置集有 150 条数据项，发送 `GET /api/configs/adblock/items?page=2`
- **THEN** 返回 200，`items` 为第 101 到第 150 条，`pageSize` 为 100

#### Scenario: 关键字筛选
- **WHEN** 发送 `GET /api/configs/adblock/items?q=GitHub`
- **THEN** 返回 200，`items` 仅包含 value 或 description 含 `github`（不区分大小写）的数据项，`total` 为筛选后的条数

#### Scenario: 筛选与分页叠加
- **WHEN** 发送 `GET /api/configs/adblock/items?q=ad&page=2&pageSize=5`
- **THEN** 返回 200，`total` 为关键字 `ad` 筛选后的条数，`items` 为筛选结果的第 6 到第 10 条

#### Scenario: 页码越界
- **WHEN** 发送 `GET /api/configs/adblock/items?page=999`
- **THEN** 返回 200，`items` 为空数组，`total` 仍为总条数

#### Scenario: 参数非法
- **WHEN** `page` 小于 1 或不是整数，或 `pageSize` 不在 1 到 1000 之间或不是整数，或 `q` 超过 200 个字符
- **THEN** 返回 400，body 为 `{"error": "invalid request body", "code": "VALIDATION_ERROR"}`

#### Scenario: 配置不存在
- **WHEN** 请求的配置不存在
- **THEN** 返回 404

### Requirement: 删除数据项
系统 SHALL 提供 `DELETE /api/configs/{name}/items` 端点，从指定配置集删除数据项。

`items` MUST 为对象数组，每个对象包含 `value` 字段。删除时基于 value 匹配，不在配置中的条目静默忽略。

响应 MUST 包含 `removed`（实际被删除的条数；请求中重复的 value 和配置中不存在的 value 不计入）和 `from`（配置集名称）。

#### Scenario: 成功删除数据项
- **WHEN** 发送 `DELETE /api/configs/adblock/items` with body `{"items": [{"value": "example.com"}]}` 和有效 ADMIN_TOKEN，且配置中存在该 value
- **THEN** 返回 200，body 为 `{"removed": 1, "from": "adblock"}`，指定 value 的数据项被移除

#### Scenario: 删除不存在的条目
- **WHEN** 删除配置中不存在的 value
- **THEN** 返回 200，body 为 `{"removed": 0, "from": "adblock"}`，操作成功，无错误

#### Scenario: 请求中含重复或不存在的 value
- **WHEN** 配置中存在 `a.com`，请求删除 `a.com`、`zzz.com`、`a.com`
- **THEN** 返回 200，`removed` 为 1

#### Scenario: 配置不存在
- **WHEN** 从不存在的配置删除数据
- **THEN** 返回 404，body 为 `{"error": "config not found", "code": "CONFIG_NOT_FOUND"}`，且数据目录中 MUST NOT 新增文件
