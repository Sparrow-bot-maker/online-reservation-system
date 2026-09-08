import express from 'express';
import sql, { initDb, autoMarkAbsent } from './db.js';

const app = express();
app.use(express.json());

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin123';

// 啟動時初始化資料表
initDb();

// ─── 自動標記 absent + 每日點名密碼（每分鐘檢查台灣時間是否跨日）──
let lastAbsentDate = '';
setInterval(async () => {
  const now = new Date();
  const tw = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const todayStr = tw.toISOString().split('T')[0];
  if (todayStr !== lastAbsentDate) {
    lastAbsentDate = todayStr;
    await autoMarkAbsent();
    // 每日 00:00 自動產生新的 5 位數點名密碼
    const newPwd = String(Math.floor(10000 + Math.random() * 90000));
    try {
      await sql`
        INSERT INTO checkin_config (key, value) VALUES ('checkin_password', ${newPwd})
        ON CONFLICT (key) DO UPDATE SET value = ${newPwd}
      `;
      console.log(`🔑 今日點名密碼已自動更新：${newPwd}`);
    } catch (err) {
      console.error('❌ 自動更新點名密碼失敗:', err);
    }
  }
}, 60_000);

// ─── 工具函式 ──────────────────────────────────────────────────

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

/**
 * 取得或自動建立今日 (台灣時間) 的 5 位數點名密碼
 * 支援 Serverless 架構：每次存取時自動檢查是否跨日，確保密碼每日自動更新且一致
 */
