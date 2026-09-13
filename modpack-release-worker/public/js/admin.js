// 管理后台逻辑
let currentMods = [];
let currentUser = null;
let mrpackFile = null;

async function json(url, opts) {
  const res = await fetch(url, opts);
  let data = {};
  try { data = await res.json(); } catch (_) { data = {}; }
  if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
  return data;
}

function toast(msg, type = 'ok') {
  const wrap = document.getElementById('toastWrap');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

function fmtSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

function esc(s) {
  const div = document.createElement('div');
  div.textContent = String(s == null ? '' : s);
  return div.innerHTML;
}

function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('zh-CN');
}

function handlePublishResult(p, actionText) {
  if (!p) { toast(`${actionText}完成`, 'ok'); return; }
  if (p.error) {
    toast(`${actionText}成功，但自动发布失败：${p.error}`, 'err');
  } else {
    toast(`${actionText}成功，已自动发布 v${p.version} → ${p.tag}`, 'ok');
  }
}

async function init() {
  try {
    const me = await json('/api/me');
    const area = document.getElementById('meArea');
    if (!me.isAdmin) {
      document.getElementById('needLogin').hidden = false;
      if (me.user) area.innerHTML = `<span class="pill pill-gray">${esc(me.user.name)}（非管理员）</span>`;
      return;
    }
    document.getElementById('needLogin').hidden = true;
    document.getElementById('panel').hidden = false;
    area.innerHTML = `<span class="pill pill-green">✅ ${esc(me.user.name)}（管理员）</span>`;
    currentUser = me.user;
    loadMods();
    loadReleases();
    loadTokens();
    loadProfile();
    bindUpload();
    bindTabs();
    bindMrpack();
  } catch (e) {
    document.getElementById('needLogin').hidden = false;
    document.getElementById('needLogin').innerHTML =
      `<h2>🔒 登录失败</h2><p style="color:var(--muted)">${esc(e.message)}</p><a href="/auth/login" class="btn btn-primary">重新登录</a>`;
  }
}

async function loadMods() {
  try {
    const data = await json('/api/admin/mods');
    currentMods = data.mods || [];
    renderMods();
  } catch (e) {
    toast('加载模组列表失败：' + e.message, 'err');
  }
}

function renderMods() {
  const list = document.getElementById('modList');
  document.getElementById('modCount').textContent = currentMods.length;
  if (!currentMods.length) {
    list.innerHTML = '<div class="empty">mods 文件夹暂无模组，请上传</div>';
    return;
  }
  list.innerHTML = currentMods.map((m) => `
    <div class="mod-item">
      <span class="name">📦 ${esc(m.name)}</span>
      <span class="meta">${fmtSize(m.size)}</span>
      <span class="ops">
        <button class="btn btn-sm" data-act="rename" data-name="${esc(m.name)}">重命名</button>
        <button class="btn btn-danger btn-sm" data-act="del" data-name="${esc(m.name)}">删除</button>
      </span>
    </div>`).join('');

  list.querySelectorAll('[data-act]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.name;
      if (btn.dataset.act === 'rename') doRename(name);
      else doDelete(name);
    });
  });
}

function bindUpload() {
  const drop = document.getElementById('dropZone');
  const input = document.getElementById('fileInput');
  drop.addEventListener('click', () => input.click());
  input.addEventListener('change', () => input.files.length && upload(input.files[0]));
  ['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('drag'); }));
  drop.addEventListener('drop', (e) => {
    const f = e.dataTransfer.files[0];
    if (f) upload(f);
  });
}

async function upload(file) {
  const lower = file.name.toLowerCase();
  if (!lower.endsWith('.jar') && !lower.endsWith('.zip')) {
    toast('仅支持 .jar 模组或 .zip 压缩包', 'err');
    return;
  }
  const fd = new FormData();
  fd.append('file', file);
  toast(`正在上传 ${file.name} 并自动打包发布…`, 'loading');
  try {
    const data = await json('/api/admin/mods', { method: 'POST', body: fd });
    if (lower.endsWith('.zip') && data.count) {
      toast(`已从 ZIP 解压上传 ${data.count} 个模组${data.publish && !data.publish.error ? '，并已自动发布 v' + data.publish.version : ''}`, 'ok');
      loadMods();
      loadReleases();
      return;
    }
    handlePublishResult(data.publish, `上传 ${file.name}`);
    loadMods();
    loadReleases();
  } catch (e) {
    toast('上传失败：' + e.message, 'err');
  }
}

async function doRename(name) {
  const newName = window.prompt(`将 "${name}" 重命名为（必须以 .jar 结尾）：`, name);
  if (!newName || newName === name) return;
  toast('正在重命名并自动发布…', 'loading');
  try {
    const data = await json('/api/admin/mods/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldName: name, newName }),
    });
    handlePublishResult(data.publish, `重命名 ${name}`);
    loadMods();
    loadReleases();
  } catch (e) {
    toast('重命名失败：' + e.message, 'err');
  }
}

