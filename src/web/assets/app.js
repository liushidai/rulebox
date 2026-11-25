/**
 * RuleBox 管理页
 *
 * 组织方式：一个状态对象（state），每个界面区域一个渲染函数。输入框和对话框写在
 * index.html 里，不参与整体重绘，所以重绘不会丢掉用户正在输入的内容。
 *
 * 硬约束：
 * - 严格 CSP：不使用任何把字符串当作 HTML 解析的 DOM 写法，也没有内联样式和内联事件；
 *   接口返回和用户输入的内容只经 textContent / createTextNode 进入文档。
 * - Token 只保存在 localStorage（rulebox.adminToken）和请求头里，不进入地址、hash 和页面文字。
 * - 易错的纯逻辑（批量文本解析、行号映射、原因映射、分页计算）在 logic.js。
 */
import * as logic from './logic.js';

/* ------------------------------------------------------------------ 常量 */

const PAGE_SIZE = 20;
const TOKEN_KEY = 'rulebox.adminToken';
const NAME_PATTERN = /^[A-Za-z0-9_-]+$/;
const API = '/api/configs';
const BODY_LIMIT_BYTES = 1024 * 1024; // 请求体上限，与后端的 bodyLimit 一致
const TOAST_DURATION = { success: 3000, warning: 5000, danger: 5000 };
const TYPE_HINTS = {
  domain: 'domain 类型支持 example.com、+.example.com、*.example.com。',
  classical: 'classical 类型的格式是「类型,值」，例如 DOMAIN-SUFFIX,example.com。',
  ipcidr: 'ipcidr 类型的格式是 CIDR 网段，例如 1.2.3.0/24。',
};

/* ------------------------------------------------------------------ 状态 */

function freshItems() {
  // page 与 q 始终对应「已经显示出来」的内容；pending 记录最后一次请求的参数，失败后重试时用它
  return { status: 'idle', rows: [], total: 0, page: 1, pageCount: 1, q: '', error: null, pending: null };
}

const state = {
  view: 'login', // login | app
  token: '',
  typeFilter: '', // 左栏的类型筛选，'' 表示全部
  configs: [], // 当前筛选下的规则集
  listStatus: 'idle', // idle | loading | ready | error
  listError: null,
  selected: '', // 当前选中的规则集，与地址 hash 保持一致
  entry: null, // 当前规则集的名称、类型、描述、条数
  items: freshItems(), // 当前显示的这一页规则；page 与 q 始终对应已经显示出来的内容
  batch: { open: false, busy: false, errors: [], lines: [], stale: false, submitted: 0 },
  editing: '', // 行内编辑中的规则值，'' 表示没有
  editDraft: '', // 行内编辑里正在输入的描述（输入框会随重绘重建，草稿必须放在状态里）
  editBusy: false,
  editError: '',
};

let pendingFocus = null; // 异步操作结束后要把焦点还给的元素（data-focus 标记）
let pendingRule = null; // 等待确认删除的规则值
let subscriptionNeedsRetry = false;
let searchTimer = 0;

// 请求序号：只呈现最后一次请求的结果，丢弃此前尚未完成的请求返回的内容。
const itemsTracker = logic.createRequestTracker();
const listTracker = logic.createRequestTracker();

/**
 * 会话代次：每次重置会话（登录成功、退出、登录失效）时加 1。
 * 请求发出时记下代次，返回时发现代次变了，就说明这是旧会话的响应，一律丢弃：
 * 旧会话迟到的 403 不会把新登录的会话踢出去，迟到的数据也不会渲染进新会话。
 */
let sessionEpoch = 0;

const sessionChanged = (epoch) => epoch !== sessionEpoch;

/* ------------------------------------------------------------------ DOM 工具 */

const byId = (id) => document.getElementById(id);

/**
 * 创建元素。所有文字只经 textContent 或 createTextNode 进入文档，不解析 HTML。
 * props 里 on 开头的键按事件监听处理；value、disabled 等按元素属性赋值。
 */
function el(tag, props, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (['value', 'checked', 'disabled', 'selected', 'hidden'].includes(key)) node[key] = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child === undefined || child === null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/** 从 index.html 的图标模板里取出一份图标；克隆体去掉 data-icon，让这个属性只标记「引用图标的地方」 */
function icon(name) {
  const source = byId('icons').content.querySelector(`[data-icon="${name}"]`);
  if (!source) return document.createTextNode('');
  const copy = source.cloneNode(true);
  copy.removeAttribute('data-icon');
  return copy;
}

function formatCount(value) {
  return new Intl.NumberFormat('zh-CN').format(Number(value) || 0);
}

/** 键盘焦点在 container 里时，返回它（或它所在的带 data-focus 的元素）的标记，供重绘后恢复 */
function focusedKey(container) {
  const active = document.activeElement;
  const tagged = container.contains(active) ? active.closest('[data-focus]') : null;
  return tagged ? tagged.dataset.focus : null;
}

/** 把焦点交给 container 里 data-focus 等于 key 的元素；元素不存在或已禁用时返回 false */
function focusKey(container, key) {
  if (!key) return false;
  const target = Array.from(container.querySelectorAll('[data-focus]')).find((node) => node.dataset.focus === key);
  if (!target || target.disabled) return false;
  target.focus();
  return true;
}

/** 删除、行内保存、键盘翻页等异步操作结束后，把焦点还给原来的元素；它已经不在时退到搜索框 */
function restorePendingFocus() {
  if (!pendingFocus) return;
  const key = pendingFocus;
  pendingFocus = null;
  if (!focusKey(document, key)) byId('search').focus();
}

/** 通用状态块：加载中、空、失败共用 */
function stateBlock({ spinner = false, title, desc, action, role, compact = false } = {}) {
  const block = el('div', { class: 'state' + (compact ? ' state-compact' : ''), role });
  if (spinner) block.append(el('span', { class: 'spinner state-spinner', 'aria-hidden': 'true' }));
  block.append(el('p', { class: 'state-title', text: title }));
  if (desc) block.append(el('p', { class: 'state-desc', text: desc }));
  if (action) {
    const button = el('button', {
      class: 'btn ' + (action.primary ? 'btn-primary' : 'btn-secondary'),
      type: 'button',
      onclick: action.onclick,
    });
    if (action.icon) button.append(icon(action.icon));
    button.append(document.createTextNode(action.label));
    block.append(el('div', { class: 'state-action' }, button));
  }
  return block;
}

/* ------------------------------------------------------------------ 请求层 */

let cooldownUntil = 0; // 限流结束的时刻（毫秒时间戳），在此之前发出的请求先等一等

class ApiError extends Error {
  constructor(kind, message, extra = {}) {
    super(message);
    this.kind = kind; // network | forbidden | stale | rate-limit | http
    Object.assign(this, extra);
  }
}

/** 请求发出后会话已经更换（退出、重新登录或登录失效）：这个响应不属于当前会话 */
const staleRequest = () => new ApiError('stale', '会话已经变化，这次请求的结果不再使用。');

/**
 * 403 与「会话已更换」都已经由请求层统一处理（回到登录视图，或直接丢弃），
 * 调用方遇到这两类错误只需静默返回。
 */
function sessionError(err) {
  return err.kind === 'forbidden' || err.kind === 'stale';
}

/** 字符串的 UTF-8 字节数，也就是它作为请求体时的 Content-Length */
function utf8ByteLength(text) {
  return new TextEncoder().encode(text).length;
}

/**
 * Retry-After 是秒数，限制在 1 到 60 秒之间。
 * 取不到时按服务端 15 秒的限流窗口处理。注意 Number(null) 和 Number('') 都是 0，
 * 所以要先排除空值，否则缺失的响应头会被当成「0 秒」。
 */
function parseRetryAfter(raw) {
  if (raw === null || raw === undefined || String(raw).trim() === '') return 15;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds < 0) return 15;
  return Math.min(Math.max(1, Math.ceil(seconds)), 60);
}

