import { api } from './api.js';
import { lineChart, donutChart, barChart, hbarChart, progressRing } from './charts.js';

const app = document.getElementById('app');

const routes = {
  dashboard: { title: '安全总览', sub: 'AI 驱动的施工现场风险驾驶舱', icon: 'layout-dashboard' },
  monitor: { title: '实时监控', sub: '多路 AI 视觉监测与隐患识别', icon: 'video' },
  alerts: { title: 'AI预警中心', sub: '隐患识别、分级与处置闭环', icon: 'bell-ring' },
  orders: { title: '隐患工单', sub: '发现 - 派单 - 整改 - 复核全流程', icon: 'clipboard-list' },
  workers: { title: '人员考勤', sub: '班组人员与安全积分管理', icon: 'users' },
  analytics: { title: '数据统计', sub: '隐患趋势与安全管理效能分析', icon: 'bar-chart-3' },
  settings: { title: '系统设置', sub: 'AI 识别阈值与预警策略', icon: 'settings' },
};

const filters = {
  alerts: { severity: '', status: '', q: '' },
  orders: { status: '', q: '' },
};

let authView = 'login';

const typeColors = {
  '未佩戴安全帽': '#f87171',
  '脚手架杆件缺失': '#fbbf24',
  '脚手架倾斜': '#fb923c',
  '扣件松动': '#38bdf8',
  '违规作业': '#a78bfa',
  '防护网破损': '#34d399',
  '基坑边坡位移': '#e879f9',
};

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

const icon = (n, cls = '') => `<i class="${cls}" data-lucide="${n}"></i>`;

