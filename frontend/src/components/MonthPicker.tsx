import { ChevronLeft, ChevronRight } from "lucide-react";
import { Select } from "@/components/Select";
import { recentMonths } from "@/lib/dates";

// Pick a specific month to filter by. Newest-first list (last 24 months) plus
// prev/next steppers. Value is "YYYY-MM"; pair with monthRange() for a [from,to].
const MONTHS = recentMonths(24);
const selectCls = "rounded-lg border border-ink/15 bg-surface px-3 py-2 text-sm outline-none focus:border-forest";
const stepCls = "rounded-lg border border-ink/15 p-2 text-ink/60 hover:bg-ink/5 disabled:opacity-40";

export function MonthPicker({ value, onChange }: { value: string; onChange: (ym: string) => void }) {
  const idx = MONTHS.findIndex((m) => m.value === value);
  const step = (delta: number) => { const next = MONTHS[idx + delta]; if (next) onChange(next.value); };

  return (
    <div className="flex items-center gap-1.5">
      <button type="button" onClick={() => step(1)} disabled={idx >= MONTHS.length - 1} aria-label="Previous month" className={stepCls}>
        <ChevronLeft size={16} />
      </button>
      <Select className={`${selectCls} min-w-[9rem]`} value={value} onChange={(e) => onChange(e.target.value)}>
        {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
      </Select>
      <button type="button" onClick={() => step(-1)} disabled={idx <= 0} aria-label="Next month" className={stepCls}>
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
