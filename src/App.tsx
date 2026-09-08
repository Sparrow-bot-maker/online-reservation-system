import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Calendar,
  Clock,
  User,
  X,
  CheckCircle2,
  AlertCircle,
  Shield,
  Lock,
  Trash2,
  ClipboardCheck,
  KeyRound,
  Settings,
  QrCode,
  GraduationCap,
  Sparkles,
  ExternalLink,
  Copy,
  ChevronRight,
  ArrowLeft,
  Check,
  CalendarCheck2,
  Flame,
  Radio,
  Share2
} from 'lucide-react';
import QRCode from 'qrcode';

// ─── 類型定義 ───────────────────────────────────────────────

type Booking = {
  id: string;
  date: string;
  time: string;
  nickname: string;
};

type AdminBooking = Booking & {
  realName: string;
  specificTime: string;
  actualTime?: string;
  attendance_status?: string;
  note?: string;
};

type MemberRecord = {
  id: string;
  date: string;
  time: string;
  nickname: string;
  specificTime: string;
  actualTime?: string;
};

type MemberPin = {
  realName: string;
  pin: string;
  createdAt?: string;
};

type ClassSession = {
  id: string;
  name: string;
  date: string;
  isOpen: boolean;
  createdAt?: string;
  attendees?: ClassAttendee[];
};

type ClassAttendee = {
  id: number;
  sessionId: string;
  realName: string;
  checkedAt: string;
};

type MemberClassRecord = {
  id: number;
  sessionId: string;
  sessionName: string;
  date: string;
  checkedAt: string;
};

// ─── 工具常數與函式 ──────────────────────────────────────────

const isWeekend = (dateString: string) => {
  const d = new Date(dateString + 'T00:00:00Z');
  const day = d.getUTCDay();
  return day === 0 || day === 6;
};

const isFriday = (dateString: string) => {
  const d = new Date(dateString + 'T00:00:00Z');
  return d.getUTCDay() === 5;
};

const MORNING_TIME_SLOT = '06:00 - 08:00';
const MORNING_SPECIFIC_TIME = '06:00~08:00';
const SHOW_MORNING_TRAINING = false; // 目前無晨練功能，前台暫時隱藏（功能與邏輯仍完整保留）

const getTimeSlots = (dateString: string) => {
  if (isWeekend(dateString)) {
    return ['09:00 - 12:00', '14:00 - 18:00'];
  }
  return ['09:00 - 12:00', '14:00 - 19:00'];
};

const generateDates = () => {
  const dates = [];
  const now = new Date();
  const twNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const todayStr = twNow.toISOString().split('T')[0];
  for (let i = 0; i < 4; i++) {
    const base = new Date(`${todayStr}T00:00:00Z`);
    const d = new Date(base.getTime() + i * 86400000);
    const dateString = d.toISOString().split('T')[0];
    const displayString = `${d.getUTCMonth() + 1}/${d.getUTCDate()} (${['日', '一', '二', '三', '四', '五', '六'][d.getUTCDay()]})`;
    dates.push({ value: dateString, display: displayString });
  }
  return dates;
};

function getTodayTW(): string {
  const now = new Date();
  const tw = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return tw.toISOString().split('T')[0];
}

