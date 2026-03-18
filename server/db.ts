import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'bookings.db');

const db = new Database(DB_PATH);

// 建立資料表
db.exec(`
  CREATE TABLE IF NOT EXISTS bookings (
    id        TEXT PRIMARY KEY,
    date      TEXT NOT NULL,
    time      TEXT NOT NULL,
    nickname  TEXT NOT NULL,
    real_name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_date ON bookings(date);
`);

export default db;