function waitForCooldown() {
  const wait = cooldownUntil - Date.now();
  return wait > 50 ? new Promise((resolve) => setTimeout(resolve, wait)) : Promise.resolve();
}

function messageForStatus(status) {
  if (status === 404) return '规则集不存在，可能已经被删除。';
  if (status === 409) return '这个名称已经被占用。';
  if (status === 413) return '内容超过 1MB 上限，请分批提交。';
  if (status === 400) return '提交的内容不符合要求。';
  if (status >= 500) return `服务出错（HTTP ${status}），请稍后重试。`;
  return `操作失败（HTTP ${status}）。`;
}

function describeError(err) {
  return err instanceof ApiError ? err.message : '操作失败，请重试。';
}

function alertKind(err) {
  return err.kind === 'rate-limit' ? 'warning' : 'danger';
}

/**
 * 统一请求函数：附带 Authorization 头，分类处理 403、429、网络错误和其它非 2xx 响应。
 * - 403：默认清除 Token 并回到登录视图；登录校验时通过 onForbidden 改为自行处理。
 * - 429：读取 Retry-After，在限流结束前暂缓后续请求。
 * - 会话代次：等待冷却结束、收到响应、读完响应体之后各核对一次。请求发出后会话
 *   已经更换的，这个响应一律丢弃：既不会触发登录失效，也不会交给调用方去渲染。
 */
async function request(method, path, { body, query, token = state.token, onForbidden } = {}) {
  const epoch = sessionEpoch;
  await waitForCooldown();
  if (sessionChanged(epoch)) throw staleRequest();

  const url = new URL(path, location.origin);
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    if (sessionChanged(epoch)) throw staleRequest();
    throw new ApiError('network', '无法连接到 RuleBox 服务，请检查网络，或确认服务正在运行。');
  }

  // 限流按客户端 IP 计算，与会话无关：即使是旧会话的响应，也记下冷却时间
  const limited = response.status === 429;
  const retryAfter = limited ? parseRetryAfter(response.headers.get('Retry-After')) : 0;
  if (limited) cooldownUntil = Date.now() + retryAfter * 1000;

  if (sessionChanged(epoch)) throw staleRequest();

  if (response.status === 403) {
    if (onForbidden) onForbidden();
    else expireSession();
    throw new ApiError('forbidden', '令牌不正确或已经失效。', { status: 403 });
  }
  if (limited) {
    throw new ApiError('rate-limit', `请求过于频繁，请 ${retryAfter} 秒后再试。`, { status: 429, retryAfter });
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    // 响应体不是 JSON 时按空处理
  }
  if (sessionChanged(epoch)) throw staleRequest();
  if (!response.ok) {
    throw new ApiError('http', messageForStatus(response.status), {
      status: response.status,
      code: data && data.code,
      details: data && data.details,
    });
  }
  return data;
}

/* ------------------------------------------------------------------ 登录与会话 */

function readToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

function saveToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    return true;
  } catch {
    return false;
  }
}

function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // 存储不可用时本来就没有保存成功
  }
}

/** 清空内存里的全部界面状态；地址里的 hash 保留，重新登录后回到原来的规则集 */
function resetAppState() {
  clearTimeout(searchTimer);
  // 会话代次加 1：旧会话还在途的请求返回后会被丢弃。两个请求序号也一并作废，
  // 这样即使新会话还没有发出新的列表或规则请求，旧请求返回的内容也不会被当作最新结果
  sessionEpoch += 1;
  itemsTracker.next();
  listTracker.next();
  state.token = '';
  state.configs = [];
  state.listStatus = 'idle';
  state.listError = null;
  state.selected = '';
  state.entry = null;
  state.items = freshItems();
  state.editing = '';
  state.editDraft = '';
  state.editBusy = false;
  state.editError = '';
  pendingFocus = null;
  byId('search').value = '';
  // 筛选回到「全部」，单选框也一并复位，避免界面显示的筛选和实际生效的不一致
  setFilter('');
  resetBatch();
  renderList();
  renderDetail();
}

/** 登录视图顶部的提示条（登录失效、请求过于频繁、无法连接等） */
function setLoginNotice(message, kind = 'info') {
  const box = byId('login-notice');
  box.hidden = !message;
  box.className = 'alert' + (kind === 'warning' ? ' alert-warning' : kind === 'danger' ? ' alert-danger' : '');
  box.replaceChildren();
  if (message) box.append(icon(kind === 'warning' ? 'alert-triangle' : kind === 'danger' ? 'alert-circle' : 'info'), el('p', { text: message }));
}

/** 令牌输入框下方的字段级错误；出现错误时焦点回到输入框并全选，方便直接重输 */
function setLoginError(message) {
  const input = byId('login-token');
  byId('login-error').textContent = message;
  byId('login-error').hidden = !message;
  if (message) {
    input.setAttribute('aria-invalid', 'true');
    input.focus();
    input.select();
  } else {
    input.removeAttribute('aria-invalid');
  }
}

function showLogin(notice) {
  state.view = 'login';
  byId('app').hidden = true;
  byId('login').hidden = false;
  byId('skip-link').hidden = true;
  document.title = 'RuleBox';
  setLoginNotice(notice);
  setLoginError('');
  byId('login-token').value = '';
  byId('login-token').focus();
}

function enterApp() {
  state.view = 'app';
  byId('login').hidden = true;
  byId('app').hidden = false;
  byId('skip-link').hidden = false;
}

/**
 * 当前会话的接口返回 403：清除 Token，回到登录视图并说明原因。
 * 旧会话迟到的 403 到不了这里，请求层已经按会话代次把它们丢弃了。
 */
function expireSession() {
  if (state.view !== 'app') return;
  clearToken();
  resetAppState();
  closeAllDialogs();
  showLogin('登录已失效，请重新登录。');
}

async function handleLogin(event) {
  event.preventDefault();
  const token = byId('login-token').value.trim();
  const submit = byId('login-submit');
  setLoginNotice('');
  setLoginError('');
  if (!token) {
    setLoginError('请输入登录令牌。');
    return;
  }

  submit.disabled = true;
  submit.setAttribute('aria-busy', 'true');
  try {
    // 用一次列表请求校验令牌；这里的 403 只说明令牌不对，不走「登录失效」的处理
    const data = await request('GET', API, { token, onForbidden: () => {} });
    resetAppState();
    state.token = token;
    if (!saveToken(token)) toast('浏览器不允许保存登录状态，刷新页面后需要重新登录。', 'warning');
    enterApp();
    startApp(data);
  } catch (err) {
    // 失败时保留已经输入的令牌，方便改掉输错的地方
    if (err.kind === 'stale') return;
    if (err.kind === 'forbidden') setLoginError('令牌不正确，请检查后重试。');
    else {
      setLoginNotice(describeError(err), alertKind(err));
      byId('login-token').focus();
    }
  } finally {
    submit.disabled = false;
    submit.removeAttribute('aria-busy');
  }
}

function toggleTokenVisibility() {
  const input = byId('login-token');
  const hide = input.type === 'text';
  input.type = hide ? 'password' : 'text';
  byId('login-toggle').textContent = hide ? '显示' : '隐藏';
}

function logout() {
  clearToken();
  resetAppState();
  closeAllDialogs();
  showLogin('');
}

/** 进入主界面后的首次加载：先恢复 hash 里记录的选中项，再加载列表（规则由 select 加载） */
function startApp(prefetched) {
  select(parseHash());
  loadConfigs(prefetched);
}

/* ------------------------------------------------------------------ 地址 hash */