export default function App() {
  const [dates, setDates] = useState(generateDates());
  const [selectedDate, setSelectedDate] = useState(() => generateDates()[0].value);

  // 跨日檢查
  useEffect(() => {
    const check = () => {
      const newDates = generateDates();
      setDates((prev) => {
        if (prev[0].value !== newDates[0].value) {
          setSelectedDate(newDates[0].value);
          return newDates;
        }
        return prev;
      });
    };
    const timer = setInterval(check, 60_000);
    return () => clearInterval(timer);
  }, []);

  // ─── 路由與視圖切換 ────────────────────────────────────────
  const [view, setView] = useState<'user' | 'admin' | 'member' | 'class-checkin'>('user');
  const [userTab, setUserTab] = useState<'booking' | 'class'>('booking');
  const [urlSessionId, setUrlSessionId] = useState<string | null>(null);

  // 檢查 URL 中的社課點名 session (支援 query string 與 hash)
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

  // ─── 預約與時段 State ───────────────────────────────────────
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [myBookings, setMyBookings] = useState<Booking[]>([]);
  const [myBookingIds, setMyBookingIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('app_my_booking_ids') ?? '[]');
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(false);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [bookingSlot, setBookingSlot] = useState<{ date: string; time: string } | null>(null);
  const [formData, setFormData] = useState({ nickname: '', realName: '', specificTime: '' });
  const [timeError, setTimeError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [morningTraining, setMorningTraining] = useState(false);

  // ─── 加練點名 Modal State ───────────────────────────────────
  const [checkinBookingId, setCheckinBookingId] = useState<string | null>(null);
  const [checkinPassword, setCheckinPassword] = useState('');
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [checkinError, setCheckinError] = useState('');
  const [checkinSuccess, setCheckinSuccess] = useState<string | null>(null);

  // ─── 時間處理工具 ───────────────────────────────────────────
  const sanitizeTime = (timeStr: string): string => {
    let sanitized = timeStr.replace(/\s+/g, '');
    sanitized = sanitized.replace(/：/g, ':').replace(/[～\-]/g, '~');
    sanitized = sanitized.replace(/(^|~)(\d):/g, '$10$2:');
    return sanitized;
  };

  const isSpecificTimeAllowed = (mainTime: string, specificTime: string): boolean => {
    const cleanMain = sanitizeTime(mainTime);
    const [mStart, mEnd] = cleanMain.split('~');
    const [sStart, sEnd] = specificTime.split('~');

    if (!mStart || !mEnd || !sStart || !sEnd) return false;

    const validateHMS = (time: string) => {
      const parts = time.split(':');
      if (parts.length !== 2) return NaN;
      return Number(parts[0]) * 60 + Number(parts[1]);
    };

    const mS = validateHMS(mStart);
    let mE = validateHMS(mEnd);
    const sS = validateHMS(sStart);
    let sE = validateHMS(sEnd);

    if (isNaN(mS) || isNaN(mE) || isNaN(sS) || isNaN(sE)) return false;
    if (mE < mS) mE += 1440;

    let adjustedSS = sS;
    let adjustedSE = sE;
    if (sS < mS && mS > 12 * 60) adjustedSS += 1440;
    if (sE < sS || adjustedSS > adjustedSE) adjustedSE += 1440;

    return adjustedSS >= mS && adjustedSE <= mE;
  };

  const validateDuration = (sanitizedValue: string): boolean => {
    const match = sanitizedValue.match(/^(\d{2}):(\d{2})~(\d{2}):(\d{2})$/);
    if (!match) return false;
    const [, sh, sm, eh, em] = match.map(Number);
    const start = sh * 60 + sm;
    let end = eh * 60 + em;
    if (end < start) end += 24 * 60;
    return end - start >= 120;
  };

  const calculateHours = (timeStr: string, actualTimeStr?: string) => {
    const target = actualTimeStr || timeStr;
    try {
      if (!target) return 0;
      const clean = sanitizeTime(target);
      const match = clean.match(/^(\d{2}):(\d{2})~(\d{2}):(\d{2})$/);
      if (!match) return 0;
      const [, sh, sm, eh, em] = match.map(Number);
      let durationMs = eh * 60 + em - (sh * 60 + sm);
      if (durationMs < 0) durationMs += 24 * 60;
      return durationMs / 60;
    } catch {
      return 0;
    }
  };

  // ─── 管理員 States ──────────────────────────────────────────
  const [isAdminAuth, setIsAdminAuth] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [adminBookings, setAdminBookings] = useState<AdminBooking[]>([]);
  const [adminTab, setAdminTab] = useState<'overview' | 'members' | 'classes' | 'settings'>('overview');
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteMember, setConfirmDeleteMember] = useState(false);
  const [confirmClearAbsent, setConfirmClearAbsent] = useState(false);

  // 管理員設定
  const [memberPins, setMemberPins] = useState<MemberPin[]>([]);
  const [newPinName, setNewPinName] = useState('');
  const [newPinCode, setNewPinCode] = useState('');
  const [pinSubmitting, setPinSubmitting] = useState(false);
  const [checkinPwdDisplay, setCheckinPwdDisplay] = useState('');
  const [newCheckinPwd, setNewCheckinPwd] = useState('');
  const [checkinPwdSubmitting, setCheckinPwdSubmitting] = useState(false);
  const [confirmDeletePin, setConfirmDeletePin] = useState<string | null>(null);

  // 管理員社課場次管理
  const [adminClassSessions, setAdminClassSessions] = useState<ClassSession[]>([]);
  const [newClassName, setNewClassName] = useState('');
  const [newClassDate, setNewClassDate] = useState(getTodayTW());
  const [creatingClass, setCreatingClass] = useState(false);
  const [activeQrSession, setActiveQrSession] = useState<ClassSession | null>(null);
  const [activeAttendeesSession, setActiveAttendeesSession] = useState<ClassSession | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // ─── 社員個人紀錄 States ────────────────────────────────────
  const [memberMode, setMemberMode] = useState<'login' | 'register'>('login');
  const [memberPin, setMemberPin] = useState(() => localStorage.getItem('saved_member_pin') ?? '');
  const [memberPinInput, setMemberPinInput] = useState('');
  const [memberRegisterName, setMemberRegisterName] = useState('');
  const [memberRealName, setMemberRealName] = useState('');
  const [memberRecords, setMemberRecords] = useState<MemberRecord[]>([]);
  const [memberClassRecords, setMemberClassRecords] = useState<MemberClassRecord[]>([]);
  const [memberLoginError, setMemberLoginError] = useState('');
  const [memberLoading, setMemberLoading] = useState(false);

  // ─── 社課點名獨立頁面 States ────────────────────────────────
  const [classSessionData, setClassSessionData] = useState<ClassSession | null>(null);
  const [classCheckinPin, setClassCheckinPin] = useState('');
  const [classCheckinLoading, setClassCheckinLoading] = useState(false);
  const [classCheckinResult, setClassCheckinResult] = useState<{ success: boolean; message: string; realName?: string } | null>(null);
  const [manualSessionIdInput, setManualSessionIdInput] = useState('');

  // ─── 儲存我的預約 ID ────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem('app_my_booking_ids', JSON.stringify(myBookingIds));
  }, [myBookingIds]);

  // ─── 取得預約 ───────────────────────────────────────────────
  const fetchBookings = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/bookings?date=${date}`);
      if (res.ok) setBookings(await res.json());
    } catch (err) {
      console.error('取得預約失敗', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMyBookings = useCallback(async (ids: string[]) => {
    if (ids.length === 0) {
      setMyBookings([]);
      return;
    }
    try {
      const allDates = generateDates().map((d) => d.value);
      const results = await Promise.all(
        allDates.map((d) => fetch(`/api/bookings?date=${d}`).then((r) => r.json()))
      );
      const allBookings: Booking[] = results.flat();
      setMyBookings(allBookings.filter((b) => ids.includes(b.id)));
    } catch (err) {
      console.error('取得我的預約失敗', err);
    }
  }, []);

  useEffect(() => {
    fetchMyBookings(myBookingIds);
  }, [myBookingIds, fetchMyBookings]);

  useEffect(() => {
    if (view === 'user' && userTab === 'booking') {
      fetchBookings(selectedDate);
    }
  }, [selectedDate, view, userTab, fetchBookings]);

  // ─── 管理員 API ────────────────────────────────────────────
  const fetchAdminBookings = useCallback(async (password: string) => {
    try {
      const res = await fetch('/api/admin/bookings', {
        headers: { 'x-admin-password': password },
      });
      if (res.ok) {
        const data = await res.json();
        setAdminBookings(data);
      } else {
        alert('密碼錯誤！');
      }
    } catch (err) {
      console.error('管理員查詢失敗', err);
    }
  }, []);

  const fetchAdminClasses = useCallback(async (password: string) => {
    try {
      const res = await fetch('/api/admin/class-sessions', {
        headers: { 'x-admin-password': password },
      });
      if (res.ok) {
        setAdminClassSessions(await res.json());
      }
    } catch (err) {
      console.error('取得社課場次失敗', err);
    }
  }, []);

  const fetchMemberPins = useCallback(async (pwd: string) => {
    try {
      const res = await fetch('/api/admin/member-pins', {
        headers: { 'x-admin-password': pwd },
      });
      if (res.ok) setMemberPins(await res.json());
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchCheckinPassword = useCallback(async (pwd: string) => {
    try {
      const res = await fetch('/api/admin/checkin-password', {
        headers: { 'x-admin-password': pwd },
      });
      if (res.ok) {
        const data = await res.json();
        setCheckinPwdDisplay(data.checkinPassword);
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    if (isAdminAuth) {
      if (adminTab === 'overview' || adminTab === 'members') {
        fetchAdminBookings(adminPassword);
      } else if (adminTab === 'classes') {
        fetchAdminClasses(adminPassword);
      } else if (adminTab === 'settings') {
        fetchMemberPins(adminPassword);
        fetchCheckinPassword(adminPassword);
      }
    }
  }, [adminTab, isAdminAuth, adminPassword, fetchAdminBookings, fetchAdminClasses, fetchMemberPins, fetchCheckinPassword]);

  // ─── 社員登入與查詢 ─────────────────────────────────────────
  const loginWithPin = useCallback(async (pin: string) => {
    setMemberLoading(true);
    try {
      const [statsRes, classRes] = await Promise.all([
        fetch('/api/member/stats', { headers: { 'x-member-pin': pin } }),
        fetch('/api/member/class-stats', { headers: { 'x-member-pin': pin } })
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setMemberRealName(statsData.realName);
        setMemberRecords(statsData.records);
        setMemberPin(pin);
        localStorage.setItem('saved_member_pin', pin);
      }
      if (classRes.ok) {
        const classData = await classRes.json();
        setMemberClassRecords(classData.records);
      }
    } catch (err) {
      console.error('加載社員紀錄失敗', err);
    } finally {
      setMemberLoading(false);
    }
  }, []);

  // 自動以 localStorage 的 PIN 登入
  useEffect(() => {
    if (memberPin && !memberRealName) {
      loginWithPin(memberPin);
    }
  }, [memberPin, memberRealName, loginWithPin]);

  const handleMemberLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setMemberLoginError('');
    setMemberLoading(true);
    try {
      const res = await fetch('/api/member/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: memberPinInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMemberLoginError(data.error ?? '學號錯誤，請重試');
        return;
      }
      await loginWithPin(memberPinInput.trim());
      setMemberPinInput('');
    } catch (err) {
      setMemberLoginError('網路錯誤，請重試');
    } finally {
      setMemberLoading(false);
    }
  };

  const handleMemberRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setMemberLoginError('');
    setMemberLoading(true);
    try {
      const res = await fetch('/api/member/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ realName: memberRegisterName.trim(), pin: memberPinInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMemberLoginError(data.error ?? '設定失敗，請重試');
        return;
      }
      await loginWithPin(memberPinInput.trim());
      setMemberPinInput('');
      setMemberRegisterName('');
    } catch (err) {
      setMemberLoginError('網路錯誤，請重試');
    } finally {
      setMemberLoading(false);
    }
  };

  const handleMemberLogout = () => {
    setMemberPin('');
    setMemberRealName('');
    setMemberRecords([]);
    setMemberClassRecords([]);
    setMemberPinInput('');
    setMemberRegisterName('');
    setMemberLoginError('');
    setMemberMode('login');
    localStorage.removeItem('saved_member_pin');
  };

  // ─── 加練線上點名 ───────────────────────────────────────────
  const handleCheckin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkinBookingId || !checkinPassword.trim()) return;
    setCheckinLoading(true);
    setCheckinError('');
    try {
      const res = await fetch(`/api/bookings/${checkinBookingId}/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkinPassword: checkinPassword.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCheckinError(data.error ?? '點名失敗');
        return;
      }
      setCheckinSuccess(checkinBookingId);
      setCheckinBookingId(null);
      setCheckinPassword('');
      // 即時重新整理當前畫面預約資料
      fetchBookings(selectedDate);
    } catch (err) {
      setCheckinError('網路錯誤，請重試');
    } finally {
      setCheckinLoading(false);
    }
  };

  // ─── 社課掃碼點名流程 ───────────────────────────────────────
  const loadClassSessionInfo = useCallback(async (sessionId: string) => {
    setClassCheckinLoading(true);
    try {
      const res = await fetch(`/api/class/session/${sessionId}`);
      const data = await res.json();
      if (res.ok) {
        setClassSessionData(data);
      } else {
        setClassCheckinResult({ success: false, message: data.error ?? '無效的社課點名連結' });
      }
    } catch (err) {
      setClassCheckinResult({ success: false, message: '網路連線失敗，請檢查網路' });
    } finally {
      setClassCheckinLoading(false);
    }
  }, []);

  useEffect(() => {
    if (urlSessionId) {
      loadClassSessionInfo(urlSessionId);
    }
  }, [urlSessionId, loadClassSessionInfo]);

  const handleClassCheckinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlSessionId || !classCheckinPin.trim()) return;
    setClassCheckinLoading(true);
    setClassCheckinResult(null);
    try {
      const res = await fetch(`/api/class/session/${urlSessionId}/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: classCheckinPin.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setClassCheckinResult({
          success: true,
          message: data.message,
          realName: data.realName,
        });
        // 若該裝置已登入同個 PIN，同步更新紀錄
        if (memberPin === classCheckinPin.trim()) {
          loginWithPin(memberPin);
        }
      } else {
        setClassCheckinResult({
          success: false,
          message: data.error ?? '點名失敗',
          realName: data.realName,
        });
      }
    } catch (err) {
      setClassCheckinResult({ success: false, message: '網路連線錯誤，請稍後重試' });
    } finally {
      setClassCheckinLoading(false);
    }
  };

  // ─── 管理員操作社課場次 ─────────────────────────────────────
  const handleCreateClassSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassName.trim() || !newClassDate.trim()) return;
    setCreatingClass(true);
    try {
      const res = await fetch('/api/admin/class-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
        body: JSON.stringify({ name: newClassName.trim(), date: newClassDate.trim() }),
      });
      if (res.ok) {
        setNewClassName('');
        await fetchAdminClasses(adminPassword);
      } else {
        alert('建立失敗');
      }
    } catch (err) {
      alert('網路錯誤');
    } finally {
      setCreatingClass(false);
    }
  };

  const handleToggleClassOpen = async (id: string, currentOpen: boolean) => {
    try {
      const res = await fetch(`/api/admin/class-sessions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
        body: JSON.stringify({ isOpen: !currentOpen }),
      });
      if (res.ok) {
        setAdminClassSessions((prev) =>
          prev.map((s) => (s.id === id ? { ...s, isOpen: !currentOpen } : s))
        );
      }
    } catch (err) {
      alert('切換失敗');
    }
  };

  const handleDeleteClassSession = async (id: string) => {
    if (!window.confirm('確定要刪除此社課場次及所有出席名冊？無法復原！')) return;
    try {
      const res = await fetch(`/api/admin/class-sessions/${id}`, {
        method: 'DELETE',
        headers: { 'x-admin-password': adminPassword },
      });
      if (res.ok) {
        setAdminClassSessions((prev) => prev.filter((s) => s.id !== id));
        if (activeQrSession?.id === id) setActiveQrSession(null);
        if (activeAttendeesSession?.id === id) setActiveAttendeesSession(null);
      }
    } catch (err) {
      alert('刪除失敗');
    }
  };

  const handleDeleteAttendee = async (attendeeId: number) => {
    try {
      const res = await fetch(`/api/admin/class-attendance/${attendeeId}`, {
        method: 'DELETE',
        headers: { 'x-admin-password': adminPassword },
      });
      if (res.ok) {
        setAdminClassSessions((prev) =>
          prev.map((s) => ({
            ...s,
            attendees: s.attendees?.filter((a) => a.id !== attendeeId),
          }))
        );
        if (activeAttendeesSession) {
          setActiveAttendeesSession((prev) =>
            prev
              ? {
                  ...prev,
                  attendees: prev.attendees?.filter((a) => a.id !== attendeeId),
                }
              : null
          );
        }
      }
    } catch (err) {
      alert('刪除失敗');
    }
  };

  // ─── 預約與表單處理 ─────────────────────────────────────────
  const handleBookClick = (date: string, time: string) => {
    setMorningTraining(false);
    setBookingSlot({ date, time });
    setShowModal(true);
  };

  const handleMorningTrainingClick = (date: string) => {
    setMorningTraining(true);
    setBookingSlot({ date, time: MORNING_TIME_SLOT });
    setFormData({ nickname: '', realName: '', specificTime: MORNING_SPECIFIC_TIME });
    setTimeError('');
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingSlot || !formData.nickname || !formData.realName) return;

    if (morningTraining) {
      setSubmitting(true);
      try {
        const res = await fetch('/api/bookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: bookingSlot.date,
            time: MORNING_TIME_SLOT,
            nickname: formData.nickname,
            realName: formData.realName,
            specificTime: MORNING_SPECIFIC_TIME,
            isMorningTraining: true,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          alert(data.error ?? '預約失敗，請重試');
          return;
        }
        setMyBookingIds((prev) => [...prev, data.id]);
        await fetchBookings(selectedDate);
        setFormData({ nickname: '', realName: '', specificTime: '' });
        setShowModal(false);
        setBookingSlot(null);
        setMorningTraining(false);
      } catch (err) {
        alert('網路錯誤，請重試');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!formData.specificTime) return;
    const sanitizedTime = sanitizeTime(formData.specificTime);

    if (!validateDuration(sanitizedTime)) {
      setTimeError('加練時間需至少 2 小時，格式請填如：14:00~16:00');
      return;
    }

    if (!isSpecificTimeAllowed(bookingSlot.time, sanitizedTime)) {
      if (isWeekend(bookingSlot.date) && bookingSlot.time === '14:00 - 18:00') {
        setTimeError('週末下午時段僅開放至 18:00，且預約需滿 2 小時。');
      } else {
        setTimeError('您填寫的時間不在選擇的時段範圍內。');
      }
      return;
    }

    setTimeError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: bookingSlot.date,
          time: bookingSlot.time,
          nickname: formData.nickname,
          realName: formData.realName,
          specificTime: sanitizedTime,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? '預約失敗，請重試');
        return;
      }
      setMyBookingIds((prev) => [...prev, data.id]);
      await fetchBookings(selectedDate);
      setFormData({ nickname: '', realName: '', specificTime: '' });
      setTimeError('');
      setShowModal(false);
      setBookingSlot(null);
    } catch (err) {
      alert('網路錯誤，請重試');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (id: string) => {
    setConfirmCancelId(id);
  };

  const confirmCancel = async () => {
    const id = confirmCancelId;
    if (!id) return;
    setConfirmCancelId(null);
    try {
      const res = await fetch(`/api/bookings/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error ?? '取消失敗');
        return;
      }
      const newIds = myBookingIds.filter((myId) => myId !== id);
      setMyBookingIds(newIds);
      await Promise.all([fetchBookings(selectedDate), fetchMyBookings(newIds)]);
    } catch (err) {
      alert('網路錯誤，請重試');
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const pwd = passwordInput;
    try {
      const res = await fetch('/api/admin/bookings', {
        headers: { 'x-admin-password': pwd },
      });
      if (!res.ok) {
        alert('密碼錯誤！');
        return;
      }
      const data = await res.json();
      setAdminBookings(data);
      setIsAdminAuth(true);
      setAdminPassword(pwd);
      setPasswordInput('');
    } catch (err) {
      alert('網路錯誤，請重試');
    }
  };

  const updateAdminBooking = async (id: string, updates: { attendance_status?: string; note?: string; actual_time?: string }) => {
    try {
      const res = await fetch(`/api/admin/bookings/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': adminPassword,
        },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        setAdminBookings((prev) => prev.map((b) => (b.id === id ? { ...b, ...updates } : b)));
      } else {
        alert('更新失敗');
      }
    } catch (err) {
      alert('網路錯誤');
    }
  };

  const deleteAdminBooking = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/bookings/${id}`, {
        method: 'DELETE',
        headers: { 'x-admin-password': adminPassword },
      });
      if (res.ok) {
        const remaining = adminBookings.filter((b) => b.id !== id);
        setAdminBookings(remaining);
        if (selectedMember && remaining.filter((b) => b.realName === selectedMember).length === 0) {
          setSelectedMember(null);
        }
      }
    } catch (err) {
      alert('網路錯誤');
    } finally {
      setConfirmDeleteId(null);
    }
  };

  const deleteAdminMember = async (realName: string) => {
    try {
      const res = await fetch(`/api/admin/members/${encodeURIComponent(realName)}`, {
        method: 'DELETE',
        headers: { 'x-admin-password': adminPassword },
      });
      if (res.ok) {
        setAdminBookings((prev) => prev.filter((b) => b.realName !== realName));
        setSelectedMember(null);
      }
    } catch (err) {
      alert('網路錯誤');
    } finally {
      setConfirmDeleteMember(false);
    }
  };

  const clearAbsentBookings = async () => {
    try {
      const res = await fetch('/api/admin/clear-absent', {
        method: 'DELETE',
        headers: { 'x-admin-password': adminPassword },
      });
      if (res.ok) {
        setAdminBookings((prev) => prev.filter((b) => b.attendance_status !== 'absent'));
        setSelectedMember(null);
      }
    } catch (err) {
      alert('刪除失敗');
    } finally {
      setConfirmClearAbsent(false);
    }
  };

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
        await fetchMemberPins(adminPassword);
      }
    } catch (err) {
      alert('網路錯誤');
    } finally {
      setPinSubmitting(false);
    }
  };

  const handleDeletePin = async (realName: string) => {
    try {
      const res = await fetch(`/api/admin/member-pins/${encodeURIComponent(realName)}`, {
        method: 'DELETE',
        headers: { 'x-admin-password': adminPassword },
      });
      if (res.ok) {
        setMemberPins((prev) => prev.filter((m) => m.realName !== realName));
      }
    } catch (err) {
      alert('網路錯誤');
    } finally {
      setConfirmDeletePin(null);
    }
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
    } catch (err) {
      alert('網路錯誤');
    } finally {
      setCheckinPwdSubmitting(false);
    }
  };

  // ─── QR Code Canvas 元件 ─────────────────────────────────────
  const QrCanvas = ({ url, size = 220 }: { url: string; size?: number }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
      if (canvasRef.current) {
        QRCode.toCanvas(canvasRef.current, url, {
          width: size,
          margin: 2,
          color: {
            dark: '#451a03',
            light: '#ffffff',
          },
        });
      }
    }, [url, size]);
    return <canvas ref={canvasRef} className="rounded-xl shadow-sm mx-auto" />;
  };

  const getCheckinUrl = (sessionId: string) => {
    const origin = window.location.origin;
    const path = window.location.pathname;
    return `${origin}${path}#/class-checkin?session=${sessionId}`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const getSlotBookings = (date: string, time: string) =>
    bookings.filter((b) => b.date === date && b.time === time);

  const today = getTodayTW();

  // ═════════════════════════════════════════════════════════════
  // 視圖 1: 專屬社課點名畫面 (掃描 QR Code 後到達)
  // ═════════════════════════════════════════════════════════════
  if (view === 'class-checkin') {
    return (
      <div className="min-h-screen bg-stone-100/70 text-stone-900 font-sans p-4 md:p-8 flex items-center justify-center">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-stone-200/80 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
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
            <h2 className="text-2xl font-bold tracking-tight">馬術社課現場簽到</h2>
            <p className="text-xs text-amber-200/80 mt-1">馬術社社團課程</p>
          </div>

          <div className="p-6 md:p-8 space-y-6">
            {classCheckinLoading && !classSessionData ? (
              <div className="text-center py-10 space-y-3">
                <div className="w-8 h-8 border-3 border-amber-600 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm text-stone-500">正在載入社課場次資訊…</p>
              </div>
            ) : classCheckinResult?.success ? (
              <div className="text-center py-6 space-y-4 animate-in fade-in">
                <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-stone-800">
                    {classCheckinResult.realName} 同學，點名成功！
                  </h3>
                  <p className="text-sm text-stone-500 mt-1">{classCheckinResult.message}</p>
                </div>
                <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 text-xs text-stone-600 space-y-1">
                  <p className="font-semibold text-stone-800">🐎 今日社課重點提示：</p>
                  <p>1. 請遵循教練指示進行熱身與裝備配戴</p>
                  <p>2. 上課時請保持冷靜與馬匹安全距離</p>
                </div>
                <button
                  onClick={() => {
                    window.location.hash = '';
                    setView('user');
                  }}
                  className="w-full py-3 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 transition-colors shadow-sm"
                >
                  返回系統首頁
                </button>
              </div>
            ) : (
              <>
                {classSessionData ? (
                  <div className="bg-amber-50/80 border border-amber-200/80 rounded-2xl p-4 text-sm space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">今日場次</span>
                      <span
                        className={`inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                          classSessionData.isOpen ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${classSessionData.isOpen ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                        {classSessionData.isOpen ? '點名進行中' : '已截止點名'}
                      </span>
                    </div>
                    <p className="text-lg font-bold text-stone-900">{classSessionData.name}</p>
                    <p className="text-xs text-stone-500">日期：{classSessionData.date}</p>
                  </div>
                ) : (
                  <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-sm text-rose-700">
                    {classCheckinResult?.message || '找不到場次資訊，請確認連結是否正確。'}
                  </div>
                )}

                {classSessionData?.isOpen && (
                  <form onSubmit={handleClassCheckinSubmit} className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-stone-700 mb-1.5">
                        請輸入學號 (PIN 碼) <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <Lock className="w-5 h-5 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          required
                          autoFocus
                          value={classCheckinPin}
                          onChange={(e) => {
                            setClassCheckinPin(e.target.value);
                            setClassCheckinResult(null);
                          }}
                          className="w-full pl-11 pr-4 py-3 rounded-xl border border-stone-200 focus:border-amber-600 focus:ring-2 focus:ring-amber-200 outline-none transition-all font-mono text-base"
                          placeholder="請輸入學號完成簽到"
                        />
                      </div>
                      <p className="text-xs text-stone-400 mt-1.5">
                        * 系統將自動比對您的社員資料並記錄出席
                      </p>
                    </div>

                    {classCheckinResult && !classCheckinResult.success && (
                      <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-700 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                        <div>
                          <p className="font-medium">{classCheckinResult.message}</p>
                        </div>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={classCheckinLoading || !classCheckinPin.trim()}
                      className="w-full py-3.5 bg-gradient-to-r from-amber-700 to-amber-900 text-white rounded-xl font-bold hover:from-amber-800 hover:to-amber-950 transition-all shadow-md shadow-amber-900/20 disabled:opacity-60 text-base"
                    >
                      {classCheckinLoading ? '驗證中…' : '✅ 立即完成點名'}
                    </button>
                  </form>
                )}

                <div className="pt-2 text-center border-t border-stone-100">
                  <button
                    onClick={() => {
                      window.location.hash = '';
                      setView('member');
                    }}
                    className="text-xs text-amber-800 font-medium hover:underline inline-flex items-center gap-1"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    還沒設定過學號？點此前往設定
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ═════════════════════════════════════════════════════════════
  // 視圖 2: 個人紀錄 (加練時數 + 社課出席歷程)
  // ═════════════════════════════════════════════════════════════
  const renderMemberView = () => {
    if (!memberPin || !memberRealName) {
      const isRegister = memberMode === 'register';
      return (
        <div className="w-full max-w-md mx-auto mt-6 bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-stone-200/80 overflow-hidden">
          <div className="flex flex-col items-center mb-6">
            <div className="w-14 h-14 bg-sienna-50 border border-sienna-200/60 rounded-2xl flex items-center justify-center mb-3 shadow-inner">
              <KeyRound className="w-7 h-7 text-sienna-700" />
            </div>
            <h2 className="text-2xl font-bold text-stone-800">個人訓練與社課紀錄</h2>
            <p className="text-xs text-stone-500 mt-1">輸入學號查詢您的加練時數與出席狀況</p>
          </div>

          <div className="flex bg-stone-100/90 rounded-2xl p-1 mb-6 border border-stone-200/50">
            <button
              type="button"
              onClick={() => {
                setMemberMode('login');
                setMemberLoginError('');
              }}
              className={`flex-1 py-2.5 text-xs md:text-sm font-bold rounded-xl transition-all ${
                !isRegister ? 'bg-white text-sienna-800 shadow-sm' : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              登入
            </button>
            <button
              type="button"
              onClick={() => {
                setMemberMode('register');
                setMemberLoginError('');
              }}
              className={`flex-1 py-2.5 text-xs md:text-sm font-bold rounded-xl transition-all ${
                isRegister ? 'bg-white text-sienna-800 shadow-sm' : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              首次設定 (綁定學號)
            </button>
          </div>

          {isRegister ? (
            <form onSubmit={handleMemberRegister} className="space-y-4">
              <div className="bg-amber-50/80 border border-amber-200/80 rounded-2xl p-3.5 text-xs text-amber-900 leading-relaxed">
                📋 請填寫真實本名與學號。日後只需輸入學號即可查詢加練時數與進行社課簽到。
              </div>
              <div>
                <label className="block text-sm font-semibold text-stone-700 mb-1">
                  真實本名 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={memberRegisterName}
                  onChange={(e) => {
                    setMemberRegisterName(e.target.value);
                    setMemberLoginError('');
                  }}
                  className="w-full px-4 py-2.5 rounded-xl border border-stone-200 focus:border-sienna-600 focus:ring-2 focus:ring-sienna-200 outline-none transition-all text-sm"
                  placeholder="例如：王大明"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-stone-700 mb-1">
                  學號 (登入 PIN) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Lock className="w-5 h-5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={memberPinInput}
                    onChange={(e) => {
                      setMemberPinInput(e.target.value);
                      setMemberLoginError('');
                    }}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-stone-200 focus:border-sienna-600 focus:ring-2 focus:ring-sienna-200 outline-none transition-all font-mono text-sm"
                    placeholder="請輸入學號"
                  />
                </div>
              </div>
              {memberLoginError && (
                <p className="text-xs text-rose-500 font-medium">{memberLoginError}</p>
              )}
              <button
                type="submit"
                disabled={memberLoading}
                className="w-full py-3 bg-sienna-600 text-white rounded-xl font-bold hover:bg-sienna-700 transition-colors shadow-sm disabled:opacity-60 text-sm"
              >
                {memberLoading ? '設定中…' : '完成綁定並查看紀錄'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleMemberLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-stone-700 mb-1">學號 (PIN)</label>
                <div className="relative">
                  <Lock className="w-5 h-5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    value={memberPinInput}
                    onChange={(e) => {
                      setMemberPinInput(e.target.value);
                      setMemberLoginError('');
                    }}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-stone-200 focus:border-sienna-600 focus:ring-2 focus:ring-sienna-200 outline-none transition-all font-mono text-sm"
                    placeholder="請輸入學號"
                  />
                </div>
                {memberLoginError && (
                  <p className="text-xs text-rose-500 font-medium mt-1">{memberLoginError}</p>
                )}
              </div>
              <button
                type="submit"
                disabled={memberLoading}
                className="w-full py-3 bg-sienna-600 text-white rounded-xl font-bold hover:bg-sienna-700 transition-colors shadow-sm disabled:opacity-60 text-sm"
              >
                {memberLoading ? '查詢中…' : '登入並查看紀錄'}
              </button>
            </form>
          )}
        </div>
      );
    }

    const totalHours = memberRecords.reduce(
      (sum, r) => sum + calculateHours(r.specificTime, r.actualTime),
      0
    );

    return (
      <div className="w-full max-w-3xl mx-auto space-y-6 animate-in fade-in duration-300">
        {/* Profile Card */}
        <div className="bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-stone-200 flex justify-between items-center">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-sienna-100 text-sienna-700 flex items-center justify-center font-bold text-lg shadow-inner">
              {memberRealName.slice(0, 1)}
            </div>
            <div>
              <p className="font-bold text-stone-800 text-lg md:text-xl flex items-center gap-2">
                {memberRealName}
                <span className="text-xs font-normal text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  已認證社員
                </span>
              </p>
              <p className="text-xs text-stone-500">學號 PIN: {memberPin}</p>
            </div>
          </div>
          <button
            onClick={handleMemberLogout}
            className="text-xs md:text-sm font-medium text-stone-500 hover:text-stone-800 px-3.5 py-2 rounded-xl hover:bg-stone-100 transition-colors border border-stone-200"
          >
            登出
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-3 md:gap-4">
          <div className="bg-white p-4 md:p-5 rounded-3xl shadow-sm border border-stone-200 text-center">
            <p className="text-xs md:text-sm text-stone-500 mb-1 flex items-center justify-center gap-1">
              <Clock className="w-3.5 h-3.5 text-sienna-600" />
              加練總時數
            </p>
            <p className="text-2xl md:text-3xl font-black text-sienna-700">
              {totalHours} <span className="text-xs font-normal text-stone-400">hr</span>
            </p>
          </div>
          <div className="bg-white p-4 md:p-5 rounded-3xl shadow-sm border border-stone-200 text-center">
            <p className="text-xs md:text-sm text-stone-500 mb-1 flex items-center justify-center gap-1">
              <Flame className="w-3.5 h-3.5 text-amber-600" />
              加練次數
            </p>
            <p className="text-2xl md:text-3xl font-black text-stone-800">
              {memberRecords.length} <span className="text-xs font-normal text-stone-400">次</span>
            </p>
          </div>
          <div className="bg-white p-4 md:p-5 rounded-3xl shadow-sm border border-stone-200 text-center">
            <p className="text-xs md:text-sm text-stone-500 mb-1 flex items-center justify-center gap-1">
              <GraduationCap className="w-3.5 h-3.5 text-emerald-600" />
              社課出席
            </p>
            <p className="text-2xl md:text-3xl font-black text-emerald-700">
              {memberClassRecords.length} <span className="text-xs font-normal text-stone-400">堂</span>
            </p>
          </div>
        </div>

        {/* Records Lists */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* 加練紀錄 */}
          <div className="bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-stone-200 space-y-4">
            <h3 className="font-bold text-stone-800 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <ClipboardCheck className="w-5 h-5 text-sienna-600" />
                已點名加練明細
              </span>
              <span className="text-xs font-normal text-stone-400">共 {memberRecords.length} 筆</span>
            </h3>
            {memberRecords.length === 0 ? (
              <div className="text-center py-10 text-stone-400 text-sm">尚無加練出席紀錄</div>
            ) : (
              <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                {memberRecords.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between bg-stone-50/80 rounded-2xl p-3 border border-stone-100"
                  >
                    <div>
                      <p className="font-semibold text-stone-800 text-sm">{r.date}</p>
                      <p className="text-xs text-stone-500">{r.time}</p>
                      {r.actualTime ? (
                        <p className="text-xs text-amber-600 mt-0.5">
                          ✏️ {r.actualTime}{' '}
                          <span className="text-stone-400 line-through">{r.specificTime}</span>
                        </p>
                      ) : (
                        r.specificTime && (
                          <p className="text-xs text-sienna-600 mt-0.5">⏱ {r.specificTime}</p>
                        )
                      )}
                    </div>
                    <div className="text-right bg-white px-3 py-1.5 rounded-xl border border-stone-200/60 shadow-2xs">
                      <p className="text-lg font-bold text-sienna-700 leading-none">
                        {calculateHours(r.specificTime, r.actualTime)}
                      </p>
                      <p className="text-3xs text-stone-400 uppercase mt-0.5">小時</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 社課出席紀錄 */}
          <div className="bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-stone-200 space-y-4">
            <h3 className="font-bold text-stone-800 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-emerald-600" />
                社課簽到明細
              </span>
              <span className="text-xs font-normal text-stone-400">共 {memberClassRecords.length} 堂</span>
            </h3>
            {memberClassRecords.length === 0 ? (
              <div className="text-center py-10 text-stone-400 text-sm">尚無社課簽到紀錄</div>
            ) : (
              <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                {memberClassRecords.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between bg-emerald-50/40 rounded-2xl p-3 border border-emerald-100/80"
                  >
                    <div>
                      <p className="font-semibold text-stone-800 text-sm">{c.sessionName}</p>
                      <p className="text-xs text-stone-500">日期：{c.date}</p>
                    </div>
                    <div className="text-right">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-white border border-emerald-200 px-2.5 py-1 rounded-lg">
                        <Check className="w-3 h-3" />
                        已出席
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ═════════════════════════════════════════════════════════════
  // 視圖 3: 管理員後台
  // ═════════════════════════════════════════════════════════════
  const renderAdminView = () => {
    if (!isAdminAuth) {
      return (
        <div className="w-full max-w-md mx-auto mt-12 bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-stone-200 overflow-hidden">
          <div className="flex flex-col items-center mb-6">
            <div className="w-14 h-14 bg-sienna-50 border border-sienna-200 rounded-2xl flex items-center justify-center mb-3">
              <Shield className="w-7 h-7 text-sienna-700" />
            </div>
            <h2 className="text-2xl font-bold text-stone-800">幹部與管理員後台</h2>
            <p className="text-xs text-stone-500 mt-1">請輸入管理密碼進入系統管理</p>
          </div>
          <form onSubmit={handleAdminLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">管理密碼</label>
              <div className="relative">
                <Lock className="w-5 h-5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-stone-200 focus:border-sienna-500 focus:ring-2 focus:ring-sienna-200 outline-none transition-all text-sm"
                  placeholder="請輸入管理員密碼"
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full py-2.5 bg-sienna-600 text-white rounded-xl font-bold hover:bg-sienna-700 transition-colors shadow-sm"
            >
              進入管理後台
            </button>
          </form>
        </div>
      );
    }

    const byDate = dates.reduce<Record<string, AdminBooking[]>>((acc, d) => {
      acc[d.value] = adminBookings.filter((b) => b.date === d.value);
      return acc;
    }, {});

    return (
      <div className="space-y-6 animate-in fade-in duration-300 w-full min-w-0">
        {/* Admin Navigation Bar */}
        <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center bg-white p-4 md:p-5 rounded-3xl shadow-sm border border-stone-200 gap-3.5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-stone-100/80 p-1.5 rounded-2xl border border-stone-200/50 w-full md:w-auto">
            <button
              onClick={() => setAdminTab('overview')}
              className={`px-3 py-2.5 font-bold rounded-xl text-xs md:text-sm transition-all flex items-center justify-center gap-1.5 ${
                adminTab === 'overview'
                  ? 'bg-white text-sienna-800 shadow-sm'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-white/60'
              }`}
            >
              <Calendar className="w-4 h-4 text-sienna-600" />
              預約總覽
            </button>
            <button
              onClick={() => setAdminTab('members')}
              className={`px-3 py-2.5 font-bold rounded-xl text-xs md:text-sm transition-all flex items-center justify-center gap-1.5 ${
                adminTab === 'members'
                  ? 'bg-white text-sienna-800 shadow-sm'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-white/60'
              }`}
            >
              <User className="w-4 h-4 text-sienna-600" />
              成員名冊
            </button>
            <button
              onClick={() => setAdminTab('classes')}
              className={`px-3 py-2.5 font-bold rounded-xl text-xs md:text-sm transition-all flex items-center justify-center gap-1.5 ${
                adminTab === 'classes'
                  ? 'bg-white text-sienna-800 shadow-sm'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-white/60'
              }`}
            >
              <GraduationCap className="w-4 h-4 text-emerald-600" />
              社課 QR Code
            </button>
            <button
              onClick={() => setAdminTab('settings')}
              className={`px-3 py-2.5 font-bold rounded-xl text-xs md:text-sm transition-all flex items-center justify-center gap-1.5 ${
                adminTab === 'settings'
                  ? 'bg-white text-sienna-800 shadow-sm'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-white/60'
              }`}
            >
              <Settings className="w-4 h-4 text-stone-600" />
              設定與 PIN
            </button>
          </div>

          <div className="flex items-center justify-end gap-2 shrink-0 pt-1 md:pt-0 border-t md:border-t-0 border-stone-100">
            {adminTab === 'overview' && (
              confirmClearAbsent ? (
                <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-200 rounded-xl px-2.5 py-1">
                  <span className="text-xs font-semibold text-rose-700">確定清空？</span>
                  <button
                    onClick={clearAbsentBookings}
                    className="text-xs bg-rose-600 text-white px-2 py-0.5 rounded-lg font-bold"
                  >
                    確定
                  </button>
                  <button
                    onClick={() => setConfirmClearAbsent(false)}
                    className="text-xs text-stone-500 px-1.5 py-0.5"
                  >
                    取消
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmClearAbsent(true)}
                  className="flex items-center gap-1 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 px-3 py-2 rounded-xl border border-rose-200/60 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  清空未加練
                </button>
              )
            )}
            <button
              onClick={() => {
                setIsAdminAuth(false);
                setAdminBookings([]);
                setAdminPassword('');
              }}
              className="text-xs font-medium text-stone-500 hover:text-stone-800 px-3 py-2 rounded-xl hover:bg-stone-100 transition-colors border border-stone-200"
            >
              登出
            </button>
          </div>
        </div>

        {/* Tab 1: 預約總覽 */}
        {adminTab === 'overview' && (
          <div key="overview" className="space-y-6 animate-in fade-in zoom-in-[0.99] duration-150">
            {dates.map((dateObj) => {
              const dateBookings = byDate[dateObj.value] ?? [];
              if (dateBookings.length === 0) return null;
              return (
                <div
                  key={dateObj.value}
                  className="bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-stone-200 overflow-hidden"
                >
                  <h3 className="text-lg font-bold text-sienna-800 mb-4 border-b border-stone-100 pb-2.5 flex items-center justify-between">
                    <span>{dateObj.display}</span>
                    <span className="text-xs font-medium text-stone-400">
                      共 {dateBookings.length} 人預約
                    </span>
                  </h3>
                  <div className="space-y-4">
                    {Array.from(new Set(dateBookings.map((b) => b.time)))
                      .sort()
                      .map((time) => {
                        const slotBookings = dateBookings.filter((b) => b.time === time);
                        const isMorningSlot = time === MORNING_TIME_SLOT;
                        return (
                          <div
                            key={time}
                            className={`rounded-2xl p-4 border ${
                              isMorningSlot
                                ? 'bg-amber-50/60 border-amber-200/80'
                                : 'bg-stone-50/60 border-stone-100'
                            }`}
                          >
                            <div className="flex justify-between items-center mb-3">
                              <h4 className="font-bold text-stone-800 text-sm flex items-center gap-1.5">
                                <Clock
                                  className={`w-4 h-4 ${
                                    isMorningSlot ? 'text-amber-600' : 'text-sienna-600'
                                  }`}
                                />
                                {isMorningSlot ? '🌅 ' : ''}
                                {time}
                              </h4>
                              <span
                                className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                                  isMorningSlot
                                    ? 'text-amber-700 bg-amber-100'
                                    : 'text-sienna-700 bg-sienna-100'
                                }`}
                              >
                                {slotBookings.length} 人
                              </span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                              {slotBookings.map((b, idx) => (
                                <div
                                  key={b.id}
                                  className="flex items-center gap-3 bg-white p-3 rounded-xl border border-stone-200/70 shadow-2xs"
                                >
                                  <span className="w-5 h-5 shrink-0 rounded-full bg-stone-100 text-stone-600 flex items-center justify-center text-xs font-bold">
                                    {idx + 1}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-1">
                                      <p className="font-bold text-stone-800 text-sm truncate">
                                        {b.nickname}
                                      </p>
                                      <span
                                        className={`text-3xs px-1.5 py-0.5 rounded font-bold ${
                                          b.attendance_status === 'attended'
                                            ? 'bg-emerald-100 text-emerald-700'
                                            : b.attendance_status === 'absent'
                                            ? 'bg-rose-100 text-rose-700'
                                            : 'bg-stone-100 text-stone-600'
                                        }`}
                                      >
                                        {b.attendance_status === 'attended'
                                          ? '已點名'
                                          : b.attendance_status === 'absent'
                                          ? '未加練'
                                          : '待確認'}
                                      </span>
                                    </div>
                                    <p className="text-xs text-stone-400 truncate">{b.realName}</p>
                                    {b.specificTime && (
                                      <p className="text-xs text-sienna-600 font-medium truncate mt-0.5">
                                        ⏱ {b.specificTime}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              );
            })}
            {adminBookings.length === 0 && (
              <div className="text-center py-16 bg-white rounded-3xl border border-stone-200">
                <Calendar className="w-12 h-12 text-stone-300 mx-auto mb-2" />
                <p className="text-stone-500 font-medium">目前尚無任何加練預約紀錄</p>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: 成員名冊 */}
        {adminTab === 'members' && (
          <div key="members" className="bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-stone-200 animate-in fade-in zoom-in-[0.99] duration-150">
            {selectedMember ? (
              <div className="space-y-6">
                <div className="flex justify-between items-center border-b border-stone-100 pb-4">
                  <h3 className="text-xl font-bold text-stone-800 flex items-center gap-2">
                    <User className="w-5 h-5 text-sienna-600" />
                    {selectedMember} 的個別加練紀錄
                  </h3>
                  <div className="flex items-center gap-2">
                    {confirmDeleteMember ? (
                      <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-xl px-3 py-1.5">
                        <span className="text-xs font-semibold text-rose-700">全刪除紀錄？</span>
                        <button
                          onClick={() => deleteAdminMember(selectedMember)}
                          className="text-xs bg-rose-600 text-white px-2 py-1 rounded-lg font-bold"
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
                        className="text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-xl border border-rose-200"
                      >
                        刪除全部紀錄
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setSelectedMember(null);
                        setConfirmDeleteMember(false);
                      }}
                      className="text-sienna-700 bg-sienna-50 hover:bg-sienna-100 px-3.5 py-1.5 rounded-xl font-semibold text-sm"
                    >
                      返回名冊
                    </button>
                  </div>
                </div>

                {(() => {
                  const memberRecords = adminBookings
                    .filter((b) => b.realName === selectedMember)
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                  const attended = memberRecords.filter((b) => b.attendance_status === 'attended');
                  const totalHrs = attended.reduce(
                    (sum, b) => sum + calculateHours(b.specificTime, b.actualTime),
                    0
                  );

                  return (
                    <>
                      <div className="grid grid-cols-2 gap-4 bg-stone-50 p-4 rounded-2xl border border-stone-100">
                        <div>
                          <p className="text-xs text-stone-500">出席次數</p>
                          <p className="text-2xl font-bold text-stone-800">{attended.length} 次</p>
                        </div>
                        <div>
                          <p className="text-xs text-stone-500">加練時數</p>
                          <p className="text-2xl font-bold text-sienna-700">{totalHrs} 小時</p>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {memberRecords.map((b) => (
                          <div
                            key={b.id}
                            className="bg-white border border-stone-200 rounded-2xl p-4 shadow-2xs space-y-3"
                          >
                            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                              <div>
                                <p className="font-bold text-stone-800">
                                  {b.date} {b.time}
                                </p>
                                <p className="text-xs text-stone-500">綽號：{b.nickname}</p>
                              </div>
                              <div className="flex bg-stone-100 rounded-xl p-1 shrink-0">
                                {['pending', 'attended', 'absent'].map((st) => (
                                  <button
                                    key={st}
                                    onClick={() => updateAdminBooking(b.id, { attendance_status: st })}
                                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                                      (b.attendance_status || 'pending') === st
                                        ? st === 'attended'
                                          ? 'bg-emerald-500 text-white shadow-2xs'
                                          : st === 'absent'
                                          ? 'bg-rose-500 text-white shadow-2xs'
                                          : 'bg-stone-300 text-stone-800'
                                        : 'text-stone-500 hover:bg-stone-200'
                                    }`}
                                  >
                                    {st === 'attended' ? '已點名' : st === 'absent' ? '未加練' : '待確認'}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <input
                              type="text"
                              placeholder="教練備註..."
                              className="w-full text-xs bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 outline-none focus:border-sienna-400"
                              value={b.note || ''}
                              onChange={(e) => {
                                setAdminBookings((prev) =>
                                  prev.map((item) => (item.id === b.id ? { ...item, note: e.target.value } : item))
                                );
                              }}
                              onBlur={(e) => updateAdminBooking(b.id, { note: e.target.value })}
                            />
                          </div>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative">
                  <User className="w-5 h-5 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="搜尋成員姓名..."
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-stone-200 focus:border-sienna-500 outline-none text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {(Array.from(new Set(adminBookings.map((b) => b.realName))) as string[])
                    .filter((name) => name.includes(memberSearch))
                    .map((m) => (
                      <button
                        key={m}
                        onClick={() => setSelectedMember(m)}
                        className="p-3.5 rounded-2xl border border-stone-200 bg-stone-50/70 hover:bg-sienna-50 hover:border-sienna-300 text-left font-bold text-stone-800 transition-all text-sm truncate flex items-center justify-between"
                      >
                        <span className="truncate">{m}</span>
                        <ChevronRight className="w-4 h-4 text-stone-400 shrink-0" />
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: 社課管理 (QR Code) */}
        {adminTab === 'classes' && (
          <div key="classes" className="space-y-6 animate-in fade-in zoom-in-[0.99] duration-150">
            {/* 建立社課場次表單 */}
            <div className="bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-stone-200">
              <h3 className="font-bold text-stone-800 mb-4 flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-sienna-600" />
                建立新社課場次
              </h3>
              <form onSubmit={handleCreateClassSession} className="grid sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  required
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  placeholder="社課名稱 (例如: 正課理論與上下馬安全)"
                  className="sm:col-span-2 px-4 py-2.5 rounded-xl border border-stone-200 focus:border-sienna-500 outline-none text-sm"
                />
                <div className="flex gap-2">
                  <input
                    type="date"
                    required
                    value={newClassDate}
                    onChange={(e) => setNewClassDate(e.target.value)}
                    className="flex-1 px-3 py-2.5 rounded-xl border border-stone-200 focus:border-sienna-500 outline-none text-sm font-mono"
                  />
                  <button
                    type="submit"
                    disabled={creatingClass}
                    className="px-5 py-2.5 bg-sienna-600 text-white rounded-xl font-bold hover:bg-sienna-700 transition-colors text-sm shrink-0 disabled:opacity-60"
                  >
                    {creatingClass ? '建立中…' : '建立場次'}
                  </button>
                </div>
              </form>
            </div>

            {/* 場次列表 */}
            <div className="space-y-4">
              {adminClassSessions.map((session) => (
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
                        <h4 className="text-lg font-bold text-stone-900">{session.name}</h4>
                      </div>
                      <p className="text-xs text-stone-500 mt-0.5">
                        日期：{session.date} · 已簽到人數：
                        <span className="font-bold text-sienna-700 ml-1">
                          {session.attendees?.length ?? 0} 人
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
                        檢視名冊 ({session.attendees?.length ?? 0})
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

              {adminClassSessions.length === 0 && (
                <div className="text-center py-16 bg-white rounded-3xl border border-stone-200">
                  <GraduationCap className="w-12 h-12 text-stone-300 mx-auto mb-2" />
                  <p className="text-stone-500 font-medium">目前尚無社課場次，請上方表單建立</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 4: 系統設定與 PIN */}
        {adminTab === 'settings' && (
          <div key="settings" className="space-y-6 animate-in fade-in zoom-in-[0.99] duration-150">
            {/* 每日點名密碼 */}
            <div className="bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-stone-200">
              <h3 className="font-bold text-stone-800 mb-4 flex items-center gap-2">
                <ClipboardCheck className="w-5 h-5 text-sienna-600" />
                加練現場點名密碼
              </h3>
              <div className="bg-stone-50 rounded-2xl p-4 mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-stone-500">今日加練點名 5 位數密碼：</p>
                  <p className="text-2xl font-black text-sienna-700 font-mono tracking-widest mt-0.5">
                    {checkinPwdDisplay || '—'}
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
                  className="flex-1 px-4 py-2 rounded-xl border border-stone-200 focus:border-sienna-500 outline-none text-sm font-mono"
                />
                <button
                  type="submit"
                  disabled={checkinPwdSubmitting || !newCheckinPwd.trim()}
                  className="px-5 py-2 bg-sienna-600 text-white rounded-xl font-bold hover:bg-sienna-700 text-sm disabled:opacity-60 shrink-0"
                >
                  更新
                </button>
              </form>
            </div>

            {/* 社員 PIN 管理 */}
            <div className="bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-stone-200 space-y-4">
              <h3 className="font-bold text-stone-800 flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-sienna-600" />
                社員學號 (PIN) 綁定名冊
              </h3>
              <form onSubmit={handleAddPin} className="flex gap-2 flex-wrap">
                <input
                  type="text"
                  value={newPinName}
                  onChange={(e) => setNewPinName(e.target.value)}
                  placeholder="本名"
                  className="flex-1 min-w-28 px-3.5 py-2 rounded-xl border border-stone-200 focus:border-sienna-500 outline-none text-sm"
                />
                <input
                  type="text"
                  value={newPinCode}
                  onChange={(e) => setNewPinCode(e.target.value)}
                  placeholder="學號 (PIN)"
                  className="w-36 px-3.5 py-2 rounded-xl border border-stone-200 focus:border-sienna-500 outline-none text-sm font-mono"
                />
                <button
                  type="submit"
                  disabled={pinSubmitting || !newPinName.trim() || !newPinCode.trim()}
                  className="px-4 py-2 bg-sienna-600 text-white rounded-xl font-bold text-sm hover:bg-sienna-700 disabled:opacity-60 shrink-0"
                >
                  手動新增 / 更新
                </button>
              </form>
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {memberPins.map((m) => (
                  <div
                    key={m.realName}
                    className="flex items-center justify-between bg-stone-50 rounded-xl px-4 py-2.5 border border-stone-100 text-sm"
                  >
                    <span className="font-bold text-stone-800">{m.realName}</span>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs bg-white border border-stone-200 px-2.5 py-1 rounded-md text-sienna-700 font-bold">
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
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Modal: QR Code 投影視窗 */}
        {activeQrSession && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden text-center p-6 space-y-5">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
                  現場掃碼點名
                </span>
                <button
                  onClick={() => setActiveQrSession(null)}
                  className="p-1 rounded-full text-stone-400 hover:bg-stone-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div>
                <h3 className="text-xl font-black text-stone-900">{activeQrSession.name}</h3>
                <p className="text-xs text-stone-500 mt-0.5">日期：{activeQrSession.date}</p>
              </div>

              {/* QR Code Canvas */}
              <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 inline-block">
                <QrCanvas url={getCheckinUrl(activeQrSession.id)} size={220} />
              </div>

              <div className="space-y-2">
                <button
                  onClick={() => copyToClipboard(getCheckinUrl(activeQrSession.id))}
                  className="w-full py-2.5 bg-stone-900 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-stone-800 transition-colors"
                >
                  {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  {copiedLink ? '已複製點名專屬網址！' : '複製點名網址'}
                </button>
                <a
                  href={getCheckinUrl(activeQrSession.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-2 bg-stone-100 text-stone-700 rounded-xl font-semibold text-xs flex items-center justify-center gap-1 hover:bg-stone-200 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  開啟學生端點名頁
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Modal: 檢視出席名冊 */}
        {activeAttendeesSession && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden p-6 space-y-4">
              <div className="flex justify-between items-center border-b border-stone-100 pb-3">
                <div>
                  <h3 className="font-bold text-stone-900 text-lg">
                    {activeAttendeesSession.name} 出席名冊
                  </h3>
                  <p className="text-xs text-stone-500">
                    共 {activeAttendeesSession.attendees?.length ?? 0} 人完成簽到
                  </p>
                </div>
                <button
                  onClick={() => setActiveAttendeesSession(null)}
                  className="p-1 rounded-full text-stone-400 hover:bg-stone-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {(activeAttendeesSession.attendees?.length ?? 0) === 0 ? (
                  <p className="text-center py-8 text-stone-400 text-xs">目前尚無人簽到</p>
                ) : (
                  activeAttendeesSession.attendees?.map((a, idx) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between bg-stone-50 rounded-xl p-3 border border-stone-100 text-sm"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 text-3xs font-bold flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span className="font-bold text-stone-800">{a.realName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-3xs text-stone-400 font-mono">
                          {new Date(a.checkedAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <button
                          onClick={() => handleDeleteAttendee(a.id)}
                          className="text-stone-400 hover:text-rose-500 p-1"
                          title="刪除此簽到"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
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

  // ═════════════════════════════════════════════════════════════
  // 視圖 4: 用戶主頁 (加練預約 & 社課出席)
  // ═════════════════════════════════════════════════════════════
  const renderUserView = () => (
    <div className="space-y-6">
      {/* Tab Switcher: 加練預約 vs 社課出席 */}
      <div className="flex bg-stone-200/70 p-1.5 rounded-2xl max-w-sm mx-auto border border-stone-300/40 shadow-inner">
        <button
          onClick={() => setUserTab('booking')}
          className={`flex-1 py-2.5 text-xs md:text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            userTab === 'booking'
              ? 'bg-white text-sienna-800 shadow-sm'
              : 'text-stone-600 hover:text-stone-900'
          }`}
        >
          <Calendar className="w-4 h-4 text-sienna-600" />
          加練預約
        </button>
        <button
          onClick={() => setUserTab('class')}
          className={`flex-1 py-2.5 text-xs md:text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            userTab === 'class'
              ? 'bg-white text-sienna-800 shadow-sm'
              : 'text-stone-600 hover:text-stone-900'
          }`}
        >
          <GraduationCap className="w-4 h-4 text-emerald-600" />
          社課點名與紀錄
        </button>
      </div>

      {userTab === 'booking' ? (
        <div className="grid md:grid-cols-3 gap-8 animate-in fade-in duration-300 w-full">
          {/* Main Booking Section */}
          <div className="md:col-span-2 space-y-6 min-w-0 w-full">
            {/* 選擇日期 */}
            <div className="bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-stone-200/80 overflow-hidden">
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="w-5 h-5 text-sienna-600" />
                <h2 className="text-xl font-bold text-stone-800">
                  選擇日期 <span className="text-lg ml-1">🐎</span>
                </h2>
              </div>
              <div className="flex overflow-x-auto gap-2.5 pb-2">
                {dates.map((d) => (
                  <button
                    key={d.value}
                    onClick={() => setSelectedDate(d.value)}
                    className={`whitespace-nowrap px-4 py-2.5 rounded-2xl text-sm font-bold transition-all ${
                      selectedDate === d.value
                        ? 'bg-sienna-600 text-white shadow-md shadow-sienna-600/20'
                        : 'bg-stone-100 text-stone-600 hover:bg-stone-200/80'
                    }`}
                  >
                    {d.display}
                  </button>
                ))}
              </div>
            </div>

            {/* 選擇時段 */}
            <div className="bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-stone-200/80 w-full overflow-hidden">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-5 h-5 text-sienna-600" />
                <h2 className="text-xl font-bold text-stone-800">選擇時段</h2>
                {loading && (
                  <span className="ml-auto text-xs text-stone-400 animate-pulse">載入中…</span>
                )}
              </div>

              {/* 週五晨練專區 (功能保留，前台預設隱藏) */}
              {SHOW_MORNING_TRAINING && isFriday(selectedDate) && (
                <div className="mb-4 p-4 md:p-5 bg-gradient-to-r from-amber-50 to-amber-100/50 border-2 border-amber-300 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center gap-3.5 shadow-2xs">
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-amber-900 text-sm md:text-base flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-amber-600" />
                      週五固定晨練時段
                    </p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      06:00 ~ 08:00 · 晨光馬術訓練，免選具體時間快速報名
                    </p>
                  </div>
                  <button
                    onClick={() => handleMorningTrainingClick(selectedDate)}
                    disabled={loading}
                    className="shrink-0 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl shadow-sm transition-colors text-sm disabled:opacity-60"
                  >
                    🏇 報名週五晨練
                  </button>
                </div>
              )}

              {/* 時段卡片 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full">
                {getTimeSlots(selectedDate).map((time) => {
                  const slotBookings = getSlotBookings(selectedDate, time);
                  return (
                    <button
                      key={time}
                      disabled={loading}
                      onClick={() => handleBookClick(selectedDate, time)}
                      className="relative flex flex-col p-4 md:p-5 rounded-2xl border text-left transition-all w-full min-w-0 bg-white border-stone-200/90 hover:border-sienna-500 hover:shadow-md cursor-pointer group"
                    >
                      <span className="text-base sm:text-lg font-bold truncate w-full text-stone-800 group-hover:text-sienna-700 transition-colors">
                        {time}
                      </span>
                      <div className="flex justify-between items-center mt-3 w-full gap-1">
                        <span className="text-xs font-semibold text-sienna-600 bg-sienna-50 px-2.5 py-1 rounded-lg">
                          開放加練中
                        </span>
                        <span className="text-xs text-stone-400">已預約 {slotBookings.length} 人</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Sidebar: 我的加練預約 */}
          <div className="space-y-6 min-w-0 w-full">
            <div className="bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-stone-200/80 overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <User className="w-5 h-5 text-sienna-600" />
                  <h2 className="text-xl font-bold text-stone-800">我的預約</h2>
                </div>
                <span className="text-3xs bg-stone-100 text-stone-500 px-2 py-0.5 rounded-full font-mono">
                  本機保存
                </span>
              </div>

              {myBookings.length === 0 ? (
                <div className="text-center py-8 text-stone-400 flex flex-col items-center">
                  <AlertCircle className="w-8 h-8 mb-2 opacity-40" />
                  <p className="text-sm">目前尚無預約紀錄</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {myBookings.map((booking) => {
                    const isToday = booking.date === today;
                    const alreadyCheckedIn = checkinSuccess === booking.id;
                    return (
                      <div
                        key={booking.id}
                        className="rounded-2xl border border-stone-200/70 bg-stone-50/70 p-3.5 relative overflow-hidden"
                      >
                        {confirmCancelId === booking.id ? (
                          <div className="space-y-2">
                            <p className="text-xs font-bold text-rose-700">確定取消此筆預約？</p>
                            <div className="flex gap-2">
                              <button
                                onClick={confirmCancel}
                                className="flex-1 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 transition-colors"
                              >
                                確定取消
                              </button>
                              <button
                                onClick={() => setConfirmCancelId(null)}
                                className="flex-1 py-1.5 rounded-xl border border-stone-300 text-stone-600 text-xs font-semibold hover:bg-stone-100 transition-colors"
                              >
                                保留
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="pr-7">
                              <p className="font-bold text-stone-800 text-sm">{booking.date}</p>
                              <p className="text-xs text-stone-600 mt-0.5">{booking.time}</p>
                              <p className="text-3xs text-stone-400 mt-1">預約暱稱：{booking.nickname}</p>
                            </div>

                            <button
                              onClick={() => handleCancel(booking.id)}
                              className="absolute top-3 right-3 p-1.5 text-stone-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                              title="取消預約"
                            >
                              <X className="w-4 h-4" />
                            </button>

                            {/* 點名按鈕 (當日限定) */}
                            {isToday && (
                              <div className="mt-3 pt-2.5 border-t border-stone-200/50">
                                {alreadyCheckedIn ? (
                                  <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-100/80 px-2.5 py-1 rounded-lg">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    已完成現場點名
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => {
                                      setCheckinBookingId(booking.id);
                                      setCheckinError('');
                                      setCheckinPassword('');
                                    }}
                                    className="w-full flex items-center justify-center gap-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 py-2 rounded-xl transition-colors shadow-xs"
                                  >
                                    <ClipboardCheck className="w-3.5 h-3.5" />
                                    🏁 現場加練點名
                                  </button>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* 社課點名與紀錄 Tab */
        <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in duration-300">
          <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-stone-200/80 text-center space-y-5">
            <div className="w-16 h-16 bg-emerald-50 border border-emerald-200/80 rounded-3xl flex items-center justify-center mx-auto shadow-inner text-emerald-600">
              <QrCode className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-stone-800">社課現場 QR Code 點名</h3>
              <p className="text-sm text-stone-500 mt-1 max-w-md mx-auto">
                到場參加社課時，請使用手機相機直接掃描教練或幹部展示的 QR Code 完成點名簽到。
              </p>
            </div>

            <div className="grid sm:grid-cols-3 gap-3 text-left">
              <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100 space-y-1">
                <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-800 text-xs font-bold flex items-center justify-center">
                  1
                </span>
                <p className="font-bold text-stone-800 text-sm">手機掃碼</p>
                <p className="text-3xs text-stone-500">掃描現場專屬 QR Code</p>
              </div>
              <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100 space-y-1">
                <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-800 text-xs font-bold flex items-center justify-center">
                  2
                </span>
                <p className="font-bold text-stone-800 text-sm">輸入學號</p>
                <p className="text-3xs text-stone-500">輸入個人學號 (PIN)</p>
              </div>
              <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100 space-y-1">
                <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-800 text-xs font-bold flex items-center justify-center">
                  3
                </span>
                <p className="font-bold text-stone-800 text-sm">完成簽到</p>
                <p className="text-3xs text-stone-500">系統即時記錄出席</p>
              </div>
            </div>

            {/* 手動輸入場次 ID 備案 */}
            <div className="pt-4 border-t border-stone-100 text-left space-y-2">
              <p className="text-xs font-semibold text-stone-600">相機無法掃描？手動輸入場次代碼：</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualSessionIdInput}
                  onChange={(e) => setManualSessionIdInput(e.target.value)}
                  placeholder="輸入場次代碼 (例如: cls_...)"
                  className="flex-1 px-3.5 py-2 rounded-xl border border-stone-200 text-xs outline-none focus:border-emerald-500 font-mono"
                />
                <button
                  onClick={() => {
                    if (manualSessionIdInput.trim()) {
                      window.location.hash = `#/class-checkin?session=${manualSessionIdInput.trim()}`;
                    }
                  }}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-colors shrink-0"
                >
                  前往點名
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ═════════════════════════════════════════════════════════════
  // 全域主視圖排版
  // ═════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-stone-100/60 text-stone-900 font-sans p-4 md:p-8 relative w-full overflow-x-hidden max-w-[100vw]">
      {/* 頂部快捷按鈕列 */}
      <div className="absolute top-4 right-4 md:top-8 md:right-8 flex items-center gap-2 z-10">
        <button
          onClick={() => setView(view === 'member' ? 'user' : 'member')}
          className={`flex items-center gap-1.5 px-3.5 py-2 border text-xs md:text-sm font-bold rounded-xl transition-all shadow-xs ${
            view === 'member'
              ? 'bg-sienna-600 text-white border-sienna-600'
              : 'bg-white border-stone-200/90 text-stone-700 hover:bg-stone-50 hover:text-sienna-600'
          }`}
        >
          <KeyRound className="w-4 h-4" />
          <span>{view === 'member' ? '返回首頁' : '我的紀錄'}</span>
        </button>

        <button
          onClick={() => setView(view === 'admin' ? 'user' : 'admin')}
          className={`flex items-center gap-1.5 px-3.5 py-2 border text-xs md:text-sm font-bold rounded-xl transition-all shadow-xs ${
            view === 'admin'
              ? 'bg-stone-900 text-white border-stone-900'
              : 'bg-white border-stone-200/90 text-stone-700 hover:bg-stone-50'
          }`}
        >
          <Shield className="w-4 h-4" />
          <span>{view === 'admin' ? '返回首頁' : '幹部後台'}</span>
        </button>
      </div>

      <div className="max-w-4xl mx-auto space-y-6 pt-12 md:pt-0 w-full">
        {/* Header */}
        <header className="text-center space-y-2 px-2 md:px-0">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 bg-sienna-50 border border-sienna-200/70 rounded-full text-xs font-bold text-sienna-800 mb-1 shadow-2xs">
            <span>🐎</span> 馬術社訓練預約與社課系統
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-stone-800 tracking-tight">
            {view === 'user'
              ? '馬術社加練與社課系統'
              : view === 'admin'
              ? '管理員幹部後台'
              : '個人訓練與出席歷程'}
          </h1>
          <p className="text-xs md:text-sm text-stone-500">
            {view === 'user'
              ? '免登入即可預約加練時段 · 現場掃描 QR Code 點名'
              : view === 'admin'
              ? '統整管理加練名冊、社課 QR Code 場次與點名密碼'
              : '查看個人總加練時數與社課出席紀錄'}
          </p>
        </header>

        {view === 'user' ? renderUserView() : view === 'admin' ? renderAdminView() : renderMemberView()}
      </div>

      {/* Booking Modal */}
      {view === 'user' && showModal && bookingSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-stone-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-stone-800">
                {morningTraining ? '🌅 報名週五晨練' : '填寫預約資料'}
              </h3>
              <button
                onClick={() => {
                  setShowModal(false);
                  setMorningTraining(false);
                }}
                className="text-stone-400 hover:text-stone-600 p-1 rounded-full hover:bg-stone-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {morningTraining ? (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 text-xs text-amber-900 space-y-1">
                  <p className="font-bold">週五固定晨練</p>
                  <p>{bookingSlot.date}　時段：06:00 ~ 08:00</p>
                  <p className="text-3xs text-amber-700">填寫真實姓名與暱稱即可送出</p>
                </div>
              ) : (
                <div className="bg-sienna-50 border border-sienna-200 rounded-2xl p-3.5 text-xs text-sienna-900 space-y-1">
                  <p className="font-bold">您正在預約：</p>
                  <p className="text-sm font-semibold">
                    {bookingSlot.date} {bookingSlot.time}
                  </p>
                </div>
              )}

              <div className="space-y-1">
                <label className="block text-xs font-bold text-stone-700">
                  綽號 / 稱呼 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.nickname}
                  onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 focus:border-sienna-500 outline-none text-sm"
                  placeholder="顯示在公開時段上的稱呼"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-stone-700">
                  真實本名 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.realName}
                  onChange={(e) => setFormData({ ...formData, realName: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 focus:border-sienna-500 outline-none text-sm"
                  placeholder="僅管理員與教練可見，時數統計用"
                />
              </div>

              {!morningTraining && (
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-stone-700">
                    具體加練時間 <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.specificTime}
                    onChange={(e) => {
                      setFormData({ ...formData, specificTime: e.target.value });
                      setTimeError('');
                    }}
                    className={`w-full px-3.5 py-2.5 rounded-xl border outline-none text-sm ${
                      timeError ? 'border-rose-400 bg-rose-50/50' : 'border-stone-200 focus:border-sienna-500'
                    }`}
                    placeholder="例如：14:00~16:00 (需滿2小時)"
                  />
                  {timeError && <p className="text-xs text-rose-500 mt-1">{timeError}</p>}
                </div>
              )}

              <div className="pt-3 flex gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setMorningTraining(false);
                  }}
                  className="flex-1 py-2.5 rounded-xl border border-stone-200 text-stone-600 font-bold text-sm hover:bg-stone-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-xl bg-sienna-600 text-white font-bold text-sm hover:bg-sienna-700 transition-colors shadow-sm disabled:opacity-60"
                >
                  {submitting ? '送出預約中…' : morningTraining ? '確認晨練報名 🏇' : '確認預約上馬 🏇'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 加練現場點名密碼 Modal */}
      {checkinBookingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-sm overflow-hidden p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-stone-100 pb-3">
              <h3 className="font-bold text-stone-900 text-base flex items-center gap-1.5">
                <ClipboardCheck className="w-5 h-5 text-emerald-600" />
                現場加練點名簽到
              </h3>
              <button
                onClick={() => {
                  setCheckinBookingId(null);
                  setCheckinPassword('');
                  setCheckinError('');
                }}
                className="p-1 rounded-full text-stone-400 hover:bg-stone-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCheckin} className="space-y-4">
              <p className="text-xs text-stone-500">請向現場教練或幹部索取今日 5 位數點名密碼</p>
              <div>
                <input
                  type="text"
                  required
                  autoFocus
                  value={checkinPassword}
                  onChange={(e) => {
                    setCheckinPassword(e.target.value);
                    setCheckinError('');
                  }}
                  className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:border-emerald-500 outline-none text-center font-mono tracking-widest text-xl font-bold"
                  placeholder="5 位密碼"
                />
                {checkinError && <p className="text-xs text-rose-500 mt-1">{checkinError}</p>}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCheckinBookingId(null)}
                  className="flex-1 py-2.5 rounded-xl border border-stone-200 text-stone-600 font-bold text-xs"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={checkinLoading || !checkinPassword}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 disabled:opacity-60"
                >
                  {checkinLoading ? '驗證中…' : '確認點名'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
