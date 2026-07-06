// Recurring-rule scheduling (§7.12, §12.1). Shared by the materializer (backend
// job) and the UI (to preview the next run), so the schedule never drifts.

export type Frequency = "daily" | "weekly" | "monthly" | "yearly";

export interface RecurrenceSpec {
  frequency: Frequency;
  interval: number; // every N periods
  dayOfMonth?: number | null; // for monthly/yearly
}

function parse(iso: string): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return [y, m, d];
}

function fmt(y: number, m: number, d: number): string {
  return `${y.toString().padStart(4, "0")}-${m.toString().padStart(2, "0")}-${d
    .toString()
    .padStart(2, "0")}`;
}

function daysInMonth(year: number, month1: number): number {
  // month1 is 1-based; day 0 of next month = last day of this month.
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

function addMonths(iso: string, months: number, dayOfMonth?: number | null): string {
  const [y, m, d] = parse(iso);
  let total = m - 1 + months;
  const year = y + Math.floor(total / 12);
  const month1 = (((total % 12) + 12) % 12) + 1;
  const target = dayOfMonth ?? d;
  const day = Math.min(target, daysInMonth(year, month1));
  return fmt(year, month1, day);
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = parse(iso);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return fmt(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** The next occurrence strictly after `current`, per the recurrence spec. */
export function nextRunDate(current: string, spec: RecurrenceSpec): string {
  const n = Math.max(1, spec.interval);
  switch (spec.frequency) {
    case "daily":
      return addDays(current, n);
    case "weekly":
      return addDays(current, n * 7);
    case "monthly":
      return addMonths(current, n, spec.dayOfMonth);
    case "yearly":
      return addMonths(current, n * 12, spec.dayOfMonth);
  }
}

/** ISO date `a` <= ISO date `b` (lexicographic works for YYYY-MM-DD). */
export const isOnOrBefore = (a: string, b: string): boolean => a <= b;

// The shape stored in recurring_rules.template (the entry to clone each period).
export interface RecurringTemplate {
  kind: string;
  description?: string;
  lines: {
    line_no: number;
    account_id: string;
    amount_minor: string;
    currency: string;
    fx_rate: number;
    base_amount_minor: string;
    memo: string | null;
  }[];
}
