const app = document.getElementById('worker-app');
const TOKEN_KEY = 'zha_worker_token';

const state = {
  token: localStorage.getItem(TOKEN_KEY) || '',
  worker: null,
  tab: 'home',
};

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

const icon = (n, cls = '') => `<i class="${cls}" data-lucide="${n}"></i>`;

function paintIcons() {
  if (window.lucide) {
    window.lucide.createIcons({ attrs: { class: 'icon', 'stroke-width': '2', 'aria-hidden': 'true' } });
  }
}

function toast(msg, type = 'ok') {
  let box = document.querySelector('.toasts');
  if (!box) {
    box = document.createElement('div');
    box.className = 'toasts';
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `${icon(type === 'ok' ? 'check' : 'x')}<span>${esc(msg)}</span>`;
  box.appendChild(el);
  paintIcons();
  setTimeout(() => el.remove(), 2600);
}

async function req(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(path, { ...options, headers });
  if (res.status === 401) {
    state.token = '';
    localStorage.removeItem(TOKEN_KEY);
    renderLogin();
    throw new Error('登录已过期，请重新登录');
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) throw new Error((data && data.error) || `请求失败 (${res.status})`);
  return data;
}

const DEMO_WORKERS = [
  { name: '王建国', phone: '13800138001' },
  { name: '李伟', phone: '13800138002' },
  { name: '张强', phone: '13800138003' },
  { name: '刘洋', phone: '13800138004' },
  { name: '孙明', phone: '13800138007' },
];

// ---------- Login ----------
function renderLogin() {
  app.innerHTML = `
    <div class="login-wrap">
      <div class="login-logo">${icon('shield-check')}</div>
      <h1>智筑安监 · 工人端</h1>
      <p class="lead">刷脸考勤 · 隐患上报 · 安全微课</p>
      <div class="field">
        <label for="login-phone">手机号</label>
        <input class="input" id="login-phone" inputmode="numeric" placeholder="请输入登记手机号" />
      </div>
      <div class="chips" id="demo-chips">
        ${DEMO_WORKERS.map((w) => `<button class="chip" data-phone="${w.phone}">${esc(w.name)}</button>`).join('')}
      </div>
      <div class="login-error" id="login-error"></div>
      <button class="btn primary block" data-action="worker-login">${icon('log-in')} 登录</button>
    </div>`;
  paintIcons();
}

async function handleLogin(phone) {
  const err = document.getElementById('login-error');
  try {
    const res = await req('/api/worker/login', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    });
    state.token = res.token;
    state.worker = res.worker;
    localStorage.setItem(TOKEN_KEY, res.token);
    state.tab = 'home';
    await renderShell();
  } catch (e) {
    if (err) err.textContent = e.message;
  }
}

// ---------- Shell ----------
async function renderShell() {
  if (!state.worker) {
    try {
      const res = await req('/api/worker/me');
      state.worker = res.worker;
    } catch {
      return renderLogin();
    }
  }
  app.innerHTML = `
    <div class="app">
      <div class="topbar">
        <div style="min-width:0">
          <h1>${state.tab === 'home' ? '智筑安监' : tabTitle(state.tab)}</h1>
          <div class="sub">中矿·智慧工地示范项目</div>
        </div>
        ${state.tab === 'home' ? `<button class="back-btn" data-action="logout" title="退出">${icon('log-out')}</button>` : ''}
        ${state.tab !== 'home' ? `<button class="back-btn" data-action="go-home">${icon('chevron-left')}</button>` : ''}
      </div>
      <main class="main" id="worker-main"><div class="empty">加载中…</div></main>
      <nav class="tabbar">
        <button class="tab ${state.tab === 'home' ? 'on' : ''}" data-tab="home">${icon('bell')}<span>首页</span></button>
        <button class="tab ${state.tab === 'report' ? 'on' : ''}" data-tab="report">${icon('camera')}<span>上报</span></button>
        <button class="tab ${state.tab === 'orders' ? 'on' : ''}" data-tab="orders">${icon('clipboard-list')}<span>工单</span></button>
        <button class="tab ${state.tab === 'me' ? 'on' : ''}" data-tab="me">${icon('user')}<span>我的</span></button>
      </nav>
    </div>`;
  paintIcons();
  await loadTab();
}

function tabTitle(tab) {
  return { home: '首页', report: '隐患上报', orders: '我的工单', me: '个人中心' }[tab] || '';
}