async function doDelete(name) {
  if (!window.confirm(`确定删除模组 "${name}"？删除后将自动发布新版本。`)) return;
  toast(`正在删除 ${name} 并自动发布…`, 'loading');
  try {
    const data = await json('/api/admin/mods/' + encodeURIComponent(name), { method: 'DELETE' });
    handlePublishResult(data.publish, `删除 ${name}`);
    loadMods();
    loadReleases();
  } catch (e) {
    toast('删除失败：' + e.message, 'err');
  }
}

document.getElementById('publishBtn').addEventListener('click', async () => {
  const msg = document.getElementById('publishMsg').value.trim();
  toast('正在打包并发布新版本…', 'loading');
  try {
    const data = await json('/api/admin/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg }),
    });
    toast(`发布成功：v${data.result.version} → ${data.result.tag}`, 'ok');
    loadMods();
    loadReleases();
  } catch (e) {
    toast('发布失败：' + e.message, 'err');
  }
});

async function loadReleases() {
  try {
    const data = await json('/api/releases');
    const list = document.getElementById('releaseList');
    if (!data.releases || !data.releases.length) {
      list.innerHTML = '<div class="empty">暂无发布记录</div>';
      return;
    }
    list.innerHTML = data.releases.map((r) => {
      const zip = (r.assets || []).find((a) => a.name.toLowerCase().endsWith('.zip'));
      return `
      <div class="mod-item">
        <span class="name">🏷 ${esc(r.tag)} <span class="pill pill-green" style="margin-left:6px;">${esc(r.name || '')}</span></span>
        <span class="meta">${fmtTime(r.published_at)}${zip ? ' · ' + fmtSize(zip.size) : ''}</span>
        <span class="ops">
          ${zip ? `<a class="btn btn-primary btn-sm" href="${esc(zip.url)}" target="_blank" rel="noopener">下载</a>` : ''}
          <a class="btn btn-sm" href="${esc(r.html_url)}" target="_blank" rel="noopener">详情</a>
          <button class="btn btn-blue btn-sm" data-rb-id="${r.id}" data-rb-tag="${esc(r.tag)}">回滚</button>
          <button class="btn btn-danger btn-sm" data-del-id="${r.id}" data-del-tag="${esc(r.tag)}">删除</button>
        </span>
      </div>`;
    }).join('');

    list.querySelectorAll('[data-rb-id]').forEach((btn) => {
      btn.addEventListener('click', () => doRollback(btn.dataset.rbId, btn.dataset.rbTag));
    });
    list.querySelectorAll('[data-del-id]').forEach((btn) => {
      btn.addEventListener('click', () => doDeleteRelease(btn.dataset.delId, btn.dataset.delTag));
    });
  } catch (e) {
    document.getElementById('releaseList').innerHTML = `<div class="empty">加载失败：${esc(e.message)}</div>`;
  }
}

async function doRollback(id, tag) {
  if (!window.confirm(`确定回滚到版本 ${tag}？\n将用该版本的模组替换当前 mods 文件夹，并发布新版本。`)) return;
  toast(`正在回滚到 ${tag} 并发布新版本…`, 'loading');
  try {
    const data = await json('/api/admin/releases/rollback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, tag }),
    });
    handlePublishResult(data.publish, `回滚到 ${tag}（恢复 ${data.count} 个模组）`);
    loadMods();
    loadReleases();
  } catch (e) {
    toast('回滚失败：' + e.message, 'err');
  }
}

