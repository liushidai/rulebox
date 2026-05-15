## ADDED Requirements

### Requirement: 获取配置数据项
系统 SHALL 提供 `GET /api/configs/{name}/items` 端点，返回指定配置集的所有数据项。

#### Scenario: 成功获取数据项
- **WHEN** 发送 `GET /api/configs/adblock/items` with 有效 ADMIN_TOKEN
- **THEN** 返回 200，body 为 `{"name": "adblock", "items": ["example.com", "*.tracker.io"]}`

#### Scenario: 配置不存在
- **WHEN** 请求的配置不存在
- **THEN** 返回 404

### Requirement: 追加数据项
系统 SHALL 提供 `POST /api/configs/{name}/items` 端点，向指定配置集追加数据项。

`items` 可以是字符串数组或单个字符串。追加时自动去重（合并到已有数据，不重复添加）。

#### Scenario: 成功追加数组
- **WHEN** 发送 `POST /api/configs/adblock/items` with body `{"items": ["example.com", "ads.com"]}` 和有效 ADMIN_TOKEN
- **THEN** 返回 200，数据项被追加并去重

#### Scenario: 追加重复项
- **WHEN** 追加已存在的数据项
- **THEN** 返回 200，不产生重复条目

#### Scenario: 配置不存在
- **WHEN** 向不存在的配置追加数据
- **THEN** 返回 404

### Requirement: 删除数据项
系统 SHALL 提供 `DELETE /api/configs/{name}/items` 端点，从指定配置集删除数据项。

`items` 可以是字符串数组或单个字符串。不在配置中的条目静默忽略。

#### Scenario: 成功删除数据项
- **WHEN** 发送 `DELETE /api/configs/adblock/items` with body `{"items": ["example.com"]}` 和有效 ADMIN_TOKEN
- **THEN** 返回 200，指定数据项被移除

#### Scenario: 删除不存在的条目
- **WHEN** 删除配置中不存在的数据项
- **THEN** 返回 200，操作成功，无错误

#### Scenario: 配置不存在
- **WHEN** 从不存在的配置删除数据
- **THEN** 返回 404
