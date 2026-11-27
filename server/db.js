const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const DB_PATH = path.join(__dirname, 'data.db');

function openDb() {
  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  createSchema(db);
  seed(db);
  return db;
}

function createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin'
    );

    CREATE TABLE IF NOT EXISTS workers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      crew TEXT NOT NULL,
      job TEXT NOT NULL,
      phone TEXT,
      safety_score INTEGER DEFAULT 0,
      status TEXT DEFAULT '在岗',
      helmet TEXT DEFAULT '已佩戴'
    );

    CREATE TABLE IF NOT EXISTS cameras (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      area TEXT NOT NULL,
      status TEXT DEFAULT '在线',
      resolution TEXT,
      fps INTEGER DEFAULT 25,
      risk TEXT DEFAULT '正常'
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      camera_id INTEGER,
      area TEXT NOT NULL,
      type TEXT NOT NULL,
      severity TEXT NOT NULL,
      status TEXT DEFAULT '待处理',
      confidence REAL,
      detected_at TEXT NOT NULL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS work_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      area TEXT NOT NULL,
      type TEXT NOT NULL,
      priority TEXT NOT NULL,
      status TEXT DEFAULT '待派发',
      assignee TEXT,
      created_at TEXT NOT NULL,
      deadline TEXT,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      worker_id INTEGER,
      date TEXT NOT NULL,
      check_in TEXT,
      check_out TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

function now() {
  return new Date();
}

function iso(daysAgo, hour, minute) {
  const d = now();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function dateOnly(daysAgo) {
  const d = now();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function seed(db) {
  const count = db.prepare('SELECT COUNT(*) AS c FROM workers').get().c;
  if (count > 0) return;

  const defaults = [
    ['helmet_threshold', '0.85'],
    ['scaffold_tilt_threshold', '3.5'],
    ['member_missing_threshold', '0.8'],
    ['alert_auto_close', 'true'],
    ['alert_push', 'true'],
  ];
  const insertSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
  for (const s of defaults) insertSetting.run(s[0], s[1]);

  db.prepare(
    'INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)'
  ).run('admin', 'admin123', '系统管理员', 'admin');

  const workers = [
    ['王建国', '脚手架一班', '架子工', '13800138001', 96, '在岗', '已佩戴'],
    ['李伟', '脚手架一班', '架子工', '13800138002', 88, '在岗', '已佩戴'],
    ['张强', '脚手架二班', '架子工', '13800138003', 72, '在岗', '未佩戴'],
    ['刘洋', '模板班组', '木工', '13800138004', 90, '在岗', '已佩戴'],
    ['陈军', '钢筋班组', '钢筋工', '13800138005', 84, '离岗', '已佩戴'],
    ['赵磊', '水电班组', '电工', '13800138006', 79, '在岗', '已佩戴'],
    ['孙明', '脚手架二班', '架子工', '13800138007', 68, '在岗', '未佩戴'],
    ['周涛', '模板班组', '木工', '13800138008', 93, '在岗', '已佩戴'],
  ];
  const insertWorker = db.prepare(
    'INSERT INTO workers (name, crew, job, phone, safety_score, status, helmet) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  for (const w of workers) insertWorker.run(...w);

  const cameras = [
    ['A区脚手架 1号监控', 'A区脚手架', '在线', '1920x1080', 25, '正常'],
    ['A区脚手架 2号监控', 'A区脚手架', '在线', '1920x1080', 25, '正常'],
    ['B区主体结构监控', 'B区主体', '在线', '2560x1440', 30, '正常'],
    ['C区材料堆放区', 'C区料场', '在线', '1920x1080', 25, '正常'],
    ['D区基坑边坡监控', 'D区基坑', '离线', '1280x720', 15, '信号中断'],
    ['E区钢筋加工棚', 'E区加工区', '在线', '1920x1080', 25, '正常'],
  ];
  const insertCamera = db.prepare(
    'INSERT INTO cameras (name, area, status, resolution, fps, risk) VALUES (?, ?, ?, ?, ?, ?)'
  );
  for (const c of cameras) insertCamera.run(...c);

  const alerts = [
    // [camera_id, area, type, severity, status, confidence, daysAgo, hh, mm, description]
    [1, 'A区脚手架', '未佩戴安全帽', '严重', '待处理', 0.93, 0, 9, 12, '3层作业面发现1名工人未佩戴安全帽，已自动抓拍。'],
    [2, 'A区脚手架', '脚手架杆件缺失', '严重', '待处理', 0.88, 0, 9, 46, '西立面第4跨横杆缺失，疑似拆除后未恢复。'],
    [1, 'A区脚手架', '扣件松动', '一般', '待处理', 0.81, 0, 10, 20, '连墙件位置检测到扣件位移超过阈值。'],
    [3, 'B区主体', '未佩戴安全帽', '一般', '待处理', 0.91, 0, 11, 5, '2层平台入口处工人未佩戴安全帽。'],
    [4, 'C区料场', '违规作业', '轻微', '待处理', 0.76, 0, 13, 40, '吊装区域人员逗留，超出安全距离。'],
    [1, 'A区脚手架', '脚手架倾斜', '严重', '已处理', 0.9, 0, 8, 30, '东立面架体倾斜角超限，已派发整改。'],
    [2, 'A区脚手架', '防护网破损', '一般', '已处理', 0.84, 1, 16, 20, '第6层密目网破损，存在坠落风险。'],
    [5, 'D区基坑', '基坑边坡位移', '严重', '已处理', 0.87, 1, 15, 10, '南侧边坡位移速率异常，已停止作业并加固。'],
    [1, 'A区脚手架', '未佩戴安全帽', '严重', '已忽略', 0.95, 1, 10, 5, '误报：工人安全帽被遮挡，现场复核无异常。'],
    [3, 'B区主体', '违规作业', '一般', '已处理', 0.79, 2, 14, 30, '临边作业未系安全带，已现场纠正。'],
    [2, 'A区脚手架', '脚手架杆件缺失', '严重', '已处理', 0.9, 2, 9, 50, '剪刀撑缺失，已要求补设。'],
    [6, 'E区加工区', '未佩戴安全帽', '轻微', '已处理', 0.82, 3, 11, 20, '加工棚内切割作业未佩戴安全帽。'],
    [1, 'A区脚手架', '扣件松动', '一般', '已处理', 0.83, 3, 10, 40, '转角处扣件紧固不足。'],
    [4, 'C区料场', '违规作业', '轻微', '已处理', 0.77, 4, 15, 0, '材料堆放过高，存在倾倒隐患。'],
    [2, 'A区脚手架', '脚手架倾斜', '严重', '已处理', 0.89, 4, 9, 20, '架体垂直度偏差超出规范要求。'],
    [1, 'A区脚手架', '未佩戴安全帽', '一般', '已处理', 0.92, 5, 10, 10, '入口处安全帽佩戴不规范。'],
    [3, 'B区主体', '防护网破损', '一般', '已处理', 0.8, 5, 16, 30, '外架安全网局部破损。'],
    [5, 'D区基坑', '基坑边坡位移', '严重', '已处理', 0.86, 6, 14, 40, '基坑监测点位移超限预警。'],
    [2, 'A区脚手架', '脚手架杆件缺失', '严重', '已处理', 0.91, 6, 9, 30, '连墙件数量不足。'],
    [4, 'C区料场', '违规作业', '轻微', '已忽略', 0.75, 7, 11, 10, '误报：物料摆放正常。'],
    [1, 'A区脚手架', '未佩戴安全帽', '严重', '已处理', 0.94, 7, 8, 50, '高处作业未佩戴安全帽。'],
    [3, 'B区主体', '扣件松动', '一般', '已处理', 0.82, 8, 15, 20, '外架扣件松动，已复紧。'],
    [6, 'E区加工区', '违规作业', '轻微', '已处理', 0.78, 9, 10, 30, '加工区电线拖地，存在触电风险。'],
    [2, 'A区脚手架', '脚手架倾斜', '严重', '已处理', 0.88, 9, 9, 10, '架体倾斜角接近预警阈值。'],
    [1, 'A区脚手架', '防护网破损', '一般', '已处理', 0.83, 10, 16, 0, '5层外架密目网破损。'],
    [4, 'C区料场', '未佩戴安全帽', '轻微', '已处理', 0.85, 11, 13, 20, '料场叉车司机未佩戴安全帽。'],
    [3, 'B区主体', '违规作业', '一般', '已处理', 0.8, 12, 14, 10, '临边堆放零散材料。'],
    [2, 'A区脚手架', '脚手架杆件缺失', '严重', '已处理', 0.9, 13, 9, 40, '外架横杆缺失，已整改。'],
  ];
  const insertAlert = db.prepare(
    'INSERT INTO alerts (camera_id, area, type, severity, status, confidence, detected_at, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  for (const a of alerts) {
    insertAlert.run(a[0], a[1], a[2], a[3], a[4], a[5], iso(a[6], a[7], a[8]), a[9]);
  }

  const orders = [
    // [title, area, type, priority, status, assignee, daysAgoCreated, hh, mm, deadlineDaysAhead, description]
    ['A区西立面脚手架杆件缺失整改', 'A区脚手架', '脚手架杆件缺失', '高', '整改中', '王建国', 0, 9, 50, 1, '补齐西立面第4跨横杆并复紧相邻扣件。'],
    ['B区临边防护网修复', 'B区主体', '防护网破损', '中', '待派发', null, 0, 10, 5, 2, '更换第6层破损密目网。'],
    ['D区基坑边坡位移复核', 'D区基坑', '基坑边坡位移', '高', '待复核', '陈军', 1, 15, 10, 1, '复核南侧边坡加固后的位移数据。'],
    ['A区东立面架体倾斜纠偏', 'A区脚手架', '脚手架倾斜', '高', '待复核', '李伟', 1, 8, 30, 1, '对东立面架体进行垂直度复测。'],
    ['C区料场材料堆放规范', 'C区料场', '违规作业', '中', '已销号', '赵磊', 2, 14, 30, 0, '材料分类码放，控制堆高。'],
    ['E区加工棚线路整理', 'E区加工区', '违规作业', '中', '已销号', '赵磊', 3, 11, 20, 0, '整理临时用电线路，架空敷设。'],
    ['A区剪刀撑补设', 'A区脚手架', '脚手架杆件缺失', '高', '已销号', '王建国', 2, 9, 50, 0, '按规定间距补设剪刀撑。'],
    ['B区临边作业安全带纠正', 'B区主体', '违规作业', '中', '已销号', '刘洋', 2, 14, 30, 0, '现场纠正临边作业人员系挂安全带。'],
    ['A区转角扣件紧固', 'A区脚手架', '扣件松动', '中', '已销号', '李伟', 3, 10, 40, 0, '复紧转角处松动扣件。'],
    ['C区吊装区域警戒管理', 'C区料场', '违规作业', '低', '已销号', '周涛', 4, 13, 40, 0, '吊装作业时增设警戒区。'],
    ['A区5层安全网更换', 'A区脚手架', '防护网破损', '中', '待派发', null, 0, 16, 20, 3, '更换5层破损密目网并检查周边。'],
    ['D区基坑夜间照明整改', 'D区基坑', '违规作业', '低', '待派发', null, 0, 15, 30, 2, '基坑临边补充夜间警示照明。'],
  ];
  const insertOrder = db.prepare(
    'INSERT INTO work_orders (title, area, type, priority, status, assignee, created_at, deadline, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  for (const o of orders) {
    const deadlineDaysAhead = o[9];
    insertOrder.run(
      o[0], o[1], o[2], o[3], o[4], o[5], iso(o[6], o[7], o[8]),
      deadlineDaysAhead >= 0 ? iso(-deadlineDaysAhead, 18, 0) : iso(o[6] - 1, 18, 0),
      o[10]
    );
  }

  const attendance = [
    [1, 0, '06:52', null],
    [2, 0, '07:01', null],
    [3, 0, '07:10', null],
    [4, 0, '06:58', null],
    [5, 0, '06:45', '17:32'],
    [6, 0, '07:05', null],
    [7, 0, '07:20', null],
    [8, 0, '06:55', null],
    [1, 1, '06:48', '17:40'],
    [2, 1, '07:03', '17:45'],
    [3, 1, '07:12', '17:30'],
    [4, 1, '06:50', '17:50'],
    [6, 1, '07:00', '17:35'],
    [7, 1, '07:18', '17:28'],
    [8, 1, '06:57', '17:42'],
    [1, 2, '06:55', '17:38'],
    [2, 2, '07:05', '17:40'],
    [3, 2, '07:09', '17:33'],
    [4, 2, '06:52', '17:47'],
    [5, 2, '06:47', '17:31'],
    [6, 2, '07:02', '17:39'],
    [8, 2, '06:59', '17:44'],
  ];
  const insertAttendance = db.prepare(
    'INSERT INTO attendance (worker_id, date, check_in, check_out) VALUES (?, ?, ?, ?)'
  );
  for (const a of attendance) {
    insertAttendance.run(a[0], dateOnly(a[1]), a[2], a[3]);
  }
}

module.exports = { openDb, DB_PATH };