async function doDeleteRelease(id, tag) {
  if (!window.confirm(`确定删除历史版本 ${tag}？\n将同时删除 GitHub 上的 Release 与 Tag，此操作不可恢复。`)) return;
  toast(`正在删除版本 ${tag}…`, 'loading');
  try {
    const data = await json('/api/admin/releases/' + id, { method: 'DELETE' });
    toast(`已删除版本 ${data.tag}`, 'ok');
    loadMods();
    loadReleases();
  } catch (e) {
    toast('删除失败：' + e.message, 'err');
  }
}

// ============ 后台 Tab 切换 ============
function bindTabs() {
  const tabs = document.getElementById('adminTabs');
  const switchTab = (name) => {
    document.querySelectorAll('.admin-tabs a').forEach((a) => a.classList.toggle('active', a.dataset.tab === name));
    document.querySelectorAll('.admin-panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-' + name));
    if (name === 'api') loadTokens();
    if (name === 'profile') loadProfile();
  };
  tabs.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-tab]');
    if (!a) return;
    e.preventDefault();
    switchTab(a.dataset.tab);
    history.replaceState(null, '', '#/' + a.dataset.tab);
  });
  const m = location.hash.match(/#\/(mods|mrpack|api|profile)/);
  if (m) switchTab(m[1]);
}