async function getOrCreateDailyCheckinPassword(): Promise<string> {
  const todayStr = getTodayTW();
  const { rows } = await sql`
    SELECT key, value FROM checkin_config WHERE key IN ('checkin_password', 'checkin_password_date')
  `;
  const pwdRow = rows.find((r) => r.key === 'checkin_password');
  const dateRow = rows.find((r) => r.key === 'checkin_password_date');

  // 若當前密碼不存在、不是 5 位數字、或記錄的日期不是今天，自動產生今天的 5 位數密碼
  if (!pwdRow?.value || dateRow?.value !== todayStr || !/^\d{5}$/.test(pwdRow.value)) {
    const newPwd = String(Math.floor(10000 + Math.random() * 90000));
    await sql`
      INSERT INTO checkin_config (key, value) VALUES ('checkin_password', ${newPwd})
      ON CONFLICT (key) DO UPDATE SET value = ${newPwd}
    `;
    await sql`
      INSERT INTO checkin_config (key, value) VALUES ('checkin_password_date', ${todayStr})
      ON CONFLICT (key) DO UPDATE SET value = ${todayStr}
    `;
    // 同步觸發標記昨日 pending 為 absent
    await autoMarkAbsent();
    return newPwd;
  }

  return pwdRow.value;
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
  const { date, time, nickname, realName, specificTime, isMorningTraining } = req.body as {
    date?: string;
    time?: string;
    nickname?: string;
    realName?: string;
    specificTime?: string;
    isMorningTraining?: boolean;
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

  // 清洗具體時間
  const sanitizedSpecificTime = sanitizeTime(specificTime);

  // 晨練時段（06:00 - 08:00）跳過主時段邊界驗證
  const isFixedMorning = isMorningTraining || sanitizedSpecificTime === '06:00~08:00';
  if (!isFixedMorning && !isSpecificTimeAllowed(time, sanitizedSpecificTime)) {
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

// ─── 線上點名 API ─────────────────────────────────────────

/**
 * POST /api/bookings/:id/checkin
 * Body: { checkinPassword }
 * 社員輸入點名密碼，當天預約才能點名，attendance_status 改為 attended
 */
app.post('/api/bookings/:id/checkin', async (req, res) => {
  const { id } = req.params;
  const { checkinPassword } = req.body as { checkinPassword?: string };

  if (!checkinPassword) {
    res.status(400).json({ error: '請輸入點名密碼' });
    return;
  }

  try {
    // 取得當前今日點名密碼
    const currentPassword = await getOrCreateDailyCheckinPassword();

    if (!currentPassword || checkinPassword.trim() !== currentPassword.trim()) {
      res.status(401).json({ error: '點名密碼錯誤' });
      return;
    }

    // 驗證預約存在且是今天
    const today = getTodayTW();
    const { rows } = await sql`
      SELECT id, date, attendance_status FROM bookings WHERE id = ${id}
    `;
    if (rows.length === 0) {
      res.status(404).json({ error: '找不到此預約' });
      return;
    }
    const booking = rows[0];
    if (booking.date !== today) {
      res.status(400).json({ error: '只能對今天的預約進行點名' });
      return;
    }
    if (booking.attendance_status === 'attended') {
      res.status(400).json({ error: '此預約已完成點名' });
      return;
    }

    await sql`
      UPDATE bookings SET attendance_status = 'attended' WHERE id = ${id}
    `;
    res.json({ message: '點名成功！' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '資料庫錯誤' });
  }
});

// ─── 社員 PIN API ─────────────────────────────────────────

/**
 * POST /api/member/register
 * Body: { realName, pin }
 * 社員首次自行設定：本名 + 學號(PIN)
 * - 若本名已存在 → 409 (請直接登入)
 * - 否則新增
 */
app.post('/api/member/register', async (req, res) => {
  const { realName, pin } = req.body as { realName?: string; pin?: string };
  if (!realName || !pin) {
    res.status(400).json({ error: '請填寫本名與學號' });
    return;
  }
  try {
    // 檢查本名是否已存在
    const { rows } = await sql`SELECT real_name FROM members WHERE real_name = ${realName}`;
    if (rows.length > 0) {
      res.status(409).json({ error: '此本名已完成設定，請直接用學號登入' });
      return;
    }
    await sql`INSERT INTO members (real_name, pin) VALUES (${realName}, ${pin})`;
    res.status(201).json({ message: '設定成功，歡迎 ' + realName, realName });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '資料庫寫入錯誤' });
  }
});

/**
 * POST /api/member/login
 * Body: { pin }
 * 驗證 PIN，回傳 realName
 */
app.post('/api/member/login', async (req, res) => {
  const { pin } = req.body as { pin?: string };
  if (!pin) {
    res.status(400).json({ error: '請輸入 PIN 碼' });
    return;
  }

  try {
    const { rows } = await sql`
      SELECT real_name as "realName" FROM members WHERE pin = ${pin}
    `;
    if (rows.length === 0) {
      res.status(401).json({ error: 'PIN 碼錯誤' });
      return;
    }
    res.json({ realName: rows[0].realName });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '資料庫錯誤' });
  }
});

/**
 * GET /api/member/stats
 * Header: x-member-pin: <pin>
 * 回傳該社員所有 attended 紀錄與總加練時數
 */
