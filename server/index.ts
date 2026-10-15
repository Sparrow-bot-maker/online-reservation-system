import express from 'express';
import type { VercelPoolClient } from '@vercel/postgres';
import sql, { initDb, autoMarkAbsent } from './db.js';

const app = express();
app.use(express.json());

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'sparrow';

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

/** 根據具體時間或時段判斷屬於上午或下午時段 */
const MAX_PRACTICE_PER_PERIOD = 8;

function getPracticePeriod(timeStr: string): 'morning' | 'afternoon' | null {
  if (!timeStr) return null;
  const clean = sanitizeTime(timeStr);
  const parts = clean.split(/[~-]/);
  if (!parts[0]) return null;
  const [h, m] = parts[0].split(':').map(Number);
  const s = (h || 0) * 60 + (m || 0);
  if (s >= 9 * 60 && s < 12 * 60) return 'morning';
  if (s >= 14 * 60 && s < 19 * 60) return 'afternoon';
  return null;
}

/** 自此日期（含）起，下午加練最晚結束時間由 19:00 改為 18:00 */
const AFTERNOON_END_CHANGE_DATE = '2026-10-08';
function getAfternoonEnd(date: string): number {
  return date >= AFTERNOON_END_CHANGE_DATE ? 18 * 60 : 19 * 60;
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

/** 取得允許的日期清單（今天 ~ 今天+6 天，UTC+8） */
function getAllowedDates(): string[] {
  const today = getTodayTW();
  const base = new Date(today + 'T00:00:00Z');
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base.getTime() + i * 86400000);
    return d.toISOString().split('T')[0];
  });
}

// ─── 社員學號 / 姓名工具 ───────────────────────────────────

/** 學號格式：英文字母 + 數字組合（兩者皆至少一個），4~20 字元；一律轉大寫儲存與比對 */
const PIN_REGEX = /^(?=.*[A-Z])(?=.*\d)[A-Z0-9]{4,20}$/;

function normalizePin(raw: unknown): string {
  return String(raw ?? '').trim().toUpperCase();
}

function normalizeName(raw: unknown): string {
  return String(raw ?? '').trim().replace(/\s+/g, ' ');
}

function pinFormatError(pin: string): string | null {
  if (!pin) return '請輸入學號';
  if (!PIN_REGEX.test(pin)) {
    return '學號格式錯誤：需為英文字母與數字的組合（例如 S12345678），4–20 字元，不可含空白或符號';
  }
  return null;
}

type MemberLookup = {
  ok: boolean;
  realName?: string;
  pin?: string;
  status?: number;
  error?: string;
};

/** 以學號（不分大小寫）或完整本名查詢名冊；名冊外的輸入一律視為查無此人 */
async function findMember(query: string): Promise<MemberLookup> {
  const q = normalizeName(query);
  if (!q) return { ok: false, status: 400, error: '請輸入學號或姓名' };
  const { rows } = await sql`
    SELECT real_name as "realName", pin FROM members
    WHERE UPPER(pin) = ${q.toUpperCase()} OR real_name = ${q}
  `;
  if (rows.length === 0) {
    return { ok: false, status: 404, error: '名冊中查無此學號或姓名，請確認輸入是否正確，或先完成首次登記' };
  }
  if (rows.length > 1) {
    return { ok: false, status: 409, error: '此學號對應到多位社員，請聯絡幹部修正名冊' };
  }
  return { ok: true, realName: rows[0].realName, pin: rows[0].pin };
}

/** 取得查詢字串：優先 ?q=（支援中文），相容舊版 x-member-pin header */
function getMemberQuery(req: express.Request): string {
  const q = req.query.q;
  if (typeof q === 'string' && q.trim()) return q;
  return (req.headers['x-member-pin'] as string | undefined) ?? '';
}