/** hash 形如 #/adblock；名称不符合接口要求时视为没有选中 */
function parseHash() {
  const match = /^#\/([A-Za-z0-9_-]+)$/.exec(location.hash);
  return match ? match[1] : '';
}

function onHashChange() {
  const name = parseHash();
  if (name !== state.selected) select(name);
}

/** 选中规则集：换规则集时清空搜索和页码；上一次的校验错误是按旧规则集的类型算的，一并清掉 */
function select(name) {
  clearTimeout(searchTimer);
  state.selected = name;
  state.editing = '';
  state.editError = '';
  state.entry = name ? entryFromList(name) || { name, type: '', description: '', count: undefined } : null;
  state.items = freshItems();
  byId('search').value = '';
  document.title = name ? `${name} · RuleBox` : 'RuleBox';
  clearBatchErrors();
  renderDetail();
  renderList();
  if (name) loadItems({ page: 1, q: '' });
}

function entryFromList(name) {
  const listed = state.configs.find((config) => config.name === name);
  return listed ? { name: listed.name, type: listed.type, description: listed.description, count: listed.item_count } : null;
}

/* ------------------------------------------------------------------ 规则集列表 */

/**
 * 加载规则集列表。
 * 返回这一次是否真的拿到了新的列表；被更新的请求取代、会话已经变化或请求失败时返回 false，
 * 此时 state.configs 里留着的可能是旧数据。
 */
async function loadConfigs(prefetched) {
  let refreshed = false;
  if (prefetched) {
    state.configs = prefetched.configs || [];
    state.listStatus = 'ready';
    state.listError = null;
    refreshed = true;
  } else {
    const id = listTracker.next();
    if (state.configs.length === 0) {
      state.listStatus = 'loading';
      renderList();
      renderNoSelection();
    }
    try {
      const data = await request('GET', API, { query: { type: state.typeFilter } });
      if (!listTracker.isCurrent(id)) return false;
      state.configs = data.configs || [];
      state.listStatus = 'ready';
      state.listError = null;
      refreshed = true;
    } catch (err) {
      if (!listTracker.isCurrent(id) || sessionError(err)) return false;
      if (state.configs.length === 0) {
        state.listStatus = 'error';
        state.listError = err;
      } else {
        // 已经有列表时静默刷新失败，只提示一下，不打断当前操作；state.configs 里留着的是旧数据
        toast(describeError(err), 'danger');
      }
    }
  }
  syncEntry();
  renderList();
  renderDetail();
  return refreshed;
}

/** 列表里的条数是权威值，同步到当前规则集；类型与描述在右栏还没有时一并补上 */
function syncEntry() {
  const listed = entryFromList(state.selected);
  if (!listed || !state.entry) return;
  state.entry.count = listed.count;
  if (!state.entry.type) state.entry.type = listed.type;
  if (!state.entry.description) state.entry.description = listed.description;
}

function buildListState() {
  if (state.listStatus === 'loading') {
    return stateBlock({ compact: true, spinner: true, title: '正在加载规则集…', role: 'status' });
  }
  if (state.listStatus === 'error') {
    return stateBlock({
      compact: true,
      role: 'alert',
      title: '规则集列表加载失败',
      desc: describeError(state.listError),
      action: { label: '重试', onclick: () => loadConfigs() },
    });
  }
  if (state.configs.length === 0) {
    return el('p', { class: 'set-empty', text: state.typeFilter ? `没有 ${state.typeFilter} 类型的规则集` : '还没有规则集' });
  }
  return null;
}

function renderList() {
  const list = byId('set-list');
  const focused = focusedKey(list);
  byId('set-count').textContent = String(state.configs.length);

  const fragment = document.createDocumentFragment();
  for (const config of state.configs) {
    fragment.append(
      el(
        'a',
        {
          class: 'set-item',
          href: '#/' + config.name,
          'data-focus': 'set:' + config.name,
          'aria-current': config.name === state.selected ? 'page' : undefined,
        },
        el('span', { class: 'set-name', text: config.name }),
        el('span', { class: 'set-count', text: formatCount(config.item_count) }),
        el(
          'span',
          { class: 'set-meta' },
          el('span', { class: 'badge badge-sm', text: config.type }),
          config.description ? el('span', { class: 'set-desc', text: config.description, title: config.description }) : null,
        ),
      ),
    );
  }
  list.replaceChildren(fragment);
  byId('set-state').replaceChildren(...[buildListState()].filter(Boolean));
  renderPicker();
  focusKey(list, focused);
}

/** 窄屏的下拉选择器：选项与列表一致；当前选中的规则集被筛选掉时仍然保留一项 */
function renderPicker() {
  const picker = byId('picker');
  const entries = state.configs.slice();
  if (state.selected && state.entry && !entries.some((config) => config.name === state.selected)) {
    entries.unshift({ name: state.entry.name, type: state.entry.type, item_count: state.entry.count });
  }
  const options = entries.map((config) => {
    const count = typeof config.item_count === 'number' ? `，${formatCount(config.item_count)} 条` : '';
    return el('option', { value: config.name, text: `${config.name}（${config.type}${count}）` });
  });
  if (options.length === 0) {
    const text = state.listStatus === 'loading' ? '正在加载…' : state.listStatus === 'error' ? '列表加载失败' : '还没有规则集';
    options.push(el('option', { value: '', disabled: true, text }));
  }
  picker.replaceChildren(...options);
  picker.value = entries.some((config) => config.name === state.selected) ? state.selected : '';
}

function setFilter(value) {
  state.typeFilter = value;
  const radio = document.querySelector(`input[name="set-type"][value="${value}"]`);
  if (radio) radio.checked = true;
}

/* ------------------------------------------------------------------ 右栏 */

function renderDetail() {
  const selected = Boolean(state.selected);
  byId('detail-head').hidden = !selected;
  byId('toolbar').hidden = !selected;
  byId('batch').hidden = !selected || !state.batch.open;
  renderNoSelection();
  renderHeader();
  renderItemsArea();
  renderPager();
}

function renderNoSelection() {
  const holder = byId('detail-empty');
  holder.replaceChildren();
  if (state.selected) return;
  if (state.listStatus === 'loading') {
    holder.append(stateBlock({ spinner: true, title: '正在加载…', role: 'status' }));
  } else if (state.listStatus === 'error') {
    // 左栏的状态块在窄屏下不显示，所以右栏也给出失败状态和重试入口
    holder.append(
      stateBlock({
        role: 'alert',
        title: '规则集列表加载失败',
        desc: describeError(state.listError),
        action: { label: '重试', onclick: () => loadConfigs() },
      }),
    );
  } else if (state.listStatus === 'ready' && state.configs.length === 0) {
    holder.append(
      stateBlock({
        title: '还没有规则集',
        desc: '规则集是一组同类型规则的集合。创建以后可以批量添加规则，再把订阅链接填进 mihomo 配置。',
        action: { label: '新建规则集', primary: true, icon: 'plus', onclick: openCreate },
      }),
    );
  } else if (state.listStatus === 'ready') {
    holder.append(stateBlock({ title: '选择一个规则集', desc: '在规则集列表中选择一项，查看和维护它的规则。' }));
  }
}

function renderHeader() {
  const entry = state.entry;
  if (!entry) return;
  const searching = Boolean(state.items.q);
  const shown = state.items.status === 'ready' ? state.items.total : null;
  const count = typeof entry.count === 'number' ? entry.count : searching ? null : shown;
  const parts = [entry.description || '暂无描述'];
  if (count !== null) parts.push(`共 ${formatCount(count)} 条规则`);

  byId('detail-title').textContent = entry.name;
  byId('detail-badge').textContent = entry.type;
  byId('detail-badge').hidden = !entry.type;
  byId('detail-desc').textContent = parts.join(' · ');
  byId('btn-sub').setAttribute('aria-label', `查看 ${entry.name} 的订阅链接`);
  byId('btn-set-desc').setAttribute('aria-label', `修改 ${entry.name} 的描述`);
  byId('btn-rename').setAttribute('aria-label', `重命名 ${entry.name}`);
  byId('btn-del-set').setAttribute('aria-label', `删除规则集 ${entry.name}`);
  byId('batch-hint').textContent = `每行一条规则，空行会忽略，添加到 ${entry.name}。${TYPE_HINTS[entry.type] || ''}`;
}