async function loadTab() {
  const main = document.getElementById('worker-main');
  if (!main) return;
  try {
    if (state.tab === 'home') await renderHome(main);
    if (state.tab === 'report') renderReport(main);
    if (state.tab === 'orders') await renderOrders(main);
    if (state.tab === 'me') await renderMe(main);
    paintIcons();
  } catch (e) {
    main.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

// ---------- Home ----------
async function renderHome(main) {
  const [me, notices, score] = await Promise.all([
    req('/api/worker/me'),
    req('/api/worker/notices'),
    req('/api/worker/score'),
  ]);
  state.worker = me.worker;
  const w = me.worker;
  const checkedIn = w.attendance && w.attendance.check_in;
  const checkedOut = w.attendance && w.attendance.check_out;

  main.innerHTML = `
    <div class="hero">
      <div class="badge-round">${icon('hard-hat')}</div>
      <div class="name">${esc(w.name)}</div>
      <div class="role">${esc(w.crew)} · ${esc(w.job)}</div>
      <div class="stats">
        <div><b>${w.safety_score}</b><span>安全积分</span></div>
        <div><b>${checkedIn ? w.attendance.check_in : '--:--'}</b><span>今日签到</span></div>
        <div><b>${checkedOut ? w.attendance.check_out : '在岗'}</b><span>${checkedOut ? '今日签退' : '当前状态'}</span></div>
      </div>
    </div>

    <div class="card checkin-box">
      <button class="checkin-btn ${checkedIn && !checkedOut ? 'out' : ''}" data-action="checkin">
        ${checkedIn && !checkedOut ? icon('log-out') : icon('scan-face')}
      </button>
      <div style="font-size:16px;font-weight:650">${checkedIn && !checkedOut ? '点击下班签退' : checkedOut ? '今日已签退' : '点击上班签到'}</div>
      <div class="checkin-hint">${checkedOut ? '辛苦了，明天见' : '基于人脸识别的无感考勤'}</div>
    </div>

    <div class="card">
      <h3>快捷入口</h3>
      <div class="quick-grid">
        <button class="quick" data-tab="report"><span class="ic teal">${icon('camera')}</span>隐患上报</button>
        <button class="quick" data-tab="orders"><span class="ic amber">${icon('clipboard-list')}</span>我的工单</button>
        <button class="quick" data-action="courses"><span class="ic green">${icon('book-open')}</span>安全微课</button>
        <button class="quick" data-tab="me"><span class="ic red">${icon('user')}</span>个人中心</button>
      </div>
    </div>

    <div class="card">
      <h3>通知公告</h3>
      <div class="list">
        ${notices.items.map((n) => `
          <div class="list-item">
            <div class="thumb">${icon('bell')}</div>
            <div class="main"><div class="t">${esc(n.title)}</div><div class="m">${esc(n.date)}</div></div>
            ${icon('chevron-right')}
          </div>`).join('')}
      </div>
    </div>`;
}

function showScan(msg, cb) {
  const mask = document.createElement('div');
  mask.className = 'scan-ring';
  mask.innerHTML = `<div class="inner"><div class="face"></div><div>${esc(msg)}</div></div>`;
  document.body.appendChild(mask);
  setTimeout(() => {
    mask.remove();
    cb();
  }, 1400);
}

async function handleCheckin() {
  const w = state.worker;
  const checkedIn = w.attendance && w.attendance.check_in;
  const checkedOut = w.attendance && w.attendance.check_out;
  if (checkedIn && checkedOut) return toast('今日已签退，明天见');
  const type = checkedIn ? 'out' : 'in';
  showScan(type === 'in' ? '正在识别人脸…' : '正在核验离岗…', async () => {
    try {
      const res = await req('/api/worker/checkin', {
        method: 'POST',
        body: JSON.stringify({ type }),
      });
      state.worker = res.worker;
      toast(type === 'in' ? '签到成功，注意安全' : '签退成功，辛苦了');
      await renderShell();
    } catch (e) {
      toast(e.message, 'err');
    }
  });
}

// ---------- Report ----------
function renderReport(main) {
  main.innerHTML = `
    <div class="card">
      <h3>隐患随手拍</h3>
      <label class="photo-box" id="photo-box">
        <input type="file" id="photo-input" accept="image/*" />
        <div id="photo-empty">${icon('camera')}<div style="margin-top:6px">拍照或选择现场照片</div></div>
      </label>
      <div class="field">
        <label>隐患区域</label>
        <select class="input" id="rep-area">
          <option>A区脚手架</option><option>B区主体</option><option>C区料场</option>
          <option>D区基坑</option><option>E区加工区</option>
        </select>
      </div>
      <div class="field">
        <label>隐患类型</label>
        <select class="input" id="rep-type">
          <option>脚手架杆件缺失</option><option>脚手架倾斜</option><option>扣件松动</option>
          <option>未佩戴安全帽</option><option>违规作业</option><option>防护网破损</option>
        </select>
      </div>
      <div class="field">
        <label>隐患描述</label>
        <textarea class="input" id="rep-desc" placeholder="请描述隐患位置和情况"></textarea>
      </div>
      <button class="btn primary block" data-action="submit-report">${icon('navigation')} 提交上报</button>
    </div>`;

  document.getElementById('photo-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const box = document.getElementById('photo-box');
      box.classList.add('has');
      box.innerHTML = `<img src="${reader.result}" alt="现场照片" />`;
    };
    reader.readAsDataURL(file);
  });
}