function paintIcons() {
  if (window.lucide) {
    window.lucide.createIcons({ attrs: { class: 'icon', 'stroke-width': '1.8', 'aria-hidden': 'true' } });
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
  el.innerHTML = `${icon(type === 'ok' ? 'circle-check' : 'circle-x')}<span>${esc(msg)}</span>`;
  box.appendChild(el);
  paintIcons();
  setTimeout(() => el.remove(), 2800);
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return new Date(iso).toLocaleDateString('zh-CN');
}

function fmtTime(iso) {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function sevIcon(type) {
  if (type === '未佩戴安全帽') return 'hard-hat';
  if (type === '脚手架倾斜') return 'scan-line';
  if (type === '脚手架杆件缺失') return 'wrench';
  if (type === '扣件松动') return 'activity';
  if (type === '防护网破损') return 'alert-triangle';
  if (type === '基坑边坡位移') return 'map-pin';
  return 'bell-ring';
}

function sevFeedClass(type) {
  if (['未佩戴安全帽', '脚手架倾斜', '脚手架杆件缺失', '基坑边坡位移'].includes(type)) return 'danger';
  if (['扣件松动', '防护网破损'].includes(type)) return 'warn';
  return 'info';
}

function badge(text) {
  return `<span class="badge ${esc(text)}">${esc(text)}</span>`;
}

// ---------- Login ----------
function loginTemplate() {
  return `
    <div class="login-wrap">
      <div class="login-card">
        <div class="login-brand">
          <div class="login-logo">${icon('shield-check')}</div>
          <div><h1>智筑安监</h1><p>智慧工地安全管控平台</p></div>
        </div>
        <h2>登录管理后台</h2>
        <p class="login-sub">基于 AI 视觉的脚手架隐患识别与闭环管控</p>
        <div class="field">
          <label for="login-user">账号</label>
          <input class="input" id="login-user" autocomplete="username" placeholder="请输入账号" />
        </div>
        <div class="field">
          <label for="login-pass">密码</label>
          <input class="input" id="login-pass" type="password" autocomplete="current-password" placeholder="请输入密码" />
        </div>
        <div class="login-hint">${icon('badge-check')} 演示账号 admin / admin123</div>
        <div class="login-error" id="login-error"></div>
        <button class="btn primary" style="width:100%" id="login-btn" data-action="login">
          ${icon('log-in')} 进入平台
        </button>
        <div style="margin-top:14px;text-align:center;font-size:13px;color:#647a76">
          没有账号？<a href="javascript:;" data-action="show-register" style="color:#2dd4bf">立即注册</a>
        </div>
      </div>
    </div>`;
}

function registerTemplate() {
  return `
    <div class="login-wrap">
      <div class="login-card">
        <div class="login-brand">
          <div class="login-logo">${icon('shield-check')}</div>
          <div><h1>智筑安监</h1><p>智慧工地安全管控平台</p></div>
        </div>
        <h2>注册账号</h2>
        <p class="login-sub">创建管理员账号，用于登录安全管控后台</p>
        <div class="field">
          <label for="reg-user">账号</label>
          <input class="input" id="reg-user" autocomplete="username" placeholder="3-20 位字母、数字或下划线" />
        </div>
        <div class="field">
          <label for="reg-name">姓名</label>
          <input class="input" id="reg-name" autocomplete="name" placeholder="用于后台显示" />
        </div>
        <div class="field">
          <label for="reg-pass">密码</label>
          <input class="input" id="reg-pass" type="password" autocomplete="new-password" placeholder="至少 6 位" />
        </div>
        <div class="field">
          <label for="reg-pass2">确认密码</label>
          <input class="input" id="reg-pass2" type="password" autocomplete="new-password" placeholder="再次输入密码" />
        </div>
        <div class="login-error" id="reg-error"></div>
        <button class="btn primary" style="width:100%" id="reg-btn" data-action="register">
          ${icon('user-plus')} 注册并登录
        </button>
        <div style="margin-top:14px;text-align:center;font-size:13px;color:#647a76">
          已有账号？<a href="javascript:;" data-action="show-login" style="color:#2dd4bf">返回登录</a>
        </div>
      </div>
    </div>`;
}

async function handleLogin() {
  const u = document.getElementById('login-user').value.trim();
  const p = document.getElementById('login-pass').value;
  const err = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');
  btn.disabled = true;
  try {
    const res = await api.login(u, p);
    api.setToken(res.token);
    location.hash = '#/dashboard';
    render();
  } catch (e) {
    err.textContent = e.message;
    btn.disabled = false;
  }
}

async function handleRegister() {
  const username = document.getElementById('reg-user').value.trim();
  const name = document.getElementById('reg-name').value.trim();
  const password = document.getElementById('reg-pass').value;
  const password2 = document.getElementById('reg-pass2').value;
  const err = document.getElementById('reg-error');
  const btn = document.getElementById('reg-btn');
  if (password !== password2) {
    err.textContent = '两次输入的密码不一致';
    return;
  }
  btn.disabled = true;
  try {
    const res = await api.register(username, password, name);
    api.setToken(res.token);
    authView = 'login';
    location.hash = '#/dashboard';
    render();
    toast('注册成功，欢迎使用');
  } catch (e) {
    err.textContent = e.message;
    btn.disabled = false;
  }
}

// ---------- Shell ----------
function shellTemplate(route) {
  const nav = [
    ['dashboard', '总览驾驶舱', 'layout-dashboard'],
    ['monitor', '实时监控', 'video'],
    ['alerts', 'AI预警中心', 'bell-ring'],
    ['orders', '隐患工单', 'clipboard-list'],
    ['workers', '人员考勤', 'users'],
    ['analytics', '数据统计', 'bar-chart-3'],
    ['settings', '系统设置', 'settings'],
  ];
  const items = nav.map(([key, label, ic]) => `
    <button class="nav-item ${key === route.key ? 'active' : ''}" data-nav="${key}">
      ${icon(ic)}<span>${label}</span>
    </button>`).join('');

  return `
    <div class="shell">
      <aside class="sidebar" id="sidebar">
        <div class="side-head">
          <div class="side-logo">${icon('shield-check')}</div>
          <div><strong>智筑安监</strong><span>SMART SITE GUARD</span></div>
        </div>
        <div class="side-nav">
          <div class="nav-group">安全管控</div>
          ${items}
        </div>
        <div class="side-foot">
          <div class="user-box">
            <div class="avatar">管</div>
            <div class="meta"><strong>系统管理员</strong><span>项目经理 · 在线</span></div>
            <button class="icon-btn" data-action="logout" title="退出登录">${icon('log-out')}</button>
          </div>
        </div>
      </aside>
      <div class="main">
        <header class="topbar">
          <button class="icon-btn menu-toggle" data-action="toggle-sidebar">${icon('menu')}</button>
          <div>
            <h1>${esc(route.title)}</h1>
            <div class="crumb">${esc(route.sub)}</div>
          </div>
          <div class="spacer"></div>
          <select class="site-select" title="当前项目">
            <option>中矿·智慧工地示范项目</option>
            <option>城东高层住宅项目</option>
            <option>科技园综合楼项目</option>
          </select>
          <div class="top-clock" id="top-clock"></div>
          <button class="icon-btn" data-action="refresh" title="刷新">${icon('refresh-cw')}</button>
        </header>
        <main class="page" id="view">
          <div class="empty">${icon('loader-circle')} 正在加载…</div>
        </main>
      </div>
    </div>`;
}

// ---------- Views ----------
function kpiCards(k) {
  const cards = [
    ['今日告警', k.todayAlerts, '起', '较昨日 ' + (k.todayAlerts > 4 ? '-2' : '持平'), 'bell-ring', 'danger'],
    ['待处理隐患', k.openAlerts, '项', '需尽快处置', 'alert-triangle', 'warn'],
    ['在线施工人员', k.activeWorkers, '人', '共 8 人', 'users', ''],
    ['待办工单', k.pendingOrders, '单', '闭环进行中', 'clipboard-list', ''],
    ['本周整改率', k.completionRate, '%', '闭环处置效率', 'circle-check', 'good'],
    ['识别准确率', k.accuracy, '%', 'YOLOv8 模型', 'scan-line', 'good'],
  ];
  return cards.map(([name, value, unit, foot, ic, tone]) => `
    <div class="panel kpi ${tone}">
      <div class="top"><span>${name}</span>${icon(ic)}</div>
      <div class="value">${value}<small>${unit}</small></div>
      <div class="foot">${foot}</div>
    </div>`).join('');
}

function dashboardTemplate(d) {
  const feed = d.recent.map((a) => `
    <div class="feed-item">
      <div class="feed-icon ${sevFeedClass(a.type)}">${icon(sevIcon(a.type))}</div>
      <div class="feed-main">
        <div class="title">${esc(a.type)} · ${esc(a.area)}</div>
        <div class="meta">${esc(a.camera_name || '')} · ${timeAgo(a.detected_at)}</div>
      </div>
      ${badge(a.severity)}
    </div>`).join('');

  const areaBars = hbarChart(d.areaRisk.map((a) => ({
    name: a.area,
    value: a.score,
    color: a.score >= 80 ? '#34d399' : a.score >= 60 ? '#fbbf24' : '#f87171',
  })));

  const donutData = d.distribution.map((x) => ({
    name: x.name, value: x.value, color: typeColors[x.name] || '#64748b',
  }));

  return `
    <div class="page-head">
      <div><h2>安全总览</h2><p class="sub">更新时间 ${timeAgo(d.updatedAt)}</p></div>
      <div class="head-actions">
        <span class="tag tag-ok">${icon('circle-check')} 系统运行正常</span>
        <button class="btn" data-action="refresh">${icon('refresh-cw')} 刷新</button>
      </div>
    </div>
    <div class="grid kpi-grid">${kpiCards(d.kpis)}</div>
    <div class="grid row-2" style="margin-top:16px">
      <div class="panel">
        <div class="panel-head">
          <h3>近 7 日隐患趋势</h3>
          <div class="legend">
            <span><i class="dot" style="background:#f87171"></i>严重</span>
            <span><i class="dot" style="background:#fbbf24"></i>一般</span>
            <span><i class="dot" style="background:#38bdf8"></i>轻微</span>
          </div>
        </div>
        <div class="panel-body"><div id="trend-chart"></div></div>
      </div>
      <div class="panel">
        <div class="panel-head"><h3>隐患类型分布</h3><span class="note">近 30 日</span></div>
        <div class="panel-body" id="dist-body"></div>
      </div>
    </div>
    <div class="grid row-3" style="margin-top:16px">
      <div class="panel">
        <div class="panel-head"><h3>实时告警流</h3><button class="btn sm" data-nav="alerts">查看全部</button></div>
        <div class="panel-body feed">${feed}</div>
      </div>
      <div class="panel">
        <div class="panel-head"><h3>区域安全指数</h3><span class="note">分数越低风险越高</span></div>
        <div class="panel-body" id="area-bars">${areaBars}</div>
      </div>
      <div class="panel">
        <div class="panel-head"><h3>设备在线状态</h3><span class="note">${d.cameras.filter((c) => c.status === '在线').length}/${d.cameras.length} 在线</span></div>
        <div class="panel-body" id="cam-list">
          ${d.cameras.map((c) => `
            <div class="feed-item">
              <div class="feed-icon ${c.status === '在线' ? 'good' : 'danger'}">${icon('video')}</div>
              <div class="feed-main">
                <div class="title">${esc(c.name)}</div>
                <div class="meta">${esc(c.area)} · ${c.resolution}</div>
              </div>
              <span class="tag ${c.status === '在线' ? 'tag-ok' : 'status-已忽略'}">${c.status}</span>
            </div>`).join('')}
        </div>
      </div>
    </div>`;
}

function renderDashboard(el, d) {
  el.innerHTML = dashboardTemplate(d);
  document.getElementById('trend-chart').innerHTML = lineChart({
    labels: d.trend.map((t) => t.date),
    series: [
      { name: '严重', color: '#f87171', values: d.trend.map((t) => t.severe) },
      { name: '一般', color: '#fbbf24', values: d.trend.map((t) => t.normal) },
      { name: '轻微', color: '#38bdf8', values: d.trend.map((t) => t.minor) },
    ],
    area: false,
  });
  document.getElementById('dist-body').innerHTML = `
    <div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap">
      ${donutChart(d.distribution.map((x) => ({ name: x.name, value: x.value, color: typeColors[x.name] || '#64748b' })))}
      <div class="legend" style="flex-direction:column;gap:8px">
        ${d.distribution.map((x) => `
          <span><i class="dot" style="background:${typeColors[x.name] || '#64748b'}"></i>${esc(x.name)} · ${x.value}</span>`).join('')}
      </div>
    </div>`;
}

// ---------- Monitoring ----------
function drawScene(canvas, cam) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const W = rect.width;
  const H = rect.height;

  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.62);
  sky.addColorStop(0, '#151d22');
  sky.addColorStop(1, '#1b2426');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H * 0.62);

  ctx.fillStyle = '#20272b';
  ctx.fillRect(0, H * 0.4, W, H * 0.04);
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = i % 2 ? '#242c2f' : '#1c2326';
    ctx.fillRect(i * (W / 9), H * 0.3, W / 9, H * 0.1);
  }

  ctx.fillStyle = '#111617';
  ctx.fillRect(0, H * 0.62, W, H * 0.38);
  ctx.strokeStyle = '#2a3434';
  ctx.lineWidth = 1;
  for (let y = H * 0.68; y < H; y += H * 0.07) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  const px = [W * 0.08, W * 0.2, W * 0.32, W * 0.44, W * 0.56, W * 0.68, W * 0.8, W * 0.92];
  const top = H * 0.18;
  const bottom = H * 0.7;
  ctx.strokeStyle = '#59645f';
  ctx.lineWidth = Math.max(2, W / 260);
  px.forEach((x) => {
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
  });
  const bars = [H * 0.28, H * 0.4, H * 0.52, H * 0.64];
  bars.forEach((y) => {
    ctx.beginPath();
    ctx.moveTo(px[0], y);
    ctx.lineTo(px[px.length - 1], y);
    ctx.stroke();
  });
  ctx.strokeStyle = 'rgba(89,100,95,0.65)';
  ctx.lineWidth = 1;
  for (let i = 1; i < px.length; i += 2) {
    ctx.beginPath();
    ctx.moveTo(px[i], top);
    ctx.lineTo(px[i + 1], top + (bottom - top) * 0.35);
    ctx.stroke();
  }

  const workers = [];
  const count = cam.id % 2 === 0 ? 3 : 4;
  for (let i = 0; i < count; i++) {
    const wx = W * (0.16 + i * 0.22) + (cam.id * 7) % (W * 0.06);
    const noHelmet = cam.id % 3 === 1 && i === count - 1;
    workers.push({ x: wx, y: H * 0.75, noHelmet });
  }
  const body = '#3f4a48';
  workers.forEach((w) => {
    ctx.fillStyle = body;
    ctx.fillRect(w.x - 5, w.y - 22, 10, 16);
    ctx.strokeStyle = '#2d3634';
    ctx.beginPath();
    ctx.moveTo(w.x - 3, w.y - 6);
    ctx.lineTo(w.x - 7, w.y);
    ctx.moveTo(w.x + 3, w.y - 6);
    ctx.lineTo(w.x + 7, w.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w.x, w.y - 29, 5.5, 0, Math.PI * 2);
    if (w.noHelmet) {
      ctx.fillStyle = '#c99a72';
    } else {
      ctx.fillStyle = '#fbbf24';
    }
    ctx.fill();
  });

  ctx.font = `${Math.max(8, W / 42)}px "Segoe UI","Microsoft YaHei",sans-serif`;
  workers.forEach((w) => {
    const bx = w.x - 14;
    const by = w.y - 36;
    const bw = 28;
    const bh = 42;
    if (w.noHelmet) {
      ctx.strokeStyle = '#f87171';
      ctx.fillStyle = 'rgba(248,113,113,0.16)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeRect(bx, by, bw, bh);
      ctx.fillStyle = '#f87171';
      ctx.fillText('未戴安全帽 0.91', bx, by - 4);
    } else {
      ctx.strokeStyle = '#34d399';
      ctx.fillStyle = 'rgba(52,211,153,0.14)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeRect(bx, by, bw, bh);
      ctx.fillStyle = '#34d399';
      ctx.fillText('安全帽 0.96', bx, by - 4);
    }
  });

  if (cam.risk !== '正常') {
    ctx.strokeStyle = '#f87171';
    ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(248,113,113,0.16)';
    const bx = W * 0.42;
    const by = H * 0.3;
    const bw = W * 0.2;
    const bh = H * 0.28;
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeRect(bx, by, bw, bh);
    ctx.fillStyle = '#f87171';
    ctx.fillText('杆件缺失 0.88', bx, by - 5);
  }
}

