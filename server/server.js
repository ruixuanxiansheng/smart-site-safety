const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { openDb } = require('./db');

const PORT = process.env.PORT || 5173;
const WEB_ROOT = path.join(__dirname, '..', 'web');
const db = openDb();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const sessions = new Map();

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 1e6) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function requireAuth(req, res) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || !sessions.has(token)) {
    sendJson(res, 401, { error: '未登录或登录已过期' });
    return null;
  }
  return sessions.get(token);
}

function requireWorker(req, res) {
  const session = requireAuth(req, res);
  if (!session) return null;
  if (session.role !== 'worker') {
    sendJson(res, 403, { error: '请使用工人账号登录' });
    return null;
  }
  return session;
}

function dateLocal(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dateLocalDaysAgo(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return dateLocal(d);
}

function currentTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function oneWhere(parts, values) {
  return parts.length ? `WHERE ${parts.join(' AND ')}` : '';
}

// ---------- API handlers ----------

function handleAuth(req, res, url) {
  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    return readBody(req).then((body) => {
      const row = db
        .prepare('SELECT * FROM users WHERE username = ? AND password = ?')
        .get(body.username || '', body.password || '');
      if (!row) return sendJson(res, 401, { error: '账号或密码错误' });
      const token = crypto.randomUUID();
      sessions.set(token, { id: row.id, name: row.name, role: row.role });
      return sendJson(res, 200, {
        token,
        user: { id: row.id, name: row.name, role: row.role, username: row.username },
      });
    }).catch(() => sendJson(res, 400, { error: '请求体格式错误' }));
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (token) sessions.delete(token);
    return sendJson(res, 200, { ok: true });
  }
  return sendJson(res, 404, { error: 'Not found' });
}

function handleMe(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;
  sendJson(res, 200, { user });
}

function dashboard() {
  const today = dateLocal();

  const todayAlerts = db.prepare(
    "SELECT COUNT(*) AS c FROM alerts WHERE date(detected_at, 'localtime') = date('now', 'localtime')"
  ).get().c;
  const openAlerts = db.prepare(
    "SELECT COUNT(*) AS c FROM alerts WHERE status = '待处理'"
  ).get().c;
  const activeWorkers = db.prepare(
    "SELECT COUNT(*) AS c FROM workers WHERE status = '在岗'"
  ).get().c;
  const pendingOrders = db.prepare(
    "SELECT COUNT(*) AS c FROM work_orders WHERE status IN ('待派发','整改中','待复核')"
  ).get().c;
  const closedWeek = db.prepare(
    "SELECT COUNT(*) AS c FROM work_orders WHERE status = '已销号' AND created_at >= datetime('now', '-7 days')"
  ).get().c;
  const createdWeek = db.prepare(
    "SELECT COUNT(*) AS c FROM work_orders WHERE created_at >= datetime('now', '-7 days')"
  ).get().c;
  const completionRate = createdWeek ? Math.round((closedWeek / createdWeek) * 100) : 100;

  const trend = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ds = dateLocal(d);
    const row = db.prepare(
      "SELECT COUNT(*) AS total, SUM(CASE WHEN severity='严重' THEN 1 ELSE 0 END) AS severe, SUM(CASE WHEN severity='一般' THEN 1 ELSE 0 END) AS normal, SUM(CASE WHEN severity='轻微' THEN 1 ELSE 0 END) AS minor FROM alerts WHERE date(detected_at, 'localtime') = ?"
    ).get(ds);
    trend.push({
      date: ds.slice(5).replace('-', '/'),
      severe: row.severe || 0,
      normal: row.normal || 0,
      minor: row.minor || 0,
      total: row.total || 0,
    });
  }

  const distribution = db.prepare(
    'SELECT type AS name, COUNT(*) AS value FROM alerts GROUP BY type ORDER BY value DESC'
  ).all();

  const areaRisk = [];
  const areaRows = db.prepare(
    'SELECT DISTINCT area FROM alerts'
  ).all();
  for (const a of areaRows) {
    const stats = db.prepare(
      "SELECT COUNT(*) AS total, SUM(CASE WHEN severity='严重' THEN 3 WHEN severity='一般' THEN 2 ELSE 1 END) AS weight FROM alerts WHERE area = ?"
    ).get(a.area);
    const score = Math.max(0, Math.min(100, Math.round(100 - stats.weight * 4 - stats.total * 1)));
    areaRisk.push({ area: a.area, score, total: stats.total });
  }
  areaRisk.sort((x, y) => x.score - y.score);

  const recent = db.prepare(
    `SELECT a.id, a.area, a.type, a.severity, a.status, a.confidence, a.detected_at, a.description,
            c.name AS camera_name
     FROM alerts a LEFT JOIN cameras c ON c.id = a.camera_id
     ORDER BY a.detected_at DESC LIMIT 8`
  ).all();

  const cameras = db.prepare('SELECT * FROM cameras').all();

  return {
    kpis: {
      todayAlerts,
      openAlerts,
      activeWorkers,
      pendingOrders,
      completionRate,
      accuracy: 96.8,
    },
    trend,
    distribution,
    areaRisk,
    recent,
    cameras,
    updatedAt: new Date().toISOString(),
  };
}

