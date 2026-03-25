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

    console.log('✅ 資料庫資料表結構確保完畢 (Vercel Postgres)');
  } catch (err) {
    console.error('❌ 初始化資料庫失敗:', err);
  }
}

export default sql;
