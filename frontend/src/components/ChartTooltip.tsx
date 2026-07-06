import { formatMoney, money } from "@kolo/shared";

// Themed replacement for Recharts' default (white) tooltip so it reads correctly
// in dark mode. Resolves each series' raw minor value from the row: single-series
// charts carry `raw`; the income/expense chart carries `incomeRaw`/`expenseRaw`.
interface Entry {
  name?: string | number;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
  payload?: Record<string, number>;
}
interface Props {
  active?: boolean;
  payload?: Entry[];
  label?: string | number;
  base: string;
  labelPrefix?: string;
}

const fmt = (minor: number, base: string) => formatMoney(money(BigInt(Math.round(minor)), base));

export function ChartTooltip({ active, payload, label, base, labelPrefix }: Props) {
  if (!active || !payload?.length) return null;
  const multi = payload.length > 1;
  return (
    <div className="rounded-lg bg-surface px-3 py-2 text-xs shadow-lg ring-1 ring-ink/10">
      {label != null && (
        <p className="mb-1 text-ink/50">{labelPrefix ? `${labelPrefix} ${label}` : label}</p>
      )}
      {payload.map((e, i) => {
        const row = e.payload ?? {};
        const raw =
          e.dataKey === "income" ? row.incomeRaw
          : e.dataKey === "expense" ? row.expenseRaw
          : row.raw ?? Number(e.value ?? 0);
        const name = e.dataKey === "income" ? "In" : e.dataKey === "expense" ? "Out" : e.name;
        return (
          <div key={i} className="flex items-center gap-2 font-mono text-ink">
            {multi && <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: e.color }} />}
            {multi && name != null && <span className="text-ink/55">{name}</span>}
            <span className="ml-auto">{fmt(Number(raw), base)}</span>
          </div>
        );
      })}
    </div>
  );
}
