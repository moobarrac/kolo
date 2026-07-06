import { useMemo, useState } from "react";
import {
  parseToMinor,
  buildIncomeLegs,
  buildExpenseLegs,
  type Frequency,
} from "@kolo/shared";
import { PageHeader } from "@/components/PageHeader";
import { ComingSoon } from "@/components/ComingSoon";
import { DateField } from "@/components/DateField";
import { Select as Dropdown } from "@/components/Select";
import { Repeat } from "lucide-react";
import {
  useUserAccounts,
  useProfile,
  useRecurringRules,
  useCreateRecurringRule,
  type AccountRow,
} from "@/lib/data";
import { todayIso, formatDate } from "@/lib/dates";

const field = "w-full rounded-lg border border-ink/15 bg-surface px-3 py-2.5 text-sm outline-none focus:border-forest";

const FREQ: { value: Frequency; label: string }[] = [
  { value: "monthly", label: "Every month" },
  { value: "weekly", label: "Every week" },
  { value: "yearly", label: "Every year" },
  { value: "daily", label: "Every day" },
];

export function RecurringPage() {
  const { data: profile } = useProfile();
  const { data: accounts } = useUserAccounts();
  const rules = useRecurringRules();
  const create = useCreateRecurringRule();
  const base = profile?.base_currency ?? "NGN";

  const [kind, setKind] = useState<"income" | "expense">("expense");
  const [name, setName] = useState("");
  const [moneyAccountId, setMoneyAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [startDate, setStartDate] = useState(todayIso());
  const [autoPost, setAutoPost] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const assets = useMemo(() => (accounts ?? []).filter((a) => a.type === "asset"), [accounts]);
  const moneyAccount = assets.find((a) => a.id === moneyAccountId);
  const currency = moneyAccount?.currency ?? base;
  const categories = (accounts ?? []).filter((a) => a.type === kind && a.currency === currency);
  const needsRate = currency !== base;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (!name.trim()) throw new Error("Give it a name.");
      if (!moneyAccountId || !categoryId) throw new Error("Choose both accounts.");
      const amountMinor = parseToMinor(amount, currency);
      if (amountMinor <= 0n) throw new Error("Enter an amount greater than zero.");
      const fxRate = needsRate ? Number(rate) : 1;
      if (needsRate && (!fxRate || fxRate <= 0)) throw new Error("Enter the exchange rate.");

      const lines =
        kind === "income"
          ? buildIncomeLegs({ cashAccountId: moneyAccountId, categoryAccountId: categoryId, currency, amountMinor, fxRate, baseCurrency: base })
          : buildExpenseLegs({ cashAccountId: moneyAccountId, categoryAccountId: categoryId, currency, amountMinor, fxRate, baseCurrency: base });

      const dayOfMonth = frequency === "monthly" || frequency === "yearly" ? Number(startDate.slice(8, 10)) : undefined;

      await create.mutateAsync({
        name: name.trim(),
        kind,
        description: name.trim(),
        lines,
        frequency,
        interval: 1,
        dayOfMonth,
        startDate,
        autoPost,
      });
      setName("");
      setAmount("");
      setRate("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (!accounts) return null;
  if (assets.length === 0) {
    return (
      <>
        <PageHeader title="Recurring" subtitle="Things that happen every month." />
        <ComingSoon icon={Repeat} message="First, add an account in Settings. Then you can set up things like rent and salary to happen automatically." />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Recurring" subtitle="Set it once, and it happens on time." />

      <div className="grid gap-6 md:grid-cols-[minmax(0,22rem)_1fr]">
        <form onSubmit={submit} className="rounded-2xl bg-surface p-6 shadow-sm ring-1 ring-ink/5">
          <div className="mb-5 flex gap-1 rounded-lg bg-ink/5 p-1">
            {(["expense", "income"] as const).map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium ${kind === k ? "bg-surface text-forest shadow-sm" : "text-ink/55"}`}>
                {k === "expense" ? "A bill" : "Income"}
              </button>
            ))}
          </div>
          <div className="space-y-3">
            <Input label="Name" placeholder="e.g. Rent" value={name} onChange={setName} />
            <Select label={kind === "expense" ? "Paid from" : "Goes to"} value={moneyAccountId} onChange={setMoneyAccountId} options={assets} placeholder="Choose an account" />
            <Select label={kind === "expense" ? "Category" : "Source"} value={categoryId} onChange={setCategoryId} options={categories} placeholder="Choose one" />
            <div>
              <label className="mb-1 block text-xs text-ink/55">Amount ({currency})</label>
              <input className={field} inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            {needsRate && <Input label={`Exchange rate (1 ${currency} = ? ${base})`} placeholder="0.00" value={rate} onChange={setRate} />}
            <div>
              <label className="mb-1 block text-xs text-ink/55">How often</label>
              <Dropdown className={field} value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
                {FREQ.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </Dropdown>
            </div>
            <div>
              <label className="mb-1 block text-xs text-ink/55">Starting</label>
              <DateField value={startDate} onChange={setStartDate} />
            </div>
            <label className="flex items-center gap-2 text-sm text-ink/70">
              <input type="checkbox" checked={autoPost} onChange={(e) => setAutoPost(e.target.checked)} />
              Add it automatically each time
            </label>
            {error && <p className="text-sm text-loss">{error}</p>}
            <button type="submit" disabled={create.isPending} className="w-full rounded-lg bg-forest px-4 py-3 text-sm font-medium text-paper disabled:opacity-50">
              {create.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>

        <section>
          <p className="mb-3 text-sm uppercase tracking-wide text-ink/50">Set up</p>
          {(rules.data?.length ?? 0) === 0 && <p className="text-ink/50">Nothing set up yet.</p>}
          <ul className="space-y-2">
            {rules.data?.map((r) => (
              <li key={r.id} className="flex items-center justify-between rounded-xl bg-surface px-4 py-3 text-sm ring-1 ring-ink/5">
                <div>
                  <p className="font-medium">{r.name}</p>
                  <p className="text-xs text-ink/50">
                    {FREQ.find((f) => f.value === r.frequency)?.label ?? r.frequency} · next on {formatDate(r.next_run)}
                    {!r.auto_post && " · added as a draft"}
                  </p>
                </div>
                <span className={`text-xs ${r.is_active ? "text-forest" : "text-ink/40"}`}>
                  {r.is_active ? "Active" : "Ended"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}

function Input({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-ink/55">{label}</label>
      <input className={field} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Select({ label, value, onChange, options, placeholder }: { label: string; value: string; onChange: (v: string) => void; options: AccountRow[]; placeholder: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-ink/55">{label}</label>
      <Dropdown className={field} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}>
        {options.map((a) => (
          <option key={a.id} value={a.id}>{a.name} {a.currency !== "NGN" ? `(${a.currency})` : ""}</option>
        ))}
      </Dropdown>
    </div>
  );
}
