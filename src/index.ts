/**
 * RuleBox - mihomo/clash rule-providers YAML 托管服务
 */

import { loadConfig, type AppConfig } from './config';
import { ConfigIndex } from './lib/index';
import { ConfigStore } from './lib/store';
import { buildApp } from './app';

// ---- 加载配置 ----
let appConfig: AppConfig;
try {
  appConfig = loadConfig();
} catch (err: any) {
  console.error(`❌ 启动失败: ${err.message}`);
  process.exit(1);
}

// ---- 初始化索引和数据存储 ----
const index = new ConfigIndex(appConfig.DATA_DIR);
try {
  index.load();
  console.log(`📇 已加载 ${index.listAll().length} 个配置索引`);
} catch (err: any) {
  console.error(`❌ 索引加载失败: ${err.message}`);
  process.exit(1);
}

const store = new ConfigStore(appConfig.DATA_DIR, index);
store.loadAll();
console.log(`📦 已加载 ${store.listNames().length} 个配置集`);

// ---- 组装并启动应用 ----
const app = buildApp({ config: appConfig, store });

app.listen(appConfig.PORT);

console.log(
  `🦊 RuleBox is running at http://localhost:${appConfig.PORT}`,
);
if (process.env.ENABLE_SWAGGER === 'true') {
  console.log(
    `📖 Swagger docs at http://localhost:${appConfig.PORT}/swagger`,
  );
}