function monitorTemplate(cams) {
  return `
    <div class="page-head">
      <div><h2>实时监控</h2><p class="sub">${cams.filter((c) => c.status === '在线').length}/${cams.length} 路在线 · YOLOv8 实时推理</p></div>
      <div class="head-actions">
        <span class="tag tag-ok">${icon('activity')} AI 识别运行中</span>
        <button class="btn" data-action="refresh">${icon('refresh-cw')} 刷新</button>
      </div>
    </div>
    <div class="grid cam-grid">
      ${cams.map((c) => `
        <div class="panel cam ${c.status === '离线' ? 'offline' : ''}">
          <div class="cam-screen">
            <canvas data-cam="${c.id}"></canvas>
            <div class="cam-osd">
              <span class="live">LIVE</span><span>${esc(c.name)}</span>
              <span class="ts">--:--:--</span>
            </div>
          </div>
          <div class="cam-info">
            <div><strong>${esc(c.name)}</strong><div class="meta">${esc(c.area)} · ${c.resolution} · ${c.fps}fps</div></div>
            <span class="tag ${c.status === '在线' ? 'tag-ok' : 'status-已忽略'}">${c.status}</span>
          </div>
        </div>`).join('')}
    </div>`;
}

function renderMonitor(el, cams) {
  el.innerHTML = monitorTemplate(cams);
  el.querySelectorAll('canvas[data-cam]').forEach((canvas) => {
    const cam = cams.find((c) => c.id === Number(canvas.dataset.cam));
    drawScene(canvas, cam);
  });
  window.addEventListener('resize', redrawMonitor);
  startClock();
}

