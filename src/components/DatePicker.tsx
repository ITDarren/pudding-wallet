import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  children?: ReactNode;
}

const toISODate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseISODate = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

const getDateParts = (date: Date) => ({
  year: String(date.getFullYear()),
  month: String(date.getMonth() + 1).padStart(2, "0"),
  day: String(date.getDate()).padStart(2, "0"),
});

const dateFromParts = (parts: { year: string; month: string; day: string }) => {
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  if (!Number.isInteger(year) || year < 1 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1 || day > 31) return null;
  const lastDay = new Date(year, month, 0).getDate();
  return new Date(year, month - 1, Math.min(day, lastDay));
};

export default function DatePicker({ value, onChange, className, children }: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const date = parseISODate(value);
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const [draftParts, setDraftParts] = useState(() => getDateParts(parseISODate(value)));
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const suppressDateClick = useRef(false);
  const draftDate = dateFromParts(draftParts);
  const today = new Date();
  const firstDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1).getDay();
  const daysInMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate();
  const daysInPreviousMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 0).getDate();
  const calendarDays = Array.from({ length: 42 }, (_, index) => {
    const dayNumber = index - firstDay + 1;
    if (dayNumber < 1) {
      return { date: new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, daysInPreviousMonth + dayNumber), inMonth: false };
    }
    if (dayNumber > daysInMonth) {
      return { date: new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, dayNumber - daysInMonth), inMonth: false };
    }
    return { date: new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), dayNumber), inMonth: true };
  });

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen]);

  const navigateToMonth = (nextMonth: Date) => {
    const nextParts = {
      ...draftParts,
      year: String(nextMonth.getFullYear()),
      month: String(nextMonth.getMonth() + 1).padStart(2, "0"),
    };
    const lastDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
    nextParts.day = String(Math.min(Number(draftParts.day) || 1, lastDay)).padStart(2, "0");
    setDraftParts(nextParts);
    setVisibleMonth(nextMonth);
  };

  const changeMonth = (offset: number) => {
    navigateToMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + offset, 1));
  };

  const updatePart = (part: "year" | "month" | "day", rawValue: string) => {
    const maxLength = part === "year" ? 4 : 2;
    if (!/^\d*$/.test(rawValue) || rawValue.length > maxLength) return;
    const nextParts = { ...draftParts, [part]: rawValue };
    setDraftParts(nextParts);

    const year = Number(nextParts.year);
    const month = Number(nextParts.month);
    if (nextParts.year.length === 4 && year > 0 && year <= 9999 && month >= 1 && month <= 12) {
      setVisibleMonth(new Date(year, month - 1, 1));
    }
    const nextDate = dateFromParts(nextParts);
    if (nextParts.year.length === 4 && nextDate) onChange(toISODate(nextDate));
  };

  const chooseDate = (date: Date) => {
    setDraftParts(getDateParts(date));
    onChange(toISODate(date));
    setIsOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          const date = parseISODate(value);
          setDraftParts(getDateParts(date));
          setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
          setIsOpen(true);
        }}
        className={className || "flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-100"}
        aria-haspopup="dialog"
        aria-label={`選擇日期，目前為 ${value}`}
      >
        {children || <><Calendar size={15} className="shrink-0 text-app-primary" /><span>{value}</span></>}
      </button>
      {isOpen && createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="選擇日期"
            className="w-full max-w-[340px] rounded-3xl border border-slate-100 bg-white p-5 shadow-2xl shadow-slate-900/20"
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">選擇日期</p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                aria-label="關閉日曆"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mb-3 flex items-center gap-1.5">
              <label className="flex items-center gap-0.5 rounded-xl bg-slate-50 px-2 py-2 text-xs font-bold text-slate-500">
                <input
                  type="text"
                  inputMode="numeric"
                  aria-label="年份"
                  value={draftParts.year}
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) => updatePart("year", event.target.value)}
                  className="w-[4.5ch] bg-transparent text-center text-sm font-bold text-slate-700 outline-none"
                />
                年
              </label>
              <label className="flex items-center gap-0.5 rounded-xl bg-slate-50 px-2 py-2 text-xs font-bold text-slate-500">
                <input
                  type="text"
                  inputMode="numeric"
                  aria-label="月份"
                  value={draftParts.month}
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) => updatePart("month", event.target.value)}
                  className="w-[2.5ch] bg-transparent text-center text-sm font-bold text-slate-700 outline-none"
                />
                月
              </label>
              <label className="flex items-center gap-0.5 rounded-xl bg-slate-50 px-2 py-2 text-xs font-bold text-slate-500">
                <input
                  type="text"
                  inputMode="numeric"
                  aria-label="日期"
                  value={draftParts.day}
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) => updatePart("day", event.target.value)}
                  className="w-[2.5ch] bg-transparent text-center text-sm font-bold text-slate-700 outline-none"
                />
                日
              </label>
              <button
                type="button"
                onClick={() => changeMonth(-1)}
                className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100"
                aria-label="上一個月"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                onClick={() => changeMonth(1)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100"
                aria-label="下一個月"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            <div className="mb-1 grid grid-cols-7 text-center text-[10px] font-bold text-slate-400">
              {['日', '一', '二', '三', '四', '五', '六'].map(day => <span key={day}>{day}</span>)}
            </div>

            <div
              className="touch-pan-y grid grid-cols-7 gap-y-1 text-center"
              onTouchStart={(event) => {
                const touch = event.touches[0];
                touchStart.current = { x: touch.clientX, y: touch.clientY };
              }}
              onTouchEnd={(event) => {
                if (!touchStart.current) return;
                const touch = event.changedTouches[0];
                const deltaX = touch.clientX - touchStart.current.x;
                const deltaY = touch.clientY - touchStart.current.y;
                touchStart.current = null;

                if (Math.abs(deltaX) < 50 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.2) return;
                event.preventDefault();
                suppressDateClick.current = true;
                window.setTimeout(() => { suppressDateClick.current = false; }, 500);
                changeMonth(deltaX < 0 ? 1 : -1);
              }}
              onTouchCancel={() => { touchStart.current = null; }}
              onClickCapture={(event) => {
                if (!suppressDateClick.current) return;
                suppressDateClick.current = false;
                event.preventDefault();
                event.stopPropagation();
              }}
            >
              {calendarDays.map(({ date, inMonth }, index) => {
                const isoDate = toISODate(date);
                const isSelected = draftDate !== null && isoDate === toISODate(draftDate);
                const isToday = isoDate === toISODate(today);
                return (
                  <button
                    key={`${isoDate}-${index}`}
                    type="button"
                    onClick={() => chooseDate(date)}
                    aria-label={isoDate}
                    aria-pressed={isSelected}
                    className={`mx-auto flex h-10 w-10 items-center justify-center rounded-xl text-sm font-semibold transition-colors ${isSelected
                      ? "bg-app-primary text-app-accent shadow-sm"
                      : isToday
                        ? "border border-app-primary text-slate-800"
                        : inMonth
                          ? "text-slate-600 hover:bg-slate-100"
                          : "text-slate-300 hover:bg-slate-50"
                      }`}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-center gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => chooseDate(today)}
                className="rounded-xl bg-app-primary/15 px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-app-primary/25"
              >
                今天
              </button>
              <button
                type="button"
                onClick={() => chooseDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1))}
                className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-100"
              >
                昨日
              </button>
              <button
                type="button"
                onClick={() => navigateToMonth(new Date(today.getFullYear(), today.getMonth(), 1))}
                className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-100"
              >
                本月
              </button>
            </div>
          </section>
        </div>,
        document.body
      )}
    </>
  );
}