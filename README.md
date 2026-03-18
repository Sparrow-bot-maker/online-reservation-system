# 馬術社線上預約系統

🐎 馬術社線上預約系統：專為手機優化的輕量化預約平台。支持社員時段預約（限額 4 人）與管理者名單控管。

## 功能

- 📅 開放今日起 4 天內的預約（含今天）
- 👥 每個時段最多 4 人
- 🔒 免登入預約，使用 `localStorage` 追蹤本機預約記錄
- ❌ 可取消自己的預約
- 🛡️ 管理員後台：以密碼驗證，可檢視所有預約（含真實姓名）

## 技術架構

| 層級 | 技術 |
|------|------|
| 前端 | React 19 + TypeScript + Tailwind CSS v4 |
| 後端 | Express.js + TypeScript（tsx 執行） |
| 資料庫 | SQLite（better-sqlite3） |
| 建置工具 | Vite 6 |

## 資料庫架構

```sql
CREATE TABLE IF NOT EXISTS bookings (
  id        TEXT PRIMARY KEY,         -- 隨機 7 碼識別碼
  date      TEXT NOT NULL,            -- YYYY-MM-DD（UTC+8）
  time      TEXT NOT NULL,            -- e.g. "09:00 - 10:00"
  nickname  TEXT NOT NULL,            -- 公開顯示的綽號
  real_name TEXT NOT NULL,            -- 管理員專用本名
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX IF NOT EXISTS idx_date ON bookings(date);
```

## API 端點

| 方法 | 路徑 | 說明 |
|------|------|------|
| `GET` | `/api/bookings?date=YYYY-MM-DD` | 取得指定日期預約（不含本名） |
| `POST` | `/api/bookings` | 新增預約 |
| `DELETE` | `/api/bookings/:id` | 取消預約 |
| `GET` | `/api/admin/bookings?date=YYYY-MM-DD` | 管理員查詢（需 Header: `x-admin-password`） |

### POST /api/bookings 請求格式

```json
{
  "date": "2025-01-01",
  "time": "09:00 - 10:00",
  "nickname": "小明",
  "realName": "王小明"
}
```

## 本機開發

**前置需求：** Node.js 18+

```bash
# 1. 安裝依賴
npm install

# 2. 設定環境變數
cp .env.example .env
# 編輯 .env，設定 ADMIN_PASSWORD

# 3. 同時啟動前端 (port 3000) 與後端 (port 3001)
npm run dev:all
```

瀏覽器開啟 [http://localhost:3000](http://localhost:3000)

### 單獨啟動

```bash
npm run dev      # 只啟前端
npm run server   # 只啟後端
```

## 環境變數

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `ADMIN_PASSWORD` | `admin123` | 管理員後台密碼，**正式環境請務必更換** |
| `PORT` | `3001` | 後端伺服器 Port |

## 部署注意事項

- `bookings.db` 已列入 `.gitignore`，含用戶個資，**請勿上傳至版本控制**
- 正式環境建議：
  - 更換強密碼 `ADMIN_PASSWORD`
  - 使用反向代理（Nginx）統一對外 Port
  - 定期備份 `bookings.db`

## 專案結構

```
├── src/
│   └── App.tsx          # 前端主程式（React）
├── server/
│   ├── index.ts         # Express 後端 + API 路由
│   └── db.ts            # SQLite 初始化
├── index.html
├── vite.config.ts
├── package.json
└── .env.example
```
