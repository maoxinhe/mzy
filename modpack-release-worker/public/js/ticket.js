// 工单提交页逻辑
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

const form = document.getElementById('ticketForm');
const verifyStep = document.getElementById('verifyStep');
const doneBox = document.getElementById('doneBox');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const nickname = document.getElementById('nickname').value.trim();
  const gamename = document.getElementById('gamename').value.trim();
  const email = document.getElementById('email').value.trim();
  const content = document.getElementById('content').value.trim();
  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  toast('正在发送验证码到你的邮箱…', 'loading');
  try {
    const data = await json('/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname, gamename, email, content }),
    });
    toast(data.message, 'ok');
    form.hidden = true;
    document.getElementById('verifyEmail').textContent = email;
    verifyStep.hidden = false;
  } catch (err) {
    toast('提交失败：' + err.message, 'err');
    btn.disabled = false;
  }
});

document.getElementById('verifyBtn').addEventListener('click', async () => {
  const email = document.getElementById('verifyEmail').textContent.trim();
  const code = document.getElementById('code').value.trim();
  const btn = document.getElementById('verifyBtn');
  if (!code) { toast('请输入验证码', 'err'); return; }
  btn.disabled = true;
  toast('正在验证并提交…', 'loading');
  try {
    const data = await json('/api/tickets/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
    });
    verifyStep.hidden = true;
    document.getElementById('doneId').textContent = data.id;
    doneBox.hidden = false;
    toast(data.message, 'ok');
  } catch (err) {
    toast('验证失败：' + err.message, 'err');
    btn.disabled = false;
  }
});

document.getElementById('code').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('verifyBtn').click();
});
