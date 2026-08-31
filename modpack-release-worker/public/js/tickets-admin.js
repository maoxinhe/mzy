// 工单管理后台逻辑
let currentTicket = null;

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
  setTimeout(() => el.remove(), 4500);
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

const STATUS_MAP = { new: ['新提交', 'pill-green'], replied: ['已回复', 'pill-gray'], closed: ['已关闭', 'pill-red'] };

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
    loadTickets();
    bindActions();
  } catch (e) {
    document.getElementById('needLogin').hidden = false;
    document.getElementById('needLogin').innerHTML =
      `<h2>🔒 登录失败</h2><p style="color:var(--muted)">${esc(e.message)}</p><a href="/auth/login" class="btn btn-primary">重新登录</a>`;
  }
}

async function loadTickets() {
  try {
    const data = await json('/api/admin/tickets');
    const list = document.getElementById('ticketList');
    document.getElementById('ticketCount').textContent = (data.tickets || []).length;
    if (!data.tickets || !data.tickets.length) {
      list.innerHTML = '<div class="empty">暂无工单</div>';
      return;
    }
    list.innerHTML = data.tickets.map((t) => {
      const s = STATUS_MAP[t.status] || ['未知', 'pill-gray'];
      return `
      <div class="mod-item">
        <span class="name">🎫 ${esc(t.id)} <span class="pill ${s[1]}" style="margin-left:6px;">${s[0]}</span></span>
        <span class="meta">${esc(t.nickname)} · ${esc(t.gamename)} · ${fmtTime(t.createdAt)} · ${t.replyCount} 条回复</span>
        <span class="ops">
          <button class="btn btn-blue btn-sm" data-view="${esc(t.id)}">查看/回复</button>
        </span>
      </div>`;
    }).join('');
    list.querySelectorAll('[data-view]').forEach((btn) => {
      btn.addEventListener('click', () => openTicket(btn.dataset.view));
    });
  } catch (e) {
    document.getElementById('ticketList').innerHTML = `<div class="empty">加载失败：${esc(e.message)}</div>`;
  }
}

async function openTicket(id) {
  try {
    const data = await json('/api/admin/tickets/' + encodeURIComponent(id));
    currentTicket = data.ticket;
    renderDetail();
  } catch (e) {
    toast('加载工单失败：' + e.message, 'err');
  }
}

function renderDetail() {
  const t = currentTicket;
  const s = STATUS_MAP[t.status] || ['未知', 'pill-gray'];
  const replies = (t.replies || []).map((r) => `
    <div style="background:rgba(255,255,255,.55); border:1px solid var(--border); border-radius:12px; padding:12px 16px; margin-top:10px;">
      <div style="font-size:12px; color:var(--muted); margin-bottom:4px;">管理员回复 · ${fmtTime(r.at)}</div>
      <div style="white-space:pre-wrap;">${esc(r.content)}</div>
    </div>`).join('');

  document.getElementById('detailCard').hidden = false;
  document.getElementById('detailId').textContent = `${t.id} · ${s[0]}`;
  document.getElementById('detailId').className = `pill ${s[1]}`;
  document.getElementById('detailBody').innerHTML = `
    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:6px;">
      <span class="pill pill-green">${esc(t.nickname)}</span>
      <span class="pill pill-gray">游戏名：${esc(t.gamename)}</span>
      <span class="pill pill-gray">${esc(t.email)}</span>
    </div>
    <div style="font-size:12px; color:var(--muted); margin-bottom:12px;">提交时间：${fmtTime(t.createdAt)}</div>
    <div style="background:rgba(255,255,255,.55); border:1px solid var(--border); border-radius:12px; padding:12px 16px; white-space:pre-wrap;">${esc(t.content)}</div>
    ${replies}
  `;
  document.getElementById('replyContent').value = '';
  document.getElementById('replyBtn').disabled = t.status === 'closed';
  document.getElementById('closeBtn').disabled = t.status === 'closed';
}

function bindActions() {
  document.getElementById('replyBtn').addEventListener('click', async () => {
    if (!currentTicket) return;
    const content = document.getElementById('replyContent').value.trim();
    if (!content) { toast('请输入回复内容', 'err'); return; }
    const btn = document.getElementById('replyBtn');
    btn.disabled = true;
    toast('正在发送回复邮件…', 'loading');
    try {
      const data = await json('/api/admin/tickets/' + encodeURIComponent(currentTicket.id) + '/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      currentTicket = data.ticket;
      toast('回复已发送到用户邮箱', 'ok');
      renderDetail();
      loadTickets();
    } catch (e) {
      toast('回复失败：' + e.message, 'err');
      btn.disabled = false;
    }
  });

  document.getElementById('closeBtn').addEventListener('click', async () => {
    if (!currentTicket) return;
    if (!window.confirm(`确定关闭工单 ${currentTicket.id} 吗？`)) return;
    try {
      const data = await json('/api/admin/tickets/' + encodeURIComponent(currentTicket.id) + '/close', {
        method: 'POST',
      });
      currentTicket = data.ticket;
      toast('工单已关闭', 'ok');
      renderDetail();
      loadTickets();
    } catch (e) {
      toast('关闭失败：' + e.message, 'err');
    }
  });
}

init();