app.get('/api/member/stats', async (req, res) => {
  const pin = req.headers['x-member-pin'] as string | undefined;
  if (!pin) {
    res.status(400).json({ error: '缺少 x-member-pin' });
    return;
  }

  try {
    // 先用 PIN 找 realName
    const { rows: memberRows } = await sql`
      SELECT real_name as "realName" FROM members WHERE pin = ${pin}
    `;
    if (memberRows.length === 0) {
      res.status(401).json({ error: 'PIN 碼錯誤' });
      return;
    }
    const realName = memberRows[0].realName;

    // 查詢 attended 紀錄（不返回 realName，只返回統計與日期/時段）
    const { rows } = await sql`
      SELECT id, date, time, nickname, specific_time as "specificTime", actual_time as "actualTime"
      FROM bookings
      WHERE real_name = ${realName}
        AND attendance_status = 'attended'
      ORDER BY date DESC
    `;
    res.json({ realName, records: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '資料庫查詢錯誤' });
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
          SELECT id, date, time, nickname, real_name as "realName", specific_time as "specificTime", actual_time as "actualTime", attendance_status, note, created_at 
          FROM bookings WHERE date = ${date} ORDER BY time, created_at
        `
      : await sql`
          SELECT id, date, time, nickname, real_name as "realName", specific_time as "specificTime", actual_time as "actualTime", attendance_status, note, created_at 
          FROM bookings ORDER BY date, time, created_at
        `;

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '資料庫查詢錯誤' });
  }
});

/**
 * PATCH /api/admin/bookings/:id
 * Header: x-admin-password: <password>
 * 更新出缺席狀態或備註
 */
app.patch('/api/admin/bookings/:id', async (req, res) => {
  const pwd = req.headers['x-admin-password'];
  if (pwd !== ADMIN_PASSWORD) {
    res.status(401).json({ error: '密碼錯誤' });
    return;
  }

  const { id } = req.params;
  const { attendance_status, note, actual_time } = req.body;

  try {
    if (actual_time !== undefined) {
      // 後台時間覆蓋：無格式限制，允許 null 清除覆蓋
      const val = actual_time === '' ? null : actual_time;
      await sql`UPDATE bookings SET actual_time = ${val} WHERE id = ${id}`;
    }
    if (attendance_status !== undefined && note !== undefined) {
      await sql`UPDATE bookings SET attendance_status = ${attendance_status}, note = ${note} WHERE id = ${id}`;
    } else if (attendance_status !== undefined) {
      await sql`UPDATE bookings SET attendance_status = ${attendance_status} WHERE id = ${id}`;
    } else if (note !== undefined) {
      await sql`UPDATE bookings SET note = ${note} WHERE id = ${id}`;
    }
    res.json({ message: '更新成功' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '資料庫寫入錯誤' });
  }
});

/**
 * DELETE /api/admin/clear-absent
 * Header: x-admin-password: <password>
 * 管理員刪除所有未加練的預約紀錄
 */
app.delete('/api/admin/clear-absent', async (req, res) => {
  const pwd = req.headers['x-admin-password'];
  if (pwd !== ADMIN_PASSWORD) {
    res.status(401).json({ error: '密碼錯誤' });
    return;
  }

  try {
    const result = await sql`DELETE FROM bookings WHERE attendance_status = 'absent' RETURNING id`;
    res.json({ message: `已刪除 ${result.rowCount} 筆未加練紀錄`, deleted: result.rowCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '資料庫刪除錯誤' });
  }
});

/**
 * DELETE /api/admin/bookings/:id
 * Header: x-admin-password: <password>
 * 管理員刪除單筆預約
 */
app.delete('/api/admin/bookings/:id', async (req, res) => {
  const pwd = req.headers['x-admin-password'];
  if (pwd !== ADMIN_PASSWORD) {
    res.status(401).json({ error: '密碼錯誤' });
    return;
  }

  const { id } = req.params;
  try {
    const result = await sql`DELETE FROM bookings WHERE id = ${id} RETURNING id`;
    if (result.rowCount === 0) {
      res.status(404).json({ error: '找不到此預約' });
      return;
    }
    res.json({ message: '已刪除' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '資料庫刪除錯誤' });
  }
});

/**
 * DELETE /api/admin/members/:realName
 * Header: x-admin-password: <password>
 * 管理員刪除某成員的所有預約紀錄
 */
app.delete('/api/admin/members/:realName', async (req, res) => {
  const pwd = req.headers['x-admin-password'];
  if (pwd !== ADMIN_PASSWORD) {
    res.status(401).json({ error: '密碼錯誤' });
    return;
  }

  const { realName } = req.params;
  try {
    const result = await sql`DELETE FROM bookings WHERE real_name = ${realName} RETURNING id`;
    res.json({ message: `已刪除 ${result.rowCount} 筆紀錄`, deleted: result.rowCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '資料庫刪除錯誤' });
  }
});

// ─── 管理員：社員 PIN 管理 ─────────────────────────────────

/**
 * GET /api/admin/member-pins
 * Header: x-admin-password
 * 查看所有社員 PIN
 */
app.get('/api/admin/member-pins', async (req, res) => {
  const pwd = req.headers['x-admin-password'];
  if (pwd !== ADMIN_PASSWORD) {
    res.status(401).json({ error: '密碼錯誤' });
    return;
  }
  try {
    const { rows } = await sql`
      SELECT real_name as "realName", pin, created_at as "createdAt" FROM members ORDER BY real_name
    `;
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '資料庫查詢錯誤' });
  }
});

/**
 * POST /api/admin/member-pins
 * Header: x-admin-password
 * Body: { realName, pin }
 * 新增社員 PIN
 */
app.post('/api/admin/member-pins', async (req, res) => {
  const pwd = req.headers['x-admin-password'];
  if (pwd !== ADMIN_PASSWORD) {
    res.status(401).json({ error: '密碼錯誤' });
    return;
  }
  const { realName, pin } = req.body as { realName?: string; pin?: string };
  if (!realName || !pin) {
    res.status(400).json({ error: '請填寫本名與 PIN 碼' });
    return;
  }
  try {
    await sql`
      INSERT INTO members (real_name, pin) VALUES (${realName}, ${pin})
      ON CONFLICT (real_name) DO UPDATE SET pin = ${pin}
    `;
    res.status(201).json({ message: '社員 PIN 已設定' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '資料庫寫入錯誤' });
  }
});

/**
 * DELETE /api/admin/member-pins/:realName
 * Header: x-admin-password
 * 刪除社員 PIN（不影響預約紀錄）
 */
app.delete('/api/admin/member-pins/:realName', async (req, res) => {
  const pwd = req.headers['x-admin-password'];
  if (pwd !== ADMIN_PASSWORD) {
    res.status(401).json({ error: '密碼錯誤' });
    return;
  }
  const { realName } = req.params;
  try {
    await sql`DELETE FROM members WHERE real_name = ${realName}`;
    res.json({ message: '已刪除' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '資料庫刪除錯誤' });
  }
});

// ─── 管理員：點名密碼管理 ─────────────────────────────────

/**
 * GET /api/admin/checkin-password
 * Header: x-admin-password
 * 取得當前點名密碼
 */
app.get('/api/admin/checkin-password', async (req, res) => {
  const pwd = req.headers['x-admin-password'];
  if (pwd !== ADMIN_PASSWORD) {
    res.status(401).json({ error: '密碼錯誤' });
    return;
  }
  try {
    const checkinPassword = await getOrCreateDailyCheckinPassword();
    res.json({ checkinPassword });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '資料庫查詢錯誤' });
  }
});

/**
 * PATCH /api/admin/checkin-password
 * Header: x-admin-password
 * Body: { checkinPassword }
 * 更新點名密碼
 */
app.patch('/api/admin/checkin-password', async (req, res) => {
  const pwd = req.headers['x-admin-password'];
  if (pwd !== ADMIN_PASSWORD) {
    res.status(401).json({ error: '密碼錯誤' });
    return;
  }
  const { checkinPassword } = req.body as { checkinPassword?: string };
  if (!checkinPassword) {
    res.status(400).json({ error: '請輸入新的點名密碼' });
    return;
  }
  const todayStr = getTodayTW();
  const trimmed = checkinPassword.trim();
  try {
    await sql`
      INSERT INTO checkin_config (key, value) VALUES ('checkin_password', ${trimmed})
      ON CONFLICT (key) DO UPDATE SET value = ${trimmed}
    `;
    await sql`
      INSERT INTO checkin_config (key, value) VALUES ('checkin_password_date', ${todayStr})
      ON CONFLICT (key) DO UPDATE SET value = ${todayStr}
    `;
    res.json({ message: '點名密碼已更新', checkinPassword: trimmed });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '資料庫寫入錯誤' });
  }
});

// ─── 社課點名 API ─────────────────────────────────────────

/**
 * GET /api/class/session/:sessionId
 * 取得社課場次公開資訊（供學生掃碼後確認場次名稱與開放狀態）
 */
app.get('/api/class/session/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  try {
    const { rows } = await sql`
      SELECT id, name, date, is_open as "isOpen", created_at as "createdAt"
      FROM class_sessions
      WHERE id = ${sessionId}
    `;
    if (rows.length === 0) {
      res.status(404).json({ error: '找不到此社課場次或 QR Code 已失效' });
      return;
    }
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '資料庫錯誤' });
  }
});

/**
 * POST /api/class/session/:sessionId/checkin
 * Body: { pin }
 * 學生掃碼輸入學號 (PIN) 簽到社課
 */
app.post('/api/class/session/:sessionId/checkin', async (req, res) => {
  const { sessionId } = req.params;
  const { pin } = req.body as { pin?: string };

  if (!pin) {
    res.status(400).json({ error: '請輸入學號 (PIN)' });
    return;
  }

  try {
    // 1. 確認場次存在且開啟
    const { rows: sessionRows } = await sql`
      SELECT id, name, date, is_open as "isOpen"
      FROM class_sessions
      WHERE id = ${sessionId}
    `;
    if (sessionRows.length === 0) {
      res.status(404).json({ error: '找不到此社課場次' });
      return;
    }
    if (!sessionRows[0].isOpen) {
      res.status(400).json({ error: '此社課場次點名已關閉' });
      return;
    }

    // 2. 驗證學號 (PIN) 是否存在於 members
    const { rows: memberRows } = await sql`
      SELECT real_name as "realName" FROM members WHERE pin = ${pin.trim()}
    `;
    if (memberRows.length === 0) {
      res.status(404).json({ error: '找不到此學號，請先至「我的紀錄」進行首次設定（綁定姓名與學號）' });
      return;
    }
    const realName = memberRows[0].realName;

    // 3. 檢查是否已經點名過
    const { rows: existRows } = await sql`
      SELECT id FROM class_attendance
      WHERE session_id = ${sessionId} AND real_name = ${realName}
    `;
    if (existRows.length > 0) {
      res.status(409).json({ error: `${realName} 同學，您已於稍早完成本社課點名！`, realName, alreadyChecked: true });
      return;
    }

    // 4. 寫入出席紀錄
    await sql`
      INSERT INTO class_attendance (session_id, real_name)
      VALUES (${sessionId}, ${realName})
    `;

    res.status(201).json({
      message: `點名成功！歡迎 ${realName} 同學參加「${sessionRows[0].name}」社課 🐎`,
      realName,
      sessionName: sessionRows[0].name,
      date: sessionRows[0].date
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '資料庫寫入錯誤' });
  }
});

/**
 * GET /api/member/class-stats
 * Header: x-member-pin
 * 查詢該社員的所有社課出席紀錄
 */
app.get('/api/member/class-stats', async (req, res) => {
  const pin = req.headers['x-member-pin'] as string | undefined;
  if (!pin) {
    res.status(400).json({ error: '缺少 x-member-pin' });
    return;
  }

  try {
    const { rows: memberRows } = await sql`
      SELECT real_name as "realName" FROM members WHERE pin = ${pin.trim()}
    `;
    if (memberRows.length === 0) {
      res.status(401).json({ error: 'PIN 碼錯誤' });
      return;
    }
    const realName = memberRows[0].realName;

    const { rows } = await sql`
      SELECT a.id, a.session_id as "sessionId", a.checked_at as "checkedAt", s.name as "sessionName", s.date
      FROM class_attendance a
      JOIN class_sessions s ON a.session_id = s.id
      WHERE a.real_name = ${realName}
      ORDER BY a.checked_at DESC
    `;

    res.json({ realName, records: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '資料庫查詢錯誤' });
  }
});

// ─── 管理員：社課場次與名單管理 ─────────────────────────────

/**
 * GET /api/admin/class-sessions
 * Header: x-admin-password
 * 取得所有社課場次與出席名單
 */
app.get('/api/admin/class-sessions', async (req, res) => {
  const pwd = req.headers['x-admin-password'];
  if (pwd !== ADMIN_PASSWORD) {
    res.status(401).json({ error: '密碼錯誤' });
    return;
  }

  try {
    const { rows: sessions } = await sql`
      SELECT id, name, date, is_open as "isOpen", created_at as "createdAt"
      FROM class_sessions
      ORDER BY date DESC, created_at DESC
    `;

    const { rows: attendances } = await sql`
      SELECT id, session_id as "sessionId", real_name as "realName", checked_at as "checkedAt"
      FROM class_attendance
      ORDER BY checked_at ASC
    `;

    const result = sessions.map(s => ({
      ...s,
      attendees: attendances.filter(a => a.sessionId === s.id)
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '資料庫查詢錯誤' });
  }
});

/**
 * POST /api/admin/class-sessions
 * Header: x-admin-password
 * Body: { name, date }
 * 建立新社課場次
 */
app.post('/api/admin/class-sessions', async (req, res) => {
  const pwd = req.headers['x-admin-password'];
  if (pwd !== ADMIN_PASSWORD) {
    res.status(401).json({ error: '密碼錯誤' });
    return;
  }

  const { name, date } = req.body as { name?: string; date?: string };
  if (!name || !date) {
    res.status(400).json({ error: '請填寫社課名稱與日期' });
    return;
  }

  const sessionId = 'cls_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36).slice(-4);
  try {
    await sql`
      INSERT INTO class_sessions (id, name, date, is_open)
      VALUES (${sessionId}, ${name.trim()}, ${date.trim()}, true)
    `;
    res.status(201).json({
      id: sessionId,
      name: name.trim(),
      date: date.trim(),
      isOpen: true,
      message: '社課場次已建立'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '資料庫寫入錯誤' });
  }
});

/**
 * PATCH /api/admin/class-sessions/:id
 * Header: x-admin-password
 * Body: { isOpen, name, date }
 * 更新社課場次狀態（開啟/關閉點名）或資訊
 */
app.patch('/api/admin/class-sessions/:id', async (req, res) => {
  const pwd = req.headers['x-admin-password'];
  if (pwd !== ADMIN_PASSWORD) {
    res.status(401).json({ error: '密碼錯誤' });
    return;
  }

  const { id } = req.params;
  const { isOpen, name, date } = req.body as { isOpen?: boolean; name?: string; date?: string };

  try {
    if (isOpen !== undefined) {
      await sql`UPDATE class_sessions SET is_open = ${isOpen} WHERE id = ${id}`;
    }
    if (name) {
      await sql`UPDATE class_sessions SET name = ${name.trim()} WHERE id = ${id}`;
    }
    if (date) {
      await sql`UPDATE class_sessions SET date = ${date.trim()} WHERE id = ${id}`;
    }
    res.json({ message: '場次已更新' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '資料庫寫入錯誤' });
  }
});

/**
 * DELETE /api/admin/class-sessions/:id
 * Header: x-admin-password
 * 刪除社課場次及出席紀錄
 */
app.delete('/api/admin/class-sessions/:id', async (req, res) => {
  const pwd = req.headers['x-admin-password'];
  if (pwd !== ADMIN_PASSWORD) {
    res.status(401).json({ error: '密碼錯誤' });
    return;
  }

  const { id } = req.params;
  try {
    await sql`DELETE FROM class_attendance WHERE session_id = ${id}`;
    await sql`DELETE FROM class_sessions WHERE id = ${id}`;
    res.json({ message: '社課場次與出席紀錄已刪除' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '資料庫刪除錯誤' });
  }
});

/**
 * DELETE /api/admin/class-attendance/:id
 * Header: x-admin-password
 * 刪除單筆社課出席紀錄
 */
app.delete('/api/admin/class-attendance/:id', async (req, res) => {
  const pwd = req.headers['x-admin-password'];
  if (pwd !== ADMIN_PASSWORD) {
    res.status(401).json({ error: '密碼錯誤' });
    return;
  }

  const { id } = req.params;
  try {
    await sql`DELETE FROM class_attendance WHERE id = ${id}`;
    res.json({ message: '出席紀錄已刪除' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '資料庫刪除錯誤' });
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
