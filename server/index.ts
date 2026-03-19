import express from 'express';
import sql, { initDb } from './db.js';

const app = express();
app.use(express.json());

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin123';

// 啟動時初始化資料表
initDb();

// ─── 工具函式 ──────────────────────────────────────────────

/** 時間字串清洗 */
function sanitizeTime(timeStr: string): string {
  // 去除所有空白
  let sanitized = timeStr.replace(/\s+/g, '');
  // 替換全形與各種連接符號
  sanitized = sanitized.replace(/：/g, ':').replace(/[～\-]/g, '~');
  // 單數小時補零
  sanitized = sanitized.replace(/(^|~)(\d):/g, '$10$2:');
  return sanitized;
}

/** 驗證具體時間是否落在選擇的大時段內 */
function isSpecificTimeAllowed(mainTime: string, specificTime: string): boolean {
  // mainTime: '09:00 - 12:00'
  // specificTime (已清洗): '09:30~11:30'
  const cleanMain = sanitizeTime(mainTime);
  const [mStart, mEnd] = cleanMain.split('~');
  const [sStart, sEnd] = specificTime.split('~');

  if (!mStart || !mEnd || !sStart || !sEnd) return false;

  const validateHMS = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m; // 轉成分鐘數
  };

  const mS = validateHMS(mStart);
  let mE = validateHMS(mEnd);
  const sS = validateHMS(sStart);
  let sE = validateHMS(sEnd);

  // 若結束時間小於開始，以跨日計算 (+1440 mins)
  if (mE < mS) mE += 1440;
  // 具體時間也做相對應的跨日容錯
  let adjustedSS = sS;
  let adjustedSE = sE;
  if (sS < mS && mS > 12 * 60) adjustedSS += 1440; // 如果是大半夜的預約
  if (sE < sS || adjustedSS > adjustedSE) adjustedSE += 1440;

  return adjustedSS >= mS && adjustedSE <= mE;
}

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
app.get('/api/bookings', async (req, res) => {
  const { date } = req.query as { date?: string };
  if (!date) {
    res.status(400).json({ error: '缺少 date 參數' });
    return;
  }

  try {
    const { rows } = await sql`
      SELECT id, date, time, nickname FROM bookings WHERE date = ${date} ORDER BY created_at
    `;
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '資料庫錯誤' });
  }
});

/**
 * POST /api/bookings
 * Body: { date, time, nickname, realName, specificTime }
 * 新增預約，後端驗證日期範圍與容量
 */
app.post('/api/bookings', async (req, res) => {
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
  
  // 清洗具體時間並做邊界驗證
  const sanitizedSpecificTime = sanitizeTime(specificTime);
  if (!isSpecificTimeAllowed(time, sanitizedSpecificTime)) {
    res.status(400).json({ error: '您填寫的時間不在選擇的時段範圍內。' });
    return;
  }

  // 新增預約
  const id = Math.random().toString(36).substring(2, 9);
  try {
    await sql`
      INSERT INTO bookings (id, date, time, nickname, real_name, specific_time) 
      VALUES (${id}, ${date}, ${time}, ${nickname}, ${realName}, ${sanitizedSpecificTime})
    `;
    
    res.status(201).json({
      id,
      date,
      time,
      nickname,
      realName,
      specificTime: sanitizedSpecificTime,
      message: '預約成功',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '資料庫寫入錯誤' });
  }
});

/**
 * DELETE /api/bookings/:id
 * 取消預約
 */
app.delete('/api/bookings/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await sql`DELETE FROM bookings WHERE id = ${id} RETURNING id`;
    
    if (result.rowCount === 0) {
      res.status(404).json({ error: '找不到此預約' });
      return;
    }

    res.json({ message: '已成功取消預約' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '資料庫刪除錯誤' });
  }
});

// ─── 管理員 API ────────────────────────────────────────────

/**
 * GET /api/admin/bookings?date=YYYY-MM-DD
 * Header: x-admin-password: <password>
 * 管理員查詢（含本名），可不帶 date 查詢全部
 */
app.get('/api/admin/bookings', async (req, res) => {
  const pwd = req.headers['x-admin-password'];
  if (pwd !== ADMIN_PASSWORD) {
    res.status(401).json({ error: '密碼錯誤' });
    return;
  }

  const { date } = req.query as { date?: string };
  try {
    const { rows } = date
      ? await sql`
          SELECT id, date, time, nickname, real_name as "realName", specific_time as "specificTime", created_at 
          FROM bookings WHERE date = ${date} ORDER BY time, created_at
        `
      : await sql`
          SELECT id, date, time, nickname, real_name as "realName", specific_time as "specificTime", created_at 
          FROM bookings ORDER BY date, time, created_at
        `;

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '資料庫查詢錯誤' });
  }
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