async function loadItems({ page = state.items.page, q = state.items.q } = {}) {
  const name = state.selected;
  if (!name) return;
  const id = itemsTracker.next();
  state.items.status = 'loading';
  state.items.pending = { page, q };
  state.editing = '';
  renderDetail();

  let data;
  try {
    data = await request('GET', `${API}/${encodeURIComponent(name)}/items`, { query: { page, pageSize: PAGE_SIZE, q } });
  } catch (err) {
    if (!itemsTracker.isCurrent(id) || state.selected !== name || sessionError(err)) return;
    state.items.status = err.status === 404 ? 'missing' : 'error';
    state.items.error = err;
    renderDetail();
    return;
  }
  if (!itemsTracker.isCurrent(id) || state.selected !== name) return;

  // 请求的页码越界（例如删掉了末页最后一条）：按接口返回的真实总数回到末页
  if (data.items.length === 0 && data.total > 0 && page > 1) {
    return loadItems({ page: lastPage(data.total), q });
  }

  state.entry = { name: data.name, type: data.type, description: data.description, count: entryFromList(name)?.count };
  Object.assign(state.items, { status: 'ready', rows: data.items, total: data.total, page, pageCount: lastPage(data.total), q, error: null, pending: null });
  renderDetail();
  restorePendingFocus();
}

/** 末页页码：总数为 0 时按第 1 页处理 */
function lastPage(total) {
  const info = logic.pagination(Number(total) || 0, 1, PAGE_SIZE) || {};
  return Math.max(1, Math.ceil(Number(info.pageCount) || 1));
}

/**
 * 规则增删成功后的统一刷新：先刷新规则集列表，再刷新当前页。
 * goLast 用于批量添加后跳到末页：先清掉搜索，避免新增的规则被搜索条件挡住。
 * 末页页码只按真实总数计算：这次列表刷新成功且其中有这个规则集时，用它的条数；
 * 否则（当前规则集被类型筛选排除，或列表刷新失败、旧列表里的条数已经过期）
 * 先取一次不带搜索的总数，再跳到末页。
 */
async function refreshAfterChange({ goLast = false } = {}) {
  const name = state.selected;
  const epoch = sessionEpoch;
  const refreshed = await loadConfigs();
  if (sessionChanged(epoch) || state.selected !== name || !name) return;
  if (!goLast) {
    await loadItems();
    return;
  }

  byId('search').value = '';
  clearTimeout(searchTimer);
  const listed = refreshed ? entryFromList(name) : null;
  if (listed) {
    await loadItems({ page: lastPage(listed.count), q: '' });
    return;
  }
  try {
    const data = await request('GET', `${API}/${encodeURIComponent(name)}/items`, { query: { page: 1, pageSize: PAGE_SIZE } });
    if (sessionChanged(epoch) || state.selected !== name) return;
    await loadItems({ page: lastPage(data.total), q: '' });
  } catch (err) {
    if (sessionError(err)) return;
    // 总数也拿不到时退回第 1 页；仍然失败的话，错误状态由 loadItems 显示
    await loadItems({ page: 1, q: '' });
  }
}

function buildItemsState() {
  const items = state.items;
  if (items.status === 'loading') return stateBlock({ spinner: true, title: '正在加载规则…', role: 'status' });
  if (items.status === 'missing') {
    return stateBlock({
      title: '规则集不存在',
      desc: '它可能已经被删除。请选择其他规则集。',
      action: { label: '刷新列表', onclick: () => loadConfigs() },
    });
  }
  if (items.status === 'error') {
    // 重试的是最后一次请求（可能是翻页或搜索），而不是当前已经显示出来的那一页
    return stateBlock({
      role: 'alert',
      title: '加载失败',
      desc: describeError(items.error),
      action: {
        label: '重试',
        onclick: () => {
          pendingFocus = 'search'; // 重试按钮会随状态块消失，成功后把焦点交给搜索框
          loadItems(items.pending || {});
        },
      },
    });
  }
  if (items.total === 0) {
    if (items.q) {
      return stateBlock({
        title: '没有匹配的规则',
        desc: `没有找到规则值或描述里包含「${items.q}」的规则。`,
        action: {
          label: '清除搜索',
          onclick: () => {
            pendingFocus = 'search';
            applySearch('');
          },
        },
      });
    }
    return stateBlock({
      title: '这个规则集还没有规则',
      desc: '把规则一行一条粘贴进来，可以一次添加多条。',
      action: { label: '批量添加规则', primary: true, icon: 'plus', onclick: () => setBatchOpen(true) },
    });
  }
  return null;
}

function renderItemsArea() {
  const items = state.items;
  byId('items-state').replaceChildren();

  if (!state.selected) {
    // 没有选中规则集（或已经退出登录）时清掉表格里残留的行
    byId('rule-table').hidden = true;
    byId('table-status').hidden = true;
    byId('rule-body').replaceChildren();
    byId('items-region').setAttribute('aria-busy', 'false');
    return;
  }

  // 翻页或搜索时保留上一页的内容，只在上方提示正在加载，避免表格在每次请求时整块消失
  const showTable = items.rows.length > 0 && (items.status === 'ready' || items.status === 'loading');
  byId('rule-table').hidden = !showTable;
  byId('items-region').setAttribute('aria-busy', String(items.status === 'loading'));
  byId('table-status').hidden = !(showTable && items.status === 'loading');
  if (showTable) {
    renderRows();
    return;
  }
  const block = buildItemsState();
  if (block) byId('items-state').append(block);
}

function buildRow(item) {
  const key = 'row:' + item.value;
  return el(
    'tr',
    {},
    el('td', { class: 'cell-value' }, el('code', { text: item.value })),
    el(
      'td',
      { class: 'cell-desc' },
      item.description
        ? el('span', { text: item.description, title: item.description })
        : el('span', { class: 'cell-empty' }, el('span', { 'aria-hidden': 'true', text: '—' }), el('span', { class: 'visually-hidden', text: '无描述' })),
    ),
    el(
      'td',
      { class: 'cell-actions' },
      el('button', {
        class: 'btn btn-sm btn-ghost',
        type: 'button',
        'data-focus': key + ':edit',
        'aria-label': `修改 ${item.value} 的描述`,
        onclick: () => startEdit(item.value),
      }, '改描述'),
      el('button', {
        class: 'btn btn-sm btn-ghost btn-danger-ghost',
        type: 'button',
        'data-focus': key + ':delete',
        'aria-label': `删除 ${item.value}`,
        onclick: () => openDeleteRule(item),
      }, '删除'),
    ),
  );
}

/**
 * 行内编辑：规则值留在左侧作为标签，描述变成输入框并占满其余宽度。
 * 输入框随重绘重建，所以它的内容取自 state.editDraft，并在输入时同步回状态。
 */
