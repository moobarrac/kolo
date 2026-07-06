import { useMemo, useState } from "react";
import {
  parseToMinor,
  formatMoney,
  money,
  buildIncomeLegs,
  buildExpenseLegs,
  buildTransferLegs,
} from "@kolo/shared";
import { useUserAccounts, usePostEntry, useProfile, useAddCommonCategories, type AccountRow } from "@/lib/data";
import { useConfirm } from "@/components/Confirm";
import { DateField } from "@/components/DateField";
import { Select as Dropdown } from "@/components/Select";
import { todayIso, formatDate } from "@/lib/dates";

type Kind = "income" | "expense" | "transfer";

const TABS: { kind: Kind; label: string }[] = [
  { kind: "income", label: "Money in" },
  { kind: "expense", label: "Money out" },
  { kind: "transfer", label: "Move money" },
];

const field = "w-full rounded-lg border border-ink/15 bg-surface px-3 py-2.5 text-sm outline-none focus:border-forest";

export function EntryForm({ onPosted }: { onPosted?: () => void }) {
  const { data: profile } = useProfile();
  const { data: accounts } = useUserAccounts();
  const post = usePostEntry();
  const confirm = useConfirm();
  const addCategories = useAddCommonCategories();
  const base = profile?.base_currency ?? "NGN";

  const [kind, setKind] = useState<Kind>("expense");
  const [moneyAccountId, setMoneyAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("");
  const [date, setDate] = useState(todayIso());
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const assets = useMemo(() => (accounts ?? []).filter((a) => a.type === "asset"), [accounts]);
  const moneyAccount = assets.find((a) => a.id === moneyAccountId);
  const currency = moneyAccount?.currency ?? base;

  // Single-currency entry: the other leg must share the money account's currency.
  const categoryType = kind === "income" ? "income" : "expense";
  const categories = (accounts ?? []).filter((a) => a.type === categoryType && a.currency === currency);
  const transferTargets = assets.filter((a) => a.id !== moneyAccountId && a.currency === currency);

  const needsRate = currency !== base;

  function reset() {
    setAmount("");
    setRate("");
    setDescription("");
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const amountMinor = parseToMinor(amount, currency);
      if (amountMinor <= 0n) throw new Error("Enter an amount greater than zero.");
      const fxRate = needsRate ? Number(rate) : 1;
      if (needsRate && (!fxRate || fxRate <= 0)) throw new Error("Enter the exchange rate.");

      const name = (id: string) => (accounts ?? []).find((a) => a.id === id)?.name ?? "";
      const amountText = formatMoney(money(amountMinor, currency));
      let lines;
      let summary: string;
      if (kind === "income") {
        if (!moneyAccountId || !categoryId) throw new Error("Choose where it went and where it came from.");
        lines = buildIncomeLegs({ cashAccountId: moneyAccountId, categoryAccountId: categoryId, currency, amountMinor, fxRate, baseCurrency: base });
        summary = `${amountText} in from ${name(categoryId)} → ${name(moneyAccountId)}`;
      } else if (kind === "expense") {
        if (!moneyAccountId || !categoryId) throw new Error("Choose what it was for and where it came from.");
        lines = buildExpenseLegs({ cashAccountId: moneyAccountId, categoryAccountId: categoryId, currency, amountMinor, fxRate, baseCurrency: base });
        summary = `${amountText} out for ${name(categoryId)} from ${name(moneyAccountId)}`;
      } else {
        if (!moneyAccountId || !toAccountId) throw new Error("Choose both accounts.");
        if (moneyAccountId === toAccountId) throw new Error("Choose two different accounts.");
        lines = buildTransferLegs({ fromAccountId: moneyAccountId, toAccountId, currency, amountMinor, fxRate, baseCurrency: base });
        summary = `${amountText} from ${name(moneyAccountId)} → ${name(toAccountId)}`;
      }

      const okToPost = await confirm({
        title: "Add this?",
        body: `${summary}, on ${formatDate(date)}.`,
        confirmLabel: "Add",
      });
      if (!okToPost) return;

      await post.mutateAsync({ kind, entryDate: date, description: description || undefined, lines });
      reset();
      onPosted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  const categoryLabel = kind === "income" ? "Where it came from" : "What it was for";

  return (
    <form onSubmit={submit} className="rounded-2xl bg-surface p-6 shadow-sm ring-1 ring-ink/5">
      <div className="mb-5 flex gap-1 rounded-lg bg-ink/5 p-1">
        {TABS.map((t) => (
          <button
            key={t.kind}
            type="button"
            onClick={() => { setKind(t.kind); setError(null); }}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              kind === t.kind ? "bg-surface text-forest shadow-sm" : "text-ink/55"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        <Select
          label={kind === "transfer" ? "From" : kind === "income" ? "Where it went" : "Paid from"}
          value={moneyAccountId}
          onChange={setMoneyAccountId}
          options={assets}
          placeholder="Choose an account"
        />

        {kind === "transfer" ? (
          <Select label="To" value={toAccountId} onChange={setToAccountId} options={transferTargets} placeholder="Choose an account" />
        ) : (
          <div>
            <Select label={categoryLabel} value={categoryId} onChange={setCategoryId} options={categories} placeholder={`Choose a ${categoryType === "income" ? "source" : "category"}`} />
            {categories.length === 0 && currency === base && (
              <button
                type="button"
                onClick={() => addCategories.mutate()}
                disabled={addCategories.isPending}
                className="mt-1 text-xs text-brass hover:underline disabled:opacity-50"
              >
                {addCategories.isPending ? "Adding…" : "Add common categories"}
              </button>
            )}
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs text-ink/55">Amount ({currency})</label>
          <input className={field} inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>

        {needsRate && (
          <div>
            <label className="mb-1 block text-xs text-ink/55">Exchange rate (1 {currency} = ? {base})</label>
            <input className={field} inputMode="decimal" placeholder="0.00" value={rate} onChange={(e) => setRate(e.target.value)} />
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs text-ink/55">Date</label>
          <DateField value={date} onChange={setDate} />
        </div>

        <div>
          <label className="mb-1 block text-xs text-ink/55">Note (optional)</label>
          <input className={field} placeholder="e.g. Groceries at the market" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        {error && <p className="text-sm text-loss">{error}</p>}

        <button
          type="submit"
          disabled={post.isPending}
          className="w-full rounded-lg bg-forest px-4 py-3 text-sm font-medium text-paper disabled:opacity-50"
        >
          {post.isPending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: AccountRow[];
  placeholder: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-ink/55">{label}</label>
      <Dropdown className={field} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}>
        {options.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} {a.currency !== "NGN" ? `(${a.currency})` : ""}
          </option>
        ))}
      </Dropdown>
    </div>
  );
}
