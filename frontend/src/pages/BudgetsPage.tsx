import { useMemo, useState } from "react";
import { parseToMinor, formatMinor, money } from "@kolo/shared";
import { PageHeader } from "@/components/PageHeader";
import { Money } from "@/components/Money";
import { useUserAccounts, useBudgets, useSetBudget, useProfile, type AccountRow, type BudgetRow } from "@/lib/data";

// Fixed-width amount input (no w-full, so the category name keeps its space).
const numField = "w-28 shrink-0 rounded-lg border border-ink/15 bg-surface px-3 py-2 text-sm outline-none focus:border-forest";
const clamp = (n: number) => Math.max(0, Math.min(1, n));

// Monthly spending budgets (§13.5): one cap per expense category, shown against
// what's been spent this month.
export function BudgetsPage() {
  const { data: profile } = useProfile();
  const base = profile?.base_currency ?? "NGN";
  const { data: accounts } = useUserAccounts();
  const { data: budgets } = useBudgets();

  const categories = useMemo(
    () => (accounts ?? []).filter((a: AccountRow) => a.type === "expense").sort((a, b) => a.name.localeCompare(b.name)),
    [accounts],
  );
  const byCategory = useMemo(() => {
    const m = new Map<string, BudgetRow>();
    for (const b of budgets ?? []) m.set(b.category_id, b);
    return m;
  }, [budgets]);

  const totalCap = (budgets ?? []).reduce((s, b) => s + BigInt(b.amount_minor), 0n);
  const totalSpent = (budgets ?? []).reduce((s, b) => s + BigInt(b.spent_minor), 0n);

  return (
    <>
      <PageHeader title="Budgets" subtitle="Set a monthly limit for a category and track how much is left." />

      {(budgets?.length ?? 0) > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="Budgeted" value={<Money value={money(totalCap, base)} />} />
          <Stat label="Spent so far" value={<Money value={money(totalSpent, base)} tone={totalSpent > totalCap ? "loss" : "balance"} />} />
          <Stat label="Left" value={<Money value={money(totalCap - totalSpent, base)} tone={totalCap - totalSpent < 0n ? "loss" : "gain"} />} />
        </div>
      )}

      {categories.length === 0 ? (
        <p className="text-ink/50">Add a spending category first (Settings → Add an account).</p>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-surface ring-1 ring-ink/5">
          <ul className="divide-y divide-ink/5">
            {categories.map((c) => (
              <BudgetRowItem key={c.id} category={c} budget={byCategory.get(c.id)} base={base} />
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-ink/5">
      <p className="mb-1 text-xs uppercase tracking-wide text-ink/50">{label}</p>
      <p className="text-base">{value}</p>
    </div>
  );
}

function BudgetRowItem({ category, budget, base }: { category: AccountRow; budget?: BudgetRow; base: string }) {
  const save = useSetBudget();
  const initial = budget ? formatMinor(BigInt(budget.amount_minor), base) : "";
  const [value, setValue] = useState(initial);
  const dirty = value.trim() !== initial;

  const cap = budget ? BigInt(budget.amount_minor) : 0n;
  const spent = budget ? BigInt(budget.spent_minor) : 0n;
  const pct = cap > 0n ? clamp(Number(spent) / Number(cap)) : 0;
  const over = budget != null && spent > cap;

  async function submit() {
    const amount = value.trim() ? parseToMinor(value, base) : null;
    await save.mutateAsync({ categoryId: category.id, amountMinor: amount, currency: base });
    setValue(amount != null ? formatMinor(amount, base) : "");
  }

  return (
    <li className="px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-ink/80">{category.name}</span>
          {budget != null && (
            <span className="text-xs text-ink/45">
              <Money value={money(spent, base)} className="text-xs" tone={over ? "loss" : "balance"} /> of{" "}
              <Money value={money(cap, base)} className="text-xs" /> {over ? "· over" : "spent"}
            </span>
          )}
        </span>
        <input
          className={numField}
          inputMode="decimal"
          placeholder="No limit"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button
          type="button"
          onClick={submit}
          disabled={!dirty || save.isPending}
          className="rounded-lg border border-ink/15 px-3 py-2 text-xs font-medium text-ink/70 hover:bg-ink/5 disabled:opacity-40"
        >
          Save
        </button>
      </div>
      {budget != null && cap > 0n && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/5">
          <div className={over ? "h-full bg-loss" : "h-full bg-forest/60"} style={{ width: `${Math.round(pct * 100)}%` }} />
        </div>
      )}
    </li>
  );
}