// ============ mrpack 导入 ============
function bindMrpack() {
  const drop = document.getElementById('mrpackDrop');
  const input = document.getElementById('mrpackInput');
  const btn = document.getElementById('mrpackBtn');
  drop.addEventListener('click', () => input.click());
  input.addEventListener('change', () => pickMrpack(input.files[0]));
  ['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('drag'); }));
  drop.addEventListener('drop', (e) => {
    const f = e.dataTransfer.files[0];
    if (f) pickMrpack(f);
  });
  btn.addEventListener('click', doMrpackImport);
}

function pickMrpack(file) {
  const lower = file ? file.name.toLowerCase() : '';
  if (!lower.endsWith('.mrpack') && !lower.endsWith('.zip')) {
    toast('仅支持 .mrpack 或 .zip 模组包文件', 'err');
    return;
  }
  mrpackFile = file;
  document.getElementById('mrpackBtn').disabled = false;
  document.getElementById('mrpackDropText').innerHTML = `已选择：<b>${esc(file.name)}</b>（${fmtSize(file.size)}）`;
  document.getElementById('mrpackInput').value = '';
}

async function doMrpackImport() {
  if (!mrpackFile) { toast('请先选择 .mrpack 文件', 'err'); return; }
  const btn = document.getElementById('mrpackBtn');
  const fd = new FormData();
  fd.append('file', mrpackFile);
  const msg = document.getElementById('mrpackMsg').value.trim();
  if (msg) fd.append('message', msg);
  btn.disabled = true;
  btn.textContent = '导入中…（下载模组可能需要几分钟）';
  toast('正在导入 mrpack：解析清单 → 下载模组 → 打包发布…', 'loading');
  try {
    const data = await json('/api/admin/mrpack', { method: 'POST', body: fd });
    document.getElementById('mrpackResultCard').hidden = false;
    const p = data.publish;
    const pubText = !p ? '' : p.error ? `<span class="pill pill-red" style="margin-left:6px;">发布失败：${esc(p.error)}</span>`
      : `<span class="pill pill-green" style="margin-left:6px;">已自动发布 v${esc(p.version)} → ${esc(p.tag)}</span>`;
    const items = (data.mods || []).map((m) => `
      <div class="mod-item">
        <span class="name">✅ ${esc(m.name)}</span>
        <span class="meta">${fmtSize(m.size)}</span>
      </div>`).join('');
    const fails = (data.errors || []).map((msg2) => `
      <div class="mod-item">
        <span class="name">❌ ${esc(msg2)}</span>
      </div>`).join('');
    document.getElementById('mrpackResult').innerHTML =
      `<div class="mod-item" style="background:transparent;"><span class="name">📥 成功 ${data.downloaded || 0} 个${pubText}</span></div>` +
      (data.failed ? `<div class="mod-item" style="background:transparent;"><span class="name">⚠️ 失败 ${data.failed} 个</span></div>` : '') +
      items + fails;
    toast(`导入完成：成功 ${data.downloaded || 0} 个${data.failed ? '，失败 ' + data.failed + ' 个' : ''}`, data.failed ? 'err' : 'ok');
    loadMods();
    loadReleases();
  } catch (e) {
    toast('导入失败：' + e.message, 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = '开始导入';
  }
}

// ============ API Token 管理 ============
async function loadTokens() {
  const list = document.getElementById('tokenList');
  if (!list) return;
  try {
    const data = await json('/api/admin/api-tokens');
    const tokens = data.tokens || [];
    document.getElementById('tokenCount').textContent = tokens.length;
    if (!tokens.length) { list.innerHTML = '<div class="empty">暂无 Token，可点击上方创建</div>'; return; }
    list.innerHTML = tokens.map((t) => `
      <div class="mod-item">
        <span class="name">🔑 ${esc(t.name)} <span class="oauth-chip" style="margin-left:6px;">${esc(t.prefix)}</span></span>
        <span class="meta">由 ${esc(t.createdBy)} 创建 · ${fmtTime(t.createdAt)}</span>
        <span class="ops">
          <button class="btn btn-danger btn-sm" data-revoke="${esc(t.id)}" data-name="${esc(t.name)}">撤销</button>
        </span>
      </div>`).join('');
    list.querySelectorAll('[data-revoke]').forEach((btn) => {
      btn.addEventListener('click', () => revokeToken(btn.dataset.revoke, btn.dataset.name));
    });
  } catch (e) {
    list.innerHTML = `<div class="empty">加载失败：${esc(e.message)}</div>`;
  }
}

document.getElementById('tokenCreateBtn').addEventListener('click', async () => {
  const btn = document.getElementById('tokenCreateBtn');
  const name = document.getElementById('tokenName').value.trim();
  btn.disabled = true;
  toast('正在生成 Token…', 'loading');
  try {
    const data = await json('/api/admin/api-tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    document.getElementById('newTokenVal').value = data.token;
    document.getElementById('newTokenBox').hidden = false;
    document.getElementById('tokenName').value = '';
    toast('Token 已生成，请立即复制保存', 'ok');
    loadTokens();
  } catch (e) {
    toast('生成失败：' + e.message, 'err');
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('copyTokenBtn').addEventListener('click', async () => {
  const val = document.getElementById('newTokenVal').value;
  try {
    await navigator.clipboard.writeText(val);
    toast('已复制到剪贴板', 'ok');
  } catch (_) {
    document.getElementById('newTokenVal').select();
    document.execCommand('copy');
    toast('已复制到剪贴板', 'ok');
  }
});

async function revokeToken(id, name) {
  if (!window.confirm(`确定撤销 Token "${name}"？撤销后使用该 Token 的请求将立即失效。`)) return;
  toast('正在撤销 Token…', 'loading');
  try {
    await json('/api/admin/api-tokens/' + encodeURIComponent(id), { method: 'DELETE' });
    toast('Token 已撤销', 'ok');
    loadTokens();
  } catch (e) {
    toast('撤销失败：' + e.message, 'err');
  }
}

// ============ 个人中心 ============
function loadProfile() {
  const box = document.getElementById('profileInfo');
  if (!box) return;
  if (!currentUser) { box.innerHTML = '<div class="empty">未登录</div>'; return; }
  const u = currentUser;
  const roleText = u.role === 'superadmin' || u.role === 'super' ? '超级管理员' : u.role === 'admin' ? '管理员' : '普通用户';
  const oauth = u.oauth || {};
  const chips = [];
  if (oauth.sso && oauth.sso.bound) chips.push(`<span class="oauth-chip">SSO 已绑定${oauth.sso.name ? '：' + esc(oauth.sso.name) : ''}</span>`);
  if (oauth.github && oauth.github.bound) chips.push(`<span class="oauth-chip">GitHub：${esc(oauth.github.login)}</span>`);
  if (oauth.qq && oauth.qq.bound) chips.push(`<span class="oauth-chip">QQ：${esc(oauth.qq.nickname)}</span>`);
  if (!chips.length) chips.push('<span class="pill pill-gray">未绑定任何第三方账号</span>');
  box.innerHTML = `
    <div class="mod-item" style="background:transparent;">
      <span class="name">${u.avatar_url ? `<img src="${esc(u.avatar_url)}" alt="" style="width:28px;height:28px;border-radius:50%;vertical-align:middle;margin-right:8px;">` : '👤 '}${esc(u.name)}</span>
      <span class="meta">账号：${esc(u.login)} · <span class="pill pill-green">${roleText}</span></span>
    </div>
    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">${chips.join('')}</div>`;
  document.getElementById('profileName').value = u.name || '';
  renderOauthActions(oauth);
}

function renderOauthActions(oauth) {
  const box = document.getElementById('oauthBox');
  if (!box) return;
  oauth = oauth || {};
  const actions = [];
  if (oauth.sso && oauth.sso.bound) {
    actions.push(`<button class="btn btn-danger btn-sm" id="unbindSso">解绑 SSO</button>`);
  } else {
    actions.push(`<button class="btn btn-primary btn-sm" id="bindSso">绑定 SSO 账号</button>`);
  }
  if (oauth.github && oauth.github.bound) {
    actions.push(`<button class="btn btn-danger btn-sm" id="unbindGithub">解绑 GitHub（${esc(oauth.github.login)}）</button>`);
  } else {
    actions.push(`<button class="btn btn-sm" id="bindGithub">绑定 GitHub</button>`);
  }
  if (oauth.qq && oauth.qq.bound) {
    actions.push(`<button class="btn btn-danger btn-sm" id="unbindQq">解绑 QQ（${esc(oauth.qq.nickname)}）</button>`);
  } else {
    actions.push(`<button class="btn btn-sm" id="bindQq">绑定 QQ</button>`);
  }
  box.innerHTML = `<div style="display:flex; gap:10px; flex-wrap:wrap;">${actions.join('')}</div>`;
  bindOauthBtn('bindSso', '/api/oauth/qq/bind-url');
  bindOauthBtn('bindGithub', '/api/oauth/github/bind-url');
  bindOauthBtn('bindQq', '/api/oauth/qq/bind-url');
  bindOauthBtn('unbindSso', null, 'sso');
  bindOauthBtn('unbindGithub', null, 'github');
  bindOauthBtn('unbindQq', null, 'qq');
}

function bindOauthBtn(id, url, unbindProvider) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('click', async () => {
    if (unbindProvider) {
      if (!window.confirm(`确定解绑 ${unbindProvider.toUpperCase()} 绑定？`)) return;
      try {
        await json('/api/oauth/unbind', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: unbindProvider }),
        });
        toast('已解绑', 'ok');
        refreshMe();
      } catch (e) {
        toast('解绑失败：' + e.message, 'err');
      }
      return;
    }
    try {
      const data = await json(url);
      window.location.href = data.url;
    } catch (e) {
      toast('获取绑定地址失败：' + e.message, 'err');
    }
  });
}

async function refreshMe() {
  try {
    const me = await json('/api/me');
    currentUser = me.user;
    loadProfile();
  } catch (_) { /* 忽略 */ }
}

document.getElementById('profileNameBtn').addEventListener('click', async () => {
  const name = document.getElementById('profileName').value.trim();
  if (!name) { toast('显示名不能为空', 'err'); return; }
  const btn = document.getElementById('profileNameBtn');
  btn.disabled = true;
  try {
    const data = await json('/api/me/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    currentUser = data.user;
    document.getElementById('meArea').innerHTML = `<span class="pill pill-green">✅ ${esc(data.user.name)}（管理员）</span>`;
    toast('显示名已更新', 'ok');
    loadProfile();
  } catch (e) {
    toast('保存失败：' + e.message, 'err');
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('profilePwdBtn').addEventListener('click', async () => {
  const oldPassword = document.getElementById('oldPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  if (!oldPassword) { toast('请输入当前密码', 'err'); return; }
  if (newPassword.length < 6) { toast('新密码至少 6 位', 'err'); return; }
  const btn = document.getElementById('profilePwdBtn');
  btn.disabled = true;
  try {
    await json('/api/me/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPassword, newPassword }),
    });
    document.getElementById('oldPassword').value = '';
    document.getElementById('newPassword').value = '';
    toast('密码已修改', 'ok');
  } catch (e) {
    toast('修改失败：' + e.message, 'err');
  } finally {
    btn.disabled = false;
  }
});

init();