let monitorCams = [];
let osdTimer = null;
function redrawMonitor() {
  document.querySelectorAll('canvas[data-cam]').forEach((canvas) => {
    const cam = monitorCams.find((c) => c.id === Number(canvas.dataset.cam));
    if (cam) drawScene(canvas, cam);
  });
}

function startClock() {
  const tick = () => document.querySelectorAll('.cam-osd .ts').forEach((el) => {
    const now = new Date();
    el.textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  });
  tick();
  if (osdTimer) clearInterval(osdTimer);
  osdTimer = setInterval(tick, 1000);
}

// ---------- Alerts ----------
function alertsTemplate(items) {
  const sevs = ['', '严重', '一般', '轻微'];
  const statuses = ['', '待处理', '已处理', '已忽略'];
  const rows = items.map((a) => `
    <tr>
      <td class="cell-main">${esc(a.type)}</td>
      <td>${esc(a.area)}</td>
      <td class="cell-sub">${esc(a.camera_name || '-')}</td>
      <td>${badge(a.severity)}</td>
      <td class="cell-sub">${(a.confidence * 100).toFixed(0)}%</td>
      <td>${badge(a.status)}</td>
      <td class="cell-sub">${fmtTime(a.detected_at)}</td>
      <td style="white-space:nowrap">
        <button class="btn sm" data-action="alert-detail" data-id="${a.id}">${icon('eye')} 详情</button>
        ${a.status === '待处理' ? `
          <button class="btn sm" data-action="alert-order" data-id="${a.id}">${icon('clipboard-check')} 转工单</button>
          <button class="btn sm danger" data-action="alert-ignore" data-id="${a.id}">${icon('circle-x')} 忽略</button>` : ''}
      </td>
    </tr>`).join('');
  return `
    <div class="page-head">
      <div><h2>AI预警中心</h2><p class="sub">共 ${items.length} 条记录 · 按识别置信度排序展示</p></div>
      <div class="head-actions"><button class="btn primary" data-action="refresh">${icon('refresh-cw')} 刷新</button></div>
    </div>
    <div class="filter-bar">
      <div class="seg" id="sev-seg">
        ${sevs.map((s, i) => `<button class="${filters.alerts.severity === s ? 'on' : ''}" data-filter="alerts.severity" data-value="${s}">${s || '全部级别'}</button>`).join('')}
      </div>
      <div class="seg" id="status-seg">
        ${statuses.map((s) => `<button class="${filters.alerts.status === s ? 'on' : ''}" data-filter="alerts.status" data-value="${s}">${s || '全部状态'}</button>`).join('')}
      </div>
      <div class="spacer"></div>
      <div class="search">${icon('search')}<input class="input" id="alert-search" placeholder="搜索类型 / 区域" /></div>
    </div>
    <div class="panel">
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>隐患类型</th><th>区域</th><th>摄像头</th><th>级别</th><th>置信度</th><th>状态</th><th>识别时间</th><th>操作</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="8"><div class="empty">暂无匹配记录</div></td></tr>`}</tbody>
        </table>
      </div>
    </div>`;
}

async function renderAlerts(el) {
  const params = {
    severity: filters.alerts.severity,
    status: filters.alerts.status,
    q: filters.alerts.q || '',
  };
  const res = await api.alerts(params);
  el.innerHTML = alertsTemplate(res.items);
  document.getElementById('alert-search')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      filters.alerts.q = e.target.value.trim();
      render();
    }
  });
}

// ---------- Orders ----------
const orderFlow = {
  '待派发': '整改中',
  '整改中': '待复核',
  '待复核': '已销号',
};
const orderActionLabel = {
  '待派发': '派单',
  '整改中': '整改完成',
  '待复核': '复核通过',
};

function ordersTemplate(items) {
  const tabs = ['', '待派发', '整改中', '待复核', '已销号'];
  const rows = items.map((o) => `
    <tr>
      <td><div class="cell-main">${esc(o.title)}</div><div class="cell-sub">${esc(o.description || '')}</div></td>
      <td>${esc(o.area)}</td>
      <td>${esc(o.type)}</td>
      <td>${badge(o.priority)}</td>
      <td>${esc(o.assignee || '未指派')}</td>
      <td class="cell-sub">${fmtTime(o.created_at)}</td>
      <td>${badge(o.status)}</td>
      <td style="white-space:nowrap">
        ${o.status !== '已销号' ? `
          <button class="btn sm primary" data-action="order-advance" data-id="${o.id}" data-status="${orderFlow[o.status]}">${icon('arrow-right')} ${orderActionLabel[o.status]}</button>` : `<span class="tag tag-ok">${icon('check')} 已闭环</span>`}
      </td>
    </tr>`).join('');
  return `
    <div class="page-head">
      <div><h2>隐患工单</h2><p class="sub">全流程数字化闭环 · 共 ${items.length} 单</p></div>
      <div class="head-actions"><button class="btn primary" data-action="new-order">${icon('plus')} 新建工单</button></div>
    </div>
    <div class="filter-bar">
      <div class="seg">
        ${tabs.map((s) => `<button class="${filters.orders.status === s ? 'on' : ''}" data-filter="orders.status" data-value="${s}">${s || '全部'}</button>`).join('')}
      </div>
      <div class="spacer"></div>
      <div class="search">${icon('search')}<input class="input" id="order-search" placeholder="搜索工单 / 区域 / 负责人" /></div>
    </div>
    <div class="panel">
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>工单</th><th>区域</th><th>类型</th><th>优先级</th><th>负责人</th><th>创建时间</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="8"><div class="empty">暂无工单</div></td></tr>`}</tbody>
        </table>
      </div>
    </div>`;
}

