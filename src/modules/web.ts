/**
 * Web 管理页面托管
 * buildApp（启动）时把 src/web/ 下的页面与静态资源按固定映射读入内存，
 * 之后只按「完整 URL → 内存内容」查表返回，不拼接任意文件系统路径
 */

import { readFileSync } from 'node:fs';
import { Elysia } from 'elysia';

/** 页面与静态资源统一使用的内容安全策略 */
export const PAGE_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; " +
  "connect-src 'self'; object-src 'none'; base-uri 'none'; " +
  "form-action 'self'; frame-ancestors 'none'";

/** 单个托管资源：响应体与内容类型 */
interface WebAsset {
  body: string;
  contentType: string;
}

/** src/web/ 目录的基准 URL */
const WEB_ROOT = new URL('../web/', import.meta.url);

/**
 * 固定的「URL → 本地文件 + 内容类型」映射
 * 这些是正式应用必需的交付文件，缺失则启动失败
 */
const WEB_FILES: Record<string, { file: string; contentType: string }> = {
  '/': { file: 'index.html', contentType: 'text/html; charset=utf-8' },
  '/assets/app.js': { file: 'assets/app.js', contentType: 'text/javascript' },
  '/assets/style.css': { file: 'assets/style.css', contentType: 'text/css' },
  '/assets/favicon.svg': { file: 'assets/favicon.svg', contentType: 'image/svg+xml' },
  // 纯逻辑模块同时被页面与单元测试引用，因此映射到 src/web/logic.js
  '/assets/logic.js': { file: 'logic.js', contentType: 'text/javascript' },
};

/** 页面与静态资源共用的安全响应头 */
function pageHeaders(contentType: string): Record<string, string> {
  return {
    'content-type': contentType,
    // 文件名不带内容哈希，升级后必须让浏览器重新校验
    'cache-control': 'no-cache',
    'content-security-policy': PAGE_CSP,
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  };
}

/**
 * 按固定映射一次性读入全部资源
 * 读取失败不兜底：文件缺失属于交付不完整，直接让启动报错
 */
function loadAssets(): Map<string, WebAsset> {
  const assets = new Map<string, WebAsset>();

  for (const [urlPath, { file, contentType }] of Object.entries(WEB_FILES)) {
    const fileUrl = new URL(file, WEB_ROOT);
    // 失败时抛出的错误里保留文件绝对路径，便于定位缺失的交付文件
    assets.set(urlPath, {
      body: readFileSync(fileUrl, 'utf-8'),
      contentType,
    });
  }

  return assets;
}

/** 构造带安全头的 200 响应 */
function assetResponse(asset: WebAsset): Response {
  return new Response(asset.body, {
    status: 200,
    headers: pageHeaders(asset.contentType),
  });
}

/** 构造 404 响应，与全局错误处理保持同样的 JSON 结构 */
function notFoundResponse(): Response {
  return new Response(
    JSON.stringify({ error: 'not found', code: 'ROUTE_NOT_FOUND' }),
    {
      status: 404,
      headers: { 'content-type': 'application/json' },
    },
  );
}

/**
 * 创建页面托管模块
 * 在 buildApp() 中调用，因此资源缺失会在启动阶段暴露
 */
export function createWebModule() {
  const assets = loadAssets();
  const page = assets.get('/');
  // 映射表必然包含 '/'，这里是防御性检查：宁可启动报错，也不静默降级成 404
  if (!page) {
    throw new Error('web ui: "/" 未映射到 index.html');
  }

  return new Elysia({ name: 'web-ui' })
    // GET / - 管理页面，不要求 Token
    .get('/', () => assetResponse(page))

    // GET /assets/* - 按完整路径查表，不存在的资源返回 404
    .get('/assets/*', ({ params }) => {
      const asset = assets.get(`/assets/${params['*'] ?? ''}`);
      return asset ? assetResponse(asset) : notFoundResponse();
    });
}
