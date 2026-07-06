import { money } from "@kolo/shared";
import { Money } from "./Money";
import type { CashFlowCategory, CashFlowData } from "@/lib/data";

// Cash-flow view (§13.1/§13.5): income & expense totals plus where the money
// went. Category amounts sum to their total (the Phase 2 acceptance check).
export function CashFlowSummary({
  flow,
  base,
  label,
}: {
  flow: CashFlowData;
  base: string;
  label: string;
}) {
  const net = flow.income_total - flow.expense_total;
  return (
    <section className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <Totals label="Money in" value={flow.income_total} base={base} tone="gain" />
        <Totals label="Money out" value={flow.expense_total} base={base} tone="loss" />
        <Totals label="Left over" value={net} base={base} tone="auto" />
      </div>

      <Breakdown
        title={`Where it went · ${label}`}
        categories={flow.expense_categories}
        total={flow.expense_total}
        base={base}
        tone="loss"
      />
      {flow.income_categories.length > 0 && (
        <Breakdown
          title="Where it came from"
          categories={flow.income_categories}
          total={flow.income_total}
          base={base}
          tone="gain"
        />
      )}
    </section>
  );
}

function Totals({
  label,
  value,
  base,
  tone,
}: {
  label: string;
  value: number;
  base: string;
  tone: "gain" | "loss" | "auto";
}) {
  return (
    <div className="rounded-xl bg-surface p-4 ring-1 ring-ink/5">
      <p className="text-xs text-ink/50">{label}</p>
      <div className="mt-1 text-lg">
        <Money value={money(BigInt(value), base)} tone={tone} />
      </div>
    </div>
  );
}

function Breakdown({
  title,
  categories,
  total,
  base,
  tone,
}: {
  title: string;
  categories: CashFlowCategory[];
  total: number;
  base: string;
  tone: "gain" | "loss";
}) {
  if (categories.length === 0) {
    return (
      <div>
        <p className="mb-3 text-sm uppercase tracking-wide text-ink/50">{title}</p>
        <p className="text-sm text-ink/50">Nothing yet.</p>
      </div>
    );
  }
  return (
    <div>
      <p className="mb-3 text-sm uppercase tracking-wide text-ink/50">{title}</p>
      <ul className="space-y-2">
        {categories.map((c) => {
          const pct = total > 0 ? Math.round((c.total / total) * 100) : 0;
          return (
            <li key={c.id} className="rounded-xl bg-surface px-4 py-3 ring-1 ring-ink/5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{c.name}</span>
                <Money value={money(BigInt(c.total), base)} tone={tone} />
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/5">
                <div
                  className={tone === "loss" ? "h-full bg-loss/60" : "h-full bg-gain/60"}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