function buildEditRow(item) {
  const key = 'row:' + item.value;
  const input = el('input', {
    class: 'input',
    type: 'text',
    value: state.editDraft,
    maxlength: '500',
    'data-focus': key + ':input',
    'aria-label': `规则 ${item.value} 的描述`,
    'aria-invalid': state.editError ? 'true' : undefined,
  });
  input.addEventListener('input', () => {
    state.editDraft = input.value;
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveEdit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit();
    }
  });

  return el(
    'tr',
    { class: 'is-editing' },
    el(
      'td',
      { class: 'cell-edit', colspan: '3' },
      el(
        'div',
        { class: 'edit-row' },
        el('code', { class: 'edit-value', text: item.value }),
        input,
        el('button', {
          class: 'btn btn-sm btn-ghost',
          type: 'button',
          disabled: state.editBusy,
          'data-focus': key + ':cancel',
          onclick: cancelEdit,
        }, '取消'),
        el('button', {
          class: 'btn btn-sm btn-primary',
          type: 'button',
          disabled: state.editBusy,
          'data-focus': key + ':save',
          'aria-busy': state.editBusy ? 'true' : undefined,
          onclick: saveEdit,
        }, '保存'),
      ),
      state.editError ? el('p', { class: 'field-error edit-error', role: 'alert', text: state.editError }) : null,
    ),
  );
}

function renderRows() {
  const body = byId('rule-body');
  const focused = focusedKey(body);
  const fragment = document.createDocumentFragment();
  for (const item of state.items.rows) fragment.append(state.editing === item.value ? buildEditRow(item) : buildRow(item));
  body.replaceChildren(fragment);
  focusKey(body, focused);
}

function renderPager() {
  const pager = byId('pager');
  const items = state.items;
  const visible = Boolean(state.selected) && items.rows.length > 0 && (items.status === 'ready' || items.status === 'loading');
  pager.hidden = !visible;
  if (!visible) {
    pager.replaceChildren();
    return;
  }
  // 分页条每次整体重建。记住键盘焦点所在的按钮（或上一次加载期间记下的那个），重建后还给它。
  const wanted = focusedKey(pager) || (pendingFocus && pendingFocus.startsWith('pager:') ? pendingFocus : null);

  const info = logic.pagination(items.total, items.page, PAGE_SIZE) || {};
  const first = Number.isFinite(info.first) ? info.first : (items.page - 1) * PAGE_SIZE + 1;
  const last = Number.isFinite(info.last) ? info.last : Math.min(items.page * PAGE_SIZE, items.total);
  const idle = items.status !== 'ready';
  const parts = [
    el('span', {
      class: 'pager-info',
      text: items.q ? `匹配 ${formatCount(items.total)} 条` : `第 ${formatCount(first)}–${formatCount(last)} 条，共 ${formatCount(items.total)} 条`,
    }),
  ];
  if (items.pageCount > 1) {
    parts.push(
      el(
        'div',
        { class: 'pager-controls' },
        el('button', {
          class: 'btn btn-sm btn-secondary',
          type: 'button',
          'data-focus': 'pager:prev',
          disabled: idle || items.page <= 1,
          onclick: () => loadItems({ page: items.page - 1 }),
        }, '上一页'),
        el('span', { class: 'pager-page', text: `第 ${items.page} / ${items.pageCount} 页` }),
        el('button', {
          class: 'btn btn-sm btn-secondary',
          type: 'button',
          'data-focus': 'pager:next',
          disabled: idle || items.page >= items.pageCount,
          onclick: () => loadItems({ page: items.page + 1 }),
        }, '下一页'),
      ),
    );
  }
  pager.replaceChildren(...parts);
  if (!wanted) return;
  if (focusKey(pager, wanted)) {
    pendingFocus = null;
    return;
  }
  const other = pager.querySelector('.pager-controls button:not([disabled])');
  if (other) {
    // 翻到了首页或末页：原来聚焦的按钮变成禁用，把焦点交给另一个按钮
    other.focus();
    pendingFocus = null;
  } else if (items.status === 'loading') {
    // 加载期间两个按钮都暂时禁用，等数据到了由下一次渲染把焦点还回去
    pendingFocus = wanted;
  } else {
    // 只剩一页，分页按钮不再显示
    pendingFocus = null;
    byId('search').focus();
  }
}

/* ------------------------------------------------------------------ 搜索 */

/** 停止输入 300 毫秒后再请求，避免每按一个键就消耗一次限流额度 */
function scheduleSearch(value) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => applySearch(value), 300);
}

/** 以关键字请求筛选结果并回到第 1 页；清空搜索框即恢复 */
function applySearch(value) {
  clearTimeout(searchTimer);
  const q = value.trim();
  byId('search').value = value;
  if (q === state.items.q) return;
  loadItems({ page: 1, q });
}

/* ------------------------------------------------------------------ 行内改描述 */

function startEdit(value) {
  if (state.editing || state.items.status !== 'ready') return;
  state.editing = value;
  state.editDraft = (state.items.rows.find((item) => item.value === value) || {}).description || '';
  state.editError = '';
  renderRows();
  focusKey(byId('rule-body'), 'row:' + value + ':input');
  const input = byId('rule-body').querySelector('.edit-row .input');
  if (input) input.select();
}

function cancelEdit() {
  if (state.editBusy) return;
  const value = state.editing;
  state.editing = '';
  state.editDraft = '';
  state.editError = '';
  renderRows();
  focusKey(byId('rule-body'), 'row:' + value + ':edit');
}

/** 保存：以相同的 value 和新的 description 调用追加接口，相同的 value 会覆盖原描述 */
async function saveEdit() {
  const value = state.editing;
  if (state.editBusy || !value) return;
  const epoch = sessionEpoch;
  const original = (state.items.rows.find((item) => item.value === value) || {}).description || '';
  const description = state.editDraft.trim();
  if (description === original) {
    cancelEdit();
    return;
  }

  // 提交期间输入框保持可用，焦点不会丢；按钮禁用，回车和 Esc 都被忽略
  state.editBusy = true;
  state.editError = '';
  renderRows();
  try {
    await request('POST', `${API}/${encodeURIComponent(state.selected)}/items`, { body: { items: [{ value, description }] } });
    if (sessionChanged(epoch)) return;
    state.editBusy = false;
    state.editing = '';
    state.editDraft = '';
    pendingFocus = 'row:' + value + ':edit';
    toast('描述已更新');
    await refreshAfterChange();
  } catch (err) {
    state.editBusy = false;
    if (sessionError(err)) return;
    // 保存失败：这一行保持编辑状态，已经输入的内容不丢
    state.editError = describeError(err);
    renderRows();
    focusKey(byId('rule-body'), 'row:' + value + ':input');
  }
}

/* ------------------------------------------------------------------ 批量添加 */

function resetBatch() {
  state.batch = { open: false, busy: false, errors: [], lines: [], stale: false, submitted: 0 };
  byId('batch-text').value = '';
  byId('batch-desc').value = '';
  renderBatch();
}

function clearBatchErrors() {
  state.batch.errors = [];
  state.batch.lines = [];
  state.batch.stale = false;
  renderBatchFeedback();
  renderGutter();
}

function setBatchOpen(open) {
  state.batch.open = open;
  byId('btn-batch').setAttribute('aria-expanded', String(open));
  renderDetail();
  if (open) byId('batch-text').focus();
}

function renderBatch() {
  renderGutter();
  renderBatchFeedback();
  renderBatchSubmit();
}

function onBatchInput() {
  // 内容一改，上一次的错误清单就不再对应现在的行：降级为「过期」提示，但保留下来给用户参考
  if (state.batch.errors.length && !state.batch.stale) {
    state.batch.stale = true;
    renderBatchFeedback();
  }
  renderGutter();
  renderBatchSubmit();
}

/**
 * 行号栏。没有错误时用单个文本节点，成千上万行也只改一次文字。
 * 行号栏用了 size containment 以后宽度不再随内容变化，
 * 这里用 data-digits 记下行号的位数（最多 6 位），样式表据此决定宽度。
 */