function alerts(req, url) {
  const parts = [];
  const values = [];
  const q = url.searchParams;
  if (q.get('status')) { parts.push('a.status = ?'); values.push(q.get('status')); }
  if (q.get('severity')) { parts.push('a.severity = ?'); values.push(q.get('severity')); }
  if (q.get('type')) { parts.push('a.type = ?'); values.push(q.get('type')); }
  if (q.get('area')) { parts.push('a.area = ?'); values.push(q.get('area')); }
  if (q.get('q')) {
    parts.push('(a.type LIKE ? OR a.area LIKE ? OR a.description LIKE ?)');
    const like = `%${q.get('q')}%`;
    values.push(like, like, like);
  }
  const where = oneWhere(parts, values);
  const rows = db.prepare(
    `SELECT a.*, c.name AS camera_name FROM alerts a
     LEFT JOIN cameras c ON c.id = a.camera_id
     ${where} ORDER BY a.detected_at DESC LIMIT 200`
  ).all(...values);
  return rows;
}

function patchAlert(req, res, id) {
  return readBody(req).then((body) => {
    const row = db.prepare('SELECT * FROM alerts WHERE id = ?').get(id);
    if (!row) return sendJson(res, 404, { error: '告警不存在' });
    const status = body.status;
    if (!['待处理', '已处理', '已忽略'].includes(status)) {
      return sendJson(res, 400, { error: '无效状态' });
    }
    db.prepare('UPDATE alerts SET status = ? WHERE id = ?').run(status, id);
    return sendJson(res, 200, { ok: true });
  }).catch(() => sendJson(res, 400, { error: '请求体格式错误' }));
}

function alertToOrder(req, res, id) {
  return readBody(req).then((body) => {
    const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(id);
    if (!alert) return sendJson(res, 404, { error: '告警不存在' });
    const nowIso = new Date().toISOString();
    const deadline = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const title = body.title || `${alert.area}${alert.type}整改`;
    const info = db.prepare(
      'INSERT INTO work_orders (title, area, type, priority, status, assignee, created_at, deadline, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      title,
      alert.area,
      alert.type,
      alert.severity === '严重' ? '高' : alert.severity === '一般' ? '中' : '低',
      '待派发',
      body.assignee || null,
      nowIso,
      deadline,
      alert.description || ''
    );
    db.prepare("UPDATE alerts SET status = '已处理' WHERE id = ?").run(id);
    return sendJson(res, 200, { ok: true, id: Number(info.lastInsertRowid) });
  }).catch(() => sendJson(res, 400, { error: '请求体格式错误' }));
}

