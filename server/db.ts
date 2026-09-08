import { sql } from '@vercel/postgres';

// 初始化資料庫資料表
export async function initDb() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS bookings (
        id            VARCHAR(255) PRIMARY KEY,
        date          VARCHAR(255) NOT NULL,
        time          VARCHAR(255) NOT NULL,
        nickname      VARCHAR(255) NOT NULL,
        real_name     VARCHAR(255) NOT NULL,
        specific_time VARCHAR(255) NOT NULL DEFAULT '',
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // 確保新增 attendance_status 和 note 欄位
    await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS attendance_status VARCHAR(50) DEFAULT 'pending';`;
    await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS note TEXT DEFAULT '';`;
    // 後台時間覆蓋欄位（NULL = 使用原始 specific_time）
    await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS actual_time VARCHAR(255) DEFAULT NULL;`;

    // 社員 PIN 表
    await sql`
      CREATE TABLE IF NOT EXISTS members (
        real_name  VARCHAR(255) PRIMARY KEY,
        pin        VARCHAR(50)  NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // 點名密碼設定表（只會有一列，key='checkin_password'）
    await sql`
      CREATE TABLE IF NOT EXISTS checkin_config (
        key   VARCHAR(100) PRIMARY KEY,
        value TEXT NOT NULL
      );
    `;
    // 預設點名密碼
    await sql`
      INSERT INTO checkin_config (key, value)
      VALUES ('checkin_password', 'checkin123')
      ON CONFLICT (key) DO NOTHING;
    `;

    // 社課場次表
    await sql`
      CREATE TABLE IF NOT EXISTS class_sessions (
        id          VARCHAR(100) PRIMARY KEY,
        name        VARCHAR(255) NOT NULL,
        date        VARCHAR(50) NOT NULL,
        is_open     BOOLEAN DEFAULT true,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // 社課出席紀錄表
    await sql`
      CREATE TABLE IF NOT EXISTS class_attendance (
        id          SERIAL PRIMARY KEY,
        session_id  VARCHAR(100) NOT NULL,
        real_name   VARCHAR(255) NOT NULL,
        checked_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    console.log('✅ 資料庫資料表結構確保完畢 (Vercel Postgres)');
  } catch (err) {
    console.error('❌ 初始化資料庫失敗:', err);
  }
}

/** 自動將昨天（台灣時間）所有 pending 的預約改為 absent */
export async function autoMarkAbsent() {
  try {
    // 台灣時間今天 YYYY-MM-DD
    const now = new Date();
    const tw = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const todayStr = tw.toISOString().split('T')[0];

    const result = await sql`
      UPDATE bookings
      SET attendance_status = 'absent'
      WHERE attendance_status = 'pending'
        AND date < ${todayStr}
    `;
    if ((result.rowCount ?? 0) > 0) {
      console.log(`⏰ 自動標記 ${result.rowCount} 筆過期預約為未加練`);
    }
  } catch (err) {
    console.error('❌ 自動標記 absent 失敗:', err);
  }
}

export default sql;
