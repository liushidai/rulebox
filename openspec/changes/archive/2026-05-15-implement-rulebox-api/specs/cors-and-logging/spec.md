## ADDED Requirements

### Requirement: CORS 支持
系统 SHALL 允许所有来源的跨域请求（`Access-Control-Allow-Origin: *`）。

#### Scenario: 跨域请求成功
- **WHEN** 浏览器从不同 origin 发起请求
- **THEN** 响应包含 `Access-Control-Allow-Origin: *` header

#### Scenario: OPTIONS 预检请求
- **WHEN** 浏览器发送 OPTIONS 预检请求
- **THEN** 返回 204，包含必要的 CORS headers

### Requirement: 请求日志
系统 SHALL 记录每个请求的基本信息：时间、HTTP 方法、路径、响应状态码。

#### Scenario: 正常请求日志
- **WHEN** 处理 `GET /adblock.yaml` 返回 200
- **THEN** 日志输出包含时间戳、GET、路径、200

### Requirement: 错误日志
系统 SHALL 将内部错误详情输出到 stderr。

#### Scenario: 内部错误记录
- **WHEN** 发生未捕获的内部错误
- **THEN** 错误堆栈和详情输出到 stderr，客户端收到 500 响应