function workOrders(url) {
  const parts = [];
  const values = [];
  const q = url.searchParams;
  if (q.get('status')) { parts.push('status = ?'); values.push(q.get('status')); }
  if (q.get('q')) {
    parts.push('(title LIKE ? OR area LIKE ? OR assignee LIKE ?)');
    const like = `%${q.get('q')}%`;
    values.push(like, like, like);
  }
  const where = oneWhere(parts, values);
  return db.prepare(
    `SELECT * FROM work_orders ${where} ORDER BY created_at DESC LIMIT 200`
  ).all(...values);
}

function patchOrder(req, res, id) {
  return readBody(req).then((body) => {
    const row = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(id);
    if (!row) return sendJson(res, 404, { error: '工单不存在' });
    const statuses = ['待派发', '整改中', '待复核', '已销号'];
    if (body.status && !statuses.includes(body.status)) {
      return sendJson(res, 400, { error: '无效状态' });
    }
    const nextStatus = body.status || row.status;
    const assignee = body.assignee !== undefined ? body.assignee : row.assignee;
    db.prepare('UPDATE work_orders SET status = ?, assignee = ? WHERE id = ?').run(nextStatus, assignee, id);
    return sendJson(res, 200, { ok: true });
  }).catch(() => sendJson(res, 400, { error: '请求体格式错误' }));
}

function createOrder(req, res) {
  return readBody(req).then((body) => {
    const title = String(body.title || '').trim();
    if (!title) return sendJson(res, 400, { error: '工单标题不能为空' });
    const nowIso = new Date().toISOString();
    const deadline = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const info = db.prepare(
      'INSERT INTO work_orders (title, area, type, priority, status, assignee, created_at, deadline, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      title,
      body.area || 'A区脚手架',
      body.type || '其他',
      body.priority || '中',
      '待派发',
      body.assignee || null,
      nowIso,
      body.deadline || deadline,
      body.description || ''
    );
    return sendJson(res, 201, { ok: true, id: Number(info.lastInsertRowid) });
  }).catch(() => sendJson(res, 400, { error: '请求体格式错误' }));
}

function workers() {
  const rows = db.prepare('SELECT * FROM workers ORDER BY id').all();
  const today = dateLocal();
  const att = db.prepare('SELECT * FROM attendance WHERE date = ?').all(today);
  const attMap = new Map(att.map((a) => [a.worker_id, a]));
  return rows.map((w) => ({
    ...w,
    attendance: attMap.get(w.id) || null,
  }));
}

function analytics() {
  const days = 30;
  const trend = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ds = dateLocal(d);
    const row = db.prepare(
      "SELECT COUNT(*) AS total, SUM(CASE WHEN severity='严重' THEN 1 ELSE 0 END) AS severe FROM alerts WHERE date(detected_at, 'localtime') = ?"
    ).get(ds);
    trend.push({
      date: `${d.getMonth() + 1}/${d.getDate()}`,
      total: row.total || 0,
      severe: row.severe || 0,
    });
  }

  const distribution = db.prepare(
    'SELECT type AS name, COUNT(*) AS value FROM alerts GROUP BY type ORDER BY value DESC'
  ).all();

  const areaStats = db.prepare(
    "SELECT area, COUNT(*) AS total, SUM(CASE WHEN severity='严重' THEN 1 ELSE 0 END) AS severe FROM alerts GROUP BY area ORDER BY total DESC"
  ).all();

  const orderStatus = db.prepare(
    'SELECT status AS name, COUNT(*) AS value FROM work_orders GROUP BY status'
  ).all();

  const helmet = db.prepare(
    "SELECT COUNT(*) AS total, SUM(CASE WHEN helmet='已佩戴' THEN 1 ELSE 0 END) AS ok FROM workers"
  ).get();

  const weekly = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ds = dateLocal(d);
    const opened = db.prepare("SELECT COUNT(*) AS c FROM work_orders WHERE date(created_at,'localtime') = ?").get(ds).c;
    const closed = db.prepare(
      "SELECT COUNT(*) AS c FROM work_orders WHERE status='已销号' AND date(created_at,'localtime') = ?"
    ).get(ds).c;
    weekly.push({ date: ds.slice(5).replace('-', '/'), opened, closed });
  }

  return { trend, distribution, areaStats, orderStatus, helmet, weekly };
}

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

