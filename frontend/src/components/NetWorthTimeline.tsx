import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { formatMoney, money, minorUnitDigits } from "@kolo/shared";
import { useNetWorthTimeline } from "@/lib/data";
import { ChartTooltip } from "@/components/ChartTooltip";

// Net-worth timeline from daily snapshots (§15 Phase 3). Only shown once there
// are at least two points to draw a line between.
export function NetWorthTimeline({ base }: { base: string }) {
  const timeline = useNetWorthTimeline();
  const points = (timeline.data ?? []).map((s) => ({
    date: s.as_of_date.slice(5), // MM-DD
    value: s.net_worth_minor / 10 ** minorUnitDigits(base),
    raw: s.net_worth_minor,
  }));

  if (points.length < 2) return null;

  return (
    <section className="mt-6 rounded-2xl bg-surface p-8 shadow-sm ring-1 ring-ink/5">
      <p className="mb-4 text-sm uppercase tracking-wide text-ink/50">Net worth over time</p>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "rgb(var(--color-ink) / 0.5)" }} tickLine={false} axisLine={false} />
            <YAxis
              width={64}
              tick={{ fontSize: 11, fill: "rgb(var(--color-ink) / 0.5)" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => formatMoney(money(BigInt(Math.round(v * 10 ** minorUnitDigits(base))), base))}
            />
            <Tooltip content={<ChartTooltip base={base} labelPrefix="Date" />} />
            <Line type="monotone" dataKey="value" stroke="rgb(var(--color-forest))" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