function renderGutter() {
  const gutter = byId('batch-gutter');
  const lineCount = byId('batch-text').value.split('\n').length;
  gutter.dataset.digits = String(Math.min(6, String(lineCount).length));
  if (state.batch.lines.length === 0) {
    const numbers = new Array(lineCount);
    for (let line = 1; line <= lineCount; line += 1) numbers[line - 1] = line;
    gutter.textContent = numbers.join('\n');
    return;
  }
  const marked = new Set(state.batch.lines);
  const fragment = document.createDocumentFragment();
  for (let line = 1; line <= lineCount; line += 1) {
    const error = marked.has(line);
    fragment.append(el('span', { class: error ? (state.batch.stale ? 'is-error is-stale' : 'is-error') : '' }, String(line)));
  }
  gutter.replaceChildren(fragment);
}

function renderBatchSubmit() {
  const button = byId('batch-submit');
  let count = 0;
  for (const line of byId('batch-text').value.split('\n')) if (line.trim()) count += 1;
  button.textContent = count > 0 ? `添加 ${formatCount(count)} 条规则` : '添加规则';
  button.disabled = count === 0 || state.batch.busy;
}

function renderBatchFeedback() {
  const batch = state.batch;
  const invalid = batch.errors.length > 0 && !batch.stale;
  byId('batch-editor').classList.toggle('is-invalid', invalid);
  byId('batch-text').setAttribute('aria-invalid', String(invalid));

  const holder = byId('batch-feedback');
  holder.replaceChildren();
  if (batch.errors.length === 0) return;

  const summary = el(
    'div',
    { class: 'alert' + (batch.stale ? '' : ' alert-danger'), id: 'batch-summary', role: batch.stale ? 'status' : 'alert', tabindex: '-1' },
    icon(batch.stale ? 'info' : 'alert-circle'),
    el(
      'p',
      {},
      el('strong', { text: `${batch.errors.length} 行不合法，这一批 ${formatCount(batch.submitted)} 条规则都没有写入。` }),
      batch.stale ? ' 内容已经修改，下面的清单是上次提交时的结果，修正后请重新提交。' : ' 修正下面的行，然后重新提交。',
    ),
  );
  const list = el(
    'ul',
    { class: 'error-list', 'aria-label': '不合法的行' },
    batch.errors.map((error) =>
      el(
        'li',
        {},
        el(
          'button',
          {
            class: 'error-row',
            type: 'button',
            'aria-label': `定位到第 ${error.line} 行：${error.value}`,
            onclick: () => locateLine(error),
          },
          el('span', { class: 'error-line', text: `第 ${error.line} 行` }),
          el('span', { class: 'error-value', text: error.value }),
          el('span', { class: 'error-reason', text: error.reason }),
        ),
      ),
    ),
  );
  holder.append(summary, list);
}

/**
 * 批量面板里其它失败（网络、限流、超过上限）的提示条：留在面板里，不打断用户修改内容。
 * 提交期间文本域是禁用的，焦点已经不在它上面，所以把焦点交给这条提示。
 */
function showBatchFailure(message, kind) {
  const glyph = kind === 'warning' ? 'alert-triangle' : 'alert-circle';
  const alert = el('div', { class: 'alert alert-' + kind, role: 'alert', tabindex: '-1' }, icon(glyph), el('p', { text: message }));
  byId('batch-feedback').replaceChildren(alert);
  byId('batch-editor').classList.remove('is-invalid');
  byId('batch-text').setAttribute('aria-invalid', 'false');
  alert.focus();
}

/** 行号栏跟着文本框滚动。两者使用相同的字体、行高和上下内边距，所以逐行对齐 */
function syncGutterScroll() {
  byId('batch-gutter').scrollTop = byId('batch-text').scrollTop;
}

/**
 * 定位到出错的行。
 * - 内容还没有改动：直接用提交时记下的真实行号。同一条不合法的规则可能出现多次，
 *   只有按行号才能定位到错误清单里指的那一处。
 * - 内容已经改过：行号可能整体偏移，改为按原文找到那一行，找不到再退回记下的行号。
 */
function locateLine(error) {
  const textarea = byId('batch-text');
  const lines = textarea.value.split('\n');
  let index = error.line - 1;
  if (state.batch.stale) {
    const found = lines.findIndex((line) => line.trim() === error.value);
    if (found !== -1) index = found;
  }
  index = Math.min(Math.max(index, 0), lines.length - 1);

  let start = 0;
  for (let line = 0; line < index; line += 1) start += lines[line].length + 1;
  textarea.focus();
  textarea.setSelectionRange(start, start + lines[index].length);

  const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 20;
  textarea.scrollTop = Math.max(0, (index - 2) * lineHeight);
}

async function submitBatch() {
  const textarea = byId('batch-text');
  const description = byId('batch-desc').value.trim();
  const name = state.selected;
  if (state.batch.busy || !name) return;
  const epoch = sessionEpoch;

  // 大小上限分两道检查：先按原文拦一道（不必解析），解析后再按实际请求体拦一道。
  // 统一描述会随每条规则重复进入请求体，原文不大时请求体也可能超限。
  if (logic.exceedsBodyLimit(textarea.value)) {
    showBatchFailure('内容超过 1MB 上限，请分批添加。', 'danger');
    return;
  }
  const { items, lineNumbers } = logic.parseBatch(textarea.value, description);
  if (items.length === 0) {
    textarea.focus();
    return;
  }
  if (utf8ByteLength(JSON.stringify({ items })) > BODY_LIMIT_BYTES) {
    showBatchFailure('加上统一描述后内容超过 1MB 上限，请分批添加。', 'danger');
    return;
  }

  state.batch.busy = true;
  textarea.disabled = true;
  byId('batch-desc').disabled = true;
  byId('batch-submit').setAttribute('aria-busy', 'true');
  renderBatchSubmit();
  try {
    const result = await request('POST', `${API}/${encodeURIComponent(name)}/items`, { body: { items } });
    if (sessionChanged(epoch)) return;
    resetBatch();
    setBatchOpen(false);
    toast(`已添加 ${formatCount(result.added)} 条规则`);
    // 请求期间用户可能已经切换到别的规则集：这时只刷新列表，不动新规则集的搜索和页码
    await refreshAfterChange({ goLast: state.selected === name });
  } catch (err) {
    if (sessionError(err)) return;
    if (err.status === 400 && Array.isArray(err.details)) {
      const errors = logic.mapValidationErrors(err.details, lineNumbers);
      if (errors.length === 0) {
        // 服务端没有指出具体是哪几行（或下标都对不上）：退回普通提示，不做逐行标注
        showBatchFailure(`有规则不合法，这一批 ${formatCount(items.length)} 条规则都没有写入，但没能确定是哪几行。`, 'danger');
      } else {
        // 整批校验失败：文本原样保留，按真实行号标出出错的行
        state.batch.errors = errors;
        state.batch.lines = errors.map((error) => error.line);
        state.batch.stale = false;
        state.batch.submitted = items.length;
        renderGutter();
        renderBatchFeedback();
        const summary = byId('batch-summary');
        if (summary) summary.focus();
      }
    } else if (err.status === 404) {
      showBatchFailure(describeError(err), 'danger');
      loadConfigs();
    } else {
      showBatchFailure(describeError(err), alertKind(err));
    }
  } finally {
    state.batch.busy = false;
    textarea.disabled = false;
    byId('batch-desc').disabled = false;
    byId('batch-submit').removeAttribute('aria-busy');
    renderBatchSubmit();
  }
}

/* ------------------------------------------------------------------ 对话框 */

function isBusy(dialog) {
  return dialog.getAttribute('aria-busy') === 'true';
}

function openDialog(id) {
  const dialog = byId(id);
  resetDialog(dialog);
  if (!dialog.open) dialog.showModal();
  return dialog;
}

function closeAllDialogs() {
  for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
}

