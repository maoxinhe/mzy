// 错误报告上传与分析结果轮询
function esc(s) {
  const div = document.createElement('div');
  div.textContent = String(s == null ? '' : s);
  return div.innerHTML;
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
// 轻量 Markdown 渲染（用于展示 AI 分析结果）
function renderMd(md) {
  if (!md) return '';
  const lines = String(md).replace(/\r\n/g, '\n').split('\n');
  let html = '', inCode = false, codeBuf = [], listType = null;
  const flushList = () => { if (listType) { html += `</${listType}>`; listType = null; } };
  const inline = (s) => esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('```')) {
      flushList();
      if (inCode) { html += `<pre><code>${esc(codeBuf.join('\n'))}</code></pre>`; codeBuf = []; inCode = false; }
      else inCode = true;
      continue;
    }
    if (inCode) { codeBuf.push(raw); continue; }
    if (!line) { flushList(); continue; }
    if (/^#{1,4}\s/.test(line)) {
      flushList();
      const lvl = Math.min(line.match(/^#{1,4}/)[0].length + 1, 5);
      html += `<h${lvl}>${inline(line.replace(/^#{1,4}\s*/, ''))}</h${lvl}>`;
      continue;
    }
    if (/^>\s?/.test(line)) { flushList(); html += `<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`; continue; }
    if (/^[-*]\s/.test(line)) {
      if (listType !== 'ul') { flushList(); html += '<ul>'; listType = 'ul'; }
      html += `<li>${inline(line.replace(/^[-*]\s/, ''))}</li>`;
      continue;
    }
    if (/^\d+\.\s/.test(line)) {
      if (listType !== 'ol') { flushList(); html += '<ol>'; listType = 'ol'; }
      html += `<li>${inline(line.replace(/^\d+\.\s/, ''))}</li>`;
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(line)) { flushList(); html += '<hr>'; continue; }
    flushList();
    html += `<p>${inline(raw)}</p>`;
  }
  if (inCode) html += `<pre><code>${esc(codeBuf.join('\n'))}</code></pre>`;
  flushList();
  return html;
}

let pollTimer = null;
let current = null;
let codeSent = false;
let resendTimer = null;

// ---- 用户 ID 与邮箱绑定（验证一次，永久免验证码）----
function getUid() {
  let uid = null;
  try { uid = localStorage.getItem('md_er_uid'); } catch (_) {}
  if (!uid) {
    uid = 'u_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    try { localStorage.setItem('md_er_uid', uid); } catch (_) {}
  }
  return uid;
}
function getBound() {
  try { return JSON.parse(localStorage.getItem('md_er_bound') || 'null'); } catch (_) { return null; }
}
const UID = getUid();
let bound = getBound();

// 已绑定：自动填充邮箱、隐藏验证码输入，无需再验证；绑定失效时可一键恢复验证界面
function applyBoundState() {
  const emailInput = document.getElementById('email');
  const emailStatus = document.getElementById('emailStatus');
  const sendCodeBtn = document.getElementById('sendCodeBtn');
  const codeRow = document.getElementById('codeRow');
  if (bound && bound.email) {
    emailInput.value = bound.email;
    emailInput.disabled = true;
    emailStatus.textContent = '✅ 已验证邮箱 ' + bound.email + '，直接选择文件上传即可，无需再输入验证码';
    emailStatus.style.color = 'var(--ok)';
    emailStatus.hidden = false;
    sendCodeBtn.hidden = true;
    codeRow.hidden = true;
  } else {
    emailInput.disabled = false;
    emailStatus.hidden = true;
    sendCodeBtn.hidden = false;
    codeRow.hidden = true;
  }
}
function saveBound(email) {
  bound = { email, boundAt: new Date().toISOString() };
  try { localStorage.setItem('md_er_bound', JSON.stringify(bound)); } catch (_) {}
  applyBoundState();
}
function unbind() {
  bound = null;
  try { localStorage.removeItem('md_er_bound'); } catch (_) {}
  applyBoundState();
}
applyBoundState();

// 发送邮箱验证码
const sendCodeBtn = document.getElementById('sendCodeBtn');
const codeRow = document.getElementById('codeRow');
const codeInput = document.getElementById('code');
sendCodeBtn.addEventListener('click', async () => {
  const email = document.getElementById('email').value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast('请先填写格式正确的邮箱', 'err');
  sendCodeBtn.disabled = true;
  sendCodeBtn.textContent = '发送中…';
  try {
    const res = await fetch('/api/error-reports/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, id: UID, nickname: document.getElementById('nickname').value.trim() || '玩家' })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `发送失败 (${res.status})`);
    codeSent = true;
    document.getElementById('verifyEmail').textContent = email;
    codeRow.hidden = false;
    codeInput.value = '';
    codeInput.focus();
    toast('验证码已发送，请查收邮箱');
    startResendCountdown();
  } catch (err) {
    toast(err.message || '发送失败', 'err');
  } finally {
    sendCodeBtn.disabled = false;
    sendCodeBtn.textContent = resendTimer ? '重新发送' : '发送验证码';
  }
});

function startResendCountdown() {
  if (resendTimer) clearInterval(resendTimer);
  let left = 60;
  const tick = () => {
    left--;
    if (left <= 0) {
      clearInterval(resendTimer);
      resendTimer = null;
      sendCodeBtn.disabled = false;
      sendCodeBtn.textContent = '重新发送验证码';
      return;
    }
    sendCodeBtn.disabled = true;
    sendCodeBtn.textContent = `重新发送 (${left}s)`;
  };
  tick();
  resendTimer = setInterval(tick, 1000);
}

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('file');
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag');
  if (e.dataTransfer.files && e.dataTransfer.files.length) fileInput.files = e.dataTransfer.files;
  updateDropText();
});
fileInput.addEventListener('change', updateDropText);
function updateDropText() {
  const f = fileInput.files && fileInput.files[0];
  dropZone.querySelector('#dropText').textContent = f
    ? `已选择：${f.name}（${fmtSize(f.size)}）`
    : '点击选择或拖拽 <code>.zip</code> 文件到此处';
}