async function submitReport() {
  const desc = document.getElementById('rep-desc').value.trim();
  if (!desc) return toast('请填写隐患描述', 'err');
  const body = {
    area: document.getElementById('rep-area').value,
    type: document.getElementById('rep-type').value,
    description: desc,
  };
  try {
    await req('/api/worker/reports', { method: 'POST', body: JSON.stringify(body) });
    toast('上报成功，安全员将尽快处理');
    state.tab = 'home';
    await renderShell();
  } catch (e) {
    toast(e.message, 'err');
  }
}

// ---------- Orders ----------
async function renderOrders(main) {
  const res = await req('/api/worker/orders');
  const items = res.items;
  if (!items.length) {
    main.innerHTML = `<div class="empty">${icon('clipboard-check')}<div style="margin-top:8px">暂无派发给你的工单</div></div>`;
    return;
  }
  main.innerHTML = items.map((o) => `
    <div class="card">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
        <div style="min-width:0">
          <div style="font-weight:650">${esc(o.title)}</div>
          <div class="m" style="color:#8a9592;font-size:12px;margin-top:2px">${esc(o.area)} · ${esc(o.type)}</div>
        </div>
        ${orderTag(o.status)}
      </div>
      <div style="color:#5f6c69;font-size:13px;margin:10px 0">${esc(o.description || '')}</div>
      <div style="color:#8a9592;font-size:12px;margin-bottom:12px">截止：${esc(o.deadline ? o.deadline.slice(0, 16).replace('T', ' ') : '-')}</div>
      ${orderActions(o)}
    </div>`).join('');
}

function orderTag(status) {
  const cls = { 待派发: 'gray', 整改中: 'warn', 待复核: 'info', 已销号: 'ok' }[status] || 'gray';
  return `<span class="tag ${cls}">${status}</span>`;
}

function orderActions(o) {
  if (o.status === '待派发') {
    return `<button class="btn primary sm" data-action="order-start" data-id="${o.id}">${icon('play-circle')} 开始整改</button>`;
  }
  if (o.status === '整改中') {
    return `<button class="btn primary sm" data-action="order-done" data-id="${o.id}">${icon('check')} 整改完成</button>`;
  }
  if (o.status === '已销号') {
    return `<div class="tag ok">${icon('check')} 已闭环</div>`;
  }
  return '';
}