function patchSettings(req, res) {
  return readBody(req).then((body) => {
    const stmt = db.prepare('UPDATE settings SET value = ? WHERE key = ?');
    for (const [key, value] of Object.entries(body)) {
      stmt.run(String(value), key);
    }
    return sendJson(res, 200, getSettings());
  }).catch(() => sendJson(res, 400, { error: '请求体格式错误' }));
}

// ---------- Worker app handlers ----------

function workerWithAttendance(row) {
  const att = db
    .prepare('SELECT * FROM attendance WHERE worker_id = ? AND date = ?')
    .get(row.id, dateLocal());
  return { ...row, attendance: att || null };
}

function workerLogin(req, res) {
  return readBody(req).then((body) => {
    const phone = String(body.phone || '').trim();
    const row = db.prepare('SELECT * FROM workers WHERE phone = ?').get(phone);
    if (!row) return sendJson(res, 401, { error: '未找到该手机号对应的工人' });
    const token = crypto.randomUUID();
    sessions.set(token, { id: row.id, name: row.name, role: 'worker', workerId: row.id });
    return sendJson(res, 200, { token, worker: workerWithAttendance(row) });
  }).catch(() => sendJson(res, 400, { error: '请求体格式错误' }));
}

function workerMe(req, res, session) {
  const row = db.prepare('SELECT * FROM workers WHERE id = ?').get(session.workerId);
  if (!row) return sendJson(res, 404, { error: '工人信息不存在' });
  sendJson(res, 200, { worker: workerWithAttendance(row) });
}

function workerCheckin(req, res, session) {
  return readBody(req).then((body) => {
    const type = body.type;
    if (!['in', 'out'].includes(type)) return sendJson(res, 400, { error: '无效签到类型' });
    const today = dateLocal();
    const att = db.prepare('SELECT * FROM attendance WHERE worker_id = ? AND date = ?').get(session.workerId, today);
    const time = currentTime();
    if (type === 'in') {
      if (att) {
        if (!att.check_in) db.prepare('UPDATE attendance SET check_in = ? WHERE id = ?').run(time, att.id);
      } else {
        db.prepare('INSERT INTO attendance (worker_id, date, check_in) VALUES (?, ?, ?)').run(session.workerId, today, time);
      }
      db.prepare("UPDATE workers SET status = '在岗' WHERE id = ?").run(session.workerId);
    } else {
      if (att) {
        db.prepare('UPDATE attendance SET check_out = ? WHERE id = ?').run(time, att.id);
      } else {
        db.prepare('INSERT INTO attendance (worker_id, date, check_out) VALUES (?, ?, ?)').run(session.workerId, today, time);
      }
      db.prepare("UPDATE workers SET status = '离岗' WHERE id = ?").run(session.workerId);
    }
    const row = db.prepare('SELECT * FROM workers WHERE id = ?').get(session.workerId);
    return sendJson(res, 200, { worker: workerWithAttendance(row) });
  }).catch(() => sendJson(res, 400, { error: '请求体格式错误' }));
}

function workerAttendance(session) {
  const rows = [];
  for (let i = 6; i >= 0; i--) {
    const ds = dateLocalDaysAgo(i);
    const att = db.prepare('SELECT * FROM attendance WHERE worker_id = ? AND date = ?').get(session.workerId, ds);
    rows.push({ date: ds, check_in: att ? att.check_in : null, check_out: att ? att.check_out : null });
  }
  return rows;
}

