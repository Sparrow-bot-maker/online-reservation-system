import React, { useState, useEffect, useCallback, useRef } from 'react';
import QRCodeLib from 'qrcode';
import {
  Calendar,
  Clock,
  User,
  X,
  CheckCircle2,
  AlertCircle,
  Shield,
  Lock,
  QrCode,
  RefreshCw,
  Dumbbell,
  ClipboardList,
  Search,
  Award,
  Sparkles,
  ChevronRight,
  GraduationCap,
  Users,
  Settings,
  Trash2,
  Copy,
  Check,
  KeyRound,
  ExternalLink,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type Booking = {
  id: string;
  date: string;
  time: string; // "HH:MM - HH:MM"
  nickname: string;
  realName: string;
  studentId?: string;
  createdAt?: string;
};

type ClassSession = {
  id: string; // 10 位隨機英數組合代碼
  name: string;
  date: string;
  isOpen: boolean;
  createdAt: string;
  attendees: {
    id: string;
    studentId: string;
    nickname: string;
    realName: string;
    checkedAt: string;
  }[];
};

// ─── Constants ───────────────────────────────────────────────────────────────

const MIN_DURATION_MINS = 120; // 加練需滿 2 小時

const PRACTICE_RANGES = [
  { label: '上午時段 (09:00 - 12:00)', start: 9 * 60, end: 12 * 60 },
  { label: '下午時段 (14:00 - 19:00)', start: 14 * 60, end: 19 * 60 },
];

// Drum Roll 可選刻度（09:00-12:00 / 14:00-19:00，每 15 分鐘）
const PRACTICE_TIMES = (() => {
  const times: string[] = [];
  const addRange = (startH: number, endH: number) => {
    for (let h = startH; h <= endH; h++) {
      for (let m = 0; m < 60; m += 15) {
        if (h === endH && m > 0) break;
        times.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      }
    }
  };
  addRange(9, 12);
  addRange(14, 19);
  return times;
})();

// ─── Helper Functions ────────────────────────────────────────────────────────

/** 隨機生成 10 位英數字元組合代碼 */
const generate10CharSessionCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let result = '';
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const generateDates = () => {
  const dates = [];
  const today = new Date();
  for (let i = 0; i < 4; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dateString = d.toISOString().split('T')[0];
    const displayString = `${d.getMonth() + 1}/${d.getDate()} (${
      ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
    })`;
    dates.push({ value: dateString, display: displayString });
  }
  return dates;
};

const timeToMins = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

const getRiderTitle = (count: number) => {
  if (count === 0) return { title: '馬術新手', color: 'text-stone-500', bg: 'bg-stone-100', border: 'border-stone-200' };
  if (count <= 2) return { title: '見習騎手 🐎', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' };
  if (count <= 5) return { title: '熟練騎士 🏇', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' };
  if (count <= 9) return { title: '菁英騎手 🌟', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' };
  return { title: '榮譽馬術大師 👑', color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200' };
};

const validatePracticeTime = (start: string, end: string): string | null => {
  const s = timeToMins(start);
  const e = timeToMins(end);
  if (e <= s) return '結束時間必須晚於開始時間';
  if (e - s < MIN_DURATION_MINS) {
    const diff = e - s;
    return `加練時長需至少滿 2 小時（目前為 ${Math.floor(diff / 60)} 小時 ${diff % 60 ? `${diff % 60} 分鐘` : ''}）`;
  }
  for (const range of PRACTICE_RANGES) {
    if (s >= range.start && s < range.end) {
      if (e > range.end) {
        const endStr = `${String(Math.floor(range.end / 60)).padStart(2, '0')}:00`;
        return `此時段之加練需在 ${endStr} 前結束（不可跨越午休或閉館時段）`;
      }
      return null;
    }
  }
  return '開始時間必須在 09:00–12:00 或 14:00–19:00 規定時段內';
};

// ─── DrumRollPicker Component ────────────────────────────────────────────────

const ITEM_H = 48;
const VISIBLE = 5;

function DrumRollPicker({
  items,
  value,
  onChange,
}: {
  items: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const scrollTo = useCallback((idx: number, smooth = true) => {
    const el = ref.current;
    if (!el) return;
    if (smooth) el.scrollTo({ top: idx * ITEM_H, behavior: 'smooth' });
    else el.scrollTop = idx * ITEM_H;
  }, []);

  useEffect(() => {
    const idx = items.indexOf(value);
    if (idx >= 0) scrollTo(idx, false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const idx = items.indexOf(value);
    if (idx >= 0) scrollTo(idx);
  }, [value, scrollTo, items]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const idx = Math.max(0, Math.min(Math.round(el.scrollTop / ITEM_H), items.length - 1));
        scrollTo(idx);
        onChange(items[idx]);
      }, 90);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      clearTimeout(timerRef.current);
    };
  }, [items, onChange, scrollTo]);

  return (
    <div
      className="relative overflow-hidden rounded-2xl bg-stone-50 border border-stone-200/80 shadow-inner"
      style={{ height: ITEM_H * VISIBLE }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-20 bg-gradient-to-b from-stone-50 via-stone-50/80 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-20 bg-gradient-to-t from-stone-50 via-stone-50/80 to-transparent" />

      <div
        className="pointer-events-none absolute inset-x-2.5 z-10 rounded-xl border-2 border-amber-500/80 bg-amber-500/10 shadow-sm"
        style={{ top: ITEM_H * 2, height: ITEM_H }}
      />

      <div ref={ref} className="h-full overflow-y-scroll" style={{ scrollbarWidth: 'none' }}>
        <div style={{ height: ITEM_H * 2 }} />
        {items.map((item) => (
          <div
            key={item}
            style={{ height: ITEM_H }}
            className={`flex items-center justify-center text-xl font-bold cursor-pointer select-none transition-all duration-150 ${
              item === value ? 'text-amber-700 scale-105' : 'text-stone-400 hover:text-stone-600'
            }`}
            onClick={() => {
              scrollTo(items.indexOf(item));
              onChange(item);
            }}
          >
            {item}
          </div>
        ))}
        <div style={{ height: ITEM_H * 2 }} />
      </div>
    </div>
  );
}

// ─── Main App Component ──────────────────────────────────────────────────────

export default function App() {
  const [dates] = useState(generateDates);
  const [selectedDate, setSelectedDate] = useState(dates[0].value);

  // 預約資料
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [myBookingIds, setMyBookingIds] = useState<string[]>([]);
  const [practiceStart, setPracticeStart] = useState('09:00');
  const [practiceEnd, setPracticeEnd] = useState('11:00');
  const [practiceError, setPracticeError] = useState('');

  // 社課場次資料 (支援 10 位隨機代碼)
  const [classSessions, setClassSessions] = useState<ClassSession[]>([]);
  const [newClassName, setNewClassName] = useState('');
  const [newClassDate, setNewClassDate] = useState(new Date().toISOString().split('T')[0]);

  // 手動輸入場次代碼
  const [manualSessionIdInput, setManualSessionIdInput] = useState('');

  // 學生端 Tab
  const [userTab, setUserTab] = useState<'加練' | '社課點名' | '出席紀錄'>('社課點名');
  const [attendanceQuery, setAttendanceQuery] = useState('');

  // 預約 Modal
  const [showModal, setShowModal] = useState(false);
  const [bookingSlot, setBookingSlot] = useState<{ date: string; time: string } | null>(null);
  const [formData, setFormData] = useState({ nickname: '', realName: '', studentId: '' });

  // 幹部後台 State
  const [view, setView] = useState<'user' | 'admin' | 'class-checkin'>('user');
  const [isAdminAuth, setIsAdminAuth] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [adminTab, setAdminTab] = useState<'overview' | 'classes' | 'members' | 'settings'>('classes');

  // 後台專用 Modal (QR Code / 簽到名冊)
  const [activeQrSession, setActiveQrSession] = useState<ClassSession | null>(null);
  const [qrModalDataUrl, setQrModalDataUrl] = useState('');
  const [copiedSessionId, setCopiedSessionId] = useState<string | null>(null);
  const [activeAttendeesSession, setActiveAttendeesSession] = useState<ClassSession | null>(null);

  // 點名簽到頁面 State
  const [currentCheckinSessionId, setCurrentCheckinSessionId] = useState<string | null>(null);
  const [checkinForm, setCheckinForm] = useState({ studentId: '', nickname: '', realName: '' });
  const [checkinSuccessMsg, setCheckinSuccessMsg] = useState<string | null>(null);
  const [checkinErrorMsg, setCheckinErrorMsg] = useState<string | null>(null);

  // ── 初始讀取與持久化 ──
  useEffect(() => {
    const savedBookings = localStorage.getItem('equestrian_bookings');
    if (savedBookings) setBookings(JSON.parse(savedBookings));

    const savedMyIds = localStorage.getItem('equestrian_my_ids');
    if (savedMyIds) setMyBookingIds(JSON.parse(savedMyIds));

    const savedSessions = localStorage.getItem('equestrian_class_sessions');
    if (savedSessions) {
      setClassSessions(JSON.parse(savedSessions));
    } else {
      // 預設示範場次
      const initialSession: ClassSession = {
        id: generate10CharSessionCode(),
        name: '正課理論與上下馬安全',
        date: new Date().toISOString().split('T')[0],
        isOpen: true,
        createdAt: new Date().toLocaleTimeString('zh-TW'),
        attendees: [],
      };
      setClassSessions([initialSession]);
    }

    // 支援直接透過 URL 參數進入點名： ?session=xxxxxx 或 #/class-checkin?session=xxxxxx
    const urlParams = new URLSearchParams(window.location.search);
    const sessionParam = urlParams.get('session');
    if (sessionParam) {
      setCurrentCheckinSessionId(sessionParam.trim());
      setView('class-checkin');
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('equestrian_bookings', JSON.stringify(bookings));
  }, [bookings]);

  useEffect(() => {
    localStorage.setItem('equestrian_my_ids', JSON.stringify(myBookingIds));
  }, [myBookingIds]);

  useEffect(() => {
    localStorage.setItem('equestrian_class_sessions', JSON.stringify(classSessions));
  }, [classSessions]);

  // 產生 QR Code 圖片
  useEffect(() => {
    if (activeQrSession) {
      const checkinUrl = `${window.location.origin}${window.location.pathname}?session=${activeQrSession.id}`;
      QRCodeLib.toDataURL(checkinUrl, {
        width: 320,
        margin: 2,
        color: { dark: '#1c1917', light: '#ffffff' },
      }).then(setQrModalDataUrl);
    } else {
      setQrModalDataUrl('');
    }
  }, [activeQrSession]);

  // ── 建立新社課場次（隨機 10 位英數代碼）──
  const handleCreateClassSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassName.trim() || !newClassDate.trim()) return;

    // 隨機產生 10 位英文數字組合代碼
    const random10Code = generate10CharSessionCode();

    const newSession: ClassSession = {
      id: random10Code,
      name: newClassName.trim(),
      date: newClassDate.trim(),
      isOpen: true,
      createdAt: new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
      attendees: [],
    };

    setClassSessions((prev) => [newSession, ...prev]);
    setNewClassName('');
    alert(`社課場次已成功建立！\n場次代碼：${random10Code}`);
  };

  const handleToggleClassOpen = (sessionId: string, currentStatus: boolean) => {
    setClassSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, isOpen: !currentStatus } : s))
    );
  };

  const handleDeleteClassSession = (sessionId: string) => {
    if (window.confirm('確定要刪除此社課場次嗎？此操作無法復原。')) {
      setClassSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (activeQrSession?.id === sessionId) setActiveQrSession(null);
      if (activeAttendeesSession?.id === sessionId) setActiveAttendeesSession(null);
    }
  };

  // ── 學生前往手動輸入點名 ──
  const handleManualSessionGo = () => {
    const code = manualSessionIdInput.trim();
    if (!code) {
      alert('請輸入場次代碼！');
      return;
    }
    const targetSession = classSessions.find((s) => s.id.toLowerCase() === code.toLowerCase());
    if (!targetSession) {
      alert(`找不到場次代碼為「${code}」的社課場次，請確認代碼是否正確。`);
      return;
    }
    setCurrentCheckinSessionId(targetSession.id);
    setView('class-checkin');
  };

  // ── 學生完成點名提交 ──
  const handleCheckinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCheckinErrorMsg(null);

    const session = classSessions.find((s) => s.id === currentCheckinSessionId);
    if (!session) {
      setCheckinErrorMsg('找不到此社課場次或場次已被移除');
      return;
    }
    if (!session.isOpen) {
      setCheckinErrorMsg('此社課場次點名已關閉，請向現場幹部反映。');
      return;
    }

    const { studentId, nickname, realName } = checkinForm;
    if (!studentId.trim() || !nickname.trim() || !realName.trim()) {
      setCheckinErrorMsg('請完整填寫學號、綽號與真實姓名！');
      return;
    }

    // 檢查是否已重複簽到
    const already = session.attendees.some(
      (a) => a.studentId.toLowerCase() === studentId.trim().toLowerCase()
    );
    if (already) {
      setCheckinErrorMsg(`學號 ${studentId.trim()} 已經在此場次簽到過囉！`);
      return;
    }

    const newAttendee = {
      id: Math.random().toString(36).substring(2, 9),
      studentId: studentId.trim(),
      nickname: nickname.trim(),
      realName: realName.trim(),
      checkedAt: new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
    };

    setClassSessions((prev) =>
      prev.map((s) =>
        s.id === session.id ? { ...s, attendees: [newAttendee, ...s.attendees] } : s
      )
    );

    setCheckinSuccessMsg(`簽到成功！歡迎參加【${session.name}】🐴`);
    setCheckinForm({ studentId: '', nickname: '', realName: '' });
  };

  // ── 加練預約提交 ──
  const handlePracticeBookClick = () => {
    const error = validatePracticeTime(practiceStart, practiceEnd);
    if (error) {
      setPracticeError(error);
      return;
    }
    setPracticeError('');
    setBookingSlot({ date: selectedDate, time: `${practiceStart} - ${practiceEnd}` });
    setShowModal(true);
  };

  const handleBookingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingSlot || !formData.nickname.trim() || !formData.realName.trim()) return;

    const newBooking: Booking = {
      id: Math.random().toString(36).substring(2, 9),
      date: bookingSlot.date,
      time: bookingSlot.time,
      nickname: formData.nickname.trim(),
      realName: formData.realName.trim(),
      studentId: formData.studentId.trim(),
      createdAt: new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
    };

    setBookings((prev) => [newBooking, ...prev]);
    setMyBookingIds((prev) => [newBooking.id, ...prev]);
    setFormData({ nickname: '', realName: '', studentId: '' });
    setShowModal(false);
    setBookingSlot(null);
  };

  const handleCancelBooking = (id: string) => {
    if (window.confirm('確定要取消這個加練預約嗎？')) {
      setBookings((prev) => prev.filter((b) => b.id !== id));
      setMyBookingIds((prev) => prev.filter((i) => i !== id));
    }
  };

  // 複製代碼小幫手
  const copySessionCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedSessionId(code);
    setTimeout(() => setCopiedSessionId(null), 2000);
  };

  // 統計出席資料
  const myBookingsList = bookings.filter((b) => myBookingIds.includes(b.id));
  const queryStr = attendanceQuery.trim().toLowerCase();

  // 收集所有社課的出席紀錄
  const allAttendanceList = classSessions.flatMap((s) =>
    s.attendees.map((a) => ({ ...a, sessionName: s.name, sessionDate: s.date, sessionId: s.id }))
  );

  const matchedAttendance = queryStr
    ? allAttendanceList.filter(
        (a) =>
          a.nickname.toLowerCase().includes(queryStr) ||
          a.realName.toLowerCase().includes(queryStr) ||
          a.studentId.toLowerCase().includes(queryStr)
      )
    : [];

  const riderBadge = getRiderTitle(matchedAttendance.length);

  // ─────────────────── 學生現場點名簽到頁面 ─────────────────────────────────
  if (view === 'class-checkin') {
    const currentSession = classSessions.find((s) => s.id === currentCheckinSessionId);

    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl p-6 md:p-8 max-w-md w-full border border-stone-200">
          {/* 返回按鈕 */}
          <button
            onClick={() => {
              setView('user');
              setCheckinSuccessMsg(null);
              setCheckinErrorMsg(null);
            }}
            className="text-xs font-bold text-stone-500 hover:text-stone-800 flex items-center gap-1 mb-4"
          >
            ← 返回預約首頁
          </button>

          {!currentSession ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-2xl bg-rose-100 text-rose-500 flex items-center justify-center mx-auto mb-3">
                <AlertCircle className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-black text-stone-800">找不到此社課場次</h3>
              <p className="text-xs text-stone-500 mt-2">
                代碼「{currentCheckinSessionId}」不存在或已被幹部刪除，請向現場幹部確認。
              </p>
            </div>
          ) : checkinSuccessMsg ? (
            <div className="text-center py-6 animate-in fade-in">
              <div className="w-20 h-20 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-12 h-12" />
              </div>
              <h3 className="text-2xl font-black text-stone-800">簽到完成！</h3>
              <p className="text-sm font-semibold text-emerald-700 mt-2">{checkinSuccessMsg}</p>
              <div className="my-5 p-3.5 bg-stone-50 rounded-2xl border border-stone-100 text-xs text-stone-600 space-y-1">
                <p className="font-bold text-stone-800">{currentSession.name}</p>
                <p>日期：{currentSession.date} · 代碼：<span className="font-mono font-bold">{currentSession.id}</span></p>
              </div>
              <button
                onClick={() => {
                  setView('user');
                  setCheckinSuccessMsg(null);
                }}
                className="w-full py-3 bg-stone-900 text-white rounded-xl font-bold hover:bg-stone-800 transition-colors"
              >
                回到首頁
              </button>
            </div>
          ) : (
            <div>
              <div className="text-center mb-6">
                <div className="w-16 h-16 rounded-2xl bg-emerald-600 text-white flex items-center justify-center mx-auto mb-3 shadow-md shadow-emerald-200">
                  <GraduationCap className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-black text-stone-800">社課現場簽到</h2>
                <div className="mt-3 bg-emerald-50 border border-emerald-100 rounded-2xl p-3.5 text-xs text-emerald-900">
                  <p className="font-bold text-sm text-emerald-800">{currentSession.name}</p>
                  <p className="mt-0.5 text-stone-600">
                    日期：{currentSession.date} · 場次代碼：<span className="font-mono font-bold text-emerald-700">{currentSession.id}</span>
                  </p>
                </div>
              </div>

              {checkinErrorMsg && (
                <div className="mb-4 p-3 bg-rose-50 border border-rose-100 text-rose-700 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{checkinErrorMsg}</span>
                </div>
              )}

              <form onSubmit={handleCheckinSubmit} className="space-y-3.5">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-stone-600 uppercase tracking-wider">
                    個人學號 (PIN) *
                  </label>
                  <input
                    type="text"
                    required
                    value={checkinForm.studentId}
                    onChange={(e) => setCheckinForm({ ...checkinForm, studentId: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-stone-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none text-sm transition-all font-mono"
                    placeholder="請輸入學號"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-stone-600 uppercase tracking-wider">綽號 *</label>
                  <input
                    type="text"
                    required
                    value={checkinForm.nickname}
                    onChange={(e) => setCheckinForm({ ...checkinForm, nickname: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-stone-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none text-sm transition-all"
                    placeholder="請輸入綽號"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-stone-600 uppercase tracking-wider">真實姓名 *</label>
                  <input
                    type="text"
                    required
                    value={checkinForm.realName}
                    onChange={(e) => setCheckinForm({ ...checkinForm, realName: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-stone-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none text-sm transition-all"
                    placeholder="請輸入真實姓名"
                  />
                </div>

                <button
                  type="submit"
                  disabled={!currentSession.isOpen}
                  className="w-full py-3.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 shadow-md shadow-emerald-200 transition-all text-sm mt-2 disabled:opacity-50"
                >
                  {currentSession.isOpen ? '完成現場簽到' : '點名已關閉'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─────────────────── 幹部後台視圖 ─────────────────────────────────────────
  const renderAdminView = () => {
    if (!isAdminAuth) {
      return (
        <div className="max-w-md mx-auto mt-12 bg-white p-8 rounded-3xl shadow-sm border border-stone-200">
          <div className="flex flex-col items-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center mb-3">
              <Shield className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-black text-stone-800">管理員控制台 / 幹部後台</h2>
            <p className="text-xs text-stone-400 mt-1">統整管理加練名冊、社課 QR Code 場次與點名密碼</p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (passwordInput === 'admin123') {
                setIsAdminAuth(true);
                setPasswordInput('');
              } else alert('密碼錯誤！');
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-xs font-bold text-stone-600 uppercase tracking-wider mb-1.5">
                幹部管理密碼
              </label>
              <div className="relative">
                <Lock className="w-5 h-5 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-stone-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-100 outline-none transition-all text-sm"
                  placeholder="預設密碼: admin123"
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full py-3 bg-amber-800 text-white rounded-xl font-bold hover:bg-amber-900 transition-colors shadow-sm"
            >
              登入幹部控制台
            </button>
          </form>
        </div>
      );
    }

    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        {/* 後台標題卡片 */}
        <div className="bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-stone-200">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-xl font-black text-stone-800">管理員控制台 / 幹部後台</h2>
              <p className="text-xs text-stone-500 mt-0.5">統整管理加練名冊、社課 QR Code 場次與點名密碼</p>
            </div>
            <button
              onClick={() => setIsAdminAuth(false)}
              className="px-4 py-2 text-xs font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-xl transition-colors shrink-0"
            >
              登出
            </button>
          </div>

          {/* 後台四個主要 Tab 按鈕 (符合截圖二) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-5">
            <button
              onClick={() => setAdminTab('overview')}
              className={`py-3 px-3 rounded-2xl text-xs md:text-sm font-bold transition-all flex items-center justify-center gap-2 border ${
                adminTab === 'overview'
                  ? 'bg-amber-50 text-amber-900 border-amber-300 shadow-sm'
                  : 'bg-stone-50 text-stone-600 border-stone-200/80 hover:bg-stone-100'
              }`}
            >
              <Calendar className="w-4 h-4" />
              預約總覽
            </button>
            <button
              onClick={() => setAdminTab('members')}
              className={`py-3 px-3 rounded-2xl text-xs md:text-sm font-bold transition-all flex items-center justify-center gap-2 border ${
                adminTab === 'members'
                  ? 'bg-amber-50 text-amber-900 border-amber-300 shadow-sm'
                  : 'bg-stone-50 text-stone-600 border-stone-200/80 hover:bg-stone-100'
              }`}
            >
              <Users className="w-4 h-4" />
              成員名冊
            </button>
            <button
              onClick={() => setAdminTab('classes')}
              className={`py-3 px-3 rounded-2xl text-xs md:text-sm font-bold transition-all flex items-center justify-center gap-2 border ${
                adminTab === 'classes'
                  ? 'bg-white text-emerald-800 border-emerald-500 shadow-sm ring-2 ring-emerald-100'
                  : 'bg-stone-50 text-stone-600 border-stone-200/80 hover:bg-stone-100'
              }`}
            >
              <GraduationCap className="w-4 h-4 text-emerald-600" />
              社課 QR Code
            </button>
            <button
              onClick={() => setAdminTab('settings')}
              className={`py-3 px-3 rounded-2xl text-xs md:text-sm font-bold transition-all flex items-center justify-center gap-2 border ${
                adminTab === 'settings'
                  ? 'bg-amber-50 text-amber-900 border-amber-300 shadow-sm'
                  : 'bg-stone-50 text-stone-600 border-stone-200/80 hover:bg-stone-100'
              }`}
            >
              <Settings className="w-4 h-4" />
              設定與 PIN
            </button>
          </div>
        </div>

        {/* ── Tab: 社課 QR Code 場次管理 (Screenshot 2) ── */}
        {adminTab === 'classes' && (
          <div className="space-y-6">
            {/* 建立新社課場次卡片 */}
            <div className="bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-stone-200">
              <h3 className="text-base font-bold text-stone-800 mb-4 flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-amber-800" />
                建立新社課場次
              </h3>
              <form onSubmit={handleCreateClassSession} className="grid sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  required
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  placeholder="社課名稱 (例如: 正課理論與上下馬安全)"
                  className="sm:col-span-2 px-4 py-2.5 rounded-xl border border-stone-200 focus:border-amber-700 outline-none text-sm transition-all"
                />
                <div className="flex gap-2">
                  <input
                    type="date"
                    required
                    value={newClassDate}
                    onChange={(e) => setNewClassDate(e.target.value)}
                    className="flex-1 px-3 py-2.5 rounded-xl border border-stone-200 focus:border-amber-700 outline-none text-sm font-mono"
                  />
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-amber-800 hover:bg-amber-900 text-white rounded-xl font-bold text-sm shrink-0 transition-colors shadow-sm"
                  >
                    建立場次
                  </button>
                </div>
              </form>
            </div>

            {/* 場次列表 */}
            {classSessions.length === 0 ? (
              <div className="bg-white p-12 rounded-3xl shadow-sm border border-stone-200 text-center text-stone-400">
                <GraduationCap className="w-14 h-14 mx-auto mb-3 opacity-30 text-stone-400" />
                <p className="text-sm font-bold text-stone-500">目前尚無社課場次，請上方表單建立</p>
              </div>
            ) : (
              <div className="space-y-4">
                {classSessions.map((session) => (
                  <div
                    key={session.id}
                    className="bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-stone-200 space-y-4"
                  >
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2.5 h-2.5 rounded-full ${
                              session.isOpen ? 'bg-emerald-500 animate-pulse' : 'bg-rose-400'
                            }`}
                          />
                          <h4 className="text-lg font-black text-stone-800">{session.name}</h4>
                        </div>
                        <p className="text-xs text-stone-500 mt-1 flex items-center gap-2 flex-wrap">
                          <span>日期：{session.date}</span>
                          <span>·</span>
                          <span>
                            場次代碼 (10字)：
                            <button
                              onClick={() => copySessionCode(session.id)}
                              className="font-mono font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 hover:bg-amber-100 ml-1 inline-flex items-center gap-1"
                              title="點擊複製代碼"
                            >
                              {session.id}
                              {copiedSessionId === session.id ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3 text-stone-400" />
                              )}
                            </button>
                          </span>
                          <span>·</span>
                          <span>
                            已簽到人數：
                            <span className="font-bold text-emerald-700 ml-1">
                              {session.attendees.length} 人
                            </span>
                          </span>
                        </p>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => setActiveQrSession(session)}
                          className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
                        >
                          <QrCode className="w-4 h-4 text-amber-700" />
                          顯示 QR Code
                        </button>

                        <button
                          onClick={() => setActiveAttendeesSession(session)}
                          className="px-3.5 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-xs font-bold transition-colors"
                        >
                          檢視名冊 ({session.attendees.length})
                        </button>

                        <button
                          onClick={() => handleToggleClassOpen(session.id, session.isOpen)}
                          className={`px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                            session.isOpen
                              ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                              : 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                          }`}
                        >
                          {session.isOpen ? '點名開放中 (點此關閉)' : '點名已關閉 (點此開放)'}
                        </button>

                        <button
                          onClick={() => handleDeleteClassSession(session.id)}
                          className="p-2 text-stone-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors"
                          title="刪除場次"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Tab: 加練預約總覽 ── */}
        {adminTab === 'overview' && (
          <div className="space-y-6">
            {dates.map((dateObj) => {
              const dateBookings = bookings.filter((b) => b.date === dateObj.value);
              if (dateBookings.length === 0) return null;

              return (
                <div key={dateObj.value} className="bg-white p-6 rounded-3xl shadow-sm border border-stone-200">
                  <h3 className="text-base font-black text-amber-800 mb-4 border-b border-stone-100 pb-3 flex items-center gap-2">
                    <Dumbbell className="w-5 h-5 text-amber-700" />
                    {dateObj.display} 加練預約名冊
                  </h3>
                  <div className="space-y-3">
                    {dateBookings.map((b) => (
                      <div
                        key={b.id}
                        className="bg-amber-50/60 rounded-2xl p-4 border border-amber-100 flex justify-between items-center"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 font-bold">
                            <Clock className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="font-bold text-stone-800">{b.time}</p>
                            <p className="text-xs text-stone-600 mt-0.5">
                              {b.nickname} ({b.realName}) {b.studentId && `· 學號：${b.studentId}`}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleCancelBooking(b.id)}
                          className="text-xs font-bold text-rose-600 hover:bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-200 transition-colors"
                        >
                          取消
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {bookings.length === 0 && (
              <div className="text-center py-16 bg-white rounded-3xl border border-stone-200 shadow-sm text-stone-400">
                <Dumbbell className="w-12 h-12 mx-auto mb-3 opacity-30 text-stone-400" />
                <p className="text-base font-bold text-stone-600">目前沒有加練預約紀錄</p>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: 成員出席名冊總覽 ── */}
        {adminTab === 'members' && (
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-stone-200 space-y-4">
            <h3 className="text-base font-black text-stone-800 flex items-center gap-2">
              <Users className="w-5 h-5 text-amber-800" />
              社課累積出席總表
            </h3>
            {allAttendanceList.length === 0 ? (
              <p className="text-xs text-stone-400 py-8 text-center">尚無任何簽到紀錄</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-stone-700">
                  <thead className="bg-stone-50 text-stone-500 font-bold border-b border-stone-100">
                    <tr>
                      <th className="py-3 px-3">學號 (PIN)</th>
                      <th className="py-3 px-3">綽號</th>
                      <th className="py-3 px-3">真實姓名</th>
                      <th className="py-3 px-3">出席社課</th>
                      <th className="py-3 px-3">社課日期</th>
                      <th className="py-3 px-3">簽到時間</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {allAttendanceList.map((a, i) => (
                      <tr key={i} className="hover:bg-stone-50/80">
                        <td className="py-3 px-3 font-mono font-bold text-stone-900">{a.studentId}</td>
                        <td className="py-3 px-3 font-bold">{a.nickname}</td>
                        <td className="py-3 px-3">{a.realName}</td>
                        <td className="py-3 px-3 text-emerald-800 font-semibold">{a.sessionName}</td>
                        <td className="py-3 px-3">{a.sessionDate}</td>
                        <td className="py-3 px-3 text-stone-400">{a.checkedAt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: 設定與 PIN ── */}
        {adminTab === 'settings' && (
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-stone-200 space-y-4">
            <h3 className="text-base font-black text-stone-800 flex items-center gap-2">
              <Settings className="w-5 h-5 text-amber-800" />
              系統設定與權限資訊
            </h3>
            <div className="p-4 bg-stone-50 rounded-2xl border border-stone-100 text-xs text-stone-600 space-y-2">
              <p>• 預設幹部管理員密碼：<code className="bg-stone-200 px-2 py-0.5 rounded font-mono font-bold">admin123</code></p>
              <p>• 點名代碼生成長度：<code className="bg-stone-200 px-2 py-0.5 rounded font-mono font-bold">10 位隨機英數組合</code></p>
              <p>• 加練時間規則：<code className="bg-stone-200 px-2 py-0.5 rounded font-mono font-bold">09:00~12:00 / 14:00~19:00，滿 2 小時</code></p>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ─────────────────── 學生首頁視圖 ─────────────────────────────────────────
  const renderUserView = () => (
    <div className="grid md:grid-cols-3 gap-8 animate-in fade-in duration-200">
      <div className="md:col-span-2 space-y-6">
        {/* 頂部 Tab：社課現場點名 / 加練預約 / 社課出席紀錄 */}
        <div className="flex gap-2 bg-white p-1.5 rounded-2xl border border-stone-200 shadow-sm">
          <button
            onClick={() => setUserTab('社課點名')}
            className={`flex-1 py-3 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
              userTab === '社課點名'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-200'
                : 'text-stone-600 hover:bg-stone-100'
            }`}
          >
            <QrCode className="w-4 h-4" />
            社課現場點名
          </button>
          <button
            onClick={() => setUserTab('加練')}
            className={`flex-1 py-3 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
              userTab === '加練'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-200'
                : 'text-stone-600 hover:bg-stone-100'
            }`}
          >
            <Dumbbell className="w-4 h-4" />
            加練時段預約
          </button>
          <button
            onClick={() => setUserTab('出席紀錄')}
            className={`flex-1 py-3 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
              userTab === '出席紀錄'
                ? 'bg-stone-900 text-white shadow-md'
                : 'text-stone-600 hover:bg-stone-100'
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            出席紀錄
          </button>
        </div>

        {/* ── 1. 社課現場 QR Code 點名 (Screenshot 1) ── */}
        {userTab === '社課點名' && (
          <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-stone-200 text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-xs">
              <QrCode className="w-8 h-8" />
            </div>

            <div>
              <h3 className="text-2xl font-black text-stone-800">社課現場 QR Code 點名</h3>
              <p className="text-xs md:text-sm text-stone-500 mt-1 max-w-md mx-auto leading-relaxed">
                到場參加社課時，請使用手機相機直接掃描教練或幹部展示的 QR Code 完成點名簽到。
              </p>
            </div>

            {/* 3 步驟指示卡片 (Screenshot 1) */}
            <div className="grid sm:grid-cols-3 gap-3 text-left">
              <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100 space-y-1">
                <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-800 text-xs font-bold flex items-center justify-center">
                  1
                </span>
                <p className="font-bold text-stone-800 text-sm">手機掃碼</p>
                <p className="text-xs text-stone-500">掃描現場專屬 QR Code</p>
              </div>

              <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100 space-y-1">
                <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-800 text-xs font-bold flex items-center justify-center">
                  2
                </span>
                <p className="font-bold text-stone-800 text-sm">輸入學號</p>
                <p className="text-xs text-stone-500">輸入個人學號 (PIN)</p>
              </div>

              <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100 space-y-1">
                <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-800 text-xs font-bold flex items-center justify-center">
                  3
                </span>
                <p className="font-bold text-stone-800 text-sm">完成簽到</p>
                <p className="text-xs text-stone-500">系統即時記錄出席</p>
              </div>
            </div>

            {/* 手動輸入場次代碼備案 (Screenshot 1: 支援 10 字代碼) */}
            <div className="pt-4 border-t border-stone-100 text-left space-y-2">
              <p className="text-xs font-bold text-stone-600">相機無法掃描？手動輸入場次代碼：</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualSessionIdInput}
                  onChange={(e) => setManualSessionIdInput(e.target.value)}
                  placeholder="輸入 10 位場次代碼 (例如: A8k9X2mP4q)"
                  className="flex-1 px-4 py-2.5 rounded-xl border border-stone-200 text-xs outline-none focus:border-emerald-500 font-mono transition-all"
                />
                <button
                  onClick={handleManualSessionGo}
                  className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-colors shrink-0 shadow-sm"
                >
                  前往點名
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── 2. 加練預約 (iOS Drum Roll 選擇器) ── */}
        {userTab === '加練' && (
          <>
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-stone-200">
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="w-5 h-5 text-amber-600" />
                <h2 className="text-base font-black text-stone-800">1. 選擇加練日期</h2>
              </div>
              <div className="flex overflow-x-auto gap-2 pb-1">
                {dates.map((d) => (
                  <button
                    key={d.value}
                    onClick={() => setSelectedDate(d.value)}
                    className={`whitespace-nowrap px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                      selectedDate === d.value
                        ? 'bg-amber-600 text-white shadow-md shadow-amber-200'
                        : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                    }`}
                  >
                    {d.display}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl shadow-sm border border-stone-200">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-amber-600" />
                  <h2 className="text-base font-black text-stone-800">2. 滑動選擇起訖時間</h2>
                </div>
                <span className="text-xs bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full font-bold">
                  15 分鐘刻度
                </span>
              </div>
              <p className="text-xs text-stone-400 mb-5">
                開放時段：09:00–12:00 或 14:00–19:00（單次最少需滿 2 小時）
              </p>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-xs font-bold text-stone-500 uppercase tracking-wider text-center mb-2">
                    開始時間
                  </p>
                  <DrumRollPicker
                    items={PRACTICE_TIMES}
                    value={practiceStart}
                    onChange={(v) => {
                      setPracticeStart(v);
                      setPracticeError('');
                    }}
                  />
                </div>
                <div>
                  <p className="text-xs font-bold text-stone-500 uppercase tracking-wider text-center mb-2">
                    結束時間
                  </p>
                  <DrumRollPicker
                    items={PRACTICE_TIMES}
                    value={practiceEnd}
                    onChange={(v) => {
                      setPracticeEnd(v);
                      setPracticeError('');
                    }}
                  />
                </div>
              </div>

              {/* 即時時長計算 */}
              <div className="flex items-center justify-center gap-2 bg-amber-50/80 border border-amber-100 rounded-2xl p-3.5 mb-4">
                <Clock className="w-4 h-4 text-amber-700 shrink-0" />
                <span className="text-amber-900 font-bold text-xs sm:text-sm">
                  {practiceStart} － {practiceEnd}
                  {(() => {
                    const diff = timeToMins(practiceEnd) - timeToMins(practiceStart);
                    if (diff <= 0) return '';
                    const h = Math.floor(diff / 60);
                    const m = diff % 60;
                    return `（共計 ${h > 0 ? `${h} 小時 ` : ''}${m > 0 ? `${m} 分鐘` : ''}）`;
                  })()}
                </span>
              </div>

              {practiceError && (
                <div className="flex items-start gap-2 bg-rose-50 text-rose-700 border border-rose-100 rounded-2xl p-3.5 mb-4 text-xs font-semibold">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  {practiceError}
                </div>
              )}

              <button
                onClick={handlePracticeBookClick}
                className="w-full py-4 bg-amber-600 text-white rounded-2xl font-black text-sm hover:bg-amber-700 shadow-md shadow-amber-200 transition-all flex items-center justify-center gap-2"
              >
                確認此時段並填寫預約資料
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </>
        )}

        {/* ── 3. 社課出席紀錄查詢 ── */}
        {userTab === '出席紀錄' && (
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-stone-200">
            <div className="flex items-center gap-2 mb-1">
              <ClipboardList className="w-5 h-5 text-emerald-600" />
              <h2 className="text-base font-black text-stone-800">查詢社課出席紀錄</h2>
            </div>
            <p className="text-xs text-stone-400 mb-5">
              輸入學號、綽號或真實姓名，即時檢視歷史出席紀錄與成就徽章！
            </p>

            <div className="relative mb-6">
              <Search className="w-5 h-5 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={attendanceQuery}
                onChange={(e) => setAttendanceQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-3 rounded-2xl border border-stone-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none text-sm transition-all"
                placeholder="輸入學號、綽號或真實姓名搜尋..."
              />
            </div>

            {attendanceQuery.trim() === '' ? (
              <div className="text-center py-10 text-stone-400 bg-stone-50 rounded-2xl border border-dashed border-stone-200">
                <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-xs font-semibold">在上方輸入姓名或學號以檢索出席紀錄</p>
              </div>
            ) : matchedAttendance.length === 0 ? (
              <div className="text-center py-10 text-stone-400 bg-stone-50 rounded-2xl border border-dashed border-stone-200">
                <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40 text-stone-400" />
                <p className="text-xs font-semibold">找不到「{attendanceQuery}」的出席紀錄</p>
                <p className="text-3xs text-stone-400 mt-1">請確認輸入之學號或姓名是否與簽到一致</p>
              </div>
            ) : (
              <div className="space-y-4 animate-in fade-in">
                {/* 榮譽徽章卡片 */}
                <div className={`p-4 rounded-2xl border ${riderBadge.border} ${riderBadge.bg} flex items-center justify-between`}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white shadow-xs flex items-center justify-center">
                      <Sparkles className="w-5 h-5 text-amber-500" />
                    </div>
                    <div>
                      <p className="text-3xs font-bold text-stone-500 uppercase tracking-wider">馬術社榮譽成就</p>
                      <h4 className={`text-base font-black ${riderBadge.color}`}>{riderBadge.title}</h4>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-black text-stone-800">{matchedAttendance.length}</p>
                    <p className="text-3xs font-bold text-stone-400">出席堂數</p>
                  </div>
                </div>

                {/* 出席歷史列表 */}
                <div className="space-y-2">
                  <p className="text-xs font-bold text-stone-500 uppercase tracking-wider px-1">出席清單</p>
                  {matchedAttendance.map((r, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 bg-emerald-50/50 rounded-2xl p-3.5 border border-emerald-100"
                    >
                      <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-stone-800 text-xs sm:text-sm truncate">{r.sessionName}</p>
                        <p className="text-3xs text-stone-500 mt-0.5">
                          {r.sessionDate} · 簽到時間 {r.checkedAt} · 學號 {r.studentId}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 側邊欄：我的加練預約 */}
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-stone-200">
          <div className="flex items-center gap-2 mb-4">
            <Dumbbell className="w-5 h-5 text-amber-600" />
            <h2 className="text-base font-black text-stone-800">我的加練預約</h2>
          </div>

          {myBookingsList.length === 0 ? (
            <div className="text-center py-10 text-stone-400 flex flex-col items-center bg-stone-50 rounded-2xl border border-dashed border-stone-200">
              <Dumbbell className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-xs font-bold">目前無已預約的加練時段</p>
            </div>
          ) : (
            <div className="space-y-3">
              {myBookingsList.map((booking) => (
                <div
                  key={booking.id}
                  className="p-4 rounded-2xl border border-amber-200/80 bg-amber-50/60 relative group transition-all"
                >
                  <div className="pr-8">
                    <p className="text-xs font-bold text-amber-800">{booking.date}</p>
                    <p className="font-black text-stone-800 text-sm mt-0.5">{booking.time}</p>
                    <p className="text-xs text-stone-500 mt-1">
                      {booking.nickname} ({booking.realName})
                    </p>
                  </div>
                  <button
                    onClick={() => handleCancelBooking(booking.id)}
                    className="absolute top-3 right-3 p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                    title="取消預約"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // ─────────────────── 全域渲染 ─────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-stone-100/70 text-stone-900 font-sans p-4 md:p-8 relative w-full overflow-x-hidden">
      {/* 頂部切換後台按鈕 */}
      <div className="absolute top-4 right-4 md:top-8 md:right-8 flex items-center gap-2 z-10">
        <button
          onClick={() => setView(view === 'admin' ? 'user' : 'admin')}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-stone-200 text-stone-700 rounded-xl text-xs font-bold hover:bg-stone-50 hover:text-amber-800 transition-all shadow-xs"
        >
          <Shield className="w-4 h-4" />
          <span>{view === 'admin' ? '返回社員頁' : '幹部後台'}</span>
        </button>
      </div>

      <div className="max-w-4xl mx-auto space-y-6 pt-10 md:pt-0 w-full">
        {/* Header */}
        <header className="text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 bg-amber-50 border border-amber-200 rounded-full text-xs font-bold text-amber-900 mb-1 shadow-2xs">
            <span>🐎</span> 馬術社訓練預約與社課系統
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-stone-800 tracking-tight">
            {view === 'user'
              ? '馬術社加練與社課系統'
              : view === 'admin'
              ? '管理員控制台 / 幹部後台'
              : '社課現場點名簽到'}
          </h1>
          <p className="text-xs md:text-sm text-stone-500">
            {view === 'user'
              ? '加練時段預約、社課現場 QR 點名、出席紀錄查詢'
              : view === 'admin'
              ? '統整管理加練名冊、社課 QR Code 場次與點名密碼'
              : '請確認場次資訊並輸入學號完成簽到'}
          </p>
        </header>

        {view === 'user' ? renderUserView() : renderAdminView()}
      </div>

      {/* ── 後台專用：QR Code Modal ── */}
      {activeQrSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl p-6 md:p-8 max-w-sm w-full text-center border border-stone-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-black text-stone-800 text-lg">現場簽到 QR Code</h3>
              <button
                onClick={() => setActiveQrSession(null)}
                className="text-stone-400 hover:text-stone-600 p-1 rounded-full hover:bg-stone-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="font-bold text-emerald-800 text-sm mb-1">{activeQrSession.name}</p>
            <p className="text-xs text-stone-500 mb-4">日期：{activeQrSession.date}</p>

            <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200 inline-block shadow-inner">
              {qrModalDataUrl ? (
                <img src={qrModalDataUrl} alt="QR Code" width={260} height={260} className="rounded-xl" />
              ) : (
                <div className="w-[260px] h-[260px] flex items-center justify-center">
                  <RefreshCw className="w-8 h-8 text-stone-400 animate-spin" />
                </div>
              )}
            </div>

            <div className="mt-4 p-3 bg-amber-50 rounded-xl border border-amber-100 text-xs text-stone-700 flex justify-between items-center">
              <span>場次代碼 (10字)：<span className="font-mono font-bold text-amber-900">{activeQrSession.id}</span></span>
              <button
                onClick={() => copySessionCode(activeQrSession.id)}
                className="text-xs font-bold px-2 py-1 bg-white border border-amber-200 rounded text-amber-800 hover:bg-amber-100"
              >
                {copiedSessionId === activeQrSession.id ? '已複製' : '複製代碼'}
              </button>
            </div>

            <p className="text-3xs text-stone-400 mt-3">請學生使用手機掃描此 QR Code 即可直接進入點名</p>
          </div>
        </div>
      )}

      {/* ── 後台專用：檢視名冊 Modal ── */}
      {activeAttendeesSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-lg w-full border border-stone-200 max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center pb-4 border-b border-stone-100">
              <div>
                <h3 className="font-black text-stone-800 text-base">{activeAttendeesSession.name}</h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  日期：{activeAttendeesSession.date} · 簽到人數：{activeAttendeesSession.attendees.length} 人
                </p>
              </div>
              <button
                onClick={() => setActiveAttendeesSession(null)}
                className="text-stone-400 hover:text-stone-600 p-1.5 rounded-full hover:bg-stone-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-2">
              {activeAttendeesSession.attendees.length === 0 ? (
                <p className="text-center py-8 text-xs text-stone-400">目前尚無人簽到</p>
              ) : (
                activeAttendeesSession.attendees.map((a, idx) => (
                  <div key={a.id} className="flex items-center gap-3 bg-stone-50 p-3 rounded-xl border border-stone-100">
                    <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0 text-xs">
                      <p className="font-bold text-stone-800">{a.nickname} ({a.realName})</p>
                      <p className="text-stone-400 font-mono">學號: {a.studentId} · 簽到: {a.checkedAt}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 加練預約資料填寫 Modal ── */}
      {view === 'user' && showModal && bookingSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-stone-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 border-b border-stone-100 flex justify-between items-center">
              <h3 className="text-base font-black text-stone-800">填寫加練預約資料</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-stone-400 hover:text-stone-600 p-1.5 rounded-full hover:bg-stone-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleBookingSubmit} className="p-6 space-y-4">
              <div className="bg-amber-50 text-amber-900 border border-amber-100 p-3.5 rounded-2xl text-xs flex items-start gap-2.5">
                <Dumbbell className="w-5 h-5 shrink-0 text-amber-700 mt-0.5" />
                <div>
                  <p className="font-bold">預約加練時段：</p>
                  <p className="font-semibold text-stone-800 mt-0.5">
                    {bookingSlot.date} · {bookingSlot.time}
                  </p>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-stone-600 uppercase tracking-wider">
                  學號 (選填)
                </label>
                <input
                  type="text"
                  value={formData.studentId}
                  onChange={(e) => setFormData({ ...formData, studentId: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-stone-200 focus:border-amber-600 focus:ring-2 focus:ring-amber-100 outline-none text-xs font-mono transition-all"
                  placeholder="請輸入學號"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-stone-600 uppercase tracking-wider">綽號 *</label>
                <input
                  type="text"
                  required
                  value={formData.nickname}
                  onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-stone-200 focus:border-amber-600 focus:ring-2 focus:ring-amber-100 outline-none text-xs transition-all"
                  placeholder="請輸入綽號"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-stone-600 uppercase tracking-wider">真實姓名 *</label>
                <input
                  type="text"
                  required
                  value={formData.realName}
                  onChange={(e) => setFormData({ ...formData, realName: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-stone-200 focus:border-amber-600 focus:ring-2 focus:ring-amber-100 outline-none text-xs transition-all"
                  placeholder="請輸入真實姓名"
                />
              </div>

              <div className="pt-3 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-3 rounded-xl border border-stone-200 text-stone-600 font-bold hover:bg-stone-50 text-xs transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-3 rounded-xl bg-amber-600 text-white font-bold hover:bg-amber-700 shadow-md shadow-amber-200 text-xs transition-colors"
                >
                  確認預約
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
