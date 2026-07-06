import { useMemo, useState } from "react";
import { money, minorUnitDigits } from "@kolo/shared";
import { PageHeader } from "@/components/PageHeader";
import { Money } from "@/components/Money";
import { Skeleton } from "@/components/Skeleton";
import { ContributionsChart, CategoryBars, AllocationDonut, NetWorthLine, MonthlyFlowChart } from "@/components/ReportCharts";
import { MonthPicker } from "@/components/MonthPicker";
import { monthRange, currentMonthValue } from "@/lib/dates";
import { useOverview, useCashFlow, useAssetAllocation, useNetWorthTimeline, useMonthlyFlow } from "@/lib/data";

const CLASS_LABEL: Record<string, string> = {
  cash: "Cash", bank: "Bank", mobile_money: "Mobile money", receivable: "Owed to you",
  real_estate: "Property", land: "Land", gold: "Gold", equities: "Stocks",
  vehicle: "Vehicles", business: "Business", crypto: "Crypto", other: "Other",
};

type RangeKey = "month" | "year" | "12mo" | "all" | "pick";
const RANGES: { key: RangeKey; label: string }[] = [
  { key: "month", label: "This month" },
  { key: "year", label: "This year" },
  { key: "12mo", label: "Last 12 months" },
  { key: "all", label: "All time" },
  { key: "pick", label: "A month…" },
];

function rangeFor(key: RangeKey): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const to = iso(now);
  switch (key) {
    case "year": return { from: iso(new Date(y, 0, 1)), to };
    case "12mo": return { from: iso(new Date(y, m - 11, 1)), to };
    case "all": return { from: "2000-01-01", to };
    default: return { from: iso(new Date(y, m, 1)), to }; // "month" (and "pick" fallback)
  }
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-surface p-6 shadow-sm ring-1 ring-ink/5">
      <p className="mb-4 text-sm uppercase tracking-wide text-ink/50">{title}</p>
      {children}
    </section>
  );
}

export function ReportsPage() {
  const [range, setRange] = useState<RangeKey>("year");
  const [month, setMonth] = useState(currentMonthValue());
  const { from, to } = useMemo(() => (range === "pick" ? monthRange(month) : rangeFor(range)), [range, month]);

  const overview = useOverview(from, to);
  const cashFlow = useCashFlow(from, to);
  const allocation = useAssetAllocation();
  const timeline = useNetWorthTimeline();
  const monthly = useMonthlyFlow(from, to);

  const base = overview.data?.base ?? "NGN";
  const ov = overview.data?.overview;
  const flow = cashFlow.data?.flow;
  const digits = minorUnitDigits(base);

  const slices = (allocation.data?.slices ?? []).map((s) => ({ name: CLASS_LABEL[s.class] ?? s.class, raw: s.total }));
  const points = (timeline.data ?? [])
    .filter((s) => s.as_of_date >= from && s.as_of_date <= to)
    .map((s) => ({ date: s.as_of_date.slice(5), value: s.net_worth_minor / 10 ** digits, raw: s.net_worth_minor }));

  const savingsRate = flow && flow.income_total > 0
    ? Math.round(((flow.income_total - flow.expense_total) / flow.income_total) * 100)
    : null;
  const loading = overview.isLoading || cashFlow.isLoading;
  const errored = overview.isError || cashFlow.isError;

  return (
    <>
      <PageHeader title="Reports" subtitle="A closer look at your money." />

      {/* Range filter */}
      <div className="mb-6 flex flex-wrap gap-1 rounded-lg bg-ink/5 p-1">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              range === r.key ? "bg-surface text-forest shadow-sm" : "text-ink/55 hover:text-ink/80"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {range === "pick" && (
        <div className="-mt-3 mb-6">
          <MonthPicker value={month} onChange={setMonth} />
        </div>
      )}

      {errored ? (
        <p className="rounded-2xl bg-surface p-6 text-loss shadow-sm ring-1 ring-ink/5">
          We couldn't load your reports. Please refresh the page.
        </p>
      ) : loading ? (
        <div className="space-y-6">
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-72 w-full rounded-2xl" />
          <Skeleton className="h-72 w-full rounded-2xl" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Headline cards */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-surface p-5 shadow-sm ring-1 ring-ink/5">
              <p className="text-xs text-ink/50">You started with</p>
              <div className="mt-1 text-lg"><Money value={money(BigInt(ov?.bridge.opening_net_worth ?? 0), base)} tone="balance" /></div>
            </div>
            <div className="rounded-2xl bg-surface p-5 shadow-sm ring-1 ring-ink/5">
              <p className="text-xs text-ink/50">You now have</p>
              <div className="mt-1 text-lg"><Money value={money(BigInt(ov?.net_worth ?? 0), base)} tone="balance" /></div>
            </div>
            <div className="rounded-2xl bg-surface p-5 shadow-sm ring-1 ring-ink/5">
              <p className="text-xs text-ink/50">Kept from what you earned</p>
              <p className="mt-1 text-lg font-display font-bold text-forest">{savingsRate === null ? "—" : `${savingsRate}%`}</p>
            </div>
          </div>

          <Panel title="What moved your net worth">
            {ov && <ContributionsChart bridge={ov.bridge} base={base} />}
          </Panel>

          <Panel title="Net worth over time">
            <NetWorthLine points={points} base={base} />
          </Panel>

          <Panel title="Money in vs out, by month">
            <MonthlyFlowChart rows={monthly.data ?? []} base={base} />
          </Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Where the money went">
              {flow && <CategoryBars categories={flow.expense_categories} base={base} />}
            </Panel>
            <Panel title="What your wealth is made of">
              <AllocationDonut slices={slices} base={base} />
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}
