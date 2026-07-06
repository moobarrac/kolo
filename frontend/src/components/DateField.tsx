import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { formatDate, todayIso } from "@/lib/dates";

// A self-contained calendar datepicker that matches the app's look (no native
// picker inconsistency) and shows the weekday in the field. Drops into the same
// `<div><label/>…</div>` wrappers the forms already use.
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const pad = (n: number) => n.toString().padStart(2, "0");
const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

export function DateField({
  value,
  onChange,
  placeholder = "Pick a date",
  clearable = false,
}: {
  value: string; // ISO YYYY-MM-DD, or "" when empty
  onChange: (iso: string) => void;
  placeholder?: string;
  clearable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const base = value || todayIso();
  const [vy, setVy] = useState(() => Number(base.slice(0, 4)));
  const [vm, setVm] = useState(() => Number(base.slice(5, 7)) - 1);

  // When opening, jump the view to the selected month.
  useEffect(() => {
    if (open && value) {
      setVy(Number(value.slice(0, 4)));
      setVm(Number(value.slice(5, 7)) - 1);
    }
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const cells = useMemo(() => {
    const firstWeekday = new Date(vy, vm, 1).getDay();
    const days = new Date(vy, vm + 1, 0).getDate();
    const out: (number | null)[] = Array.from({ length: firstWeekday }, () => null);
    for (let d = 1; d <= days; d++) out.push(d);
    return out;
  }, [vy, vm]);

  const today = todayIso();

  function prevMonth() {
    if (vm === 0) { setVy(vy - 1); setVm(11); } else setVm(vm - 1);
  }
  function nextMonth() {
    if (vm === 11) { setVy(vy + 1); setVm(0); } else setVm(vm + 1);
  }
  function pick(d: number) {
    onChange(isoOf(vy, vm, d));
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-lg border border-ink/15 bg-surface px-3 py-2.5 text-left text-sm outline-none focus:border-forest"
      >
        <span className={value ? "text-ink" : "text-ink/40"}>
          {value ? formatDate(value) : placeholder}
        </span>
        <Calendar size={16} className="text-ink/40" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-72 rounded-xl bg-surface p-3 shadow-xl ring-1 ring-ink/10">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={prevMonth} className="rounded-md p-1.5 text-ink/60 hover:bg-ink/5" aria-label="Previous month">
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-medium text-ink">{MONTHS[vm]} {vy}</span>
            <button type="button" onClick={nextMonth} className="rounded-md p-1.5 text-ink/60 hover:bg-ink/5" aria-label="Next month">
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 text-center">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-1 text-[0.65rem] font-medium uppercase text-ink/40">{w}</div>
            ))}
            {cells.map((d, i) => {
              if (d === null) return <div key={`b${i}`} />;
              const iso = isoOf(vy, vm, d);
              const selected = iso === value;
              const isToday = iso === today;
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => pick(d)}
                  className={`h-8 rounded-md text-sm transition-colors ${
                    selected
                      ? "bg-forest font-medium text-paper"
                      : isToday
                        ? "text-forest ring-1 ring-forest/40 hover:bg-ink/5"
                        : "text-ink/80 hover:bg-ink/5"
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-ink/5 pt-2">
            <button
              type="button"
              onClick={() => { onChange(today); setOpen(false); }}
              className="text-xs text-brass hover:underline"
            >
              Today
            </button>
            {clearable && value && (
              <button type="button" onClick={() => { onChange(""); setOpen(false); }} className="text-xs text-ink/45 hover:underline">
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