async function updateOrder(id, status) {
  const note = status === '待复核' ? await askNote() : '';
  try {
    await req(`/api/worker/orders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, note }),
    });
    toast(status === '整改中' ? '已开始整改' : '已提交复核');
    state.tab = 'orders';
    await renderShell();
  } catch (e) {
    toast(e.message, 'err');
  }
}

function askNote() {
  return new Promise((resolve) => {
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML = `
      <div class="modal">
        <h3>整改反馈</h3>
        <textarea class="input" id="note-input" placeholder="简要说明整改情况"></textarea>
        <div class="actions">
          <button class="btn" data-action="note-cancel">取消</button>
          <button class="btn primary" data-action="note-ok">提交</button>
        </div>
      </div>`;
    document.body.appendChild(mask);
    const done = (val) => {
      mask.remove();
      resolve(val);
    };
    mask.addEventListener('click', (e) => {
      const a = e.target.closest('[data-action]');
      if (!a) return;
      if (a.dataset.action === 'note-ok') done(document.getElementById('note-input').value.trim());
      if (a.dataset.action === 'note-cancel') done('');
    });
  });
}

// ---------- Me ----------
async function renderMe(main) {
  const [me, att, score] = await Promise.all([
    req('/api/worker/me'),
    req('/api/worker/attendance'),
    req('/api/worker/score'),
  ]);
  state.worker = me.worker;
  const w = me.worker;
  main.innerHTML = `
    <div class="hero" style="margin-bottom:12px">
      <div class="badge-round">${icon('user')}</div>
      <div class="name">${esc(w.name)}</div>
      <div class="role">${esc(w.crew)} · ${esc(w.job)}</div>
      <div class="stats">
        <div><b>${w.safety_score}</b><span>安全积分</span></div>
        <div><b>${score.level}</b><span>安全等级</span></div>
      </div>
    </div>

    <div class="card">
      <h3>个人信息</h3>
      <div class="list">
        <div class="list-item"><div class="thumb">${icon('user')}</div><div class="main"><div class="t">${esc(w.name)}</div><div class="m">姓名</div></div></div>
        <div class="list-item"><div class="thumb">${icon('badge-check')}</div><div class="main"><div class="t">${esc(w.job)}</div><div class="m">工种</div></div></div>
        <div class="list-item"><div class="thumb warn">${icon('wrench')}</div><div class="main"><div class="t">${esc(w.crew)}</div><div class="m">所属班组</div></div></div>
        <div class="list-item"><div class="thumb green">${icon('smartphone')}</div><div class="main"><div class="t">${esc(w.phone)}</div><div class="m">联系电话</div></div></div>
      </div>
    </div>

    <div class="card">
      <h3>近 7 日考勤</h3>
      <div class="list">
        ${att.items.map((a) => `
          <div class="list-item">
            <div class="thumb">${icon('calendar-days')}</div>
            <div class="main"><div class="t">${esc(a.date.slice(5).replace('-', '/'))}</div><div class="m">${a.check_in ? `签到 ${a.check_in}` : '未签到'}${a.check_out ? ` · 签退 ${a.check_out}` : ''}</div></div>
            ${a.check_in ? `<span class="tag ok">已出勤</span>` : `<span class="tag gray">缺勤</span>`}
          </div>`).join('')}
      </div>
    </div>

    <div class="card">
      <h3>积分明细</h3>
      <div class="list">
        ${score.items.map((s) => `
          <div class="list-item">
            <div class="thumb ${s.delta > 0 ? 'green' : 'red'}">${icon(s.delta > 0 ? 'trophy' : 'alert-triangle')}</div>
            <div class="main"><div class="t">${esc(s.title)}</div><div class="m">${esc(s.date)}</div></div>
            <b style="color:${s.delta > 0 ? 'var(--good)' : 'var(--danger)'}">${s.delta > 0 ? '+' : ''}${s.delta}</b>
          </div>`).join('')}
      </div>
    </div>

    <button class="btn danger block" data-action="logout" style="margin-top:4px">${icon('log-out')} 退出登录</button>`;
}

// ---------- Courses ----------
async function renderCourses(main) {
  const [courses, warnings] = await Promise.all([
    req('/api/worker/courses'),
    req('/api/worker/warnings'),
  ]);
  main.innerHTML = `
    <div class="card">
      <h3>安全微课</h3>
      <div class="list">
        ${courses.items.map((c) => `
          <div class="list-item">
            <div class="thumb">${icon('play-circle')}</div>
            <div class="main">
              <div class="t">${esc(c.title)}</div>
              <div class="m">${esc(c.duration)}</div>
              <div class="progress" style="margin-top:7px"><span style="width:${c.progress}%"></span></div>
            </div>
            <span class="tag ${c.progress === 100 ? 'ok' : c.tag === '必修' ? 'warn' : 'info'}">${c.progress === 100 ? '已学' : esc(c.tag)}</span>
          </div>`).join('')}
      </div>
    </div>
    <div class="card">
      <h3>违章警示库</h3>
      <div class="list">
        ${warnings.items.map((w) => `
          <div class="list-item">
            <div class="thumb red">${icon('alert-triangle')}</div>
            <div class="main"><div class="t">${esc(w.title)}</div><div class="m">${esc(w.date)}</div></div>
            <span class="tag ${w.level === '严重' ? 'danger' : 'warn'}">${esc(w.level)}</span>
          </div>`).join('')}
      </div>
    </div>
    <button class="btn block" data-action="go-home">${icon('chevron-left')} 返回首页</button>`;
}

async function logout() {
  state.token = '';
  state.worker = null;
  localStorage.removeItem(TOKEN_KEY);
  renderLogin();
}

// ---------- Events ----------
document.addEventListener('click', async (e) => {
  const actionEl = e.target.closest('[data-action]');
  if (actionEl) {
    const action = actionEl.dataset.action;
    if (action === 'worker-login') {
      return handleLogin(document.getElementById('login-phone').value.trim());
    }
    if (action === 'logout') return logout();
    if (action === 'go-home') {
      state.tab = 'home';
      return renderShell();
    }
    if (action === 'checkin') return handleCheckin();
    if (action === 'courses') {
      state.tab = 'home';
      const main = document.getElementById('worker-main');
      await renderCourses(main);
      paintIcons();
      return;
    }
    if (action === 'submit-report') return submitReport();
    if (action === 'order-start') return updateOrder(Number(actionEl.dataset.id), '整改中');
    if (action === 'order-done') return updateOrder(Number(actionEl.dataset.id), '待复核');
  }

  const chip = e.target.closest('[data-phone]');
  if (chip) {
    document.getElementById('login-phone').value = chip.dataset.phone;
    document.querySelectorAll('#demo-chips .chip').forEach((c) => c.classList.remove('on'));
    chip.classList.add('on');
    return;
  }

  const tab = e.target.closest('[data-tab]');
  if (tab) {
    state.tab = tab.dataset.tab;
    await renderShell();
  }
});

// ---------- Boot ----------
if (state.token) {
  renderShell();
} else {
  renderLogin();
}
