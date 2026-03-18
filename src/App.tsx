import React, { useState, useEffect, useCallback } from 'react';
import { Calendar, Clock, User, X, CheckCircle2, AlertCircle, Shield, Lock } from 'lucide-react';

type Booking = {
  id: string;
  date: string;
  time: string;
  nickname: string;
};

type AdminBooking = Booking & { realName: string; specificTime: string };

const TIME_SLOTS = [
  '09:00 - 12:00',
  '14:00 - 16:00',
  '16:00 - 19:00',
];

const MAX_CAPACITY = 4;

const generateDates = () => {
  const dates = [];
  // 用 UTC+8 計算今天，確保與後端一致
  const now = new Date();
  const twNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const todayStr = twNow.toISOString().split('T')[0]; // YYYY-MM-DD (UTC+8)
  for (let i = 0; i < 4; i++) {
    const base = new Date(`${todayStr}T00:00:00Z`);
    const d = new Date(base.getTime() + i * 86400000);
    const dateString = d.toISOString().split('T')[0];
    const displayString = `${d.getUTCMonth() + 1}/${d.getUTCDate()} (${['日', '一', '二', '三', '四', '五', '六'][d.getUTCDay()]})`;
    dates.push({ value: dateString, display: displayString });
  }
  return dates;
};

