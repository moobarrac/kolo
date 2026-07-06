import {
  BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, LineChart, Line,
} from "recharts";
import { minorUnitDigits, currencySymbol } from "@kolo/shared";
import type { OverviewData, CashFlowCategory, MonthlyFlow } from "@/lib/data";
import { ChartTooltip } from "@/components/ChartTooltip";

const FOREST = "#20503B", BRASS = "#B07D2B", CLAY = "#A23C2B";
const PALETTE = [FOREST, BRASS, CLAY, "#3E7A5E", "#C49A4A", "#6B8F71", "#8A6D3B", "#9C5D4A"];

function toMajor(minor: number, base: string): number {
  return minor / 10 ** minorUnitDigits(base);
}
function compact(major: number, base: string): string {
  const s = currencySymbol(base);
  const a = Math.abs(major);
  const sign = major < 0 ? "-" : "";
  if (a >= 1e9) return `${sign}${s}${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${sign}${s}${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${sign}${s}${(a / 1e3).toFixed(0)}K`;
  return `${sign}${s}${Math.round(a)}`;
}
const axisTick = { fontSize: 11, fill: "rgb(var(--color-ink) / 0.5)" };

// What moved your net worth (the bridge, as a diverging bar chart, §13.4).
export function ContributionsChart({ bridge, base }: { bridge: OverviewData["bridge"]; base: string }) {
  const rows = [
    { name: "Earned − spent", v: bridge.net_income },
    { name: "Currency", v: bridge.fx_revaluation },
    { name: "Value changes", v: bridge.asset_revaluation },
    { name: "Added / taken out", v: bridge.capital_events },
  ].filter((r) => r.v !== 0).map((r) => ({ name: r.name, value: toMajor(r.v, base), raw: r.v }));

  if (rows.length === 0) return <p className="text-sm text-ink/50">No change in this period.</p>;

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <XAxis dataKey="name" tick={axisTick} tickLine={false} axisLine={false} interval={0} />
          <YAxis width={56} tick={axisTick} tickLine={false} axisLine={false} tickFormatter={(v: number) => compact(v, base)} />
          <Tooltip content={<ChartTooltip base={base} />} cursor={{ fill: "rgb(var(--color-ink) / 0.03)" }} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {rows.map((r, i) => <Cell key={i} fill={r.raw >= 0 ? FOREST : CLAY} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Where the money went — expense categories as horizontal bars.
export function CategoryBars({ categories, base }: { categories: CashFlowCategory[]; base: string }) {
  if (categories.length === 0) return <p className="text-sm text-ink/50">Nothing yet.</p>;
  const rows = categories.slice(0, 8).map((c) => ({ name: c.name, value: toMajor(c.total, base), raw: c.total }));
  return (
    <div className="w-full" style={{ height: Math.max(120, rows.length * 38) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
          <XAxis type="number" tick={axisTick} tickLine={false} axisLine={false} tickFormatter={(v: number) => compact(v, base)} />
          <YAxis type="category" dataKey="name" width={110} tick={axisTick} tickLine={false} axisLine={false} />
          <Tooltip content={<ChartTooltip base={base} />} cursor={{ fill: "rgb(var(--color-ink) / 0.03)" }} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} fill={CLAY}>
            {rows.map((_, i) => <Cell key={i} fill={CLAY} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// What your wealth is made of — asset allocation donut.
export function AllocationDonut({
  slices, base,
}: { slices: { name: string; raw: number }[]; base: string }) {
  if (slices.length === 0) return <p className="text-sm text-ink/50">Nothing yet.</p>;
  const data = slices.map((s) => ({ name: s.name, value: toMajor(s.raw, base), raw: s.raw }));
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="h-48 w-48 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={48} outerRadius={88} paddingAngle={2} stroke="none">
              {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Pie>
            <Tooltip content={<ChartTooltip base={base} />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex-1 space-y-1.5">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />
            <span className="flex-1 text-ink/70">{d.name}</span>
            <span className="font-mono text-ink/50">{compact(d.value, base)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Income vs expense, month by month — grouped bars.
export function MonthlyFlowChart({ rows, base }: { rows: MonthlyFlow[]; base: string }) {
  if (rows.length === 0) return <p className="text-sm text-ink/50">Nothing yet.</p>;
  const data = rows.map((r) => ({
    month: r.month.slice(2), // YY-MM
    income: toMajor(r.income, base), incomeRaw: r.income,
    expense: toMajor(r.expense, base), expenseRaw: r.expense,
  }));
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <XAxis dataKey="month" tick={axisTick} tickLine={false} axisLine={false} />
          <YAxis width={56} tick={axisTick} tickLine={false} axisLine={false} tickFormatter={(v: number) => compact(v, base)} />
          <Tooltip content={<ChartTooltip base={base} />} cursor={{ fill: "rgb(var(--color-ink) / 0.03)" }} />
          <Bar dataKey="income" fill={FOREST} radius={[4, 4, 0, 0]} />
          <Bar dataKey="expense" fill={CLAY} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Net worth over time — line chart from snapshots.
export function NetWorthLine({ points, base }: { points: { date: string; value: number; raw: number }[]; base: string }) {
  if (points.length < 2) return <p className="text-sm text-ink/50">Not enough history yet — check back in a few days.</p>;
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
          <XAxis dataKey="date" tick={axisTick} tickLine={false} axisLine={false} />
          <YAxis width={56} tick={axisTick} tickLine={false} axisLine={false} tickFormatter={(v: number) => compact(v, base)} />
          <Tooltip content={<ChartTooltip base={base} />} />
          <Line type="monotone" dataKey="value" stroke={FOREST} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
