## Context

动机见 proposal.md。这里只列约束实现方式的现状。

**依赖**

- 本变更在 `harden-backend-and-refine-api` 之后实施，使用它提供的分页与搜索、删除规则的实际条数、订阅链接接口，以及对 `/` 和 `/assets/*` 的限流豁免。本变更不修改任何后端接口。

**路由现状（已实测）**

- `GET /` 目前返回 404，可以给页面使用。
- YAML 路由 `GET /:fileName` 会截走所有单段路径：`/index.html`、`/app.js` 返回 403，`/favicon.ico` 同理。页面内不能出现指向这些地址的链接。
- 两段路径 `/assets/*` 不与它冲突。

**框架行为**

- 与日志、`status()` 辅助函数相关的行为已在变更一里处理，本变更只需新增两条 GET 路由。
- 页面托管的做法已用一次性脚本验证：`GET /` 与 `/assets/*` 返回正确的类型和安全头，未知资源返回 404，页面与静态资源不计入限流，`/demo.yaml` 仍然需要 Token。

**视觉参照稿**

设计阶段产出了一份静态视觉稿和一份样式表。它是临时产物，位于 `/tmp/opencode/rulebox-ui-reference/`，没有放进仓库。设计令牌、组件和禁用清单都记录在本文「视觉」一节里，参照稿丢失时可以据此重做。

## Goals / Non-Goals

**Goals:**
- 打开即用：同源提供，零依赖，零构建，升级后不受浏览器缓存影响。
- 覆盖规则管理的全部日常操作，每个操作对应一个现有接口。
- 在严格 CSP 下工作，动态内容只按文本渲染。
- 易错的逻辑（行号映射、过期请求的丢弃、分页计算）有单元测试。

**Non-Goals:**
- 不做 Cookie 会话、多用户或权限分级。
- 不做前端路由。只在 hash 中记录选中的规则集，不记录页码和搜索词。
- 不做规则的拖拽排序、导入导出或撤销。
- 不引入浏览器自动化测试。
- 不修改后端接口。

## Decisions

1. **不引入 Vue，使用原生 JavaScript**
   - 三条路线的对比：原生 JS 不需要构建，满足严格 CSP；Vue 浏览器版虽然免构建，但运行时用 `new Function` 编译模板，需要 `'unsafe-eval'`，与严格 CSP 冲突；Vue 单文件组件需要 Vite 或 Bun 插件，等于新增一条前端工具链。
   - 组织方式：一个状态对象，每个界面区域一个渲染函数。输入框和对话框不放在会被整体重绘的区域里。
   - 备选：Preact 加 htm 的免构建单文件版，不需要 `eval`。如果实现时手动同步 DOM 的问题明显，可以之后引入，不影响接口和规格。

2. **文件布局与托管方式**
   - `src/web/index.html`、`src/web/assets/style.css`、`src/web/assets/app.js`、`src/web/assets/favicon.svg`，以及只含纯函数的 `src/web/logic.js`。
   - `src/modules/web.ts` 在启动时把这些文件读入内存。`GET /` 与 `GET /assets/*` 按完整路径查表返回，不拼接文件系统路径。
   - ES 模块脚本的类型必须是 `text/javascript`，否则浏览器会拒绝执行。`app.js` 以 `<script type="module">` 加载并 `import` 纯逻辑模块，所以 `logic.js` 可以同时被浏览器和 `bun test` 引用。
   - 不新增依赖。
   - 备选：`@elysiajs/static`（新增依赖，且这个版本的路径解析行为需要另行验证）；把所有内容内嵌进一个 HTML（CSP 需要为内联脚本计算 hash）。

3. **安全响应头与渲染约束**
   - CSP 为 `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`，另加 `X-Content-Type-Options: nosniff` 和 `Referrer-Policy: no-referrer`。
   - 由此带来硬约束：不能有内联脚本、内联样式块、`style` 属性和内联事件。样式全部写在 `style.css` 里，状态尽量用类名表达。
   - 动态内容只经 `textContent` 或 `createTextNode` 进入文档，不使用 `innerHTML`。
   - 资源文件名不含内容哈希，所以用 `Cache-Control: no-cache`，不能用长缓存。
   - 备选：给资源文件名加内容哈希并用长缓存。需要托管层计算哈希，收益不大。

