## Context

RuleBox 当前是一个空的 ElysiaJS Hello World 项目（仅 `src/index.ts` 7 行代码）。需要从零构建完整的服务端应用。

**约束条件：**
- 运行时必须是 Bun
- 框架必须是 ElysiaJS
- 存储使用文件系统（YAML）+ 内存缓存，不使用数据库
- 部署通过 Docker + docker-compose

## Goals / Non-Goals

**Goals:**
- 实现 8 个 API 端点，满足 mihomo/clash 规则集托管需求
- 模块化架构，便于后续迭代扩展
- 生产可用的鉴权、错误处理、日志
- 开发友好（Swagger 文档、热重载）

**Non-Goals:**
- 不包含数据库支持
- 不包含用户管理/多租户
- 不包含规则集版本历史
- 不包含 Webhook/通知机制
- 不包含规则语法验证

## Decisions

### 1. 项目结构：ElysiaJS 推荐的模块化架构

采用 feature-based 模块化结构，每个功能独立 Elysia 实例，通过 `.use()` 组合：

```
src/
├── index.ts              # 入口，组合模块，启动服务
├── config.ts             # 环境变量读取和验证
├── schema.ts             # TypeBox 验证模型
├── lib/
│   ├── store.ts          # ConfigStore 类：内存缓存 + 文件原子操作
│   └── yaml.ts           # YAML 解析/序列化
└── modules/
    ├── auth.ts           # 鉴权 Macro（adminAuth / viewAuth）
    ├── yaml.ts           # GET /{name}.yaml 路由
    └── configs.ts        # /api/configs/* 管理 API 路由
```

**理由：** 规则集清晰、边界明确，适合未来扩展（版本历史、Webhook 等只需新增模块）。

### 2. 鉴权实现：Elysia Macro

使用 `.macro()` 定义 `adminAuth` 和 `viewAuth`，而非传统 `onBeforeHandle` 中间件。

**理由：** ElysiaJS 官方推荐用于鉴权场景，声明式调用，复用方便。

### 3. 数据存储：启动全量加载 + 内存 Map + 原子写入

```
启动 → 扫描 DATA_DIR/*.yaml → 加载到 Map<string, string[]>
                                    ↓
运行时操作内存 → 变更时写 .tmp → rename 原子覆盖
```

**理由：** 配置集数量可控（通常 < 100 个），全量加载性能最优，原子写入避免并发半写问题。

### 4. YAML 库：`yaml` (npm)

选择 `yaml` 而非 `js-yaml` 或 Bun 内置方案。

**理由：** TypeScript 支持好、API 现代、维护活跃。

### 5. 错误响应格式：详细版

```json
{ "error": "config not found", "code": "CONFIG_NOT_FOUND" }
```

**理由：** 错误码便于前端程序化处理，message 便于人类阅读。

### 6. API 文档：@elysiajs/swagger

开发环境启用 Swagger UI，生产环境关闭。

**理由：** 开发调试效率提升显著，生产环境零成本。

### 7. 配置名格式限制

规则集名称仅允许 `[a-zA-Z0-9_-]+`。

**理由：** 简单明确，避免路径遍历和特殊字符问题。

## Risks / Trade-offs

| 风险/权衡 | 缓解措施 |
|---|---|
| 内存缓存与文件不一致 | 原子写入 + 仅内存操作成功后才返回成功响应 |
| 大配置集内存占用 | 规则集通常 < 10KB，实际无影响；未来可切换按需加载 |
| 并发写入竞争 | 单进程 Bun 模型自然避免；多实例部署需外加锁 |
| 文件 I/O 性能 | YAML 文件小，原子 rename 极快；热点数据在内存 |
| Token 硬编码在环境变量 | 符合 12-Factor App，配合密钥管理服务可轮换 |