function resetDialog(dialog) {
  const box = dialog.querySelector('[data-alert]');
  if (box) {
    box.className = 'alert';
    box.hidden = true;
    box.replaceChildren();
  }
  for (const error of dialog.querySelectorAll('.field-error')) {
    error.textContent = '';
    error.hidden = true;
  }
  for (const input of dialog.querySelectorAll('[aria-invalid]')) input.removeAttribute('aria-invalid');
  setDialogBusy(dialog, false);
}

function setDialogBusy(dialog, busy) {
  dialog.setAttribute('aria-busy', String(busy));
  for (const button of dialog.querySelectorAll('button')) button.disabled = busy;
  const primary = dialog.querySelector('.dialog-foot .btn-primary, .dialog-foot .btn-danger');
  if (!primary) return;
  if (busy) primary.setAttribute('aria-busy', 'true');
  else primary.removeAttribute('aria-busy');
}

function showDialogAlert(dialog, message, kind = 'danger') {
  const box = dialog.querySelector('[data-alert]');
  const glyph = kind === 'warning' ? 'alert-triangle' : kind === 'info' ? 'info' : 'alert-circle';
  box.className = 'alert' + (kind === 'danger' ? ' alert-danger' : kind === 'warning' ? ' alert-warning' : '');
  box.replaceChildren(icon(glyph), el('p', { text: message }));
  box.hidden = false;
}

/** 字段级错误：显示在对应输入框下方，并把焦点移过去 */
function showFieldError(dialog, errorId, message) {
  byId(errorId).textContent = message;
  byId(errorId).hidden = false;
  const input = dialog.querySelector('.input-mono');
  input.setAttribute('aria-invalid', 'true');
  input.focus();
  input.select();
}

/* --- 新建 --- */

function openCreate() {
  byId('create-name').value = '';
  byId('create-desc').value = '';
  byId('create-type-domain').checked = true;
  openDialog('dlg-create');
}

async function handleCreate(dialog) {
  if (isBusy(dialog)) return;
  resetDialog(dialog);
  const epoch = sessionEpoch;
  const name = byId('create-name').value.trim();
  if (!name) return showFieldError(dialog, 'create-name-error', '请填写名称。');
  if (!NAME_PATTERN.test(name)) return showFieldError(dialog, 'create-name-error', '只能包含字母、数字、连字符和下划线。');

  const type = dialog.querySelector('input[name="create-type"]:checked').value;
  const description = byId('create-desc').value.trim();
  setDialogBusy(dialog, true);
  try {
    await request('POST', API, { body: { name, type, description } });
    if (sessionChanged(epoch)) return;
    dialog.close();
    toast(`已创建规则集 ${name}`);
    // 新建的类型被当前筛选排除时，切回「全部」，让它在列表里出现
    if (state.typeFilter && state.typeFilter !== type) setFilter('');
    await loadConfigs();
    if (sessionChanged(epoch)) return;
    location.hash = '#/' + name; // 记录选中状态，随后由 hashchange 加载这个规则集
  } catch (err) {
    if (sessionError(err)) return;
    if (err.status === 409) showFieldError(dialog, 'create-name-error', `名称「${name}」已经被占用，请换一个。`);
    else if (err.status === 400) showFieldError(dialog, 'create-name-error', '名称只能包含字母、数字、连字符和下划线。');
    else showDialogAlert(dialog, describeError(err), alertKind(err));
  } finally {
    setDialogBusy(dialog, false);
  }
}

/* --- 重命名 --- */

function openRename() {
  if (!state.entry) return;
  byId('rename-name').value = state.entry.name;
  openDialog('dlg-rename');
}

async function handleRename(dialog) {
  if (isBusy(dialog)) return;
  resetDialog(dialog);
  const epoch = sessionEpoch;
  const previous = state.selected;
  const name = byId('rename-name').value.trim();
  if (!name) return showFieldError(dialog, 'rename-error', '请填写名称。');
  if (!NAME_PATTERN.test(name)) return showFieldError(dialog, 'rename-error', '只能包含字母、数字、连字符和下划线。');
  if (name === previous) {
    dialog.close();
    return;
  }

  setDialogBusy(dialog, true);
  try {
    await request('PATCH', `${API}/${encodeURIComponent(previous)}/rename`, { body: { newName: name } });
    if (sessionChanged(epoch)) return;
    dialog.close();
    toast(`已重命名为 ${name}`);
    if (state.selected === previous) {
      state.selected = name;
      if (state.entry) state.entry.name = name;
      // 替换当前这条历史记录：不新增一条，也不会触发 hashchange 重新加载规则
      history.replaceState(null, '', '#/' + name);
      document.title = `${name} · RuleBox`;
    }
    await loadConfigs();
  } catch (err) {
    if (sessionError(err)) return;
    if (err.status === 409) showFieldError(dialog, 'rename-error', `名称「${name}」已经被占用，请换一个。`);
    else if (err.status === 400) showFieldError(dialog, 'rename-error', '名称只能包含字母、数字、连字符和下划线。');
    else showDialogAlert(dialog, describeError(err), alertKind(err));
  } finally {
    setDialogBusy(dialog, false);
  }
}

/* --- 修改规则集描述 --- */

function openSetDesc() {
  if (!state.entry) return;
  byId('set-desc-input').value = state.entry.description || '';
  updateSetDescCount();
  openDialog('dlg-set-desc');
}

function updateSetDescCount() {
  byId('set-desc-count').textContent = `${byId('set-desc-input').value.length} / 500`;
}

async function handleSetDesc(dialog) {
  if (isBusy(dialog)) return;
  resetDialog(dialog);
  const epoch = sessionEpoch;
  const description = byId('set-desc-input').value.trim();
  if (state.entry && description === (state.entry.description || '')) {
    dialog.close();
    return;
  }

  setDialogBusy(dialog, true);
  try {
    await request('PATCH', `${API}/${encodeURIComponent(state.selected)}`, { body: { description } });
    if (sessionChanged(epoch)) return;
    dialog.close();
    toast('描述已更新');
    if (state.entry) state.entry.description = description;
    await loadConfigs();
  } catch (err) {
    if (sessionError(err)) return;
    showDialogAlert(dialog, describeError(err), alertKind(err));
  } finally {
    setDialogBusy(dialog, false);
  }
}

/* --- 删除规则集 --- */

function openDeleteSet() {
  const entry = state.entry;
  if (!entry) return;
  const shown = state.items.status === 'ready' ? state.items.total : null;
  const count = typeof entry.count === 'number' ? entry.count : state.items.q ? null : shown;
  const sentence = el('p', { class: 'dialog-text' });
  sentence.append(document.createTextNode('将删除规则集 '), el('code', { class: 'code', text: entry.name }));
  if (count > 0) sentence.append(document.createTextNode(` 和其中的 ${formatCount(count)} 条规则`));
  sentence.append(document.createTextNode('，订阅链接会立即失效。这个操作无法撤销。'));
  byId('dlg-del-set-text').replaceChildren(sentence);
  openDialog('dlg-del-set');
}

/** 规则集被删掉以后，清掉选中状态和地址里的 hash（替换当前记录，不新增历史） */
function forgetSelection(name) {
  if (state.selected !== name) return;
  state.selected = '';
  state.entry = null;
  state.items = freshItems();
  document.title = 'RuleBox';
  history.replaceState(null, '', location.pathname + location.search);
}

async function handleDeleteSet(dialog) {
  if (isBusy(dialog)) return;
  const epoch = sessionEpoch;
  const name = state.selected;
  setDialogBusy(dialog, true);
  try {
    await request('DELETE', `${API}/${encodeURIComponent(name)}`);
    if (sessionChanged(epoch)) return;
    dialog.close();
    toast(`已删除规则集 ${name}`);
  } catch (err) {
    if (sessionError(err)) return;
    if (err.status !== 404) {
      showDialogAlert(dialog, describeError(err), alertKind(err));
      return;
    }
    dialog.close();
    toast('这个规则集已经不存在，列表已刷新', 'warning');
  } finally {
    setDialogBusy(dialog, false);
  }
  forgetSelection(name);
  await loadConfigs();
}

