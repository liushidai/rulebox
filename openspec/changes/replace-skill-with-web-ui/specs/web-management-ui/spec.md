## Purpose

让管理员在浏览器里完成规则集与规则的日常管理，不需要安装或配置任何 Agent 或客户端工具。

## ADDED Requirements

### Requirement: 管理页面与静态资源
系统 SHALL 在同源提供管理页面：`GET /` 返回 HTML 页面，`GET /assets/{file}` 返回页面依赖的脚本与样式。

页面与静态资源 MUST NOT 要求 Token（页面本身不含敏感信息，数据全部来自接口），也 MUST NOT 依赖任何外部资源（CDN、外部字体、外部图片）。

页面 MUST 以 `text/html; charset=utf-8` 返回，脚本 MUST 以 `text/javascript` 返回，样式 MUST 以 `text/css` 返回。

页面与静态资源 MUST 以 `Cache-Control: no-cache` 返回，保证升级后浏览器不会继续使用旧脚本。

不存在的静态资源 MUST 返回 404。

#### Scenario: 打开管理页面
- **WHEN** 未携带任何 Token 请求 `GET /`
- **THEN** 返回 200，`Content-Type` 为 `text/html; charset=utf-8`

#### Scenario: 获取静态资源
- **WHEN** 请求 `GET /assets/app.js`
- **THEN** 返回 200，`Content-Type` 为 `text/javascript`

#### Scenario: 静态资源不占用限流额度
- **WHEN** 同一客户端在限流窗口内连续 150 次请求 `GET /assets/app.js`
- **THEN** 均返回 200，随后该客户端携带有效 `ADMIN_TOKEN` 的 `GET /api/configs` 按正常流程处理

#### Scenario: 静态资源路径不影响 YAML 路由
- **WHEN** 请求 `GET /demo.yaml` 且未携带 `VIEW_TOKEN`
- **THEN** 仍返回 403

#### Scenario: 静态资源不存在
- **WHEN** 请求 `GET /assets/nope.js`
- **THEN** 返回 404

### Requirement: 页面安全响应头
`GET /` 与 `GET /assets/{file}` 的响应 MUST 包含以下内容安全策略：

`default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`

这些响应 MUST 同时包含 `X-Content-Type-Options: nosniff`。

页面 MUST NOT 包含内联脚本、内联样式块、`style` 属性或内联事件属性。

#### Scenario: 页面响应带安全头
- **WHEN** 请求 `GET /`
- **THEN** 响应包含上述 `Content-Security-Policy` 与 `X-Content-Type-Options: nosniff`

#### Scenario: 页面不含内联脚本与内联样式
- **WHEN** 获取 `GET /` 的内容
- **THEN** 其中不存在 `<script>` 与 `</script>` 之间的代码、`style` 属性、`on` 开头的事件属性和 `<style>` 块

### Requirement: 按文本渲染动态内容
页面 MUST 把接口返回的内容和用户输入的内容（规则值、描述、名称、错误原因）作为文本插入文档，MUST NOT 把它们当作 HTML 解析。

#### Scenario: 描述中含有 HTML
- **WHEN** 某条规则的描述为 `<img src=x onerror=alert(1)>`
- **THEN** 页面把这串字符原样显示为文本，不产生任何元素，也不执行脚本

### Requirement: 登录
本地没有保存 Token 时，页面 MUST 显示登录表单。提交后，页面 MUST 用该 Token 请求 `GET /api/configs` 来校验：

- 校验通过：把 Token 保存到 `localStorage`，进入主界面。
- 返回 403：提示令牌不正确，留在登录表单。

已保存 Token 时，页面打开后 MUST 直接进入主界面。登录状态下所有接口请求 MUST 携带 `Authorization: Bearer <token>`。

Token MUST NOT 出现在任何 URL 中。

#### Scenario: 首次打开
- **WHEN** 浏览器没有保存 Token，用户打开页面
- **THEN** 显示登录表单

#### Scenario: 登录成功
- **WHEN** 用户输入正确的 `ADMIN_TOKEN` 并提交
- **THEN** 页面进入主界面并显示规则集列表，`localStorage` 中保存了该 Token

#### Scenario: 令牌不正确
- **WHEN** 用户输入错误的 `ADMIN_TOKEN` 并提交
- **THEN** 停留在登录表单，并提示令牌不正确

#### Scenario: 已保存 Token 时直接进入
- **WHEN** `localStorage` 中保存了有效的 Token，用户打开页面
- **THEN** 直接进入主界面

#### Scenario: 登录失效
- **WHEN** 已保存的 Token 失效，某个接口返回 403
- **THEN** 页面清除保存的 Token，回到登录表单并提示登录已失效

#### Scenario: 限流不被当作登录失效
- **WHEN** 已登录状态下某个接口返回 429
- **THEN** 页面保持登录状态，并提示请求过于频繁

#### Scenario: 退出登录
- **WHEN** 用户点击退出登录
- **THEN** 清除保存的 Token，回到登录表单

### Requirement: 规则集管理
页面 SHALL 提供以下操作，并使用现有接口完成：

