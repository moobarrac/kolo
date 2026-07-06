// Date helpers for report windows. ISO (YYYY-MM-DD) strings throughout.

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function todayIso(): string {
  return iso(new Date());
}

/** Human date with the weekday, e.g. "Monday, 12 Jan 2026". */
export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-NG", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** The current calendar month as a [from, to] window, with a display label. */
export function currentMonth(): { from: string; to: string; label: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    from: iso(first),
    to: iso(now),
    label: now.toLocaleDateString("en-NG", { month: "long", year: "numeric" }),
  };
}

/** The current month as a "YYYY-MM" value (for the month picker). */
export function currentMonthValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** A specific "YYYY-MM" month as a [from, to] window, built from the numbers to
 *  avoid any UTC/local off-by-one. */
export function monthRange(ym: string): { from: string; to: string; label: string } {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  const mm = String(m).padStart(2, "0");
  const lastDay = new Date(y, m, 0).getDate();
  return {
    from: `${y}-${mm}-01`,
    to: `${y}-${mm}-${String(lastDay).padStart(2, "0")}`,
    label: new Date(y, m - 1, 1).toLocaleDateString("en-NG", { month: "long", year: "numeric" }),
  };
}

/** The last `count` months, newest first, as { value: "YYYY-MM", label }. */
export function recentMonths(count: number): { value: string; label: string }[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return {
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-NG", { month: "long", year: "numeric" }),
    };
  });
}

/** The current calendar year as a [from, to] window. */
export function currentYear(): { from: string; to: string; label: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), 0, 1);
  return { from: iso(first), to: iso(now), label: String(now.getFullYear()) };
}