/* --- 删除规则 --- */

function openDeleteRule(item) {
  pendingRule = item.value;
  byId('dlg-del-rule-text').textContent = `将从规则集 ${state.selected} 中删除：`;
  byId('del-rule-value').textContent = item.value;
  byId('del-rule-desc').textContent = item.description || '';
  byId('del-rule-desc').hidden = !item.description;
  openDialog('dlg-del-rule');
}

async function handleDeleteRule(dialog) {
  if (isBusy(dialog)) return;
  const epoch = sessionEpoch;
  const value = pendingRule;
  const rows = state.items.rows;
  const index = rows.findIndex((item) => item.value === value);
  const neighbor = rows[index + 1] || rows[index - 1];
  pendingFocus = neighbor ? 'row:' + neighbor.value + ':delete' : 'search';

  setDialogBusy(dialog, true);
  try {
    const result = await request('DELETE', `${API}/${encodeURIComponent(state.selected)}/items`, { body: { items: [{ value }] } });
    if (sessionChanged(epoch)) return;
    dialog.close();
    if (result.removed === 0) toast('这条规则已经不存在，列表已刷新', 'warning');
    else toast('已删除 1 条规则');
  } catch (err) {
    pendingFocus = null;
    if (sessionError(err)) return;
    showDialogAlert(dialog, describeError(err), alertKind(err));
    return;
  } finally {
    setDialogBusy(dialog, false);
  }
  await refreshAfterChange();
}

/* --- 订阅链接 --- */

function openSubscription() {
  if (!state.selected) return;
  loadSubscription(openDialog('dlg-sub'));
}

/** 接口返回根相对地址，拼上当前访问页面的协议与主机名 */
async function loadSubscription(dialog) {
  const input = byId('sub-url');
  const action = byId('sub-action');
  const epoch = sessionEpoch;
  subscriptionNeedsRetry = false;
  resetDialog(dialog);
  action.replaceChildren(icon('copy'), document.createTextNode('复制链接'));
  setDialogBusy(dialog, true);
  input.value = '';
  input.readOnly = true;
  input.placeholder = '正在获取订阅地址…';

  try {
    const data = await request('GET', `${API}/${encodeURIComponent(state.selected)}/subscription`);
    // 对话框已经关掉，或者请求期间会话变了：都不再往对话框里写
    if (!dialog.open || sessionChanged(epoch)) return;
    input.value = location.origin + data.url;
    input.placeholder = '';
    input.readOnly = false;
    setDialogBusy(dialog, false);
    input.focus();
    input.select();
  } catch (err) {
    if (sessionError(err) || !dialog.open) return;
    showDialogAlert(dialog, describeError(err), alertKind(err));
    setDialogBusy(dialog, false);
    input.placeholder = '没有取到订阅地址';
    // 取不到时把主按钮换成「重试」
    subscriptionNeedsRetry = true;
    action.textContent = '重试';
  }
}

function onSubscriptionAction() {
  const dialog = byId('dlg-sub');
  if (subscriptionNeedsRetry) loadSubscription(dialog);
  else copySubscription();
}

/**
 * 复制：剪贴板接口只在 HTTPS 或 localhost 下可用。通过 IP 加 HTTP 访问时，
 * 回退为选中文本再执行复制命令；仍然失败时保留选中状态，让用户手动复制。
 */
async function copySubscription() {
  const input = byId('sub-url');
  const value = input.value.trim();
  if (!value) return;
  let copied = false;
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(value);
      copied = true;
    } catch {
      // 权限被拒绝等情况，继续尝试回退方案
    }
  }
  if (!copied) {
    try {
      input.focus();
      input.select();
      copied = document.execCommand('copy');
    } catch {
      copied = false;
    }
  }
  if (copied) toast('已复制订阅链接');
  else toast('复制失败，地址已经选中，请按 Ctrl+C 复制。', 'danger');
}

/* ------------------------------------------------------------------ 提示浮层 */

let toastTimer = 0;

/** 一次只显示一条，新的替换旧的；成功 3 秒后消失，警告和失败 5 秒 */
function toast(message, kind = 'success') {
  const glyph = kind === 'success' ? 'check' : kind === 'warning' ? 'alert-triangle' : 'alert-circle';
  const node = el('div', { class: 'toast' + (kind === 'success' ? '' : ' toast-' + kind) }, icon(glyph), message);
  byId('toasts').replaceChildren(node);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.remove(), TOAST_DURATION[kind] || TOAST_DURATION.success);
}

/* ------------------------------------------------------------------ 事件绑定与启动 */

function bindDialogs() {
  const forms = { 'dlg-create': handleCreate, 'dlg-rename': handleRename, 'dlg-set-desc': handleSetDesc };
  for (const dialog of document.querySelectorAll('dialog')) {
    // 提交过程中不允许用 Esc 关掉对话框
    dialog.addEventListener('cancel', (event) => {
      if (isBusy(dialog)) event.preventDefault();
    });
    for (const button of dialog.querySelectorAll('[data-close]')) {
      button.addEventListener('click', () => dialog.close());
    }
    const handler = forms[dialog.id];
    if (handler) {
      dialog.querySelector('form').addEventListener('submit', (event) => {
        event.preventDefault();
        handler(dialog);
      });
    }
  }
  byId('del-set-confirm').addEventListener('click', () => handleDeleteSet(byId('dlg-del-set')));
  byId('del-rule-confirm').addEventListener('click', () => handleDeleteRule(byId('dlg-del-rule')));
  byId('sub-action').addEventListener('click', onSubscriptionAction);
  byId('set-desc-input').addEventListener('input', updateSetDescCount);
}

function bindEvents() {
  byId('login-form').addEventListener('submit', handleLogin);
  byId('login-toggle').addEventListener('click', toggleTokenVisibility);
  byId('logout').addEventListener('click', logout);

  // 跳转链接不能改变地址 hash（hash 用来记录选中的规则集），所以直接把焦点交给主区域
  byId('skip-link').addEventListener('click', (event) => {
    event.preventDefault();
    byId('main').focus();
  });

  byId('btn-new').addEventListener('click', openCreate);
  byId('type-filters').addEventListener('change', (event) => {
    state.typeFilter = event.target.value;
    loadConfigs();
  });
  byId('picker').addEventListener('change', (event) => {
    if (event.target.value) location.hash = '#/' + event.target.value;
  });

  byId('btn-sub').addEventListener('click', openSubscription);
  byId('btn-set-desc').addEventListener('click', openSetDesc);
  byId('btn-rename').addEventListener('click', openRename);
  byId('btn-del-set').addEventListener('click', openDeleteSet);

  const search = byId('search');
  search.addEventListener('input', () => scheduleSearch(search.value));
  search.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      applySearch(search.value);
    }
  });

  byId('btn-batch').addEventListener('click', () => setBatchOpen(!state.batch.open));
  byId('batch-close').addEventListener('click', () => {
    setBatchOpen(false);
    byId('btn-batch').focus();
  });
  const editor = byId('batch-text');
  editor.addEventListener('input', onBatchInput);
  editor.addEventListener('scroll', syncGutterScroll);
  byId('batch-submit').addEventListener('click', submitBatch);

  window.addEventListener('hashchange', onHashChange);
  bindDialogs();
}

/** 把图标模板里对应的图标填到带 data-icon 的元素前面 */
function injectIcons() {
  for (const node of document.querySelectorAll('[data-icon]')) node.prepend(icon(node.dataset.icon));
}

function boot() {
  injectIcons();
  bindEvents();
  state.token = readToken();
  if (!state.token) {
    showLogin('');
    return;
  }
  enterApp();
  startApp();
}

boot();