function workerOrders(session) {
  return db.prepare('SELECT * FROM work_orders WHERE assignee = ? ORDER BY created_at DESC').all(session.name);
}

function workerPatchOrder(req, res, session, id) {
  return readBody(req).then((body) => {
    const order = db.prepare('SELECT * FROM work_orders WHERE id = ? AND assignee = ?').get(id, session.name);
    if (!order) return sendJson(res, 404, { error: '工单不存在' });
    const next = body.status;
    const valid = (order.status === '待派发' && next === '整改中') || (order.status === '整改中' && next === '待复核');
    if (!valid) return sendJson(res, 400, { error: '当前状态不允许此操作' });
    let description = order.description || '';
    if (body.note) description = `${description}\n整改反馈：${body.note}`.trim();
    db.prepare('UPDATE work_orders SET status = ?, description = ? WHERE id = ?').run(next, description, id);
    return sendJson(res, 200, { ok: true });
  }).catch(() => sendJson(res, 400, { error: '请求体格式错误' }));
}

function workerReport(req, res, session) {
  return readBody(req).then((body) => {
    const area = String(body.area || 'A区脚手架').trim();
    const type = String(body.type || '违规作业').trim();
    const description = String(body.description || '').trim();
    if (!description) return sendJson(res, 400, { error: '请填写隐患描述' });
    db.prepare(
      'INSERT INTO alerts (camera_id, area, type, severity, status, confidence, detected_at, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(null, area, type, '一般', '待处理', 0.9, new Date().toISOString(), `工人上报：${description}`);
    return sendJson(res, 201, { ok: true });
  }).catch(() => sendJson(res, 400, { error: '请求体格式错误' }));
}

const WORKER_COURSES = [
  { id: 1, title: '安全帽的正确佩戴', duration: '6 分钟', progress: 100, tag: '已学' },
  { id: 2, title: '高处作业安全规范', duration: '12 分钟', progress: 80, tag: '必修' },
  { id: 3, title: '脚手架搭设与拆除要点', duration: '18 分钟', progress: 45, tag: '必修' },
  { id: 4, title: '临时用电安全须知', duration: '10 分钟', progress: 0, tag: '选修' },
];

const WORKER_WARNINGS = [
  { id: 1, title: '未系安全带临边作业', date: '2026-11-20', level: '严重' },
  { id: 2, title: '吊装区域违规逗留', date: '2026-11-18', level: '一般' },
  { id: 3, title: '高处抛物', date: '2026-11-12', level: '严重' },
];

const WORKER_NOTICES = [
  { id: 1, title: '关于开展脚手架专项检查的通知', date: '今天 08:30' },
  { id: 2, title: '冬季施工安全注意事项', date: '昨天 17:00' },
  { id: 3, title: '明日塔吊顶升作业区域封闭公告', date: '昨天 14:20' },
];

function workerScore(session) {
  const row = db.prepare('SELECT safety_score FROM workers WHERE id = ?').get(session.workerId);
  const score = row ? row.safety_score : 0;
  return {
    score,
    level: score >= 90 ? '安全标兵' : score >= 75 ? '安全达标' : '需加强培训',
    items: [
      { title: '隐患随手拍上报奖励', delta: 10, date: '今天' },
      { title: '安全微课学习', delta: 5, date: '昨天' },
      { title: '规范佩戴安全帽', delta: 2, date: '11-24' },
      { title: '临边作业违章', delta: -5, date: '11-20' },
    ],
  };
}

function handleWorkerApi(req, res, url) {
  const p = url.pathname;

  if (p === '/api/worker/login' && req.method === 'POST') {
    return workerLogin(req, res);
  }

  const session = requireWorker(req, res);
  if (!session) return;

  if (p === '/api/worker/me' && req.method === 'GET') {
    return workerMe(req, res, session);
  }
  if (p === '/api/worker/checkin' && req.method === 'POST') {
    return workerCheckin(req, res, session);
  }
  if (p === '/api/worker/attendance' && req.method === 'GET') {
    return sendJson(res, 200, { items: workerAttendance(session) });
  }
  if (p === '/api/worker/orders' && req.method === 'GET') {
    return sendJson(res, 200, { items: workerOrders(session) });
  }
  if (p.startsWith('/api/worker/orders/') && req.method === 'PATCH') {
    return workerPatchOrder(req, res, session, p.split('/')[4]);
  }
  if (p === '/api/worker/reports' && req.method === 'POST') {
    return workerReport(req, res, session);
  }
  if (p === '/api/worker/courses' && req.method === 'GET') {
    return sendJson(res, 200, { items: WORKER_COURSES });
  }
  if (p === '/api/worker/warnings' && req.method === 'GET') {
    return sendJson(res, 200, { items: WORKER_WARNINGS });
  }
  if (p === '/api/worker/notices' && req.method === 'GET') {
    return sendJson(res, 200, { items: WORKER_NOTICES });
  }
  if (p === '/api/worker/score' && req.method === 'GET') {
    return sendJson(res, 200, workerScore(session));
  }

  return sendJson(res, 404, { error: 'Not found' });
}

function handleApi(req, res, url) {
  const p = url.pathname;

  if (p.startsWith('/api/auth/')) return handleAuth(req, res, url);
  if (p === '/api/me') return handleMe(req, res);
  if (p.startsWith('/api/worker/')) return handleWorkerApi(req, res, url);

  if (p.startsWith('/api/')) {
    const user = requireAuth(req, res);
    if (!user) return;
  }

  if (p === '/api/dashboard' && req.method === 'GET') {
    return sendJson(res, 200, dashboard());
  }
  if (p === '/api/alerts' && req.method === 'GET') {
    return sendJson(res, 200, { items: alerts(req, url) });
  }
  if (p.startsWith('/api/alerts/') && req.method === 'PATCH') {
    const id = p.split('/')[3];
    return patchAlert(req, res, id);
  }
  if (p.startsWith('/api/alerts/') && p.endsWith('/workorder') && req.method === 'POST') {
    const id = p.split('/')[3];
    return alertToOrder(req, res, id);
  }
  if (p === '/api/workorders' && req.method === 'GET') {
    return sendJson(res, 200, { items: workOrders(url) });
  }
  if (p === '/api/workorders' && req.method === 'POST') {
    return createOrder(req, res);
  }
  if (p.startsWith('/api/workorders/') && req.method === 'PATCH') {
    const id = p.split('/')[3];
    return patchOrder(req, res, id);
  }
  if (p === '/api/workers' && req.method === 'GET') {
    return sendJson(res, 200, { items: workers() });
  }
  if (p === '/api/cameras' && req.method === 'GET') {
    return sendJson(res, 200, { items: db.prepare('SELECT * FROM cameras ORDER BY id').all() });
  }
  if (p === '/api/analytics' && req.method === 'GET') {
    return sendJson(res, 200, analytics());
  }
  if (p === '/api/settings' && req.method === 'GET') {
    return sendJson(res, 200, getSettings());
  }
  if (p === '/api/settings' && req.method === 'PATCH') {
    return patchSettings(req, res);
  }

  return sendJson(res, 404, { error: 'Not found' });
}

function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const safe = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(WEB_ROOT, safe);
  if (!filePath.startsWith(WEB_ROOT)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback for non-asset routes
      fs.readFile(path.join(WEB_ROOT, 'index.html'), (e2, html) => {
        if (e2) {
          res.writeHead(404);
          return res.end('Not found');
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) {
    Promise.resolve(handleApi(req, res, url)).catch((e) => {
      sendJson(res, 500, { error: e.message });
    });
    return;
  }
  serveStatic(req, res, url);
});

server.listen(PORT, () => {
  console.log(`智筑安监平台已启动: http://localhost:${PORT}`);
  console.log('演示账号: admin / admin123');
});