| 操作 | 接口 |
|---|---|
| 规则集列表（名称、类型、描述、条数） | `GET /api/configs` |
| 按类型筛选 | `GET /api/configs?type=` |
| 新建（名称、类型必填，描述可选） | `POST /api/configs` |
| 重命名 | `PATCH /api/configs/{name}/rename` |
| 修改描述 | `PATCH /api/configs/{name}` |
| 删除 | `DELETE /api/configs/{name}` |

任一操作成功后，页面 MUST 刷新规则集列表。删除 MUST 经二次确认后才执行。

页面 MUST 在地址的 hash 中记录当前选中的规则集（`#/{name}`），刷新页面后保持选中。重命名后 MUST 更新为新的名称。

#### Scenario: 展示规则集列表
- **WHEN** 进入主界面
- **THEN** 页面显示每个规则集的名称、类型、描述和条数

#### Scenario: 按类型筛选
- **WHEN** 用户选择类型 `domain`
- **THEN** 列表只显示 `domain` 类型的规则集

#### Scenario: 新建成功
- **WHEN** 用户填写名称 `adblock`、类型 `domain` 并提交
- **THEN** 页面调用 `POST /api/configs`，列表中出现 `adblock` 并处于选中状态

#### Scenario: 新建时名称已被占用
- **WHEN** 新建时服务端返回 409
- **THEN** 表单保持打开，并提示名称已被占用

#### Scenario: 删除需要确认
- **WHEN** 用户点击删除某个规则集
- **THEN** 先显示确认对话框，用户确认后页面才调用 `DELETE /api/configs/{name}`；取消时不发送任何请求

#### Scenario: 重命名与修改描述
- **WHEN** 用户重命名规则集或修改其描述并保存
- **THEN** 页面调用对应接口，并用结果更新列表与右侧标题

#### Scenario: 刷新后保持选中
- **WHEN** 用户选中 `adblock` 后刷新页面
- **THEN** 页面重新打开时 `adblock` 仍处于选中状态

### Requirement: 规则列表
选中规则集后，页面 SHALL 分页展示该规则集的规则（规则值与描述），使用服务端分页：`GET /api/configs/{name}/items?page=&pageSize=&q=`。

- 每页 20 条，提供「上一页」「下一页」，并显示「第 a–b 条，共 n 条」。
- 搜索框停止输入 300 毫秒后，页面以当前关键字请求筛选结果并回到第 1 页；清空搜索框即恢复。
- 翻页、搜索、切换规则集时，页面 MUST 只呈现最后一次请求的结果，丢弃此前尚未完成的请求所返回的内容。
- 请求进行中 MUST 显示加载状态。
- 删除当前页最后一条规则后，页面 MUST 回到上一页。

#### Scenario: 分页展示
- **WHEN** 规则集有 47 条规则，用户选中它
- **THEN** 页面请求第 1 页并显示前 20 条，底部显示「第 1–20 条，共 47 条」

#### Scenario: 翻到下一页
- **WHEN** 用户点击「下一页」
- **THEN** 页面请求 `page=2`，并显示第 21–40 条

#### Scenario: 搜索
- **WHEN** 用户在搜索框输入 `github`
- **THEN** 停止输入 300 毫秒后，页面请求 `q=github&page=1`，并只显示筛选结果

#### Scenario: 丢弃过期结果
- **WHEN** 用户快速切换到另一个规则集，而前一个规则集的请求尚未返回
- **THEN** 页面只显示后一个规则集的数据

#### Scenario: 搜索无结果
- **WHEN** 筛选结果为空
- **THEN** 页面显示没有匹配规则的空状态

#### Scenario: 删除末页最后一条
- **WHEN** 用户删除了当前页唯一的一条规则
- **THEN** 页面回到上一页

### Requirement: 单条规则操作
删除规则：经二次确认后，页面调用 `DELETE /api/configs/{name}/items`，请求体只含该规则的 value。

修改描述：页面在行内编辑，保存时以相同的 value 和新的 description 调用 `POST /api/configs/{name}/items`。相同 value 再次提交会覆盖原描述。

操作成功后，页面 MUST 刷新当前页。

#### Scenario: 删除规则
- **WHEN** 用户确认删除 `+.openai.com`
- **THEN** 页面发送 `{"items":[{"value":"+.openai.com"}]}` 到删除接口，成功后该行从列表消失

#### Scenario: 规则已不存在
- **WHEN** 删除接口返回的 `removed` 为 0
- **THEN** 页面提示该规则已不存在，并刷新当前页

#### Scenario: 修改描述
- **WHEN** 用户把 `+.openai.com` 的描述改为「登录依赖」并保存
- **THEN** 页面以 `{"items":[{"value":"+.openai.com","description":"登录依赖"}]}` 调用追加接口，刷新后该行显示新的描述

#### Scenario: 取消修改
- **WHEN** 用户在保存前取消
- **THEN** 页面不发送任何请求，该行恢复原描述

### Requirement: 批量添加规则
页面 SHALL 提供多行文本输入：每行一条规则，忽略空行和首尾空白；另有一个可选的「统一描述」，应用于本批全部规则。

页面 MUST NOT 在前端做格式预校验。

