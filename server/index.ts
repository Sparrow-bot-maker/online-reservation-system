import express from 'express';
import db from './db.js';

const app = express();
app.use(express.json());

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin123';

// ─── 工具函式 ──────────────────────────────────────────────

/** 取得台灣今日日期字串 YYYY-MM-DD (UTC+8) */
function getTodayTW(): string {
  const now = new Date();
  const tw = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return tw.toISOString().split('T')[0];
}

/** 取得允許的日期清單（今天 ~ 今天+3 天，UTC+8） */
function getAllowedDates(): string[] {
  const today = getTodayTW();
  const base = new Date(today + 'T00:00:00Z');
  return Array.from({ length: 4 }, (_, i) => {
    const d = new Date(base.getTime() + i * 86400000);
    return d.toISOString().split('T')[0];
  });
}

// ─── 一般使用者 API ────────────────────────────────────────

/**
 * GET /api/bookings?date=YYYY-MM-DD
 * 取得指定日期所有預約（不含本名，保護隱私）
 */
app.get('/api/bookings', (req, res) => {
  const { date } = req.query as { date?: string };
  if (!date) {
    res.status(400).json({ error: '缺少 date 參數' });
    return;
  }

  const rows = db
    .prepare('SELECT id, date, time, nickname FROM bookings WHERE date = ? ORDER BY created_at')
    .all(date);

  res.json(rows);
});

/**
 * POST /api/bookings
 * Body: { date, time, nickname, realName, specificTime }
 * 新增預約，後端驗證日期範圍與容量
 */
app.post('/api/bookings', (req, res) => {
  const { date, time, nickname, realName, specificTime } = req.body as {
    date?: string;
    time?: string;
    nickname?: string;
    realName?: string;
    specificTime?: string;
  };

  // 欄位驗證
  if (!date || !time || !nickname || !realName || !specificTime) {
    res.status(400).json({ error: '請填寫所有必填欄位 (date, time, nickname, realName, specificTime)' });
    return;
  }

  // 日期範圍驗證
  const allowed = getAllowedDates();
  if (!allowed.includes(date)) {
    res.status(400).json({ error: '預約日期必須在今天至三天後之間' });
    return;
  }

  // 新增預約
  const id = Math.random().toString(36).substring(2, 9);
  db.prepare(
    'INSERT INTO bookings (id, date, time, nickname, real_name, specific_time) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, date, time, nickname, realName, specificTime);

  res.status(201).json({
    id,
    date,
    time,
    nickname,
    realName,
    specificTime,
    message: '預約成功',
  });
});

/**
 * DELETE /api/bookings/:id
 * 取消預約
 */
app.delete('/api/bookings/:id', (req, res) => {
  const { id } = req.params;
  const result = db.prepare('DELETE FROM bookings WHERE id = ?').run(id);

  if (result.changes === 0) {
    res.status(404).json({ error: '找不到此預約' });
    return;
  }

  res.json({ message: '已成功取消預約' });
});

// ─── 管理員 API ────────────────────────────────────────────

/**
 * GET /api/admin/bookings?date=YYYY-MM-DD
 * Header: x-admin-password: <password>
 * 管理員查詢（含本名），可不帶 date 查詢全部
 */
app.get('/api/admin/bookings', (req, res) => {
  const pwd = req.headers['x-admin-password'];
  if (pwd !== ADMIN_PASSWORD) {
    res.status(401).json({ error: '密碼錯誤' });
    return;
  }

  const { date } = req.query as { date?: string };
  const rows = date
    ? db
        .prepare(
          'SELECT id, date, time, nickname, real_name as realName, specific_time as specificTime, created_at FROM bookings WHERE date = ? ORDER BY time, created_at'
        )
        .all(date)
    : db
        .prepare(
          'SELECT id, date, time, nickname, real_name as realName, specific_time as specificTime, created_at FROM bookings ORDER BY date, time, created_at'
        )
        .all();

  res.json(rows);
});

// ─── 啟動 ─────────────────────────────────────────────────

const PORT = process.env.PORT ?? 3001;

// 在 Vercel 環境中，不需要自己 listen，Vercel 會自動接管
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`✅ 後端伺服器已啟動：http://localhost:${PORT}`);
    console.log(`   允許預約日期：${getAllowedDates().join(', ')}`);
  });
}

export default app;