4. **Token 的保存与请求**
   - Token 保存在 `localStorage`，键名 `rulebox.adminToken`。
   - 统一的请求函数负责添加 `Authorization` 头并分类处理响应：403 时清除 Token 并回到登录表单；429 时读取 `Retry-After`；网络错误统一提示；其余非 2xx 响应把响应体里的 `error` 和 `details` 交给调用方。
   - 限流在鉴权之前生效，所以 429 不代表登录失效。
   - 备选：Cookie 会话。Token 对脚本不可见，更安全，但需要新增登录接口、会话存储，并考虑 CSRF，超出「不需要太复杂」的范围。

5. **规则列表由服务端分页驱动**
   - 每页 20 条。搜索输入做 300 毫秒防抖，避免每按一个键就消耗一次限流额度。
   - 每次请求带一个递增的序号，返回时序号不是最新就丢弃，避免快速切换规则集时显示旧数据。
   - 分页信息由接口返回的 `total` 计算，末页页码为 `max(1, ceil(total / pageSize))`。批量添加成功后请求末页。
   - 备选：前端一次取回全部规则，再分页和筛选。规则集很大时，响应和渲染都吃不消，也与变更一提供的服务端分页相悖。

6. **批量添加**
   - 文本按行拆分，去掉首尾空白并丢弃空行，同时记录每一行在文本框里的真实行号。
   - 服务端返回的错误 `index` 是提交数组的下标，从 0 起，用它找回真实行号。
   - 校验原因按英文前缀映射成中文，未命中时原样显示：

     | 后端 reason 前缀 | 页面文案 |
     |---|---|
     | `Invalid domain format`、`Invalid domain pattern` | 域名格式不正确，只能包含字母、数字、连字符和点 |
     | `Invalid domain after prefix` | 前缀 +. 后面的域名不合法 |
     | `Invalid wildcard position in` | 通配符 * 必须独占一段，例如 *.example.com |
     | `Missing CIDR prefix` | 缺少前缀长度，应写成 1.2.3.0/24 |
     | `Invalid IPv4 prefix` | 前缀长度应在 0 到 32 之间 |
     | `Invalid IPv6 prefix` | 前缀长度应在 0 到 128 之间 |
     | `Invalid IP address` | IP 地址格式不正确 |
     | `Missing comma in classical rule` | 缺少逗号，格式应为「类型，值」 |
     | `Unknown rule type` | 不支持的规则类型 |
     | `Missing value for rule type` | 缺少规则值 |
     | `Invalid port number` | 端口应在 1 到 65535 之间 |

   - 行号栏与文本框必须使用相同的字体、字号、行高和上内边距。文本框滚动时行号栏必须同步滚动，否则两者会错位。
   - 备选：后端为每类校验错误返回稳定的错误码。这样更稳妥，但要改动校验模块，本次不做。

7. **修改单条描述用追加接口完成**
   - 以相同的 value 和新的 description 调用 `POST /api/configs/{name}/items`。存储层在锁内读取磁盘、覆盖描述、写回，一次调用就是原子操作。
   - 不需要新增「更新描述」的接口，也不拆成「删除加添加」两次调用。

8. **订阅链接**
   - 接口返回根相对地址，页面拼上 `location.origin` 后放进可编辑的输入框。
   - 复制优先用 `navigator.clipboard.writeText`。这个接口只在安全上下文（HTTPS 或 localhost）下存在，通过 IP 加 HTTP 访问时，回退到选中文本后调用 `document.execCommand('copy')`。

9. **弹窗与提示**
   - 对话框用原生 `<dialog>` 加 `showModal()`。只有 `[open]` 状态才设置 `display`，否则关闭的对话框也会显示出来。
   - 删除类操作的确认按钮用危险色，初始焦点落在「取消」上。
   - 操作完成的确认用自动消失的提示浮层。提交中的错误显示在对话框内部，不关闭，内容不丢。
   - 提示浮层的容器放在应用根元素之外。根元素是容器查询的容器，会成为 `position: fixed` 后代的包含块。

