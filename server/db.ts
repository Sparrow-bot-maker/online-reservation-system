import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Vercel filesystem 是唯讀的，只有 /tmp 允許寫入
const DB_PATH = process.env.VERCEL ? '/tmp/bookings.db' : path.join(__dirname, '..', 'bookings.db');

const db = new Database(DB_PATH);

// 建立資料表
db.exec(`
  CREATE TABLE IF NOT EXISTS bookings (
    id            TEXT PRIMARY KEY,
    date          TEXT NOT NULL,
    time          TEXT NOT NULL,
    nickname      TEXT NOT NULL,
    real_name     TEXT NOT NULL,
    specific_time TEXT NOT NULL DEFAULT '',
    created_at    TEXT DEFAULT (datetime('now', 'localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_date ON bookings(date);
`);

// 兼容舊資料表：若欄位不存在則新增（SQLite 不支援 IF NOT EXISTS on columns）
try {
  db.exec(`ALTER TABLE bookings ADD COLUMN specific_time TEXT NOT NULL DEFAULT ''`);
} catch {
  // 欄位已存在，忽略錯誤
}

export default db;