document.getElementById('reportForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  const file = fileInput.files && fileInput.files[0];
  if (!email) return toast('请填写邮箱', 'err');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast('邮箱格式不正确', 'err');
  if (!file) return toast('请选择要上传的 .zip 文件', 'err');
  if (!/\.zip$/i.test(file.name)) return toast('仅支持 .zip 压缩包', 'err');
  if (file.size > 20 * 1024 * 1024) return toast('文件超过 20MB 上限', 'err');

  const isBound = !!(bound && bound.email === email);
  let code = '';
  if (!isBound) {
    // 未绑定：必须提供验证码，通过后服务端会自动完成绑定
    if (!codeSent || codeRow.hidden) return toast('请先点击「发送验证码」并完成邮箱验证', 'err');
    code = codeInput.value.trim();
    if (!/^\d{6}$/.test(code)) return toast('请输入 6 位验证码', 'err');
  }

  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = '⏳ 上传中…';
  const fd = new FormData();
  fd.append('file', file);
  fd.append('email', email);
  fd.append('id', UID);
  if (code) fd.append('code', code);
  fd.append('nickname', document.getElementById('nickname').value.trim());
  fd.append('gamename', document.getElementById('gamename').value.trim());
  fd.append('description', document.getElementById('description').value.trim());
  try {
    const res = await fetch('/api/error-reports', { method: 'POST', body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `上传失败 (${res.status})`);
    // 上传成功即视为邮箱已验证，保存绑定，下次上传免验证码
    saveBound(email);
    current = data;
    showPending(data);
    startPoll(data.report_id, data.poll.token);
  } catch (err) {
    const msg = err.message || '上传失败';
    // 绑定过期/失效：解除本地绑定并恢复验证码界面，避免被防滥用逻辑卡死正常用户
    if (isBound && (msg.includes('验证码') || msg.includes('绑定'))) {
      unbind();
      toast('邮箱绑定已失效，请重新验证一次', 'err');
    } else {
      toast(msg, 'err');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = '📤 上传并开始分析';
  }
});

function showPending(data) {
  const box = document.getElementById('resultBox');
  box.hidden = false;
  document.getElementById('resultTitle').textContent = '⏳ 正在分析';
  document.getElementById('statusLine').innerHTML =
    `<span class="spin-dot"></span>报告编号 <b style="color:var(--pink-dark)">${esc(data.report_id)}</b> 已提交，已进入分析队列，通常需要 1~3 分钟…<br>你也可以直接关闭本页，分析结果会自动发送到你的邮箱。`;
  document.getElementById('resultBody').innerHTML = '';
  box.scrollIntoView({ behavior: 'smooth' });
}

function startPoll(id, token) {
  if (pollTimer) clearInterval(pollTimer);
  const tick = async () => {
    try {
      const res = await fetch(`/api/error-reports/${id}?token=${encodeURIComponent(token)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '查询失败');
      if (data.status === 'done') {
        clearInterval(pollTimer); pollTimer = null;
        renderDone(data);
      } else if (data.status === 'error') {
        clearInterval(pollTimer); pollTimer = null;
        renderError(data.error);
      } else {
        document.getElementById('statusLine').innerHTML =
          `<span class="spin-dot"></span>状态：<b>${data.status === 'processing' ? 'AI 分析中' : '排队等待中'}</b>，请稍候…`;
      }
    } catch (err) {
      // 网络波动忽略，继续轮询
    }
  };
  tick();
  pollTimer = setInterval(tick, 5000);
}

function renderDone(data) {
  const box = document.getElementById('resultBox');
  box.hidden = false;
  document.getElementById('resultTitle').textContent = '✅ 分析完成';
  document.getElementById('statusLine').innerHTML =
    data.ticket_id ? `工单编号：<b style="color:var(--pink-dark)">${esc(data.ticket_id)}</b>，结果已同步发送到你的邮箱。` : '结果已同步发送到你的邮箱。';
  document.getElementById('resultBody').innerHTML = `<div class="report-result">${renderMd(data.result)}</div>`;
  box.scrollIntoView({ behavior: 'smooth' });
}

function renderError(msg) {
  const box = document.getElementById('resultBox');
  box.hidden = false;
  document.getElementById('resultTitle').textContent = '❌ 分析失败';
  document.getElementById('statusLine').textContent = '';
  document.getElementById('resultBody').innerHTML =
    `<div class="report-result">${esc(msg || '未知错误')}<br><br>建议到 <a href="/ticket.html">工单系统</a> 提交工单，由人工协助排查。</div>`;
}