/** 以單一連線執行交易 */
async function withTransaction<T>(fn: (client: VercelPoolClient) => Promise<T>): Promise<T> {
  const client = await sql.connect();
  try {
    await client.sql`BEGIN`;
    const result = await fn(client);
    await client.sql`COMMIT`;
    return result;
  } catch (err) {
    await client.sql`ROLLBACK`.catch(() => {});
    throw err;
  } finally {
    client.release();
  }
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
      SELECT id, date, time, nickname, attendance_status FROM bookings WHERE date = ${date} ORDER BY created_at
    `;
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '資料庫錯誤' });
  }
});

/**
 * POST /api/bookings
 * Body: { date, time, nickname, realName, specificTime, studentId? }
 * 新增預約，後端驗證日期範圍與容量
 */
app.post('/api/bookings', async (req, res) => {
  const { date, time, nickname, realName, specificTime, isMorningTraining, studentId } = req.body as {
    date?: string;
    time?: string;
    nickname?: string;
    realName?: string;
    specificTime?: string;
    isMorningTraining?: boolean;
    studentId?: string;
  };

  // 欄位驗證
  if (!date || !time || !nickname || !realName || !specificTime) {
    res.status(400).json({ error: '請填寫所有必填欄位 (date, time, nickname, realName, specificTime)' });
    return;
  }

  // 學號驗證：若有帶學號，格式必須正確；學號已在名冊時，姓名必須與名冊一致（紀錄以本名關聯）
  let finalRealName = normalizeName(realName);
  const normalizedStudentId = normalizePin(studentId);
  if (normalizedStudentId) {
    const fmtErr = pinFormatError(normalizedStudentId);
    if (fmtErr) {
      res.status(400).json({ error: fmtErr });
      return;
    }
    try {
      const { rows } = await sql`
        SELECT real_name as "realName" FROM members WHERE UPPER(pin) = ${normalizedStudentId}
      `;
      if (rows.length === 1) {
        if (rows[0].realName !== finalRealName) {
          res.status(400).json({ error: '學號與名冊登記的姓名不符，請確認本名是否正確（若名冊有誤請聯絡幹部）' });
          return;
        }
        finalRealName = rows[0].realName;
      }
    } catch (err) {
      console.error('學號比對失敗:', err);
    }
  }

  // 日期範圍驗證
  const allowed = getAllowedDates();
  if (!allowed.includes(date)) {
    res.status(400).json({ error: '預約日期必須在今天至六天後之間' });
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

  // 驗證預約日期不可為過去或當日（台灣時間 UTC+8）：當日僅可取消，新增需為明日之後
  const todayStr = getTodayTW();
  if (date < todayStr) {
    res.status(400).json({ error: '無法預約過去的日期' });
    return;
  }

  if (date === todayStr) {
    res.status(400).json({ error: '當日不開放新增加練預約（當日僅可取消），請選擇明日或之後的日期' });
    return;
  }

  // 驗證下午時段最晚結束時間（2026-10-08 起改為 18:00）
  if (!isFixedMorning) {
    const [sStart, sEnd] = sanitizedSpecificTime.split('~');
    const toMins = (t?: string) => {
      const [h, m] = (t || '').split(':').map(Number);
      return (h || 0) * 60 + (m || 0);
    };
    const startMins = toMins(sStart);
    const endMins = toMins(sEnd);
    if (startMins % 30 !== 0 || endMins % 30 !== 0) {
      res.status(400).json({ error: '預約時間必須以 30 分鐘為間隔（例如整點或半點）' });
      return;
    }
    const afternoonEnd = getAfternoonEnd(date);
    if (startMins >= 14 * 60 && endMins > afternoonEnd) {
      res.status(400).json({ error: `下午時段加練需在 ${afternoonEnd / 60}:00 前結束` });
      return;
    }
  }

  // 驗證上午/下午時段 8 人上限
  const targetPeriod = getPracticePeriod(sanitizedSpecificTime) || getPracticePeriod(time);
  if (targetPeriod) {
    try {
      const { rows: existingRows } = await sql`
        SELECT time, specific_time FROM bookings WHERE date = ${date}
      `;
      const periodCount = existingRows.filter((r) => {
        const p = getPracticePeriod(r.specific_time) || getPracticePeriod(r.time);
        return p === targetPeriod;
      }).length;

      if (periodCount >= MAX_PRACTICE_PER_PERIOD) {
        const periodName = targetPeriod === 'morning' ? '上午時段' : '下午時段';
        res.status(400).json({ error: `${date} ${periodName}加練預約已達上限（最多 ${MAX_PRACTICE_PER_PERIOD} 人，目前已額滿）` });
        return;
      }
    } catch (err) {
      console.error('查詢既有預約數量失敗:', err);
    }
  }

  // 新增預約
  const id = Math.random().toString(36).substring(2, 9);
  try {
    await sql`
      INSERT INTO bookings (id, date, time, nickname, real_name, specific_time) 
      VALUES (${id}, ${date}, ${time}, ${nickname}, ${finalRealName}, ${sanitizedSpecificTime})
    `;
    
    res.status(201).json({
      id,
      date,
      time,
      nickname,
      realName: finalRealName,
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
 * - 學號需為英數組合，統一轉大寫
 * - 學號已被其他本名使用 → 409
 * - 本名已綁定其他學號 → 409（需由幹部修改）
 * - 本名 + 學號完全相同 → 200（視為已登記，直接查詢）
 */
app.post('/api/member/register', async (req, res) => {
  const realName = normalizeName(req.body?.realName);
  const pin = normalizePin(req.body?.pin);
  if (!realName) {
    res.status(400).json({ error: '請填寫本名' });
    return;
  }
  const fmtErr = pinFormatError(pin);
  if (fmtErr) {
    res.status(400).json({ error: fmtErr });
    return;
  }
  try {
    const { rows } = await sql`
      SELECT real_name as "realName", pin FROM members
      WHERE real_name = ${realName} OR UPPER(pin) = ${pin}
    `;
    if (rows.some((r) => r.realName !== realName)) {
      res.status(409).json({ error: '此學號已被其他社員登記，若有誤請聯絡幹部' });
      return;
    }
    const sameName = rows.find((r) => r.realName === realName);
    if (sameName) {
      if (normalizePin(sameName.pin) === pin) {
        res.json({ message: '您已完成登記', realName, pin, alreadyRegistered: true });
        return;
      }
      res.status(409).json({ error: '此本名已綁定其他學號，若需更改請聯絡幹部' });
      return;
    }
    await sql`INSERT INTO members (real_name, pin) VALUES (${realName}, ${pin})`;
    res.status(201).json({ message: '設定成功，歡迎 ' + realName, realName, pin });
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
      SELECT real_name as "realName" FROM members WHERE UPPER(pin) = ${normalizePin(pin)}
    `;
    if (rows.length !== 1) {
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
 * GET /api/member/stats?q=<學號或本名>
 * （相容舊版 Header: x-member-pin）
 * 回傳該社員所有 attended 紀錄；名冊中不存在的學號/姓名一律 404
 */
app.get('/api/member/stats', async (req, res) => {
  try {
    const member = await findMember(getMemberQuery(req));
    if (!member.ok) {
      res.status(member.status).json({ error: member.error });
      return;
    }

    const { rows } = await sql`
      SELECT id, date, time, nickname, specific_time as "specificTime", actual_time as "actualTime"
      FROM bookings
      WHERE real_name = ${member.realName}
        AND attendance_status = 'attended'
      ORDER BY date DESC
    `;
    res.json({ realName: member.realName, pin: member.pin, records: rows });
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
 * 管理員刪除某成員的全部資料：名冊綁定 + 所有加練預約 + 社課出席紀錄
 * （舊版只刪 bookings，名冊列仍在，導致成員名單上看起來「沒刪掉」）
 */
app.delete('/api/admin/members/:realName', async (req, res) => {
  const pwd = req.headers['x-admin-password'];
  if (pwd !== ADMIN_PASSWORD) {
    res.status(401).json({ error: '密碼錯誤' });
    return;
  }

  const { realName } = req.params;
  try {
    const counts = await withTransaction(async (client) => {
      const b = await client.sql`DELETE FROM bookings WHERE real_name = ${realName} RETURNING id`;
      const c = await client.sql`DELETE FROM class_attendance WHERE real_name = ${realName} RETURNING id`;
      const m = await client.sql`DELETE FROM members WHERE real_name = ${realName} RETURNING real_name`;
      return { bookings: b.rowCount ?? 0, classAttendance: c.rowCount ?? 0, member: m.rowCount ?? 0 };
    });
    res.json({
      message: `已刪除 ${realName}：加練 ${counts.bookings} 筆、社課 ${counts.classAttendance} 筆${counts.member ? '、名冊綁定' : ''}`,
      deleted: counts,
    });
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
 * 新增社員 PIN（本名已存在則更新學號）
 */
app.post('/api/admin/member-pins', async (req, res) => {
  const pwd = req.headers['x-admin-password'];
  if (pwd !== ADMIN_PASSWORD) {
    res.status(401).json({ error: '密碼錯誤' });
    return;
  }
  const realName = normalizeName(req.body?.realName);
  const pin = normalizePin(req.body?.pin);
  if (!realName) {
    res.status(400).json({ error: '請填寫本名' });
    return;
  }
  const fmtErr = pinFormatError(pin);
  if (fmtErr) {
    res.status(400).json({ error: fmtErr });
    return;
  }
  try {
    const { rows: dup } = await sql`
      SELECT real_name as "realName" FROM members WHERE UPPER(pin) = ${pin} AND real_name <> ${realName}
    `;
    if (dup.length > 0) {
      res.status(409).json({ error: `學號 ${pin} 已綁定給「${dup[0].realName}」` });
      return;
    }
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
 * PATCH /api/admin/member-pins/:realName
 * Header: x-admin-password
 * Body: { realName, pin }
 * 修改既有名冊的姓名與學號；改名時同步更新 bookings / class_attendance 的 real_name，歷史紀錄不脫鉤
 */
app.patch('/api/admin/member-pins/:realName', async (req, res) => {
  const pwd = req.headers['x-admin-password'];
  if (pwd !== ADMIN_PASSWORD) {
    res.status(401).json({ error: '密碼錯誤' });
    return;
  }
  const oldName = req.params.realName;
  const newName = normalizeName(req.body?.realName);
  const newPin = normalizePin(req.body?.pin);
  if (!newName) {
    res.status(400).json({ error: '請填寫本名' });
    return;
  }
  const fmtErr = pinFormatError(newPin);
  if (fmtErr) {
    res.status(400).json({ error: fmtErr });
    return;
  }

  try {
    const result = await withTransaction(async (client) => {
      const { rows: existing } = await client.sql`SELECT real_name FROM members WHERE real_name = ${oldName}`;
      if (existing.length === 0) return { status: 404, error: '找不到此社員' };

      if (newName !== oldName) {
        const { rows: nameTaken } = await client.sql`SELECT real_name FROM members WHERE real_name = ${newName}`;
        if (nameTaken.length > 0) {
          return { status: 409, error: `名冊已有「${newName}」，若為同一人請先刪除其中一筆再改名` };
        }
      }
      const { rows: pinTaken } = await client.sql`
        SELECT real_name as "realName" FROM members WHERE UPPER(pin) = ${newPin} AND real_name <> ${oldName}
      `;
      if (pinTaken.length > 0) {
        return { status: 409, error: `學號 ${newPin} 已綁定給「${pinTaken[0].realName}」` };
      }

      await client.sql`UPDATE members SET real_name = ${newName}, pin = ${newPin} WHERE real_name = ${oldName}`;
      let movedBookings = 0;
      let movedClasses = 0;
      if (newName !== oldName) {
        const b = await client.sql`UPDATE bookings SET real_name = ${newName} WHERE real_name = ${oldName}`;
        const c = await client.sql`UPDATE class_attendance SET real_name = ${newName} WHERE real_name = ${oldName}`;
        movedBookings = b.rowCount ?? 0;
        movedClasses = c.rowCount ?? 0;
      }
      return { status: 200, movedBookings, movedClasses };
    });

    if ('error' in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({
      message: '名冊已更新',
      realName: newName,
      pin: newPin,
      movedBookings: result.movedBookings,
      movedClasses: result.movedClasses,
    });
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
/**
 * DELETE /api/admin/clear-all-data
 * Header: x-admin-password
 * 學期末一鍵清空所有成員名冊、加練預約與社課出席紀錄
 */
app.delete('/api/admin/clear-all-data', async (req, res) => {
  const pwd = req.headers['x-admin-password'];
  if (pwd !== ADMIN_PASSWORD) {
    res.status(401).json({ error: '密碼錯誤' });
    return;
  }
  try {
    await sql`DELETE FROM class_attendance`;
    await sql`DELETE FROM bookings`;
    await sql`DELETE FROM members`;
    res.json({ message: '本學期所有成員名冊、加練預約與社課出席紀錄已全數清空！' });
  } catch (err) {
    console.error('清空資料失敗:', err);
    res.status(500).json({ error: '資料庫清空錯誤' });
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
      SELECT real_name as "realName" FROM members WHERE UPPER(pin) = ${normalizePin(pin)}
    `;
    if (memberRows.length === 0) {
      res.status(404).json({ error: '找不到此學號，請先至「我的紀錄」進行首次設定（綁定姓名與學號）' });
      return;
    }
    if (memberRows.length > 1) {
      res.status(409).json({ error: '此學號對應到多位社員，請聯絡幹部修正名冊' });
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
 * GET /api/member/class-stats?q=<學號或本名>
 * （相容舊版 Header: x-member-pin）
 * 查詢該社員的所有社課出席紀錄
 */
app.get('/api/member/class-stats', async (req, res) => {
  try {
    const member = await findMember(getMemberQuery(req));
    if (!member.ok) {
      res.status(member.status).json({ error: member.error });
      return;
    }
    const realName = member.realName;

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

  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let sessionId = '';
  for (let i = 0; i < 10; i++) {
    sessionId += chars.charAt(Math.floor(Math.random() * chars.length));
  }
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
