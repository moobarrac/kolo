import { Select } from "@/components/Select";
import { useState } from "react";
import { money, formatMoney } from "@kolo/shared";
import { PageHeader } from "@/components/PageHeader";
import { ComingSoon } from "@/components/ComingSoon";
import { EntryForm } from "@/components/EntryForm";
import { ConvertForm } from "@/components/ConvertForm";
import { Money } from "@/components/Money";
import { CashFlowSummary } from "@/components/CashFlowSummary";
import { ListSkeleton } from "@/components/Skeleton";
import { ArrowRightLeft } from "lucide-react";
import { useTransactions, useUserAccounts, useCashFlow, type TransactionRow } from "@/lib/data";
import { MonthPicker } from "@/components/MonthPicker";
import { currentMonth, currentMonthValue, monthRange, formatDate } from "@/lib/dates";

// Transaction-list filters. "Transfers" groups the money-moving entry kinds.
type FilterKey = "all" | "in" | "out" | "transfers";
const FILTERS: { key: FilterKey; label: string; kinds?: string[] }[] = [
  { key: "all", label: "All" },
  { key: "in", label: "Money in", kinds: ["income"] },
  { key: "out", label: "Money out", kinds: ["expense"] },
  { key: "transfers", label: "Transfers", kinds: ["transfer", "fx_conversion", "loan_payment", "loan_drawdown"] },
];
type RangeKey = "month" | "3mo" | "all" | "pick";
const RANGES: { key: RangeKey; label: string }[] = [
  { key: "month", label: "This month" },
  { key: "3mo", label: "Last 3 months" },
  { key: "all", label: "All time" },
  { key: "pick", label: "A month…" },
];

function rangeFrom(key: RangeKey): string | undefined {
  if (key === "all") return undefined;
  const now = new Date();
  const months = key === "month" ? 0 : 2;
  const d = new Date(now.getFullYear(), now.getMonth() - months, 1);
  return d.toISOString().slice(0, 10);
}

export function MoneyPage() {
  const accounts = useUserAccounts();
  const month = currentMonth();
  const cashFlow = useCashFlow(month.from, month.to);
  const hasAccounts = (accounts.data?.length ?? 0) > 0;

  const [filter, setFilter] = useState<FilterKey>("all");
  const [range, setRange] = useState<RangeKey>("3mo");
  const [pickMonth, setPickMonth] = useState(currentMonthValue());
  const [search, setSearch] = useState("");

  const kinds = FILTERS.find((f) => f.key === filter)?.kinds;
  const dateWindow = range === "pick" ? monthRange(pickMonth) : { from: rangeFrom(range), to: undefined as string | undefined };
  const txns = useTransactions({ kinds, from: dateWindow.from, to: dateWindow.to, search });

  return (
    <>
      <PageHeader title="Money in & out" subtitle="What you earn and what you spend." />

      {!accounts.isLoading && !hasAccounts ? (
        <ComingSoon
          icon={ArrowRightLeft}
          message="First, add an account in Settings. Then you can record money coming in and going out here."
        />
      ) : (
        <div className="grid gap-6 md:grid-cols-[minmax(0,20rem)_1fr]">
          <div className="space-y-6">
            <EntryForm />
            <ConvertForm />
          </div>
          <div className="space-y-8">
            {cashFlow.data && (
              <CashFlowSummary flow={cashFlow.data.flow} base={cashFlow.data.base} label={month.label} />
            )}
            <section>
              <p className="mb-3 text-sm uppercase tracking-wide text-ink/50">History</p>

              {/* Filters */}
              <div className="mb-3 space-y-2">
                <div className="flex flex-wrap gap-1 rounded-lg bg-ink/5 p-1">
                  {FILTERS.map((f) => (
                    <button
                      key={f.key}
                      onClick={() => setFilter(f.key)}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                        filter === f.key ? "bg-surface text-forest shadow-sm" : "text-ink/55 hover:text-ink/80"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={range}
                    onChange={(e) => setRange(e.target.value as RangeKey)}
                    className="rounded-lg border border-ink/15 bg-surface px-3 py-2 text-xs outline-none focus:border-forest"
                  >
                    {RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                  </Select>
                  {range === "pick" && <MonthPicker value={pickMonth} onChange={setPickMonth} />}
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search notes…"
                    className="flex-1 rounded-lg border border-ink/15 bg-surface px-3 py-2 text-xs outline-none focus:border-forest"
                  />
                </div>
              </div>

              {txns.isLoading && <ListSkeleton rows={5} />}
              {txns.isError && <p className="text-loss">We couldn't load your history. Please refresh.</p>}
              {txns.data?.length === 0 && <p className="text-ink/50">Nothing matches these filters.</p>}
              <ul className="space-y-2">
                {txns.data?.map((t) => (
                  <TxnRow key={t.id} txn={t} />
                ))}
              </ul>
            </section>
          </div>
        </div>
      )}
    </>
  );
}

function TxnRow({ txn }: { txn: TransactionRow }) {
  // Show the entry from the debit (positive) line that isn't the money account —
  // good enough for a glanceable list: the amount + a name + the date.
  const primary = txn.journal_lines.find((l) => l.amount_minor > 0) ?? txn.journal_lines[0];
  const name = txn.description || primary?.accounts?.name || txn.kind;
  const amount = primary ? money(BigInt(Math.abs(primary.amount_minor)), primary.currency) : null;
  const tone = txn.kind === "income" ? "gain" : txn.kind === "expense" ? "loss" : "balance";

  return (
    <li className="flex items-center justify-between rounded-xl bg-surface px-4 py-3 text-sm ring-1 ring-ink/5">
      <div>
        <p className="font-medium">{name}</p>
        <p className="text-xs text-ink/50">{formatDate(txn.entry_date)}</p>
      </div>
      {amount && <span title={formatMoney(amount)}><Money value={amount} tone={tone} /></span>}
    </li>
  );
}