10. **视觉**
    - 参照对象与借鉴点：
      - GitHub 的文件列表和设置页：标题加一行元信息，下面用 1px 分隔线组织列表；表单错误用红描边加下方一行字，不弹窗。
      - Cloudflare Zero Trust 的 Lists：信息结构最接近。一份清单有名称、类型、描述和条数，点进去是「值加描述」的两列表格。
      - AdGuard Home 的过滤器页：只借信息模型。
    - 主色是压低了饱和度的青蓝，浅色为 `#0b5ea8`，深色实底为 `#1a6fc4`、文字形态为 `#79b8f5`。它只用于主按钮、选中标记和焦点环。页面九成以上的面积是黑白灰，红色只用于危险和错误，琥珀只用于警告。
    - 形状：圆角只有 4px 和 6px，边框全部是 1px。不使用阴影、模糊和渐变，层级靠遮罩、边框和底色表达。
    - 字体：只用系统字体栈，中文回退到 PingFang SC、Microsoft YaHei、Noto Sans CJK SC。规则值、规则集名称和类型用等宽字体。字号阶梯是 12、13、14、16、20px。
    - 禁用清单：渐变、发光、彩色阴影、玻璃拟态、紫蓝配色、渐变文字、大圆角卡片嵌套、emoji 图标、装饰性插画、Hero 区，以及超过 150ms 的动效。
    - 深浅色用 `prefers-color-scheme` 跟随系统，两套主题的文字对比度都不低于 4.5:1。
    - 窄屏用容器查询：应用根元素的宽度小于 720px 时切到单栏，规则集列表变成顶部的选择器，表格变成堆叠的行。这需要 Chrome 105、Firefox 110、Safari 16 或更高版本。要兼容更老的浏览器，把 `@container` 换成 `@media` 即可，规则内容不变。
    - 可访问性：全站 2px 焦点环；只用原生表单元素；选中项用 `aria-current`，加载区用 `aria-busy`，出错的输入用 `aria-invalid` 加 `aria-describedby`。
    - 备选：引入组件库。它需要框架或 CDN，与零依赖和严格 CSP 冲突。

11. **测试策略**
    - 集成测试：`GET /` 与 `GET /assets/*` 的状态码、类型、安全头和缓存头；未知资源返回 404；`/demo.yaml` 不受影响；静态资源不计入限流；HTML 中没有内联脚本和内联样式。
    - 单元测试：`logic.js` 里的纯函数，覆盖行的拆分与行号映射、原因映射、分页计算和请求体大小预检。
    - 手工验证清单：登录与登录失效、各操作的请求与界面表现、深浅色、390 宽、HTTP 加 IP 访问时的复制。

12. **移除 Skill 的清单**
    - `skills/rulebox/SKILL.md` 和 `skills/rulebox/rulebox.json`。
    - `.gitignore` 中的 `skills/rulebox/rulebox.json` 及其注释。
    - README 的首页描述、功能特性里的 AI Agent 条目，以及「AI Agent 安装指南」整节。其中生成 Token 的提示并入快速开始。
    - 源码和测试里没有对 Skill 的引用，不需要改动。

## Risks / Trade-offs

- [Risk] Token 保存在 `localStorage`，页面一旦有脚本注入就会被读走。
  → Mitigation: 严格 CSP，不加载任何第三方脚本，动态内容只按文本渲染。
- [Risk] 没有浏览器自动化，DOM 相关的回归只能靠人工发现。
  → Mitigation: 把易错的逻辑放进 `logic.js` 并做单元测试，DOM 层保持很薄；交付时执行手工验证清单。
- [Risk] 系统字体在不同平台上的观感不同。
  → Mitigation: 字体栈带中文回退，并在 Linux 上验收。
- [Risk] 容器查询和 `<dialog>` 需要较新的浏览器。
  → Mitigation: README 注明支持的最低版本，并提供把容器查询换成媒体查询的办法。
- [Risk] 搜索和连续翻页会消耗限流额度，每个 IP 15 秒 100 次。
  → Mitigation: 搜索做 300 毫秒防抖；遇到 429 按 `Retry-After` 提示并暂缓重试。
- [Risk] 校验原因按英文前缀映射。后端调整文案时，页面会退化为显示英文原因。
  → Mitigation: 映射不命中时原样显示，不影响功能。需要时再让后端返回稳定的错误码。
- [Risk] 多个标签页同时编辑同一个规则集时，后提交的覆盖先提交的。
  → Mitigation: 页面以服务端数据为准，并在每次操作后刷新，不做冲突检测。对单人管理的场景可以接受。
- [Trade-off] 视觉参照稿位于临时目录。
  → Mitigation: 设计令牌、组件和禁用清单都记录在本文件里，参照稿丢失时可以据此重做。

## Migration Plan

1. 先完成并上线变更 `harden-backend-and-refine-api`。
2. 如果本机的 OpenClaw workspace 里安装过 Skill 的副本，手动删除 `~/.openclaw/workspace/skills/rulebox`。
3. 部署本版本，打开 `http://<主机>:<端口>/`，粘贴 `ADMIN_TOKEN` 登录。
4. 回滚：回退到旧版本即可。没有存储格式变更，也不涉及数据迁移。
