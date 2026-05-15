## 1. 项目初始化

- [x] 1.1 安装依赖：`yaml`、`@elysiajs/cors`、`@elysiajs/swagger`
- [x] 1.2 创建项目目录结构：`src/lib/`、`src/modules/`
- [x] 1.3 创建 `src/config.ts`：环境变量读取和验证（VIEW_TOKEN、ADMIN_TOKEN、PORT、DATA_DIR）
- [x] 1.4 创建 `src/schema.ts`：TypeBox 验证模型定义

## 2. 核心数据层

- [x] 2.1 创建 `src/lib/yaml.ts`：YAML 解析和序列化封装
- [x] 2.2 创建 `src/lib/store.ts`：ConfigStore 类，实现内存缓存 (Map)、启动全量加载、原子写入
- [x] 2.3 实现 ConfigStore 方法：loadAll、getConfig、createConfig、deleteConfig、renameConfig、addItems、removeItems

## 3. 鉴权模块

- [x] 3.1 创建 `src/modules/auth.ts`：定义 adminAuth 和 viewAuth Macro
- [x] 3.2 实现环境变量必填校验（启动时）

## 4. API 路由实现

- [x] 4.1 创建 `src/modules/yaml.ts`：实现 `GET /{name}.yaml` 路由（含 viewAuth 和参数验证）
- [x] 4.2 创建 `src/modules/configs.ts`：实现 `GET /api/configs`（列表）
- [x] 4.3 实现 `POST /api/configs`（新增配置）
- [x] 4.4 实现 `DELETE /api/configs/{name}`（删除配置）
- [x] 4.5 实现 `PATCH /api/configs/{name}/rename`（重命名）
- [x] 4.6 实现 `GET /api/configs/{name}/items`（获取数据项）
- [x] 4.7 实现 `POST /api/configs/{name}/items`（追加数据项）
- [x] 4.8 实现 `DELETE /api/configs/{name}/items`（删除数据项）

## 5. 应用组装

- [x] 5.1 创建 `src/index.ts`：组合所有模块，配置 CORS、Swagger、日志，启动服务
- [x] 5.2 实现全局错误处理（统一错误响应格式）
- [x] 5.3 实现请求日志中间件（时间、方法、路径、状态码）

## 6. 部署配置

- [x] 6.1 创建 `Dockerfile`（基于 oven/bun:1-alpine）
- [x] 6.2 创建 `docker-compose.yml`（端口、环境变量、volume 挂载）
- [x] 6.3 更新 `.gitignore` 忽略 `data/` 目录

## 7. 验证

- [x] 7.1 手动测试所有 API 端点
- [x] 7.2 验证 Swagger 文档可访问 (`/swagger`)
- [x] 7.3 验证 Docker 容器可正常启动和运行
