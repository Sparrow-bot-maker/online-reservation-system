# 114-2 馬術社加練預約系統 (Online Reservation System)

專為手機與桌面優化的輕量化馬術社加練預約平台，支援社員免登入預約、週五晨練特殊時段、時長驗證，以及教練/管理員後台點名、時數統計、時間覆蓋與批次清理。

---

## 🛠️ 技術棧 (Tech Stack)

- **前端 (Frontend)**: React 19, TypeScript, Tailwind CSS v4, Lucide React, Motion
- **後端 (Backend)**: Express.js (TypeScript via `tsx`), Vercel Serverless Function (`api/index.ts`)
- **資料庫 (Database)**: Vercel Postgres (`@vercel/postgres`) / 本機 SQLite (`better-sqlite3`)
- **建置工具 (Build Tool)**: Vite 6

---

## 📁 核心架構與重要檔案

```
extracted/
├── src/
│   ├── App.tsx          # 前端核心元件（包含前台預約、表單驗證、我的預約側欄、管理員後台）
│   ├── main.tsx         # React 入口
│   └── index.css        # Tailwind CSS 樣式
├── server/
│   ├── index.ts         # Express 後端 API（路由定義、密碼驗證、時段邏輯）
│   └── db.ts            # 資料庫連線與結構初始化
├── api/
│   └── index.ts         # Vercel Serverless Function 入口 (轉發至 server/index.ts)
├── vercel.json          # Vercel 重寫與部署設定
├── vite.config.ts       # Vite 配置
└── package.json
```

---

## ⚙️ 業務邏輯與規則 (Business Logic)

1. **日期範圍 (Allowed Dates)**:
   - 以台灣時間 (UTC+8) 計算，開放包含今天在內的未來 4 天。
2. **預約時段 (Time Slots)**:
   - **平日 (週一至週四)**: `09:00 - 12:00`、`14:00 - 19:00`
   - **週末 (週六、週日)**: `09:00 - 12:00`、`14:00 - 18:00`
   - **週五固定晨練 (Friday Morning)**: `06:00 - 08:00`（獨立快速報名，免填加練時長與邊界限制）
3. **加練時長驗證**:
   - 一般預約需輸入具體時間（格式如 `14:00~16:00`），時長必須 >= 2 小時，且必須完整落在所選大時段內。
4. **管理員後台 (Admin Panel)**:
   - Header 帶入 `x-admin-password` 驗證。
   - 支援點名狀態 (`pending` 待確認 / `attended` 已點名 / `absent` 未加練)。
   - 支援實際加練時間覆蓋 (`actual_time`)，自動重算個人累積加練時數。
   - 支援一鍵批次刪除所有未加練紀錄 (`DELETE /api/admin/clear-absent`)。

---

## 🚀 常用指令 (Development & Build Commands)

```bash
# 安裝相依套件
npm install

# 同步啟動前後端 (前端 :3000, 後端 :3001)
npm run dev:all

# 單獨啟動前端
npm run dev

# 單獨啟動後端
npm run server

# 專案打包
npm run build

# 型別檢查
npm run lint
```