async function renderOrders(el) {
  const res = await api.workorders({ status: filters.orders.status, q: filters.orders.q || '' });
  el.innerHTML = ordersTemplate(res.items);
  document.getElementById('order-search')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      filters.orders.q = e.target.value.trim();
      render();
    }
  });
}

// ---------- Workers ----------
function workersTemplate(items) {
  const onDuty = items.filter((w) => w.status === '在岗').length;
  const helmetOk = items.filter((w) => w.helmet === '已佩戴').length;
  const rows = items.map((w) => {
    const att = w.attendance;
    return `
      <tr>
        <td><div class="cell-main">${esc(w.name)}</div><div class="cell-sub">${esc(w.phone)}</div></td>
        <td>${esc(w.crew)}</td>
        <td>${esc(w.job)}</td>
        <td>${att ? att.check_in : '--:--'} / ${att ? (att.check_out || '在岗') : '--:--'}</td>
        <td><span class="tag ${w.status === '在岗' ? 'tag-ok' : 'status-已忽略'}">${w.status}</span></td>
        <td><span class="tag ${w.helmet === '已佩戴' ? 'tag-ok' : 'sev-严重'}">${w.helmet}</span></td>
        <td>
          <div class="score-cell">
            <span class="num">${w.safety_score}</span>
            <div class="progress" style="flex:1"><span style="width:${w.safety_score}%;background:${w.safety_score >= 85 ? '#34d399' : w.safety_score >= 70 ? '#fbbf24' : '#f87171'}"></span></div>
          </div>
        </td>
      </tr>`;
  }).join('');
  return `
    <div class="page-head">
      <div><h2>人员考勤</h2><p class="sub">人脸识别考勤 · 安全帽佩戴监测 · 安全积分激励</p></div>
      <div class="head-actions"><button class="btn primary" data-action="refresh">${icon('refresh-cw')} 刷新</button></div>
    </div>
    <div class="grid kpi-grid">
      <div class="panel kpi"><div class="top"><span>在岗人数</span>${icon('users')}</div><div class="value">${onDuty}<small>人</small></div><div class="foot">共 ${items.length} 人</div></div>
      <div class="panel kpi good"><div class="top"><span>今日出勤</span>${icon('calendar-days')}</div><div class="value">${items.filter((w) => w.attendance).length}<small>人</small></div><div class="foot">人脸签到完成</div></div>
      <div class="panel kpi warn"><div class="top"><span>安全帽佩戴率</span>${icon('hard-hat')}</div><div class="value">${Math.round((helmetOk / items.length) * 100)}<small>%</small></div><div class="foot">${items.length - helmetOk} 人未佩戴</div></div>
      <div class="panel kpi"><div class="top"><span>平均安全积分</span>${icon('badge-check')}</div><div class="value">${Math.round(items.reduce((s, w) => s + w.safety_score, 0) / items.length)}<small>分</small></div><div class="foot">行为积分激励体系</div></div>
      <div class="panel kpi"><div class="top"><span>严重违章</span>${icon('alert-triangle')}</div><div class="value">2<small>起</small></div><div class="foot">本周已纠正 5 起</div></div>
      <div class="panel kpi good"><div class="top"><span>今日工时</span>${icon('timer')}</div><div class="value">52.5<small>h</small></div><div class="foot">自动统计在岗工时</div></div>
    </div>
    <div class="panel" style="margin-top:16px">
      <div class="panel-head"><h3>班组人员台账</h3><span class="note">今日考勤状态</span></div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>姓名</th><th>班组</th><th>工种</th><th>签到 / 签退</th><th>在岗状态</th><th>安全帽</th><th>安全积分</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

// ---------- Analytics ----------
function analyticsTemplate(a) {
  const donutData = a.distribution.map((x) => ({ name: x.name, value: x.value, color: typeColors[x.name] || '#64748b' }));
  return `
    <div class="page-head">
      <div><h2>数据统计</h2><p class="sub">安全态势多维分析与闭环效能评估</p></div>
      <div class="head-actions"><button class="btn" data-action="refresh">${icon('refresh-cw')} 刷新</button></div>
    </div>
    <div class="grid row-2">
      <div class="panel">
        <div class="panel-head"><h3>近 30 日隐患趋势</h3><div class="legend"><span><i class="dot" style="background:#2dd4bf"></i>全部</span><span><i class="dot" style="background:#f87171"></i>严重</span></div></div>
        <div class="panel-body"><div id="an-trend"></div></div>
      </div>
      <div class="panel">
        <div class="panel-head"><h3>隐患类型分布</h3><span class="note">累计</span></div>
        <div class="panel-body"><div id="an-dist"></div></div>
      </div>
    </div>
    <div class="grid row-3" style="margin-top:16px">
      <div class="panel">
        <div class="panel-head"><h3>区域风险排名</h3><span class="note">隐患数量</span></div>
        <div class="panel-body"><div id="an-area"></div></div>
      </div>
      <div class="panel">
        <div class="panel-head"><h3>工单状态分布</h3></div>
        <div class="panel-body"><div id="an-order"></div></div>
      </div>
      <div class="panel">
        <div class="panel-head"><h3>安全帽佩戴合规率</h3></div>
        <div class="panel-body" style="display:flex;align-items:center;gap:20px;justify-content:center">
          ${progressRing(Math.round((a.helmet.ok / a.helmet.total) * 100), { size: 132 })}
          <div class="legend" style="flex-direction:column;gap:8px">
            <span><i class="dot" style="background:#34d399"></i>已佩戴 ${a.helmet.ok} 人</span>
            <span><i class="dot" style="background:#f87171"></i>未佩戴 ${a.helmet.total - a.helmet.ok} 人</span>
          </div>
        </div>
      </div>
    </div>
    <div class="grid" style="margin-top:16px">
      <div class="panel">
        <div class="panel-head"><h3>周隐患闭环情况</h3><div class="legend"><span><i class="dot" style="background:#38bdf8"></i>新建工单</span><span><i class="dot" style="background:#34d399"></i>完成销号</span></div></div>
        <div class="panel-body"><div id="an-weekly"></div></div>
      </div>
    </div>`;
}

function renderAnalytics(el, a) {
  el.innerHTML = analyticsTemplate(a);
  document.getElementById('an-trend').innerHTML = lineChart({
    labels: a.trend.map((t) => t.date),
    series: [
      { name: '全部', color: '#2dd4bf', values: a.trend.map((t) => t.total), areaColor: 'rgba(45,212,191,0.10)' },
      { name: '严重', color: '#f87171', values: a.trend.map((t) => t.severe) },
    ],
    area: true,
  });
  document.getElementById('an-dist').innerHTML = `
    <div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap">
      ${donutChart(a.distribution.map((x) => ({ name: x.name, value: x.value, color: typeColors[x.name] || '#64748b' })))}
      <div class="legend" style="flex-direction:column;gap:8px">
        ${a.distribution.map((x) => `<span><i class="dot" style="background:${typeColors[x.name] || '#64748b'}"></i>${esc(x.name)} · ${x.value}</span>`).join('')}
      </div>
    </div>`;
  document.getElementById('an-area').innerHTML = hbarChart(
    a.areaStats.map((x) => ({ name: x.area, value: x.total, color: '#38bdf8' }))
  );
  const orderColors = { '待派发': '#64748b', '整改中': '#fbbf24', '待复核': '#38bdf8', '已销号': '#34d399' };
  document.getElementById('an-order').innerHTML = hbarChart(
    a.orderStatus.map((x) => ({ name: x.name, value: x.value, color: orderColors[x.name] || '#64748b' }))
  );
  document.getElementById('an-weekly').innerHTML = lineChart({
    labels: a.weekly.map((w) => w.date),
    series: [
      { name: '新建工单', color: '#38bdf8', values: a.weekly.map((w) => w.opened) },
      { name: '完成销号', color: '#34d399', values: a.weekly.map((w) => w.closed) },
    ],
  });
}

// ---------- Settings ----------
function settingsTemplate(s) {
  const bool = (v) => (v === 'true');
  return `
    <div class="page-head">
      <div><h2>系统设置</h2><p class="sub">AI 识别阈值与预警策略配置</p></div>
    </div>
    <div class="panel" style="max-width:760px">
      <div class="panel-head"><h3>识别参数</h3><span class="note">修改后立即生效</span></div>
      <div class="panel-body">
        <div class="field">
          <label for="set-helmet">安全帽识别置信度阈值</label>
          <input class="input" id="set-helmet" value="${esc(s.helmet_threshold)}" />
        </div>
        <div class="field">
          <label for="set-tilt">架体倾斜判定阈值（°）</label>
          <input class="input" id="set-tilt" value="${esc(s.scaffold_tilt_threshold)}" />
        </div>
        <div class="field">
          <label for="set-member">杆件缺失判定阈值</label>
          <input class="input" id="set-member" value="${esc(s.member_missing_threshold)}" />
        </div>
        <div class="field">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="checkbox" id="set-autoclose" ${bool(s.alert_auto_close) ? 'checked' : ''} /> 整改完成后自动销号
          </label>
        </div>
        <div class="field">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="checkbox" id="set-push" ${bool(s.alert_push) ? 'checked' : ''} /> 严重隐患实时推送提醒
          </label>
        </div>
        <button class="btn primary" data-action="save-settings">${icon('save')} 保存配置</button>
      </div>
    </div>`;
}

async function renderSettings(el) {
  const s = await api.settings();
  el.innerHTML = settingsTemplate(s);
}

// ---------- Drawer / modal ----------
function openDrawer(html) {
  closeOverlay();
  const div = document.createElement('div');
  div.className = 'overlay';
  div.dataset.overlay = 'drawer';
  div.innerHTML = `<div class="drawer">${html}</div>`;
  div.addEventListener('click', (e) => { if (e.target === div) closeOverlay(); });
  document.body.appendChild(div);
  paintIcons();
}

function openModal(html) {
  closeOverlay();
  const div = document.createElement('div');
  div.className = 'modal-overlay';
  div.dataset.overlay = 'modal';
  div.innerHTML = `<div class="modal">${html}</div>`;
  div.addEventListener('click', (e) => { if (e.target === div) closeOverlay(); });
  document.body.appendChild(div);
  paintIcons();
}

function closeOverlay() {
  document.querySelectorAll('[data-overlay]').forEach((el) => el.remove());
}

async function showAlertDetail(id) {
  const res = await api.alerts({});
  const a = res.items.find((x) => x.id === id);
  if (!a) return;
  openDrawer(`
    <div class="drawer-head"><h3>告警详情</h3><button class="icon-btn" data-action="close-overlay">${icon('x')}</button></div>
    <div class="drawer-body">
      <dl class="kv">
        <dt>隐患类型</dt><dd>${esc(a.type)}</dd>
        <dt>所属区域</dt><dd>${esc(a.area)}</dd>
        <dt>来源摄像头</dt><dd>${esc(a.camera_name || '-')}</dd>
        <dt>严重程度</dt><dd>${badge(a.severity)}</dd>
        <dt>识别置信度</dt><dd>${(a.confidence * 100).toFixed(1)}%</dd>
        <dt>处理状态</dt><dd>${badge(a.status)}</dd>
        <dt>识别时间</dt><dd>${fmtTime(a.detected_at)}</dd>
        <dt>隐患描述</dt><dd>${esc(a.description || '-')}</dd>
      </dl>
    </div>
    <div class="drawer-foot">
      ${a.status === '待处理' ? `
        <button class="btn primary" style="flex:1" data-action="alert-order" data-id="${a.id}">${icon('clipboard-check')} 转为工单</button>
        <button class="btn danger" data-action="alert-ignore" data-id="${a.id}">${icon('circle-x')} 忽略</button>` : ''}
      <button class="btn" style="flex:1" data-action="close-overlay">关闭</button>
    </div>`);
}

function showNewOrder() {
  openModal(`
    <div class="modal-head"><h3>新建隐患工单</h3><button class="icon-btn" data-action="close-overlay">${icon('x')}</button></div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="field full"><label>工单标题</label><input class="input" id="o-title" placeholder="例如：A区西立面杆件缺失整改" /></div>
        <div class="field"><label>区域</label>
          <select class="input" id="o-area"><option>A区脚手架</option><option>B区主体</option><option>C区料场</option><option>D区基坑</option><option>E区加工区</option></select>
        </div>
        <div class="field"><label>类型</label>
          <select class="input" id="o-type"><option>脚手架杆件缺失</option><option>脚手架倾斜</option><option>扣件松动</option><option>未佩戴安全帽</option><option>违规作业</option><option>防护网破损</option></select>
        </div>
        <div class="field"><label>优先级</label>
          <select class="input" id="o-priority"><option>高</option><option>中</option><option>低</option></select>
        </div>
        <div class="field"><label>负责人</label><input class="input" id="o-assignee" placeholder="可选" /></div>
        <div class="field full"><label>整改要求</label><textarea class="input" id="o-desc" placeholder="描述隐患情况与整改要求"></textarea></div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn" data-action="close-overlay">取消</button>
      <button class="btn primary" data-action="save-order">${icon('check')} 创建工单</button>
    </div>`);
}

// ---------- Router ----------
const views = {
  dashboard: async (el) => renderDashboard(el, await api.dashboard()),
  monitor: async (el) => { monitorCams = (await api.cameras()).items; renderMonitor(el, monitorCams); },
  alerts: (el) => renderAlerts(el),
  orders: (el) => renderOrders(el),
  workers: async (el) => { const r = await api.workers(); el.innerHTML = workersTemplate(r.items); },
  analytics: async (el) => renderAnalytics(el, await api.analytics()),
  settings: (el) => renderSettings(el),
};

async function render() {
  const key = location.hash.replace(/^#\//, '') || 'dashboard';
  const route = routes[key] || routes.dashboard;
  route.key = key;
  if (key !== 'monitor' && osdTimer) {
    clearInterval(osdTimer);
    osdTimer = null;
  }

  if (!api.token) {
    app.innerHTML = authView === 'register' ? registerTemplate() : loginTemplate();
    paintIcons();
    return;
  }

  app.innerHTML = shellTemplate(route);
  paintIcons();
  startTopClock();

  const view = document.getElementById('view');
  try {
    await views[route.key](view);
    paintIcons();
  } catch (e) {
    view.innerHTML = `<div class="empty">${icon('circle-x')} 加载失败：${esc(e.message)}</div>`;
    paintIcons();
  }
}

let clockTimer = null;
function startTopClock() {
  if (clockTimer) clearInterval(clockTimer);
  const tick = () => {
    const el = document.getElementById('top-clock');
    if (!el) return;
    const d = new Date();
    const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    el.textContent = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} 星期${week} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  };
  tick();
  clockTimer = setInterval(tick, 1000);
}

// ---------- Global events ----------
document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-action]');
  if (!t) return;
  const action = t.dataset.action;

  if (action === 'login') return handleLogin();
  if (action === 'show-register') {
    authView = 'register';
    return render();
  }
  if (action === 'show-login') {
    authView = 'login';
    return render();
  }
  if (action === 'register') return handleRegister();
  if (action === 'logout') {
    await api.logout();
    api.clear();
    location.hash = '#/login';
    render();
    return;
  }
  if (action === 'toggle-sidebar') {
    document.getElementById('sidebar')?.classList.toggle('open');
    return;
  }
  if (action === 'refresh') return render();
  if (action === 'close-overlay') return closeOverlay();

  if (action === 'alert-detail') return showAlertDetail(Number(t.dataset.id));
  if (action === 'alert-ignore') {
    await api.patchAlert(Number(t.dataset.id), { status: '已忽略' });
    toast('告警已忽略');
    return render();
  }
  if (action === 'alert-order') {
    await api.alertToOrder(Number(t.dataset.id), {});
    toast('已转为隐患工单');
    return render();
  }
  if (action === 'order-advance') {
    await api.patchOrder(Number(t.dataset.id), { status: t.dataset.status });
    toast('工单状态已更新');
    return render();
  }
  if (action === 'new-order') return showNewOrder();
  if (action === 'save-order') {
    const body = {
      title: document.getElementById('o-title').value,
      area: document.getElementById('o-area').value,
      type: document.getElementById('o-type').value,
      priority: document.getElementById('o-priority').value,
      assignee: document.getElementById('o-assignee').value.trim(),
      description: document.getElementById('o-desc').value.trim(),
    };
    if (!body.title) return toast('请填写工单标题', 'err');
    await api.createOrder(body);
    closeOverlay();
    toast('工单已创建');
    return render();
  }
  if (action === 'save-settings') {
    const body = {
      helmet_threshold: document.getElementById('set-helmet').value,
      scaffold_tilt_threshold: document.getElementById('set-tilt').value,
      member_missing_threshold: document.getElementById('set-member').value,
      alert_auto_close: document.getElementById('set-autoclose').checked ? 'true' : 'false',
      alert_push: document.getElementById('set-push').checked ? 'true' : 'false',
    };
    await api.patchSettings(body);
    toast('配置已保存');
    return render();
  }
});

document.addEventListener('click', (e) => {
  const nav = e.target.closest('[data-nav]');
  if (nav) location.hash = `#/${nav.dataset.nav}`;
  const f = e.target.closest('[data-filter]');
  if (f) {
    const [group, field] = f.dataset.filter.split('.');
    filters[group][field] = f.dataset.value;
    render();
  }
});

window.addEventListener('hashchange', () => {
  document.getElementById('sidebar')?.classList.remove('open');
  render();
});

window.addEventListener('resize', redrawMonitor);

render();
