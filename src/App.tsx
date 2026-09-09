import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  ArrowRight,
  LogOut,
  Flame,
  ClipboardCheck,
  ArrowLeft,
  ExternalLink,
  History,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type Booking = {
  id: string;
  date: string;
  time: string; // "HH:MM - HH:MM"
  nickname: string;
  realName?: string;
  studentId?: string;
  createdAt?: string;
  attendance_status?: string;
  note?: string;
  actual_time?: string;
};

type AdminBooking = Booking & {
  realName: string;
  studentId?: string;
  specificTime?: string;
  actualTime?: string;
  attendance_status?: string;
  note?: string;
};

type MemberRecord = {
  id: string;
  date: string;
  time: string;
  nickname: string;
  specificTime?: string;
  actualTime?: string;
};

type MemberPin = {
  realName: string;
  pin: string;
  createdAt?: string;
};

type ClassSession = {
  id: string; // 10 位隨機英數組合代碼
  name: string;
  date: string;
  isOpen: boolean;
  createdAt?: string;
  attendees?: {
    id: string | number;
    studentId?: string;
    nickname?: string;
    realName: string;
    checkedAt: string;
  }[];
};

type MemberClassRecord = {
  id: number | string;
  sessionId: string;
  sessionName: string;
  date: string;
  checkedAt: string;
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

const getTodayTW = (): string => {
  const now = new Date();
  const tw = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return tw.toISOString().split('T')[0];
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
  if (!t || !t.includes(':')) return 0;
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

const sanitizeTime = (timeStr: string): string => {
  if (!timeStr) return '';
  let sanitized = timeStr.replace(/\s+/g, '');
  sanitized = sanitized.replace(/：/g, ':').replace(/[～\-]/g, '~');
  sanitized = sanitized.replace(/(^|~)(\d):/g, '$10$2:');
  return sanitized;
};

const calculateHours = (timeRange: string, actualTimeRange?: string): number => {
  const target = actualTimeRange || timeRange;
  if (!target) return 0;
  try {
    const clean = sanitizeTime(target);
    const parts = clean.split(/[~-]/);
    if (parts.length < 2) return 0;
    const s = timeToMins(parts[0]);
    let e = timeToMins(parts[1]);
    if (e < s) e += 24 * 60;
    const diff = e - s;
    if (diff <= 0) return 0;
    // 無條件進位至小數點後第二位 (例: 12.3333 -> 12.34)
    const rawHours = diff / 60;
    return Math.ceil(rawHours * 100) / 100;
  } catch {
    return 0;
  }
};

const formatHours = (hours: number): string => {
  const rounded = Math.ceil(hours * 100) / 100;
  return rounded.toString();
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
      className="relative overflow-hidden rounded-2xl bg-stone-50 border border-stone-200/80 shadow-inner w-full min-w-0"
      style={{ height: ITEM_H * VISIBLE }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-20 bg-gradient-to-b from-stone-50 via-stone-50/80 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-20 bg-gradient-to-t from-stone-50 via-stone-50/80 to-transparent" />

      <div
        className="pointer-events-none absolute inset-x-2.5 z-10 rounded-xl border-2 border-amber-500/80 bg-amber-500/10 shadow-sm"
        style={{ top: ITEM_H * 2, height: ITEM_H }}
      />

      <div ref={ref} className="h-full overflow-y-scroll w-full" style={{ scrollbarWidth: 'none' }}>
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

  // 預約與時段 State
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [myBookingIds, setMyBookingIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('app_my_booking_ids') ?? '[]');
    } catch {
      return [];
    }
  });
  const [practiceStart, setPracticeStart] = useState('09:00');
  const [practiceEnd, setPracticeEnd] = useState('11:00');
  const [practiceError, setPracticeError] = useState('');

  // 模態框與表單
  const [showModal, setShowModal] = useState(false);
  const [bookingSlot, setBookingSlot] = useState<{ date: string; time: string } | null>(null);
  const [formData, setFormData] = useState({ nickname: '', realName: '', studentId: '' });
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);

  // 社課場次 State
  const [classSessions, setClassSessions] = useState<ClassSession[]>(() => {
    try {
      const saved = localStorage.getItem('class_sessions');
      if (saved) return JSON.parse(saved);
    } catch {
      // fallback
    }
    return [
      {
        id: 'A8k9X2mP4q',
        name: '第 1 堂：馬術基礎騎姿與裝備安全',
        date: dates[0].value,
        isOpen: true,
        createdAt: new Date().toISOString(),
        attendees: [],
      },
      {
        id: 'H7j2L9vC3w',
        name: '第 2 堂：慢步節奏控制與韁繩掌握',
        date: dates[1].value,
        isOpen: true,
        createdAt: new Date().toISOString(),
        attendees: [],
      },
    ];
  });

  // 儲存社課場次至 localStorage
  useEffect(() => {
    localStorage.setItem('class_sessions', JSON.stringify(classSessions));
  }, [classSessions]);

  // 儲存我的預約 ID
  useEffect(() => {
    localStorage.setItem('app_my_booking_ids', JSON.stringify(myBookingIds));
  }, [myBookingIds]);

  // 路由與導航 State
  const [view, setView] = useState<'user' | 'admin' | 'member' | 'class-checkin'>('user');
  const [userTab, setUserTab] = useState<'加練' | '社課點名'>('加練');
  const [urlSessionId, setUrlSessionId] = useState<string | null>(null);

  // 幹部後台 State
  const [isAdminAuth, setIsAdminAuth] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminTab, setAdminTab] = useState<'overview' | 'members' | 'classes' | 'settings'>('overview');
  const [adminOverviewScope, setAdminOverviewScope] = useState<'upcoming' | 'all'>('upcoming');
  const [adminBookings, setAdminBookings] = useState<AdminBooking[]>([]);
  const [memberPins, setMemberPins] = useState<MemberPin[]>([]);
  const [newPinName, setNewPinName] = useState('');
  const [newPinCode, setNewPinCode] = useState('');
  const [pinSubmitting, setPinSubmitting] = useState(false);
  const [confirmDeletePin, setConfirmDeletePin] = useState<string | null>(null);
  const [checkinPwdDisplay, setCheckinPwdDisplay] = useState('88321');
  const [newCheckinPwd, setNewCheckinPwd] = useState('');
  const [checkinPwdSubmitting, setCheckinPwdSubmitting] = useState(false);
  const [showClearAllModal, setShowClearAllModal] = useState(false);
  const [clearAllConfirmText, setClearAllConfirmText] = useState('');
  const [clearingAll, setClearingAll] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [confirmDeleteMember, setConfirmDeleteMember] = useState(false);

  // 社員個人紀錄查詢 State (支援首次登記姓名與學號，之後只需輸入學號)
  const [memberPinInput, setMemberPinInput] = useState(() => {
    try {
      return localStorage.getItem('app_my_student_id') || '';
    } catch {
      return '';
    }
  });
  const [memberQueryMode, setMemberQueryMode] = useState<'query' | 'register'>(() => {
    try {
      return localStorage.getItem('app_my_student_id') ? 'query' : 'register';
    } catch {
      return 'register';
    }
  });
  const [registerRealNameInput, setRegisterRealNameInput] = useState(() => {
    try {
      return localStorage.getItem('app_my_real_name') || '';
    } catch {
      return '';
    }
  });
  const [registerStudentIdInput, setRegisterStudentIdInput] = useState(() => {
    try {
      return localStorage.getItem('app_my_student_id') || '';
    } catch {
      return '';
    }
  });
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerMessage, setRegisterMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [submittedMemberPin, setSubmittedMemberPin] = useState('');
  const [memberRecords, setMemberRecords] = useState<MemberRecord[]>([]);
  const [memberClassRecords, setMemberClassRecords] = useState<MemberClassRecord[]>([]);
  const [memberRealName, setMemberRealName] = useState('');
  const [memberLoading, setMemberLoading] = useState(false);

  // 社課新增與彈窗 State
  const [newClassName, setNewClassName] = useState('');
  const [newClassDate, setNewClassDate] = useState(getTodayTW());
  const [activeQrSession, setActiveQrSession] = useState<ClassSession | null>(null);
  const [qrModalDataUrl, setQrModalDataUrl] = useState<string>('');
  const [activeAttendeesSession, setActiveAttendeesSession] = useState<ClassSession | null>(null);
  const [copiedSessionId, setCopiedSessionId] = useState<string | null>(null);

  // 學生社課點名手動與直接簽到 State
  const [manualSessionInput, setManualSessionInput] = useState('');
  const [classCheckinStudentId, setClassCheckinStudentId] = useState('');
  const [classCheckinNickname, setClassCheckinNickname] = useState('');
  const [classCheckinRealName, setClassCheckinRealName] = useState('');
  const [classCheckinResult, setClassCheckinResult] = useState<{ success: boolean; message: string; realName?: string } | null>(null);
  const [classCheckinLoading, setClassCheckinLoading] = useState(false);

  // 加載後端預約
  const fetchBookings = useCallback(async (date: string) => {
    try {
      const res = await fetch(`/api/bookings?date=${date}`);
      if (res.ok) {
        const data = await res.json();
        setBookings(data);
      }
    } catch {
      // 離線模式：讀取 localStorage
      try {
        const saved = localStorage.getItem('app_bookings');
        if (saved) {
          const all: Booking[] = JSON.parse(saved);
          setBookings(all.filter((b) => b.date === date));
        }
      } catch {
        // ignore
      }
    }
  }, []);

  useEffect(() => {
    fetchBookings(selectedDate);
  }, [selectedDate, fetchBookings]);

  // 加載後端管理員資料
  const fetchAdminData = useCallback(async (pwd: string) => {
    try {
      const [bRes, cRes, pRes, pwdRes] = await Promise.all([
        fetch('/api/admin/bookings', { headers: { 'x-admin-password': pwd } }),
        fetch('/api/admin/class-sessions', { headers: { 'x-admin-password': pwd } }),
        fetch('/api/admin/member-pins', { headers: { 'x-admin-password': pwd } }),
        fetch('/api/admin/checkin-password', { headers: { 'x-admin-password': pwd } }),
      ]);
      if (bRes.ok) setAdminBookings(await bRes.json());
      if (cRes.ok) {
        const cData = await cRes.json();
        if (Array.isArray(cData) && cData.length > 0) setClassSessions(cData);
      }
      if (pRes.ok) setMemberPins(await pRes.json());
      if (pwdRes.ok) {
        const data = await pwdRes.json();
        if (data.checkinPassword) setCheckinPwdDisplay(data.checkinPassword);
      }
    } catch (err) {
      console.error('後台資料加載錯誤', err);
    }
  }, []);

  useEffect(() => {
    if (isAdminAuth && adminPassword) {
      fetchAdminData(adminPassword);
    }
  }, [isAdminAuth, adminPassword, fetchAdminData, adminTab]);

  // 檢查 URL 路由 (#/class-checkin?session=...)
  useEffect(() => {
    const handleUrlRoute = () => {
      const hash = window.location.hash;
      const search = window.location.search;
      let sessionParam: string | null = null;
      if (hash.includes('session=')) {
        const match = hash.match(/session=([^&]+)/);
        if (match) sessionParam = match[1];
      } else if (search.includes('session=')) {
        const params = new URLSearchParams(search);
        sessionParam = params.get('session');
      }

      if (sessionParam) {
        setUrlSessionId(sessionParam);
        setView('class-checkin');
      }
    };

    handleUrlRoute();
    window.addEventListener('hashchange', handleUrlRoute);
    return () => window.removeEventListener('hashchange', handleUrlRoute);
  }, []);

  // 產生 QR Code 圖片
  useEffect(() => {
    if (activeQrSession) {
      const origin = window.location.origin;
      const path = window.location.pathname;
      const url = `${origin}${path}#/class-checkin?session=${activeQrSession.id}`;
      QRCodeLib.toDataURL(url, { width: 300, margin: 2, color: { dark: '#451a03', light: '#ffffff' } })
        .then(setQrModalDataUrl)
        .catch(console.error);
    } else {
      setQrModalDataUrl('');
    }
  }, [activeQrSession]);

  // 驗證 Drum Roll 加練時段
  useEffect(() => {
    const err = validatePracticeTime(practiceStart, practiceEnd);
    setPracticeError(err || '');
  }, [practiceStart, practiceEnd]);

  // ─── 預約動作 ─────────────────────────────────────────────────────────────

  const handleOpenBookingModal = () => {
    const err = validatePracticeTime(practiceStart, practiceEnd);
    if (err) {
      setPracticeError(err);
      return;
    }
    setBookingSlot({
      date: selectedDate,
      time: `${practiceStart} - ${practiceEnd}`,
    });
    setShowModal(true);
  };

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingSlot || !formData.studentId.trim() || !formData.nickname.trim() || !formData.realName.trim()) {
      return;
    }

    const newBooking: Booking = {
      id: Math.random().toString(36).substring(2, 9),
      date: bookingSlot.date,
      time: bookingSlot.time,
      nickname: formData.nickname.trim(),
      realName: formData.realName.trim(),
      studentId: formData.studentId.trim(),
      createdAt: new Date().toISOString(),
      attendance_status: 'attended',
    };

    // 同步嘗試發送至後端
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: newBooking.date,
          time: newBooking.time,
          nickname: newBooking.nickname,
          realName: newBooking.realName,
          specificTime: sanitizeTime(newBooking.time),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.id) newBooking.id = data.id;
      }
    } catch {
      // 離線降級
    }

    // 更新本地與列表
    setBookings((prev) => [...prev, newBooking]);
    setMyBookingIds((prev) => [...prev, newBooking.id]);

    // 儲存至全局 localStorage
    try {
      const saved = localStorage.getItem('app_bookings');
      const all: Booking[] = saved ? JSON.parse(saved) : [];
      all.push(newBooking);
      localStorage.setItem('app_bookings', JSON.stringify(all));
    } catch {
      // ignore
    }

    // 自動記錄學號與姓名至名冊
    if (newBooking.realName && newBooking.studentId) {
      setMemberPins((prev) => {
        if (!prev.some((p) => p.pin === newBooking.studentId)) {
          return [...prev, { realName: newBooking.realName!, pin: newBooking.studentId!, createdAt: new Date().toISOString() }];
        }
        return prev;
      });
      try {
        localStorage.setItem('app_my_student_id', newBooking.studentId);
        localStorage.setItem('app_my_real_name', newBooking.realName);
      } catch {
        // ignore
      }
    }

    setShowModal(false);
    setFormData({ nickname: '', realName: '', studentId: '' });
    fetchBookings(selectedDate);
  };

  const handleCancelBooking = async (id: string) => {
    setConfirmCancelId(id);
  };

  const confirmCancelBooking = async () => {
    const id = confirmCancelId;
    if (!id) return;
    setConfirmCancelId(null);

    try {
      await fetch(`/api/bookings/${id}`, { method: 'DELETE' });
    } catch {
      // ignore
    }

    setBookings((prev) => prev.filter((b) => b.id !== id));
    setMyBookingIds((prev) => prev.filter((myId) => myId !== id));

    try {
      const saved = localStorage.getItem('app_bookings');
      if (saved) {
        const all: Booking[] = JSON.parse(saved);
        localStorage.setItem('app_bookings', JSON.stringify(all.filter((b) => b.id !== id)));
      }
    } catch {
      // ignore
    }
  };

  // ─── 社課場次動作 (幹部) ──────────────────────────────────────────────────

  const handleCreateClassSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassName.trim() || !newClassDate.trim()) return;

    const newCode = generate10CharSessionCode();
    const newSession: ClassSession = {
      id: newCode,
      name: newClassName.trim(),
      date: newClassDate.trim(),
      isOpen: true,
      createdAt: new Date().toISOString(),
      attendees: [],
    };

    try {
      await fetch('/api/admin/class-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
        body: JSON.stringify({ id: newCode, name: newSession.name, date: newSession.date }),
      });
    } catch {
      // ignore
    }

    setClassSessions((prev) => [newSession, ...prev]);
    setNewClassName('');
  };

  const handleToggleClassOpen = async (id: string) => {
    const target = classSessions.find((s) => s.id === id);
    if (!target) return;
    const nextState = !target.isOpen;

    try {
      await fetch(`/api/admin/class-sessions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
        body: JSON.stringify({ isOpen: nextState }),
      });
    } catch {
      // ignore
    }

    setClassSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, isOpen: nextState } : s))
    );
  };

  const handleDeleteClassSession = async (id: string) => {
    if (!window.confirm('確定要刪除此社課場次及出席紀錄？')) return;

    try {
      await fetch(`/api/admin/class-sessions/${id}`, {
        method: 'DELETE',
        headers: { 'x-admin-password': adminPassword },
      });
    } catch {
      // ignore
    }

    setClassSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeQrSession?.id === id) setActiveQrSession(null);
    if (activeAttendeesSession?.id === id) setActiveAttendeesSession(null);
  };

  const copySessionCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedSessionId(code);
    setTimeout(() => setCopiedSessionId(null), 2000);
  };

  // ─── PIN 與設定動作 (幹部) ────────────────────────────────────────────────

  const handleAddPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPinName.trim() || !newPinCode.trim()) return;
    setPinSubmitting(true);
    try {
      const res = await fetch('/api/admin/member-pins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
        body: JSON.stringify({ realName: newPinName.trim(), pin: newPinCode.trim() }),
      });
      if (res.ok) {
        setNewPinName('');
        setNewPinCode('');
        fetchAdminData(adminPassword);
      }
    } catch {
      // Local fallback
      setMemberPins((prev) => [
        ...prev.filter((p) => p.realName !== newPinName.trim()),
        { realName: newPinName.trim(), pin: newPinCode.trim(), createdAt: new Date().toISOString() },
      ]);
      setNewPinName('');
      setNewPinCode('');
    } finally {
      setPinSubmitting(false);
    }
  };

  const handleDeletePin = async (realName: string) => {
    try {
      await fetch(`/api/admin/member-pins/${encodeURIComponent(realName)}`, {
        method: 'DELETE',
        headers: { 'x-admin-password': adminPassword },
      });
    } catch {
      // ignore
    }
    setMemberPins((prev) => prev.filter((m) => m.realName !== realName));
    setConfirmDeletePin(null);
  };

  const handleUpdateCheckinPwd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCheckinPwd.trim()) return;
    setCheckinPwdSubmitting(true);
    try {
      const res = await fetch('/api/admin/checkin-password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
        body: JSON.stringify({ checkinPassword: newCheckinPwd.trim() }),
      });
      if (res.ok) {
        setCheckinPwdDisplay(newCheckinPwd.trim());
        setNewCheckinPwd('');
        alert('點名密碼已更新！');
      }
    } catch {
      setCheckinPwdDisplay(newCheckinPwd.trim());
      setNewCheckinPwd('');
      alert('點名密碼已更新！');
    } finally {
      setCheckinPwdSubmitting(false);
    }
  };

  const handleClearAllSemesterData = async () => {
    if (clearAllConfirmText.trim() !== '確認清空') return;
    setClearingAll(true);
    try {
      const res = await fetch('/api/admin/clear-all-data', {
        method: 'DELETE',
        headers: { 'x-admin-password': adminPassword },
      });
      if (res.ok) {
        setAdminBookings([]);
        setMemberPins([]);
        setClassSessions([]);
        setSelectedMember(null);
        setShowClearAllModal(false);
        setClearAllConfirmText('');
        localStorage.removeItem('app_bookings');
        localStorage.removeItem('class_sessions');
        localStorage.removeItem('app_my_booking_ids');
        alert('學期資料已成功重置清空！');
      }
    } catch {
      setAdminBookings([]);
      setMemberPins([]);
      setClassSessions([]);
      setSelectedMember(null);
      setShowClearAllModal(false);
      setClearAllConfirmText('');
      localStorage.removeItem('app_bookings');
      localStorage.removeItem('class_sessions');
      localStorage.removeItem('app_my_booking_ids');
      alert('學期資料已成功重置清空！');
    } finally {
      setClearingAll(false);
    }
  };

  const deleteAdminMember = async (realName: string) => {
    try {
      await fetch(`/api/admin/members/${encodeURIComponent(realName)}`, {
        method: 'DELETE',
        headers: { 'x-admin-password': adminPassword },
      });
    } catch {
      // ignore
    }
    setAdminBookings((prev) => prev.filter((b) => b.realName !== realName));
    setSelectedMember(null);
    setConfirmDeleteMember(false);
  };

  // ─── 社課現場點名簽到動作 (學生) ──────────────────────────────────────────

  const handleStudentClassCheckin = (e: React.FormEvent, targetSessionId: string) => {
    e.preventDefault();
    if (!classCheckinStudentId.trim() || !classCheckinNickname.trim() || !classCheckinRealName.trim()) {
      return;
    }

    const session = classSessions.find((s) => s.id === targetSessionId);
    if (!session) {
      setClassCheckinResult({ success: false, message: '找不到此社課場次代碼，請確認是否輸入正確' });
      return;
    }

    if (!session.isOpen) {
      setClassCheckinResult({ success: false, message: '此社課場次已關閉點名' });
      return;
    }

    // 檢查是否重複簽到
    const already = session.attendees?.some((a) => a.studentId === classCheckinStudentId.trim());
    if (already) {
      setClassCheckinResult({
        success: true,
        message: '您先前已經完成本堂社課點名囉！',
        realName: classCheckinRealName.trim(),
      });
      return;
    }

    const newAttendee = {
      id: Math.random().toString(36).substring(2, 9),
      studentId: classCheckinStudentId.trim(),
      nickname: classCheckinNickname.trim(),
      realName: classCheckinRealName.trim(),
      checkedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    // 同步到後端
    try {
      fetch(`/api/class/session/${targetSessionId}/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin: newAttendee.studentId,
          nickname: newAttendee.nickname,
          realName: newAttendee.realName,
        }),
      });
    } catch {
      // ignore
    }

    // 自動記錄學號與姓名至名冊
    if (newAttendee.realName && newAttendee.studentId) {
      setMemberPins((prev) => {
        if (!prev.some((p) => p.pin === newAttendee.studentId)) {
          return [...prev, { realName: newAttendee.realName, pin: newAttendee.studentId, createdAt: new Date().toISOString() }];
        }
        return prev;
      });
      try {
        localStorage.setItem('app_my_student_id', newAttendee.studentId);
        localStorage.setItem('app_my_real_name', newAttendee.realName);
      } catch {
        // ignore
      }
    }

    setClassSessions((prev) =>
      prev.map((s) =>
        s.id === targetSessionId
          ? { ...s, attendees: [...(s.attendees || []), newAttendee] }
          : s
      )
    );

    setClassCheckinResult({
      success: true,
      message: `已成功簽到【${session.name}】！`,
      realName: newAttendee.realName,
    });
  };

  // ─── 社員首次登記與紀錄查詢 ─────────────────────────────────────────────

  const handleRegisterMember = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = registerRealNameInput.trim();
    const pin = registerStudentIdInput.trim();
    if (!name || !pin) {
      setRegisterMessage({ type: 'error', text: '請輸入姓名與學號' });
      return;
    }

    setRegisterLoading(true);
    setRegisterMessage(null);

    // 1. 同步送往後端登記
    try {
      await fetch('/api/member/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ realName: name, pin: pin }),
      });
    } catch {
      // ignore
    }

    // 2. 更新本地 memberPins 與 localStorage 讓後台和後續查詢立刻生效
    setMemberPins((prev) => {
      const filtered = prev.filter((p) => p.pin !== pin && p.realName !== name);
      return [...filtered, { realName: name, pin: pin, createdAt: new Date().toISOString() }];
    });

    try {
      localStorage.setItem('app_my_student_id', pin);
      localStorage.setItem('app_my_real_name', name);
    } catch {
      // ignore
    }

    setMemberPinInput(pin);
    setRegisterLoading(false);
    setRegisterMessage({ type: 'success', text: `登記成功！已為您綁定「${name} (${pin})」，今後只需輸入學號即可查詢。` });

    // 自動執行查詢顯示紀錄
    handleQueryMemberStats(pin);
  };

  const handleQueryMemberStats = async (pinToQuery: string) => {
    const pin = pinToQuery.trim();
    if (!pin) return;
    setMemberLoading(true);

    try {
      // 嘗試從後端 API 取得
      const [statsRes, classRes] = await Promise.all([
        fetch('/api/member/stats', { headers: { 'x-member-pin': pin } }),
        fetch('/api/member/class-stats', { headers: { 'x-member-pin': pin } }),
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setMemberRealName(statsData.realName || '');
        setMemberRecords(statsData.records || []);
      } else {
        // 本地降級配對
        queryMemberStatsLocally(pin);
      }

      if (classRes.ok) {
        const classData = await classRes.json();
        setMemberClassRecords(classData.records || []);
      }
    } catch {
      // 本地降級計算
      queryMemberStatsLocally(pin);
    } finally {
      setSubmittedMemberPin(pin);
      setMemberLoading(false);
    }
  };

  const queryMemberStatsLocally = (pin: string) => {
    // 找出所有加練紀錄中學號相符者
    let allStoredBookings: Booking[] = [];
    try {
      const saved = localStorage.getItem('app_bookings');
      if (saved) allStoredBookings = JSON.parse(saved);
    } catch {
      // ignore
    }
    const myPractice = allStoredBookings.filter((b) => b.studentId === pin);
    const matchedName = myPractice[0]?.realName || memberPins.find((p) => p.pin === pin)?.realName || '社員';
    setMemberRealName(matchedName);
    setMemberRecords(
      myPractice.map((b) => ({
        id: b.id,
        date: b.date,
        time: b.time,
        nickname: b.nickname,
        specificTime: b.time,
        actualTime: b.actual_time,
      }))
    );

    // 找出所有社課簽到相符者
    const myClasses: MemberClassRecord[] = [];
    classSessions.forEach((s) => {
      s.attendees?.forEach((a) => {
        if (a.studentId === pin) {
          myClasses.push({
            id: a.id,
            sessionId: s.id,
            sessionName: s.name,
            date: s.date,
            checkedAt: a.checkedAt,
          });
        }
      });
    });
    setMemberClassRecords(myClasses);
  };

  const handleMemberPinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberPinInput.trim()) return;
    handleQueryMemberStats(memberPinInput.trim());
  };

  // ─── 幹部登入 ─────────────────────────────────────────────────────────────

  const handleAdminLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPassword === 'sparrow') {
      setIsAdminAuth(true);
      fetchAdminData(adminPassword);
    } else {
      alert('密碼錯誤！請重新輸入。');
    }
  };

  // ─── 統計指標與名冊計算 ───────────────────────────────────────────────────

  const todayStr = getTodayTW();

  // 彙整後台所有加練預約（排序與篩選今後預約）
  const { upcomingBookings, pastBookings } = useMemo(() => {
    const allBookingsSource = adminBookings.length > 0 ? adminBookings : bookings;
    const sorted = [...allBookingsSource].sort((a, b) => {
      const cmp = a.date.localeCompare(b.date);
      if (cmp !== 0) return cmp;
      return a.time.localeCompare(b.time);
    });

    const upcoming = sorted.filter((b) => b.date >= todayStr);
    const past = sorted.filter((b) => b.date < todayStr).reverse(); // 歷史由新到舊

    return { upcomingBookings: upcoming, pastBookings: past };
  }, [adminBookings, bookings, todayStr]);

  // 計算社員出席總名冊 (彙整全部預約、名冊與社課出席)
  const memberDirectory = useMemo(() => {
    const map = new Map<string, {
      realName: string;
      studentId: string;
      totalHours: number;
      practiceCount: number;
      classCount: number;
    }>();

    // 1. PIN 綁定名冊
    memberPins.forEach((p) => {
      map.set(p.realName, {
        realName: p.realName,
        studentId: p.pin,
        totalHours: 0,
        practiceCount: 0,
        classCount: 0,
      });
    });

    // 2. 加練預約
    const allBookingsSource = adminBookings.length > 0 ? adminBookings : bookings;
    allBookingsSource.forEach((b) => {
      const name = b.realName || b.nickname;
      if (!name) return;
      const current = map.get(name) || {
        realName: name,
        studentId: b.studentId || '',
        totalHours: 0,
        practiceCount: 0,
        classCount: 0,
      };
      if (!current.studentId && b.studentId) current.studentId = b.studentId;
      const hrs = calculateHours(b.specificTime || b.time, b.actualTime || b.actual_time);
      current.totalHours += hrs;
      current.practiceCount += 1;
      map.set(name, current);
    });

    // 3. 社課簽到
    classSessions.forEach((s) => {
      s.attendees?.forEach((a) => {
        const name = a.realName || a.nickname;
        if (!name) return;
        const current = map.get(name) || {
          realName: name,
          studentId: a.studentId || '',
          totalHours: 0,
          practiceCount: 0,
          classCount: 0,
        };
        if (!current.studentId && a.studentId) current.studentId = a.studentId;
        current.classCount += 1;
        map.set(name, current);
      });
    });

    return Array.from(map.values()).sort((a, b) => b.totalHours - a.totalHours);
  }, [memberPins, adminBookings, bookings, classSessions]);

  // ═══════════════════════════════════════════════════════════════════════════
  // 視圖 1: 專屬社課掃碼簽到獨立頁面 (#/class-checkin?session=...)
  // ═══════════════════════════════════════════════════════════════════════════

  if (view === 'class-checkin' && urlSessionId) {
    const currentSession = classSessions.find((s) => s.id === urlSessionId);

    return (
      <div className="min-h-screen bg-stone-100/80 text-stone-900 font-sans p-4 flex items-center justify-center box-border">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-stone-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200 box-border">
          {/* Header */}
          <div className="bg-gradient-to-br from-amber-700 via-amber-800 to-amber-950 p-6 text-white text-center relative">
            <button
              onClick={() => {
                window.location.hash = '';
                setView('user');
                setClassCheckinResult(null);
              }}
              className="absolute top-4 left-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white"
              title="返回預約首頁"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="w-14 h-14 mx-auto mb-3 bg-white/15 rounded-2xl flex items-center justify-center backdrop-blur-sm shadow-inner">
              <GraduationCap className="w-8 h-8 text-amber-200" />
            </div>
            <h2 className="text-xl font-bold tracking-tight">馬術社課現場簽到</h2>
            <p className="text-xs text-amber-200/80 mt-1">
              場次代碼：<span className="font-mono font-bold text-white">{urlSessionId}</span>
            </p>
          </div>

          <div className="p-6 space-y-5 box-border">
            {classCheckinResult?.success ? (
              <div className="text-center py-6 space-y-4 animate-in fade-in">
                <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-stone-800">
                    {classCheckinResult.realName} 同學，點名成功！
                  </h3>
                  <p className="text-xs text-stone-500 mt-1">{classCheckinResult.message}</p>
                </div>
                <button
                  onClick={() => {
                    window.location.hash = '';
                    setView('user');
                  }}
                  className="w-full py-3 bg-stone-900 text-white rounded-xl font-bold hover:bg-stone-800 transition-colors shadow-sm text-sm"
                >
                  返回系統首頁
                </button>
              </div>
            ) : (
              <>
                {currentSession ? (
                  <div className="bg-amber-50/80 border border-amber-200/80 rounded-2xl p-4 text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-amber-800 uppercase tracking-wider">今日社課場次</span>
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-semibold ${
                          currentSession.isOpen ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${currentSession.isOpen ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                        {currentSession.isOpen ? '點名進行中' : '已截止點名'}
                      </span>
                    </div>
                    <p className="text-sm font-bold text-stone-900">{currentSession.name}</p>
                    <p className="text-stone-500">日期：{currentSession.date}</p>
                  </div>
                ) : (
                  <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-xs text-rose-700">
                    找不到此代碼的場次資訊，請確認代碼是否正確。
                  </div>
                )}

                {currentSession?.isOpen && (
                  <form
                    onSubmit={(e) => handleStudentClassCheckin(e, urlSessionId)}
                    className="space-y-4"
                  >
                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1">
                        學號 (PIN) <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={classCheckinStudentId}
                        onChange={(e) => setClassCheckinStudentId(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl border border-stone-200 focus:border-amber-600 focus:ring-2 focus:ring-amber-200 outline-none transition-all font-mono text-xs"
                        placeholder="請輸入學號"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1">
                        綽號 <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={classCheckinNickname}
                        onChange={(e) => setClassCheckinNickname(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl border border-stone-200 focus:border-amber-600 focus:ring-2 focus:ring-amber-200 outline-none transition-all text-xs"
                        placeholder="請輸入綽號"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1">
                        真實姓名 <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={classCheckinRealName}
                        onChange={(e) => setClassCheckinRealName(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl border border-stone-200 focus:border-amber-600 focus:ring-2 focus:ring-amber-200 outline-none transition-all text-xs"
                        placeholder="請輸入真實姓名"
                      />
                    </div>

                    {classCheckinResult && !classCheckinResult.success && (
                      <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-700 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                        <p className="font-medium">{classCheckinResult.message}</p>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={classCheckinLoading}
                      className="w-full py-3 bg-amber-600 text-white rounded-xl font-bold hover:bg-amber-700 transition-all shadow-md shadow-amber-200 disabled:opacity-60 text-xs"
                    >
                      {classCheckinLoading ? '簽到中…' : '✅ 立即完成點名'}
                    </button>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 視圖 2: 幹部與管理員後台 (4 Tabs: overview / members / classes / settings)
  // ═══════════════════════════════════════════════════════════════════════════

  const renderAdminView = () => {
    if (!isAdminAuth) {
      return (
        <div className="w-full max-w-md mx-auto mt-8 bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-stone-200 overflow-hidden box-border">
          <div className="flex flex-col items-center mb-6">
            <div className="w-14 h-14 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-center mb-3 shadow-inner">
              <Shield className="w-7 h-7 text-amber-700" />
            </div>
            <h2 className="text-xl font-bold text-stone-800">幹部與管理員控制台</h2>
            <p className="text-xs text-stone-500 mt-1">請輸入管理密碼進入系統管理</p>
          </div>
          <form onSubmit={handleAdminLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">管理密碼</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-stone-200 focus:border-amber-600 focus:ring-2 focus:ring-amber-200 outline-none transition-all text-xs"
                  placeholder="請輸入管理密碼"
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full py-2.5 bg-amber-600 text-white rounded-xl font-bold hover:bg-amber-700 transition-colors shadow-md shadow-amber-200 text-xs"
            >
              進入控制台
            </button>
          </form>
        </div>
      );
    }

    return (
      <div className="space-y-6 animate-in fade-in duration-300 w-full min-w-0 box-border">
        {/* Admin Navigation Bar */}
        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center bg-white p-3 rounded-2xl border border-stone-200 shadow-sm gap-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 w-full sm:w-auto">
            <button
              onClick={() => setAdminTab('overview')}
              className={`px-3 py-2 font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 ${
                adminTab === 'overview'
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-200'
                  : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              加練預約
            </button>
            <button
              onClick={() => setAdminTab('members')}
              className={`px-3 py-2 font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 ${
                adminTab === 'members'
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-200'
                  : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              成員名冊
            </button>
            <button
              onClick={() => setAdminTab('classes')}
              className={`px-3 py-2 font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 ${
                adminTab === 'classes'
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-200'
                  : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5" />
              社課場次
            </button>
            <button
              onClick={() => setAdminTab('settings')}
              className={`px-3 py-2 font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 ${
                adminTab === 'settings'
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-200'
                  : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              設定與 PIN
            </button>
          </div>

          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={() => setShowClearAllModal(true)}
              className="text-xs text-rose-600 hover:bg-rose-50 px-3 py-2 rounded-xl font-bold border border-rose-200 transition-colors flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              學期結算重置
            </button>
            <button
              onClick={() => setIsAdminAuth(false)}
              className="text-xs text-stone-500 hover:bg-stone-100 px-3 py-2 rounded-xl font-bold border border-stone-200"
            >
              登出
            </button>
          </div>
        </div>

        {/* ── 1. Tab: 加練預約總覽 (只顯示今後預約，可切換歷史紀錄) ── */}
        {adminTab === 'overview' && (
          <div className="bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-stone-200 space-y-4 box-border">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 pb-3 border-b border-stone-100">
              <div>
                <h3 className="text-base font-black text-stone-800 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-amber-600" />
                  {adminOverviewScope === 'upcoming' ? '今後加練預約總覽' : '全體加練歷史紀錄'}
                </h3>
                <p className="text-3xs text-stone-400 mt-0.5">
                  {adminOverviewScope === 'upcoming'
                    ? `僅顯示今日 (${todayStr}) 與未來之預約`
                    : '包含過去所有已完成或過期之加練紀錄'}
                </p>
              </div>

              {/* 切換範圍按鈕 */}
              <div className="flex bg-stone-100 p-1 rounded-xl border border-stone-200/60 text-xs font-bold self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setAdminOverviewScope('upcoming')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    adminOverviewScope === 'upcoming'
                      ? 'bg-white text-amber-800 shadow-xs'
                      : 'text-stone-500 hover:text-stone-800'
                  }`}
                >
                  今後預約 ({upcomingBookings.length})
                </button>
                <button
                  type="button"
                  onClick={() => setAdminOverviewScope('all')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    adminOverviewScope === 'all'
                      ? 'bg-white text-amber-800 shadow-xs'
                      : 'text-stone-500 hover:text-stone-800'
                  }`}
                >
                  歷史紀錄 ({pastBookings.length})
                </button>
              </div>
            </div>

            {(() => {
              const displayList = adminOverviewScope === 'upcoming' ? upcomingBookings : pastBookings;

              if (displayList.length === 0) {
                return (
                  <p className="text-xs text-stone-400 py-10 text-center">
                    {adminOverviewScope === 'upcoming'
                      ? '目前尚無今日或今後的加練預約'
                      : '目前尚無歷史預約紀錄'}
                  </p>
                );
              }

              return (
                <div className="overflow-x-auto w-full">
                  <table className="w-full text-left text-xs text-stone-700">
                    <thead className="bg-stone-50 text-stone-500 font-bold border-b border-stone-100">
                      <tr>
                        <th className="py-2.5 px-3">日期</th>
                        <th className="py-2.5 px-3">時段</th>
                        <th className="py-2.5 px-3">學號 (PIN)</th>
                        <th className="py-2.5 px-3">綽號</th>
                        <th className="py-2.5 px-3">本名</th>
                        <th className="py-2.5 px-3">時數</th>
                        <th className="py-2.5 px-3">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {displayList.map((b) => {
                        const isToday = b.date === todayStr;
                        return (
                          <tr key={b.id} className={`hover:bg-stone-50/80 ${isToday ? 'bg-amber-50/30' : ''}`}>
                            <td className="py-2.5 px-3 font-semibold flex items-center gap-1.5">
                              {b.date}
                              {isToday && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-3xs font-bold">
                                  今日
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3">{b.specificTime || b.time}</td>
                            <td className="py-2.5 px-3 font-mono text-amber-800 font-bold">{b.studentId || '—'}</td>
                            <td className="py-2.5 px-3 font-bold">{b.nickname}</td>
                            <td className="py-2.5 px-3">{b.realName || '—'}</td>
                            <td className="py-2.5 px-3 font-bold text-amber-700">
                              {calculateHours(b.specificTime || b.time, b.actualTime || b.actual_time)} hr
                            </td>
                            <td className="py-2.5 px-3">
                              <button
                                onClick={() => handleCancelBooking(b.id)}
                                className="text-rose-500 hover:text-rose-700 p-1"
                                title="刪除預約"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        )}

        {/* ── 2. Tab: 成員名冊 (支援搜尋與個別點擊檢視訓練/社課歷程) ── */}
        {adminTab === 'members' && (
          <div className="space-y-6 box-border">
            {selectedMember ? (
              <div className="bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-stone-200 space-y-6">
                {/* 成員詳細 Header */}
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-stone-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center font-black text-xl shadow-inner">
                      {selectedMember.slice(0, 1)}
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-stone-900 flex items-center gap-2">
                        {selectedMember}
                        {memberPins.find((p) => p.realName === selectedMember) && (
                          <span className="text-xs font-mono font-bold bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-lg">
                            學號 PIN: {memberPins.find((p) => p.realName === selectedMember)?.pin}
                          </span>
                        )}
                      </h3>
                      <p className="text-xs text-stone-400 mt-0.5">社員個別訓練與社課出席明細</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {confirmDeleteMember ? (
                      <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-xl px-3 py-1.5">
                        <span className="text-xs font-semibold text-rose-700">刪除此成員紀錄？</span>
                        <button
                          onClick={() => deleteAdminMember(selectedMember)}
                          className="text-xs bg-rose-600 text-white px-2.5 py-1 rounded-lg font-bold"
                        >
                          確定
                        </button>
                        <button
                          onClick={() => setConfirmDeleteMember(false)}
                          className="text-xs text-stone-500 px-2 py-1"
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteMember(true)}
                        className="text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 px-3 py-2 rounded-xl border border-rose-200 transition-colors"
                      >
                        刪除個人紀錄
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setSelectedMember(null);
                        setConfirmDeleteMember(false);
                      }}
                      className="text-amber-800 bg-stone-100 hover:bg-stone-200 px-4 py-2 rounded-xl font-bold text-xs transition-colors"
                    >
                      返回名冊
                    </button>
                  </div>
                </div>

                {(() => {
                  const memberBookings = (adminBookings.length > 0 ? adminBookings : bookings)
                    .filter((b) => (b.realName || b.nickname) === selectedMember);
                  const totalHrs = formatHours(
                    memberBookings.reduce(
                      (sum, b) => sum + calculateHours(b.specificTime || b.time, b.actualTime || b.actual_time),
                      0
                    )
                  );
                  const memberClasses = classSessions
                    .filter((s) => s.attendees?.some((a) => (a.realName || a.nickname) === selectedMember));

                  return (
                    <div className="space-y-6">
                      {/* 3 大指標卡 */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100 text-center">
                          <p className="text-xs text-stone-500 mb-1 flex items-center justify-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-amber-600" />
                            加練總時數
                          </p>
                          <p className="text-2xl font-black text-amber-700">
                            {totalHrs} <span className="text-xs font-normal text-stone-400">小時</span>
                          </p>
                        </div>
                        <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100 text-center">
                          <p className="text-xs text-stone-500 mb-1 flex items-center justify-center gap-1">
                            <Flame className="w-3.5 h-3.5 text-amber-600" />
                            加練出席次數
                          </p>
                          <p className="text-2xl font-black text-stone-800">
                            {memberBookings.length} <span className="text-xs font-normal text-stone-400">次</span>
                          </p>
                        </div>
                        <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100 text-center">
                          <p className="text-xs text-stone-500 mb-1 flex items-center justify-center gap-1">
                            <GraduationCap className="w-3.5 h-3.5 text-emerald-600" />
                            社課出席堂數
                          </p>
                          <p className="text-2xl font-black text-emerald-700">
                            {memberClasses.length} <span className="text-xs font-normal text-stone-400">堂</span>
                          </p>
                        </div>
                      </div>

                      {/* 歷程細項 */}
                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100 space-y-2">
                          <h4 className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
                            <Dumbbell className="w-4 h-4 text-amber-600" />
                            加練預約歷程
                          </h4>
                          {memberBookings.length === 0 ? (
                            <p className="text-xs text-stone-400 py-3 text-center">無加練紀錄</p>
                          ) : (
                            memberBookings.map((b) => (
                              <div key={b.id} className="bg-white p-2.5 rounded-xl border border-stone-200 text-xs flex justify-between">
                                <div>
                                  <p className="font-bold text-stone-800">{b.date}</p>
                                  <p className="text-stone-400">{b.specificTime || b.time}</p>
                                </div>
                                <span className="font-bold text-amber-700">
                                  {calculateHours(b.specificTime || b.time, b.actualTime || b.actual_time)} hr
                                </span>
                              </div>
                            ))
                          )}
                        </div>

                        <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100 space-y-2">
                          <h4 className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
                            <GraduationCap className="w-4 h-4 text-emerald-600" />
                            社課簽到歷程
                          </h4>
                          {memberClasses.length === 0 ? (
                            <p className="text-xs text-stone-400 py-3 text-center">無社課簽到紀錄</p>
                          ) : (
                            memberClasses.map((s) => (
                              <div key={s.id} className="bg-white p-2.5 rounded-xl border border-stone-200 text-xs flex justify-between">
                                <div>
                                  <p className="font-bold text-stone-800">{s.name}</p>
                                  <p className="text-stone-400">日期：{s.date}</p>
                                </div>
                                <span className="text-emerald-700 font-bold">已簽到</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-stone-200 space-y-4 box-border">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 pb-2 border-b border-stone-100">
                  <h3 className="text-base font-black text-stone-800 flex items-center gap-2">
                    <Users className="w-5 h-5 text-amber-600" />
                    全體社員名冊與時數總覽
                  </h3>
                  <div className="relative w-full sm:w-64">
                    <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      placeholder="搜尋社員姓名或學號"
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-stone-200 focus:border-amber-600 text-xs outline-none"
                    />
                  </div>
                </div>

                {memberDirectory.length === 0 ? (
                  <p className="text-xs text-stone-400 py-8 text-center">尚無社員名冊資料</p>
                ) : (
                  <div className="overflow-x-auto w-full">
                    <table className="w-full text-left text-xs text-stone-700">
                      <thead className="bg-stone-50 text-stone-500 font-bold border-b border-stone-100">
                        <tr>
                          <th className="py-2.5 px-3">姓名</th>
                          <th className="py-2.5 px-3">學號 (PIN)</th>
                          <th className="py-2.5 px-3">加練總時數</th>
                          <th className="py-2.5 px-3">加練次數</th>
                          <th className="py-2.5 px-3">社課出席</th>
                          <th className="py-2.5 px-3">明細</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {memberDirectory
                          .filter((m) =>
                            m.realName.toLowerCase().includes(memberSearch.toLowerCase()) ||
                            m.studentId.toLowerCase().includes(memberSearch.toLowerCase())
                          )
                          .map((m) => (
                            <tr key={m.realName} className="hover:bg-stone-50/80">
                              <td className="py-2.5 px-3 font-bold text-stone-900">{m.realName}</td>
                              <td className="py-2.5 px-3 font-mono text-amber-800 font-bold">
                                {m.studentId || <span className="text-stone-300 font-normal">未綁定</span>}
                              </td>
                              <td className="py-2.5 px-3 font-black text-amber-700">{formatHours(m.totalHours)} hr</td>
                              <td className="py-2.5 px-3">{m.practiceCount} 次</td>
                              <td className="py-2.5 px-3 text-emerald-800 font-bold">{m.classCount} 堂</td>
                              <td className="py-2.5 px-3">
                                <button
                                  onClick={() => setSelectedMember(m.realName)}
                                  className="text-xs text-amber-700 hover:text-amber-900 font-bold bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-lg transition-colors"
                                >
                                  查看明細
                                </button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── 3. Tab: 社課場次管理 ── */}
        {adminTab === 'classes' && (
          <div className="space-y-6 box-border">
            {/* 建立新社課表單 */}
            <div className="bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-stone-200 box-border">
              <h3 className="text-base font-black text-stone-800 mb-3 flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-amber-600" />
                建立新社課場次 (隨機生成 10 位代碼)
              </h3>
              <form onSubmit={handleCreateClassSession} className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  required
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  placeholder="社課名稱"
                  className="flex-1 px-4 py-2.5 rounded-xl border border-stone-200 focus:border-amber-600 outline-none text-xs"
                />
                <input
                  type="date"
                  required
                  value={newClassDate}
                  onChange={(e) => setNewClassDate(e.target.value)}
                  className="px-4 py-2.5 rounded-xl border border-stone-200 focus:border-amber-600 outline-none text-xs font-mono"
                />
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-amber-600 text-white rounded-xl font-bold hover:bg-amber-700 shadow-md shadow-amber-200 text-xs shrink-0"
                >
                  建立場次
                </button>
              </form>
            </div>

            {/* 場次列表 */}
            <div className="grid sm:grid-cols-2 gap-4">
              {classSessions.map((session) => (
                <div
                  key={session.id}
                  className="bg-white p-5 rounded-3xl border border-stone-200 shadow-sm flex flex-col justify-between space-y-4"
                >
                  <div>
                    <div className="flex justify-between items-start gap-2 mb-2">
                      <span className="font-mono text-xs font-black bg-amber-50 text-amber-900 border border-amber-200 px-2.5 py-1 rounded-lg">
                        {session.id}
                      </span>
                      <button
                        onClick={() => handleToggleClassOpen(session.id)}
                        className={`text-xs px-2.5 py-1 rounded-full font-bold transition-all ${
                          session.isOpen
                            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                            : 'bg-rose-100 text-rose-700 hover:bg-rose-200'
                        }`}
                      >
                        {session.isOpen ? '● 點名進行中' : '○ 已截止'}
                      </button>
                    </div>
                    <h4 className="font-bold text-stone-900 text-sm">{session.name}</h4>
                    <p className="text-xs text-stone-400 mt-1">
                      日期：{session.date} · 簽到人數：{session.attendees?.length || 0} 人
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-stone-100">
                    <button
                      onClick={() => setActiveQrSession(session)}
                      className="flex-1 py-2 rounded-xl bg-stone-900 text-white text-xs font-bold hover:bg-stone-800 flex items-center justify-center gap-1"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      投影 QR
                    </button>
                    <button
                      onClick={() => setActiveAttendeesSession(session)}
                      className="flex-1 py-2 rounded-xl bg-stone-100 text-stone-700 text-xs font-bold hover:bg-stone-200 flex items-center justify-center gap-1"
                    >
                      <Users className="w-3.5 h-3.5" />
                      出席名冊
                    </button>
                    <button
                      onClick={() => handleDeleteClassSession(session.id)}
                      className="p-2 text-stone-400 hover:text-rose-500 rounded-xl hover:bg-stone-100"
                      title="刪除場次"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 4. Tab: 設定與 PIN (學號與真實姓名管理) ── */}
        {adminTab === 'settings' && (
          <div className="space-y-6 box-border animate-in fade-in">
            {/* 加練現場點名密碼管理 */}
            <div className="bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-stone-200">
              <h3 className="font-bold text-stone-800 mb-3 flex items-center gap-2 text-sm">
                <ClipboardCheck className="w-4 h-4 text-amber-600" />
                加練現場點名密碼
              </h3>
              <div className="bg-stone-50 rounded-2xl p-4 mb-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-stone-500">今日加練點名 5 位數密碼：</p>
                  <p className="text-2xl font-black text-amber-700 font-mono tracking-widest mt-0.5">
                    {checkinPwdDisplay || '88321'}
                  </p>
                </div>
                <span className="text-xs bg-amber-100 text-amber-800 font-semibold px-2.5 py-1 rounded-full">
                  每日 00:00 自動更換
                </span>
              </div>
              <form onSubmit={handleUpdateCheckinPwd} className="flex gap-2">
                <input
                  type="text"
                  value={newCheckinPwd}
                  onChange={(e) => setNewCheckinPwd(e.target.value)}
                  placeholder="輸入新的點名密碼 (手動覆蓋)"
                  className="flex-1 px-4 py-2 rounded-xl border border-stone-200 focus:border-amber-600 outline-none text-xs font-mono"
                />
                <button
                  type="submit"
                  disabled={checkinPwdSubmitting || !newCheckinPwd.trim()}
                  className="px-4 py-2 bg-amber-600 text-white rounded-xl font-bold hover:bg-amber-700 text-xs disabled:opacity-60 shrink-0"
                >
                  更新
                </button>
              </form>
            </div>

            {/* 社員學號 (PIN) 與真實姓名名冊管理 */}
            <div className="bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-stone-200 space-y-4">
              <div className="flex justify-between items-center pb-2 border-b border-stone-100">
                <h3 className="font-bold text-stone-800 flex items-center gap-2 text-sm">
                  <KeyRound className="w-4 h-4 text-amber-600" />
                  社員學號 (PIN) 與真實姓名綁定名冊
                </h3>
                <span className="text-xs text-stone-400">共 {memberPins.length} 位社員</span>
              </div>

              {/* 新增 / 修改 PIN */}
              <form onSubmit={handleAddPin} className="flex gap-2 flex-wrap">
                <input
                  type="text"
                  required
                  value={newPinName}
                  onChange={(e) => setNewPinName(e.target.value)}
                  placeholder="真實姓名"
                  className="flex-1 min-w-[120px] px-3.5 py-2 rounded-xl border border-stone-200 focus:border-amber-600 outline-none text-xs"
                />
                <input
                  type="text"
                  required
                  value={newPinCode}
                  onChange={(e) => setNewPinCode(e.target.value)}
                  placeholder="學號 (PIN)"
                  className="w-36 px-3.5 py-2 rounded-xl border border-stone-200 focus:border-amber-600 outline-none text-xs font-mono"
                />
                <button
                  type="submit"
                  disabled={pinSubmitting || !newPinName.trim() || !newPinCode.trim()}
                  className="px-4 py-2 bg-amber-600 text-white rounded-xl font-bold text-xs hover:bg-amber-700 disabled:opacity-60 shrink-0"
                >
                  手動新增 / 更新
                </button>
              </form>

              {/* 綁定清單 */}
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {memberPins.length === 0 ? (
                  <p className="text-xs text-stone-400 py-6 text-center">尚未新增任何社員學號綁定</p>
                ) : (
                  memberPins.map((m) => (
                    <div
                      key={m.realName}
                      className="flex items-center justify-between bg-stone-50 rounded-xl px-4 py-2.5 border border-stone-100 text-xs"
                    >
                      <span className="font-bold text-stone-800">{m.realName}</span>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs bg-white border border-stone-200 px-2.5 py-1 rounded-md text-amber-800 font-bold">
                          {m.pin}
                        </span>
                        {confirmDeletePin === m.realName ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDeletePin(m.realName)}
                              className="text-xs bg-rose-600 text-white px-2 py-0.5 rounded font-bold"
                            >
                              確定
                            </button>
                            <button
                              onClick={() => setConfirmDeletePin(null)}
                              className="text-xs text-stone-500 px-1 py-0.5"
                            >
                              取消
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeletePin(m.realName)}
                            className="text-stone-400 hover:text-rose-500 p-1"
                            title="刪除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 視圖 3: 個人訓練與社課紀錄視圖 (我的紀錄 - 支援首次使用姓名登記與學號快速查詢)
  // ═══════════════════════════════════════════════════════════════════════════

  const renderMemberView = () => (
    <div className="space-y-6 animate-in fade-in duration-200 w-full max-w-full box-border">
      {/* 查詢與首次登記卡片 */}
      <div className="bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-stone-200 max-w-xl mx-auto box-border space-y-4">
        <div className="flex flex-col items-center text-center">
          <div className="w-12 h-12 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-center mb-2 shadow-inner">
            <KeyRound className="w-6 h-6 text-amber-700" />
          </div>
          <h3 className="text-base font-black text-stone-800">個人加練與社課出席查詢</h3>
          <p className="text-xs text-stone-500 mt-1">
            {memberQueryMode === 'register'
              ? '首次使用請先登記真實姓名與學號，後台將建立專屬檔案'
              : '已登記之社員，請直接輸入學號即可查詢'}
          </p>
        </div>

        {/* 模式切換膠囊 */}
        <div className="flex bg-stone-100 p-1 rounded-2xl border border-stone-200/80 text-xs font-bold w-full">
          <button
            type="button"
            onClick={() => {
              setMemberQueryMode('query');
              setRegisterMessage(null);
            }}
            className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              memberQueryMode === 'query'
                ? 'bg-white text-amber-800 shadow-xs'
                : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>學號快速查詢</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMemberQueryMode('register');
              setRegisterMessage(null);
            }}
            className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              memberQueryMode === 'register'
                ? 'bg-white text-amber-800 shadow-xs'
                : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            <span>首次使用登記</span>
          </button>
        </div>

        {/* 提示訊息 */}
        {registerMessage && (
          <div
            className={`p-3 rounded-2xl text-xs flex items-center gap-2 ${
              registerMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            {registerMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{registerMessage.text}</span>
          </div>
        )}

        {/* 模式 1: 學號快速查詢 */}
        {memberQueryMode === 'query' ? (
          <form onSubmit={handleMemberPinSubmit} className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                required
                value={memberPinInput}
                onChange={(e) => setMemberPinInput(e.target.value)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-stone-200 focus:border-amber-600 focus:ring-2 focus:ring-amber-200 outline-none transition-all font-mono text-xs"
                placeholder="請輸入學號"
              />
              <button
                type="submit"
                disabled={memberLoading || !memberPinInput.trim()}
                className="px-5 py-2.5 bg-amber-600 text-white rounded-xl font-bold hover:bg-amber-700 shadow-md shadow-amber-200 text-xs disabled:opacity-50 shrink-0 flex items-center gap-1.5"
              >
                {memberLoading ? '查詢中…' : '查詢紀錄'}
              </button>
            </div>
            <div className="flex justify-between items-center px-1">
              <span className="text-3xs text-stone-400">輸入學號按 Enter 即可快速查詢</span>
              <button
                type="button"
                onClick={() => setMemberQueryMode('register')}
                className="text-3xs text-amber-700 hover:underline font-bold"
              >
                首次使用？點此登記姓名與學號
              </button>
            </div>
          </form>
        ) : (
          /* 模式 2: 首次使用登記 (輸入 realname 與 學號) */
          <form onSubmit={handleRegisterMember} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-3xs font-bold text-stone-600 mb-1">真實姓名 (本名)</label>
                <input
                  type="text"
                  required
                  value={registerRealNameInput}
                  onChange={(e) => setRegisterRealNameInput(e.target.value)}
                  placeholder="請輸入本名"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 focus:border-amber-600 focus:ring-2 focus:ring-amber-200 outline-none text-xs"
                />
              </div>
              <div>
                <label className="block text-3xs font-bold text-stone-600 mb-1">學號 (PIN 碼)</label>
                <input
                  type="text"
                  required
                  value={registerStudentIdInput}
                  onChange={(e) => setRegisterStudentIdInput(e.target.value)}
                  placeholder="請輸入學號"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 focus:border-amber-600 focus:ring-2 focus:ring-amber-200 outline-none text-xs font-mono"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={registerLoading || !registerRealNameInput.trim() || !registerStudentIdInput.trim()}
              className="w-full py-2.5 bg-amber-600 text-white rounded-xl font-bold hover:bg-amber-700 shadow-md shadow-amber-200 text-xs disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {registerLoading ? '登記中…' : '完成登記並查詢紀錄'}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => setMemberQueryMode('query')}
                className="text-3xs text-stone-500 hover:text-stone-800 font-bold"
              >
                已經登記過？切換至「學號快速查詢」
              </button>
            </div>
          </form>
        )}
      </div>

      {/* 查詢結果卡片 */}
      {submittedMemberPin && (
        <div className="space-y-6 max-w-2xl mx-auto box-border animate-in fade-in duration-200">
          {/* Header 徽章 */}
          <div className="bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-stone-200 flex justify-between items-center box-border">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-lg shadow-inner">
                {memberRealName.slice(0, 1) || '學'}
              </div>
              <div>
                <p className="font-bold text-stone-800 text-base flex items-center gap-2">
                  {memberRealName}
                  <span className={`text-3xs font-semibold px-2 py-0.5 rounded-full border ${getRiderTitle(memberRecords.length).border} ${getRiderTitle(memberRecords.length).bg} ${getRiderTitle(memberRecords.length).color}`}>
                    {getRiderTitle(memberRecords.length).title}
                  </span>
                </p>
                <p className="text-xs text-stone-400 font-mono">學號 PIN: {submittedMemberPin}</p>
              </div>
            </div>
          </div>

          {/* 3 大指標卡 */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white p-4 rounded-2xl border border-stone-200 text-center shadow-xs">
              <p className="text-xs text-stone-500 mb-1 flex items-center justify-center gap-1">
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                加練總時數
              </p>
              <p className="text-xl font-black text-amber-700">
                {formatHours(
                  memberRecords.reduce(
                    (sum, r) => sum + calculateHours(r.specificTime || r.time, r.actualTime),
                    0
                  )
                )} <span className="text-xs font-normal text-stone-400">小時</span>
              </p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-stone-200 text-center shadow-xs">
              <p className="text-xs text-stone-500 mb-1 flex items-center justify-center gap-1">
                <Flame className="w-3.5 h-3.5 text-amber-600" />
                加練次數
              </p>
              <p className="text-xl font-black text-stone-800">
                {memberRecords.length} <span className="text-xs font-normal text-stone-400">次</span>
              </p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-stone-200 text-center shadow-xs">
              <p className="text-xs text-stone-500 mb-1 flex items-center justify-center gap-1">
                <GraduationCap className="w-3.5 h-3.5 text-emerald-600" />
                社課出席
              </p>
              <p className="text-xl font-black text-emerald-700">
                {memberClassRecords.length} <span className="text-xs font-normal text-stone-400">堂</span>
              </p>
            </div>
          </div>

          {/* 明細清單 */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-sm space-y-3">
              <h4 className="text-xs font-bold text-stone-800 flex items-center justify-between border-b border-stone-100 pb-2">
                <span className="flex items-center gap-1.5">
                  <ClipboardCheck className="w-4 h-4 text-amber-600" />
                  加練出席明細
                </span>
                <span className="text-stone-400 font-normal">共 {memberRecords.length} 筆</span>
              </h4>
              {memberRecords.length === 0 ? (
                <p className="text-xs text-stone-400 py-6 text-center">尚無加練出席紀錄</p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {memberRecords.map((r) => (
                    <div key={r.id} className="p-3 bg-stone-50 rounded-xl border border-stone-100 text-xs flex justify-between items-center">
                      <div>
                        <p className="font-bold text-stone-800">{r.date}</p>
                        <p className="text-stone-400">{r.specificTime || r.time}</p>
                      </div>
                      <span className="font-bold text-amber-700 bg-white px-2.5 py-1 rounded-lg border border-stone-200">
                        {calculateHours(r.specificTime || r.time, r.actualTime)} hr
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-sm space-y-3">
              <h4 className="text-xs font-bold text-stone-800 flex items-center justify-between border-b border-stone-100 pb-2">
                <span className="flex items-center gap-1.5">
                  <GraduationCap className="w-4 h-4 text-emerald-600" />
                  社課簽到明細
                </span>
                <span className="text-stone-400 font-normal">共 {memberClassRecords.length} 堂</span>
              </h4>
              {memberClassRecords.length === 0 ? (
                <p className="text-xs text-stone-400 py-6 text-center">尚無社課簽到紀錄</p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {memberClassRecords.map((c) => (
                    <div key={c.id} className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100 text-xs flex justify-between items-center">
                      <div>
                        <p className="font-bold text-stone-800">{c.sessionName}</p>
                        <p className="text-stone-400">日期：{c.date}</p>
                      </div>
                      <span className="text-emerald-700 font-bold bg-white px-2.5 py-1 rounded-lg border border-emerald-200">
                        已出席
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // 視圖 4: 學生首頁 (3 Tabs: 加練預約 → 社課點名 → 出席紀錄)
  // ═══════════════════════════════════════════════════════════════════════════

  const renderUserView = () => (
    <div className="grid md:grid-cols-3 gap-6 md:gap-8 animate-in fade-in duration-200 w-full max-w-full box-border">
      <div className="md:col-span-2 space-y-6 min-w-0 w-full">
        {/* 頂部 Tab 排序：加練預約 → 社課點名 */}
        <div className="flex gap-1.5 sm:gap-2 bg-white p-1.5 rounded-2xl border border-stone-200 shadow-sm w-full box-border">
          <button
            onClick={() => setUserTab('加練')}
            className={`flex-1 py-3 px-2 sm:px-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
              userTab === '加練'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-200'
                : 'text-stone-600 hover:bg-stone-100'
            }`}
          >
            <Dumbbell className="w-4 h-4 shrink-0" />
            <span>加練預約</span>
          </button>
          <button
            onClick={() => setUserTab('社課點名')}
            className={`flex-1 py-3 px-2 sm:px-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
              userTab === '社課點名'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-200'
                : 'text-stone-600 hover:bg-stone-100'
            }`}
          >
            <QrCode className="w-4 h-4 shrink-0" />
            <span>社課點名</span>
          </button>
        </div>

        {/* ── 1. 加練預約 (Drum Roll 選擇器) ── */}
        {userTab === '加練' && (
          <div className="space-y-6 w-full">
            <div className="bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-stone-200 w-full box-border">
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="w-5 h-5 text-amber-600" />
                <h2 className="text-base font-black text-stone-800">1. 選擇加練日期</h2>
              </div>
              <div className="flex overflow-x-auto gap-2 pb-1 w-full" style={{ scrollbarWidth: 'none' }}>
                {dates.map((d) => (
                  <button
                    key={d.value}
                    onClick={() => setSelectedDate(d.value)}
                    className={`whitespace-nowrap px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all shrink-0 ${
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

            <div className="bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-stone-200 space-y-4 w-full box-border">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-600" />
                <h2 className="text-base font-black text-stone-800">2. 選擇加練時段 (滾輪選取)</h2>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:gap-4 w-full">
                <div className="space-y-1.5 min-w-0">
                  <span className="text-xs font-bold text-stone-500">開始時間</span>
                  <DrumRollPicker
                    items={PRACTICE_TIMES}
                    value={practiceStart}
                    onChange={setPracticeStart}
                  />
                </div>
                <div className="space-y-1.5 min-w-0">
                  <span className="text-xs font-bold text-stone-500">結束時間</span>
                  <DrumRollPicker
                    items={PRACTICE_TIMES}
                    value={practiceEnd}
                    onChange={setPracticeEnd}
                  />
                </div>
              </div>

              {practiceError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
                  <span>{practiceError}</span>
                </div>
              )}

              <button
                type="button"
                disabled={Boolean(practiceError)}
                onClick={handleOpenBookingModal}
                className="w-full py-3.5 rounded-2xl bg-amber-600 text-white font-bold text-sm hover:bg-amber-700 transition-all shadow-md shadow-amber-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                立即預約加練時段 ({practiceStart} - {practiceEnd})
              </button>
            </div>
          </div>
        )}

        {/* ── 2. 社課點名 ── */}
        {userTab === '社課點名' && (
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-stone-200 space-y-6 w-full box-border">
            <div className="flex items-center gap-3 border-b border-stone-100 pb-4">
              <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-700 shadow-inner">
                <QrCode className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-stone-800">社課現場簽到</h3>
                <p className="text-xs text-stone-500 mt-0.5">請掃描現場投影之 QR Code 或輸入 10 位代碼</p>
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-3">
              <div className="p-4 bg-stone-50 rounded-2xl border border-stone-100 text-center">
                <span className="w-6 h-6 rounded-full bg-amber-600 text-white font-bold text-xs inline-flex items-center justify-center mb-2">1</span>
                <p className="font-bold text-stone-800 text-xs">掃描現場 QR</p>
                <p className="text-3xs text-stone-500 mt-1">開啟相機掃描投影螢幕</p>
              </div>
              <div className="p-4 bg-stone-50 rounded-2xl border border-stone-100 text-center">
                <span className="w-6 h-6 rounded-full bg-amber-600 text-white font-bold text-xs inline-flex items-center justify-center mb-2">2</span>
                <p className="font-bold text-stone-800 text-xs">輸入個人學號</p>
                <p className="text-3xs text-stone-500 mt-1">填寫學號與姓名</p>
              </div>
              <div className="p-4 bg-stone-50 rounded-2xl border border-stone-100 text-center">
                <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold text-xs inline-flex items-center justify-center mb-2">3</span>
                <p className="font-bold text-stone-800 text-xs">完成點名</p>
                <p className="text-3xs text-stone-500 mt-1">即時記錄於出席總表</p>
              </div>
            </div>

            <div className="pt-2 border-t border-stone-100">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!manualSessionInput.trim()) return;
                  setUrlSessionId(manualSessionInput.trim());
                  setView('class-checkin');
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={manualSessionInput}
                  onChange={(e) => setManualSessionInput(e.target.value)}
                  placeholder="輸入 10 位場次代碼"
                  className="flex-1 px-4 py-2.5 rounded-xl border border-stone-200 focus:border-amber-600 outline-none text-xs font-mono"
                />
                <button
                  type="submit"
                  disabled={!manualSessionInput.trim()}
                  className="px-5 py-2.5 bg-stone-900 text-white rounded-xl font-bold hover:bg-stone-800 text-xs disabled:opacity-50 shrink-0"
                >
                  前往點名
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* 右側：當日預約狀況列表 */}
      <div className="space-y-6 w-full box-border min-w-0">
        <div className="bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-stone-200 space-y-4 w-full box-border">
          <div className="flex justify-between items-center pb-2 border-b border-stone-100">
            <h3 className="text-base font-black text-stone-800 flex items-center gap-2">
              <Users className="w-5 h-5 text-amber-600" />
              {selectedDate} 加練名單
            </h3>
            <span className="text-xs text-stone-400 font-semibold">
              共 {bookings.filter((b) => b.date === selectedDate).length} 人
            </span>
          </div>

          <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1">
            {bookings.filter((b) => b.date === selectedDate).length === 0 ? (
              <p className="text-xs text-stone-400 py-8 text-center">此日目前尚無預約</p>
            ) : (
              bookings
                .filter((b) => b.date === selectedDate)
                .map((b) => {
                  const isMine = myBookingIds.includes(b.id);
                  return (
                    <div
                      key={b.id}
                      className={`p-3.5 rounded-2xl border transition-all ${
                        isMine
                          ? 'bg-amber-50/60 border-amber-200/80 shadow-xs'
                          : 'bg-stone-50 border-stone-100'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-black text-stone-800 text-xs flex items-center gap-1.5">
                            {b.nickname}
                            {isMine && (
                              <span className="text-3xs font-bold px-2 py-0.5 bg-amber-600 text-white rounded-full">
                                我的預約
                              </span>
                            )}
                          </p>
                          <p className="text-3xs text-stone-500 font-mono mt-0.5">{b.time}</p>
                        </div>
                        {isMine && (
                          <button
                            onClick={() => handleCancelBooking(b.id)}
                            className="text-xs font-bold text-rose-500 hover:text-rose-700 bg-white border border-rose-200 px-2 py-1 rounded-lg"
                          >
                            取消
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // 主畫面 Layout (全新精緻美觀頂部 Header 與導航)
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-stone-100/60 text-stone-900 font-sans p-3 sm:p-4 md:p-8 flex flex-col items-center w-full box-border overflow-x-hidden">
      {/* 頂部 Header */}
      <header className="w-full max-w-4xl mx-auto flex items-center justify-between mb-5 pb-3.5 border-b border-stone-200/80 gap-2">
        {/* 左側 Logo 與系統標題 */}
        <div
          onClick={() => {
            setView('user');
            window.location.hash = '';
          }}
          className="flex items-center gap-2.5 cursor-pointer select-none min-w-0"
        >
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-gradient-to-tr from-amber-700 to-amber-900 text-white flex items-center justify-center font-bold text-base sm:text-lg shadow-md shadow-amber-900/20 shrink-0">
            🐎
          </div>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-black text-stone-900 tracking-tight leading-tight truncate">
              馬術社預約系統
            </h1>
            <p className="text-3xs text-stone-400 font-medium hidden sm:block">Equestrian Club System</p>
          </div>
        </div>

        {/* 右側導航按鈕群 (精緻膠囊化排版，絕不折行) */}
        <div className="flex items-center shrink-0">
          {view !== 'user' ? (
            <button
              onClick={() => {
                setView('user');
                window.location.hash = '';
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-600 text-white hover:bg-amber-700 text-xs font-bold transition-all shadow-sm shadow-amber-200 whitespace-nowrap"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>返回首頁</span>
            </button>
          ) : (
            <div className="inline-flex items-center bg-white/90 p-1 rounded-2xl border border-stone-200/90 shadow-2xs gap-1">
              <button
                onClick={() => setView('member')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-stone-700 hover:text-amber-800 hover:bg-amber-50/80 transition-all whitespace-nowrap"
              >
                <Award className="w-3.5 h-3.5 text-amber-600" />
                <span>我的紀錄</span>
              </button>
              <button
                onClick={() => setView('admin')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-stone-900 text-white hover:bg-stone-800 transition-all whitespace-nowrap shadow-xs"
              >
                <Shield className="w-3.5 h-3.5 text-amber-400" />
                <span>幹部後台</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* 主視圖容器 */}
      <main className="w-full max-w-4xl mx-auto flex-1 box-border">
        {view === 'user' && renderUserView()}
        {view === 'admin' && renderAdminView()}
        {view === 'member' && renderMemberView()}
      </main>

      {/* ── 投影 QR Code Modal (含 10 位代碼與複製按鈕) ── */}
      {activeQrSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs box-border">
          <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-sm w-full border border-stone-200 text-center animate-in fade-in zoom-in-95 duration-150 box-border">
            <div className="flex justify-between items-center pb-3 border-b border-stone-100">
              <span className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
                現場掃碼點名
              </span>
              <button
                onClick={() => setActiveQrSession(null)}
                className="text-stone-400 hover:text-stone-600 p-1 rounded-full hover:bg-stone-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <h3 className="font-black text-stone-800 text-base mt-3">{activeQrSession.name}</h3>
            <p className="text-xs text-stone-500 mt-0.5">日期：{activeQrSession.date}</p>

            <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200 inline-block shadow-inner my-3">
              {qrModalDataUrl ? (
                <img src={qrModalDataUrl} alt="QR Code" width={260} height={260} className="rounded-xl max-w-full" />
              ) : (
                <div className="w-[260px] h-[260px] flex items-center justify-center">
                  <RefreshCw className="w-8 h-8 text-stone-400 animate-spin" />
                </div>
              )}
            </div>

            <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 text-xs text-stone-700 flex justify-between items-center">
              <span>場次代碼 (10字)：<span className="font-mono font-bold text-amber-900">{activeQrSession.id}</span></span>
              <button
                onClick={() => copySessionCode(activeQrSession.id)}
                className="text-xs font-bold px-2.5 py-1 bg-white border border-amber-200 rounded-lg text-amber-800 hover:bg-amber-100"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-xs box-border">
          <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-lg w-full border border-stone-200 max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-150 box-border">
            <div className="flex justify-between items-center pb-4 border-b border-stone-100">
              <div>
                <h3 className="font-black text-stone-800 text-base">{activeAttendeesSession.name}</h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  日期：{activeAttendeesSession.date} · 簽到人數：{activeAttendeesSession.attendees?.length || 0} 人
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
              {!activeAttendeesSession.attendees || activeAttendeesSession.attendees.length === 0 ? (
                <p className="text-center py-8 text-xs text-stone-400">目前尚無人簽到</p>
              ) : (
                activeAttendeesSession.attendees.map((a, idx) => (
                  <div key={a.id} className="flex items-center gap-3 bg-stone-50 p-3 rounded-xl border border-stone-100">
                    <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0 text-xs">
                      <p className="font-bold text-stone-800">{a.nickname} ({a.realName})</p>
                      <p className="text-stone-400 font-mono">學號: {a.studentId || '—'} · 簽到: {a.checkedAt}</p>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-xs box-border">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-stone-200 animate-in fade-in zoom-in-95 duration-150 box-border">
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
                  個人學號 (PIN) *
                </label>
                <input
                  type="text"
                  required
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

      {/* ── 學期結算一鍵清空安全防護 Modal ── */}
      {showClearAllModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs box-border">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden p-6 space-y-4 border border-rose-200">
            <div className="flex justify-between items-center border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2 text-rose-600">
                <AlertCircle className="w-6 h-6" />
                <h3 className="font-black text-base text-stone-900">學期結算與全體清空確認</h3>
              </div>
              <button
                onClick={() => {
                  setShowClearAllModal(false);
                  setClearAllConfirmText('');
                }}
                className="p-1 rounded-full text-stone-400 hover:bg-stone-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-stone-600">
              <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 space-y-1.5 text-rose-900">
                <p className="font-bold text-sm">⚠️ 此操作無法復原，將會完全清除：</p>
                <p>1. 全體社員學號綁定名冊 (Members 表)</p>
                <p>2. 本學期所有加練預約與出席時數紀錄 (Bookings 表)</p>
                <p>3. 所有社課簽到出席名冊 (Class Attendance 表)</p>
              </div>
              <p className="font-semibold text-stone-700">
                為了避免誤觸，請在下方輸入 <span className="text-rose-600 font-mono font-bold bg-stone-100 px-1.5 py-0.5 rounded">確認清空</span> 以解除防護鎖定：
              </p>
              <input
                type="text"
                autoFocus
                value={clearAllConfirmText}
                onChange={(e) => setClearAllConfirmText(e.target.value)}
                placeholder="請輸入確認清空"
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 focus:border-rose-500 focus:ring-2 focus:ring-rose-200 outline-none text-xs font-bold text-center"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowClearAllModal(false);
                  setClearAllConfirmText('');
                }}
                className="flex-1 py-2.5 rounded-xl border border-stone-200 text-stone-600 font-bold text-xs hover:bg-stone-50"
              >
                取消返回
              </button>
              <button
                type="button"
                disabled={clearingAll || clearAllConfirmText.trim() !== '確認清空'}
                onClick={handleClearAllSemesterData}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 text-white font-bold text-xs hover:bg-rose-700 disabled:opacity-40 transition-colors shadow-xs"
              >
                {clearingAll ? '清空中…' : '確認執行學期重置'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
