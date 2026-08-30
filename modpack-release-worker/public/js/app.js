// 公共下载页逻辑
async function json(url, opts) {
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
  return data;
}

function toast(msg, type = 'ok') {
  const wrap = document.getElementById('toastWrap');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function fmtSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

function fmtSpeed(bps) {
  if (!bps) return '';
  const mbs = bps / 1024 / 1024;
  return mbs >= 1 ? mbs.toFixed(1) + ' MB/s' : (bps / 1024).toFixed(0) + ' KB/s';
}

function esc(s) {
  const div = document.createElement('div');
  div.textContent = String(s == null ? '' : s);
  return div.innerHTML;
}

async function loadMe() {
  try {
    const me = await json('/api/me');
    const area = document.getElementById('meArea');
    const loginBtn = document.getElementById('loginBtn');
    if (me.user) {
      const isAdmin = me.isAdmin;
      loginBtn.hidden = true;
      area.innerHTML = isAdmin
        ? `<a href="/admin.html" class="btn btn-sm">⚙ 管理后台</a> <span class="pill pill-green">${esc(me.user.name)}</span>`
        : `<span class="pill pill-gray">已登录：${esc(me.user.name)}</span>`;
    } else {
      loginBtn.hidden = false;
    }
  } catch (e) { /* ignore */ }
}

async function loadLatest() {
  try {
    const data = await json('/api/releases/latest');
    const badge = document.getElementById('verBadge');
    const sub = document.getElementById('verSub');
    const dl = document.getElementById('downloadBtn');

    const r = data.release;
    const zip = r && (r.assets || []).find((a) => a.name.toLowerCase().endsWith('.zip'));
    if (!r || !zip) {
      badge.textContent = '暂无版本';
      sub.textContent = '尚未发布任何模组包';
      return;
    }
    badge.textContent = r.tag_name;
    const when = new Date(r.published_at);
    sub.innerHTML = `发布于 ${when.toLocaleString('zh-CN')} · ${fmtSize(zip.size)} 压缩包 · <a href="${esc(r.html_url)}" target="_blank" rel="noopener">Release 详情</a>`;
    dl.hidden = false;
    dl.href = zip.browser_download_url;
    dl.textContent = `⬇ 下载最新模组包 (${r.tag_name} · ${fmtSize(zip.size)})`;
    document.getElementById('releasesLink').href = r.html_url;
  } catch (e) {
    document.getElementById('verBadge').textContent = '加载失败';
    document.getElementById('verSub').textContent = e.message;
  }
}

// 下载前对 GitHub 源站与各代理镜像测速，自动把下载按钮指向最快镜像
async function selectBestMirror() {
  const info = document.getElementById('mirrorInfo');
  const dl = document.getElementById('downloadBtn');
  if (!info || !dl || dl.hidden) return;

  let data;
  try {
    data = await json('/api/mirrors?test=1');
  } catch (e) {
    info.textContent = `镜像测速失败，使用 GitHub 源站（${e.message}）`;
    return;
  }
  const mirrors = data.mirrors || [];
  if (mirrors.length === 0) {
    info.textContent = '未获取到可用镜像，使用 GitHub 源站';
    return;
  }
  const ok = mirrors.filter((m) => m.ok).sort((a, b) => a.time_ms - b.time_ms);
  const best = ok[0] || mirrors[0];
  dl.href = best.url;
  if (best.ok) {
    info.innerHTML = `已自动选择最快镜像：<b>${esc(best.name)}</b>（${best.time_ms}ms · ${fmtSpeed(best.speed_bps)}）`;
  } else {
    info.innerHTML = `镜像测速失败，回退到 <b>${esc(best.name)}</b>（${esc(best.error || '未知错误')}）`;
  }
}

async function loadMods() {
  try {
    const data = await json('/api/mods');
    const list = document.getElementById('modList');
    if (!data.mods || data.mods.length === 0) {
      list.innerHTML = '<div class="empty">mods 文件夹暂无模组</div>';
      return;
    }
    list.innerHTML = data.mods.map((m) => `
      <div class="mod-item">
        <span class="name">📦 ${esc(m.name)}</span>
        <span class="meta">${fmtSize(m.size)}</span>
      </div>`).join('');
  } catch (e) {
    document.getElementById('modList').innerHTML = `<div class="empty">加载失败：${esc(e.message)}</div>`;
  }
}

loadMe();
loadLatest();
selectBestMirror();
loadMods();