export default function App() {
  const [dates, setDates] = useState(generateDates());
  const [selectedDate, setSelectedDate] = useState(() => generateDates()[0].value);

  // ─── 跨日偵測：每 60 秒檢查，若 today 變了就更新日期清單 ──
  useEffect(() => {
    const check = () => {
      const newDates = generateDates();
      setDates((prev) => {
        if (prev[0].value !== newDates[0].value) {
          // 跨日了，重置選中日期到新的今天
          setSelectedDate(newDates[0].value);
          return newDates;
        }
        return prev;
      });
    };
    const timer = setInterval(check, 60_000);
    return () => clearInterval(timer);
  }, []);
  const [bookings, setBookings] = useState<Booking[]>([]);
  // 所有日期我的預約（用於側欄跨日期顯示）
  const [myBookings, setMyBookings] = useState<Booking[]>([]);
  const [myBookingIds, setMyBookingIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('app_my_booking_ids') ?? '[]');
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(false);
  // inline 取消確認
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [bookingSlot, setBookingSlot] = useState<{ date: string; time: string } | null>(null);
  const [formData, setFormData] = useState({ nickname: '', realName: '', specificTime: '' });
  const [timeError, setTimeError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 驗證時長是否 ≥ 2 小時
  const validateDuration = (value: string): boolean => {
    // 支援格式：14:00-16:00, 14:00~16:00, 14:00～16:00 (可含空白)
    const match = value.match(/^(\d{1,2}):(\d{2})\s*[-~～]\s*(\d{1,2}):(\d{2})$/);
    if (!match) return false;
    const [, sh, sm, eh, em] = match.map(Number);
    const start = sh * 60 + sm;
    let end = eh * 60 + em;
    
    // 跨夜處理（如 23:00~01:00）
    if (end < start) end += 24 * 60;
    
    return end - start >= 120;
  };

  // Admin states
  const [view, setView] = useState<'user' | 'admin'>('user');
  const [isAdminAuth, setIsAdminAuth] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [adminBookings, setAdminBookings] = useState<AdminBooking[]>([]);

  // ─── 儲存「我的預約 id」到 localStorage ─────────────────────
  useEffect(() => {
    localStorage.setItem('app_my_booking_ids', JSON.stringify(myBookingIds));
  }, [myBookingIds]);


  // ─── 取得選定日期的預約（時段顯示用）───────────────────────
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

  // ─── 取得「我的預約」橫跨所有日期 ─────────────────────────
  const fetchMyBookings = useCallback(async (ids: string[]) => {
    if (ids.length === 0) { setMyBookings([]); return; }
    // 查所有開放日期的預約，過濾出自己的 id
    try {
      const allDates = generateDates().map(d => d.value);
      const results = await Promise.all(
        allDates.map(d => fetch(`/api/bookings?date=${d}`).then(r => r.json()))
      );
      const allBookings: Booking[] = results.flat();
      setMyBookings(allBookings.filter(b => ids.includes(b.id)));
    } catch (err) {
      console.error('取得我的預約失敗', err);
    }
  }, []);

  // 當 myBookingIds 變動時重新拉側欄
  useEffect(() => {
    fetchMyBookings(myBookingIds);
  }, [myBookingIds, fetchMyBookings]);

  useEffect(() => {
    if (view === 'user') {
      fetchBookings(selectedDate);
    }
  }, [selectedDate, view, fetchBookings]);

  // ─── 取得管理員視圖所有預約 ──────────────────────────────────
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

  // ─── 事件處理 ────────────────────────────────────────────────

  const handleBookClick = (date: string, time: string) => {
    setBookingSlot({ date, time });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingSlot || !formData.nickname || !formData.realName || !formData.specificTime) return;

    // 時長驗證
    if (!validateDuration(formData.specificTime)) {
      setTimeError('加練時間需至少 2 小時，格式請填如：14:00~16:00');
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
          specificTime: formData.specificTime,
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
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (id: string) => {
    // 使用 inline 確認，避免 window.confirm 被瀏覽器攔截
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
      // 同步刷新時段名額與側欄
      await Promise.all([fetchBookings(selectedDate), fetchMyBookings(newIds)]);
    } catch (err) {
      alert('網路錯誤，請重試');
      console.error(err);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const pwd = passwordInput;
    // 先嘗試用這組密碼向後端驗證
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
      setPasswordInput('');
    } catch (err) {
      alert('網路錯誤，請重試');
      console.error(err);
    }
  };

  // ─── 計算工具 ────────────────────────────────────────────────

  const getSlotBookings = (date: string, time: string) =>
    bookings.filter((b) => b.date === date && b.time === time);

  // ─── Admin 視圖 ──────────────────────────────────────────────

  const renderAdminView = () => {
    if (!isAdminAuth) {
      return (
        <div className="w-full max-w-md mx-auto mt-12 bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-stone-200 overflow-hidden">
          <div className="flex flex-col items-center mb-6">
            <Shield className="w-12 h-12 text-emerald-600 mb-4" />
            <h2 className="text-2xl font-bold text-stone-800">管理員登入</h2>
            <p className="text-sm text-stone-500 mt-2">請輸入密碼以檢視預約總覽</p>
          </div>
          <form onSubmit={handleAdminLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">密碼</label>
              <div className="relative">
                <Lock className="w-5 h-5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-stone-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                  placeholder="請輸入管理員密碼"
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full py-2.5 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors shadow-sm shadow-emerald-200"
            >
              登入
            </button>
          </form>
        </div>
      );
    }

    // 依日期分組
    const byDate = dates.reduce<Record<string, AdminBooking[]>>((acc, d) => {
      acc[d.value] = adminBookings.filter((b) => b.date === d.value);
      return acc;
    }, {});

    return (
      <div className="space-y-6 animate-in fade-in duration-300 w-full min-w-0">
        <div className="flex justify-between items-center bg-white p-5 md:p-6 rounded-2xl shadow-sm border border-stone-200 overflow-hidden">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-emerald-600" />
            <h2 className="text-2xl font-bold text-stone-800">預約總覽</h2>
          </div>
          <button
            onClick={() => {
              setIsAdminAuth(false);
              setAdminBookings([]);
            }}
            className="text-sm font-medium text-stone-500 hover:text-stone-800 px-4 py-2 rounded-lg hover:bg-stone-100 transition-colors"
          >
            登出
          </button>
        </div>

        <div className="space-y-6">
          {dates.map((dateObj) => {
            const dateBookings = byDate[dateObj.value] ?? [];
            if (dateBookings.length === 0) return null;

            return (
              <div key={dateObj.value} className="bg-white p-5 md:p-6 rounded-2xl shadow-sm border border-stone-200 overflow-hidden">
                <h3 className="text-xl font-bold text-emerald-700 mb-4 border-b border-stone-100 pb-3">
                  {dateObj.display}
                </h3>
                <div className="space-y-4">
                  {TIME_SLOTS.map((time) => {
                    const slotBookings = dateBookings.filter((b) => b.time === time);
                    if (slotBookings.length === 0) return null;

                    return (
                      <div key={time} className="bg-stone-50 rounded-xl p-4 border border-stone-100">
                        <div className="flex justify-between items-center mb-3">
                          <h4 className="font-semibold text-stone-800 flex items-center gap-2">
                            <Clock className="w-4 h-4 text-emerald-600" />
                            {time}
                          </h4>
                          <span className="text-sm font-medium text-emerald-600 bg-emerald-100 px-2 py-1 rounded-md">
                            共 {slotBookings.length} 人
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                          {slotBookings.map((b, idx) => (
                            <div key={b.id} className="flex items-center gap-3 bg-white p-3 rounded-lg border border-stone-200 shadow-sm">
                              <span className="w-6 h-6 shrink-0 rounded-full bg-stone-100 text-stone-600 flex items-center justify-center text-xs font-bold">
                                {idx + 1}
                              </span>
                              <div className="min-w-0">
                                <p className="font-medium text-stone-800 truncate">{b.nickname}</p>
                                <p className="text-xs text-stone-500 truncate">{b.realName}</p>
                                {b.specificTime && (
                                  <p className="text-xs text-emerald-600 truncate mt-0.5">⏱ {b.specificTime}</p>
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
            <div className="text-center py-16 text-stone-500 bg-white rounded-2xl border border-stone-200 shadow-sm">
              <Calendar className="w-12 h-12 mx-auto mb-3 text-stone-300" />
              <p className="text-lg font-medium text-stone-600">目前沒有任何預約紀錄</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ─── User 視圖 ───────────────────────────────────────────────

  const renderUserView = () => (
    <div className="grid md:grid-cols-3 gap-8 animate-in fade-in duration-300 w-full">
      {/* Main Booking Section */}
      <div className="md:col-span-2 space-y-6 min-w-0 w-full">
        <div className="bg-white p-5 md:p-6 rounded-2xl shadow-sm border border-stone-200 overflow-hidden">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-5 h-5 text-emerald-600" />
            <h2 className="text-xl font-semibold">選擇日期</h2>
          </div>
          <div className="flex overflow-x-auto gap-2 pb-2">
            {dates.map((d) => (
              <button
                key={d.value}
                onClick={() => setSelectedDate(d.value)}
                className={`whitespace-nowrap px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  selectedDate === d.value
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                {d.display}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white p-5 md:p-6 rounded-2xl shadow-sm border border-stone-200 w-full overflow-hidden">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-emerald-600" />
            <h2 className="text-xl font-semibold">選擇時段</h2>
            {loading && (
              <span className="ml-auto text-xs text-stone-400 animate-pulse">載入中…</span>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
            {TIME_SLOTS.map((time) => {
              const slotBookings = getSlotBookings(selectedDate, time);
              const isFull = slotBookings.length >= MAX_CAPACITY;
              const availableCount = MAX_CAPACITY - slotBookings.length;

              return (
                <button
                  key={time}
                  disabled={isFull || loading}
                  onClick={() => handleBookClick(selectedDate, time)}
                  className={`relative flex flex-col p-3 sm:p-4 rounded-xl border text-left transition-all w-full min-w-0 overflow-hidden ${
                    isFull
                      ? 'bg-stone-100 border-stone-200 opacity-60 cursor-not-allowed'
                      : 'bg-white border-emerald-200 hover:border-emerald-500 hover:shadow-md cursor-pointer'
                  }`}
                >
                  <span className={`text-base sm:text-lg font-semibold truncate w-full ${isFull ? 'text-stone-500' : 'text-stone-800'}`}>
                    {time}
                  </span>
                  <div className="flex justify-between items-center mt-1 sm:mt-2 w-full gap-1">
                    <span className={`text-xs sm:text-sm truncate ${isFull ? 'text-rose-500 font-medium' : 'text-emerald-600'}`}>
                      {isFull ? '已額滿' : `剩餘 ${availableCount} 個名額`}
                    </span>
                    <span className="text-[10px] sm:text-xs text-stone-400 shrink-0">
                      {slotBookings.length} / {MAX_CAPACITY}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Sidebar: My Bookings */}
      <div className="space-y-6 min-w-0 w-full">
        <div className="bg-white p-5 md:p-6 rounded-2xl shadow-sm border border-stone-200 overflow-hidden">
          <div className="flex items-center gap-2 mb-4">
            <User className="w-5 h-5 text-emerald-600" />
            <h2 className="text-xl font-semibold">我的預約</h2>
          </div>

          {myBookings.length === 0 ? (
            <div className="text-center py-8 text-stone-400 flex flex-col items-center">
              <AlertCircle className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm">目前沒有預約紀錄</p>
            </div>
          ) : (
            <div className="space-y-3">
              {myBookings.map((booking) => (
                <div key={booking.id} className="rounded-xl border border-stone-100 bg-stone-50 overflow-hidden">
                  {confirmCancelId === booking.id ? (
                    <div className="p-3">
                      <p className="text-sm font-medium text-stone-700 mb-2">確定取消此預約？</p>
                      <div className="flex gap-2">
                        <button
                          onClick={confirmCancel}
                          className="flex-1 py-1.5 rounded-lg bg-rose-500 text-white text-sm font-medium hover:bg-rose-600 transition-colors"
                        >
                          確定取消
                        </button>
                        <button
                          onClick={() => setConfirmCancelId(null)}
                          className="flex-1 py-1.5 rounded-lg border border-stone-200 text-stone-600 text-sm hover:bg-stone-100 transition-colors"
                        >
                          保留
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 relative group">
                      <div className="pr-8">
                        <p className="font-medium text-stone-800">{booking.date}</p>
                        <p className="text-sm text-stone-600">{booking.time}</p>
                        <p className="text-xs text-stone-500 mt-1">{booking.nickname}</p>
                      </div>
                      <button
                        id={`cancel-btn-${booking.id}`}
                        onClick={() => handleCancel(booking.id)}
                        className="absolute top-3 right-3 p-1.5 text-stone-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                        title="取消預約"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // ─── 主渲染 ──────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-sans p-4 md:p-8 relative w-full overflow-x-hidden max-w-[100vw]">
      {/* View Toggle Button */}
      <button
        onClick={() => setView(view === 'user' ? 'admin' : 'user')}
        className="absolute top-4 right-4 md:top-8 md:right-8 flex items-center gap-2 px-4 py-2 bg-white border border-stone-200 text-stone-700 rounded-xl text-sm font-medium hover:bg-stone-50 hover:text-emerald-600 transition-colors shadow-sm z-10"
      >
        {view === 'user' ? (
          <>
            <Shield className="w-4 h-4" />
            <span>管理員</span>
          </>
        ) : (
          <>
            <User className="w-4 h-4" />
            <span>返回預約</span>
          </>
        )}
      </button>

      <div className="max-w-4xl mx-auto space-y-8 pt-12 md:pt-0 w-full">
        <header className="text-center space-y-2 px-2 md:px-0">
          <h1 className="text-3xl md:text-4xl font-bold text-stone-800 tracking-tight">
            {view === 'user' ? '線上預約系統' : '管理員後台'}
          </h1>
          <p className="text-stone-500">
            {view === 'user' ? '免登入即可預約，開放今日起四天內之時段' : '檢視與管理所有預約紀錄'}
          </p>
        </header>

        {view === 'user' ? renderUserView() : renderAdminView()}
      </div>

      {/* Booking Modal */}
      {view === 'user' && showModal && bookingSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-stone-100 flex justify-between items-center">
              <h3 className="text-xl font-semibold text-stone-800">填寫預約資料</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-stone-400 hover:text-stone-600 p-1 rounded-full hover:bg-stone-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="bg-emerald-50 text-emerald-800 p-3 rounded-lg text-sm flex items-start gap-2 mb-6">
                <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
                <div>
                  <p className="font-medium">您正在預約：</p>
                  <p>
                    {bookingSlot.date} {bookingSlot.time}
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="nickname" className="block text-sm font-medium text-stone-700">
                  綽號 <span className="text-rose-500">*</span>
                </label>
                <input
                  id="nickname"
                  type="text"
                  required
                  value={formData.nickname}
                  onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-stone-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                  placeholder="請輸入綽號"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="realName" className="block text-sm font-medium text-stone-700">
                  本名 <span className="text-rose-500">*</span>
                </label>
                <input
                  id="realName"
                  type="text"
                  required
                  value={formData.realName}
                  onChange={(e) => setFormData({ ...formData, realName: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-stone-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                  placeholder="請輸入真實姓名"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="specificTime" className="block text-sm font-medium text-stone-700">
                  具體預約時間 <span className="text-rose-500">*</span>
                </label>
                <input
                  id="specificTime"
                  type="text"
                  required
                  value={formData.specificTime}
                  onChange={(e) => {
                    setFormData({ ...formData, specificTime: e.target.value });
                    setTimeError('');
                  }}
                  className={`w-full px-4 py-2 rounded-xl border focus:ring-2 outline-none transition-all ${
                    timeError
                      ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200'
                      : 'border-stone-200 focus:border-emerald-500 focus:ring-emerald-200'
                  }`}
                  placeholder="例如：14:00~16:00"
                />
                {timeError && (
                  <p className="text-xs text-rose-500 mt-1">{timeError}</p>
                )}
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-stone-200 text-stone-600 font-medium hover:bg-stone-50 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700 shadow-sm shadow-emerald-200 transition-colors disabled:opacity-60"
                >
                  {submitting ? '預約中…' : '確認預約'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
