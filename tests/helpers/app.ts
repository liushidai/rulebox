import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../../src/app';
import { ConfigIndex } from '../../src/lib/index';
import { ConfigStore } from '../../src/lib/store';

export const ADMIN_TOKEN = 'test-admin-token-12345';
export const VIEW_TOKEN = 'test-view-token-12345';
export const adminHeaders = () => ({ Authorization: `Bearer ${ADMIN_TOKEN}` });

export function createTestApp() {
  const dataDir = mkdtempSync(join(tmpdir(), 'rulebox-test-'));
  const config = {
    ADMIN_TOKEN,
    VIEW_TOKEN,
    DATA_DIR: dataDir,
    PORT: 0,
    TRUST_PROXY: false,
  };
  const index = new ConfigIndex(dataDir);
  index.load();
  const store = new ConfigStore(dataDir, index);
  store.loadAll();
  const app = buildApp({ config, store });

  async function request(
    method: string,
    path: string,
    options: {
      headers?: Record<string, string>;
      body?: unknown;
      query?: Record<string, string>;
    } = {},
  ) {
    const url = new URL(`http://localhost${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(key, value);
    }

    const headers = new Headers(options.headers);
    const init: RequestInit = { method, headers };
    if (options.body !== undefined && method !== 'GET' && method !== 'HEAD') {
      if (typeof options.body === 'string' || options.body instanceof Blob) {
        init.body = options.body;
      } else {
        init.body = JSON.stringify(options.body);
        headers.set('content-type', 'application/json');
      }
    }

    const response = await app.handle(new Request(url, init));
    const text = await response.text();
    let body: unknown = null;
    try {
      body = JSON.parse(text);
    } catch {
      // YAML 等非 JSON 响应通过 text 读取。
    }
    return {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      body,
      text,
    };
  }

  return {
    app,
    store,
    index,
    dataDir,
    request,
    cleanup: () => rmSync(dataDir, { recursive: true, force: true }),
  };
}