提交时页面调用 `POST /api/configs/{name}/items`：

- 成功：提示添加的条数，刷新列表与当前规则集的条数，并跳到最后一页。
- 返回 400 且带有校验错误明细：这一批规则都没有写入。页面 MUST 保持文本框内容不变，并以下列方式标出出错的行：
  1. 行号栏中出错行的行号标红。
  2. 汇总说明「N 行不合法，这一批 M 条规则都没有写入」。
  3. 错误清单逐条列出「行号、原文、原因」，点击某条时定位到文本框中对应的行。

后端返回的校验原因是英文。页面 MUST 按原因的前缀显示对应的中文说明，无法识别时原样显示原因。

提交前，若文本内容超过 1MB，页面 MUST 直接提示超过上限，不发送请求。

#### Scenario: 批量添加成功
- **WHEN** 用户输入 3 行合法规则并提交
- **THEN** 页面提示已添加 3 条规则，规则集条数增加 3，页面跳到最后一页

#### Scenario: 忽略空行与首尾空白
- **WHEN** 文本框内容依次为 `a.com`、空行、`  b.com  `
- **THEN** 页面提交 2 条规则：`a.com` 与 `b.com`

#### Scenario: 统一描述
- **WHEN** 统一描述填写为「广告」，提交 2 条规则
- **THEN** 这 2 条规则的 description 均为「广告」

#### Scenario: 部分行不合法
- **WHEN** 用户提交 8 条规则，其中第 2、3、5 行不合法，服务端返回这 3 条的校验错误
- **THEN** 页面显示「3 行不合法，这一批 8 条规则都没有写入」，行号栏中 2、3、5 标红，错误清单列出这 3 条的行号、原文和中文原因，文本框内容保持不变

#### Scenario: 空行之后的行号
- **WHEN** 文本框第 1 行为空、第 2 行不合法，服务端返回的错误序号为 0
- **THEN** 页面把错误定位到文本框的第 2 行

#### Scenario: 原因无法识别
- **WHEN** 服务端返回的原因不属于已知前缀
- **THEN** 页面原样显示该原因

#### Scenario: 超过大小上限
- **WHEN** 文本框内容超过 1MB
- **THEN** 页面提示内容超过上限，不发送请求

### Requirement: 订阅链接
点击「订阅链接」时，页面 SHALL 调用 `GET /api/configs/{name}/subscription`，并在对话框中显示完整订阅地址：当前访问页面的协议与主机名（`location.origin`）拼接接口返回的相对地址。

对话框中的地址 MUST 可编辑，并提供复制按钮。

通过 HTTP 且非 `localhost` 访问时，浏览器不提供剪贴板接口。这种情况下复制 MUST 有可用的回退方式。

#### Scenario: 显示订阅链接
- **WHEN** 用户在 `http://192.168.1.10:8080/` 打开 `adblock` 的订阅链接
- **THEN** 对话框显示 `http://192.168.1.10:8080/adblock.yaml?token=<VIEW_TOKEN>`

#### Scenario: 复制
- **WHEN** 用户点击复制
- **THEN** 剪贴板中的内容为对话框显示的地址

#### Scenario: 通过 HTTP 加 IP 访问时复制
- **WHEN** 页面通过 `http://192.168.1.10:8080/` 访问，用户点击复制
- **THEN** 地址仍被写入剪贴板

#### Scenario: 规则集已不存在
- **WHEN** 接口返回 404
- **THEN** 对话框提示规则集不存在

### Requirement: 错误与状态处理
页面 SHALL 为每个数据区域提供三种状态：加载中、空、加载失败。

- 接口返回 429：页面 MUST 提示请求过于频繁，并按响应头 `Retry-After` 给出的秒数暂缓重试。
- 请求因网络原因失败：页面 MUST 提示无法连接服务，并提供重试。
- 操作失败时，页面 MUST 保留用户已填写的内容。

#### Scenario: 加载中
- **WHEN** 正在请求规则集列表
- **THEN** 该区域显示加载状态

#### Scenario: 请求过于频繁
- **WHEN** 接口返回 429 且 `Retry-After` 为 12
- **THEN** 页面提示请求过于频繁，12 秒后才允许重试

#### Scenario: 无法连接
- **WHEN** 请求因网络错误失败
- **THEN** 页面提示无法连接服务，并提供重试按钮

#### Scenario: 提交失败不丢内容
- **WHEN** 新建规则集的请求失败
- **THEN** 对话框保持打开，用户填写的名称、类型和描述不变

### Requirement: 界面语言与主题
界面文案 MUST 为中文。专有名词除外，例如规则类型名和接口返回的原始错误码。

页面 MUST 跟随系统的深色或浅色偏好，两套主题下文字对比度均不低于 4.5:1。

页面宽度为 390px 时 MUST 仍可完成全部操作。

#### Scenario: 跟随系统主题
- **WHEN** 系统为深色模式
- **THEN** 页面以深色主题显示

#### Scenario: 窄屏
- **WHEN** 页面宽度为 390px
- **THEN** 规则集列表变为顶部的选择器，规则以堆叠的行显示，全部操作可用
