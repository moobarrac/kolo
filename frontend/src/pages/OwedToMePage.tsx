import { Select } from "@/components/Select";
import { useMemo, useState } from "react";
import { parseToMinor, formatMoney, money } from "@kolo/shared";
import { PageHeader } from "@/components/PageHeader";
import { Money } from "@/components/Money";
import { useConfirm } from "@/components/Confirm";
import { DateField } from "@/components/DateField";
import {
  useReceivables,
  useCreateReceivable,
  useReceivablePayment,
  useReceivableWriteoff,
  useUserAccounts,
  useProfile,
  type ReceivableRow,
} from "@/lib/data";
import { todayIso, formatDate } from "@/lib/dates";

const field = "w-full rounded-lg border border-ink/15 bg-surface px-3 py-2.5 text-sm outline-none focus:border-forest";
const MONEY = new Set(["cash", "bank", "mobile_money"]);

const STATUS_LABEL: Record<ReceivableRow["status"], string> = {
  outstanding: "Outstanding",
  partially_paid: "Partly paid",
  settled: "Paid back",
  written_off: "Written off",
};

export function OwedToMePage() {
  const { data: profile } = useProfile();
  const { data: accounts } = useUserAccounts();
  const receivables = useReceivables();
  const create = useCreateReceivable();
  const confirm = useConfirm();
  const base = profile?.base_currency ?? "NGN";

  const moneyAccounts = useMemo(
    () => (accounts ?? []).filter((a) => a.type === "asset" && a.subtype && MONEY.has(a.subtype) && a.currency === base),
    [accounts, base],
  );

  const [who, setWho] = useState("");
  const [amount, setAmount] = useState("");
  const [fromId, setFromId] = useState("");
  const [lentDate, setLentDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (!who.trim()) throw new Error("Who did you lend to?");
      if (!fromId) throw new Error("Choose where the money came from.");
      const amountMinor = parseToMinor(amount, base);
      if (amountMinor <= 0n) throw new Error("Enter how much you lent.");
      const ok = await confirm({
        title: "Record this loan?",
        body: `You lent ${who.trim()} ${formatMoney(money(amountMinor, base))}.`,
        confirmLabel: "Record",
      });
      if (!ok) return;
      await create.mutateAsync({
        counterpartyName: who.trim(), currency: base, amountMinor, fundingAccountId: fromId,
        lentDate, dueDate: dueDate || undefined,
      });
      setWho(""); setAmount(""); setDueDate("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <>
      <PageHeader title="Owed to me" subtitle="Money other people owe you." />
      <div className="grid gap-6 md:grid-cols-[minmax(0,22rem)_1fr]">
        <form onSubmit={submit} className="rounded-2xl bg-surface p-6 shadow-sm ring-1 ring-ink/5">
          <p className="mb-4 text-sm uppercase tracking-wide text-ink/50">Record money you lent</p>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-ink/55">Who did you lend to?</label>
              <input className={field} placeholder="e.g. Tunde" value={who} onChange={(e) => setWho(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-ink/55">How much ({base})</label>
              <input className={field} inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-ink/55">From</label>
              <Select className={field} value={fromId} onChange={(e) => setFromId(e.target.value)}>
                <option value="">Choose an account</option>
                {moneyAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
              {moneyAccounts.length === 0 && <p className="mt-1 text-xs text-ink/45">Add a bank or cash account in Settings first.</p>}
            </div>
            <div>
              <label className="mb-1 block text-xs text-ink/55">When you lent it</label>
              <DateField value={lentDate} onChange={setLentDate} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-ink/55">Pay-back date (optional)</label>
              <DateField value={dueDate} onChange={setDueDate} placeholder="No date" clearable />
            </div>
            {error && <p className="text-sm text-loss">{error}</p>}
            <button type="submit" disabled={create.isPending} className="w-full rounded-lg bg-forest px-4 py-3 text-sm font-medium text-paper disabled:opacity-50">
              {create.isPending ? "Saving…" : "Add"}
            </button>
          </div>
        </form>

        <section>
          <p className="mb-3 text-sm uppercase tracking-wide text-ink/50">Who owes you</p>
          {(receivables.data?.receivables.length ?? 0) === 0 && <p className="text-ink/50">Nobody owes you right now.</p>}
          <ul className="space-y-2">
            {receivables.data?.receivables.map((r) => <ReceivableItem key={r.id} receivable={r} />)}
          </ul>
        </section>
      </div>
    </>
  );
}

function ReceivableItem({ receivable: r }: { receivable: ReceivableRow }) {
  const { data: accounts } = useUserAccounts();
  const payment = useReceivablePayment();
  const writeoff = useReceivableWriteoff();
  const confirm = useConfirm();
  const [repaying, setRepaying] = useState(false);
  const [fromId, setFromId] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const cur = r.currency;
  const active = r.status === "outstanding" || r.status === "partially_paid";

  const moneyAccounts = useMemo(
    () => (accounts ?? []).filter((a) => a.type === "asset" && a.subtype && MONEY.has(a.subtype) && a.currency === cur),
    [accounts, cur],
  );

  async function recordPayment() {
    setError(null);
    try {
      if (!fromId) throw new Error("Choose where the money went.");
      const amountMinor = parseToMinor(amount, cur);
      if (amountMinor <= 0n) throw new Error("Enter the amount.");
      if (amountMinor > BigInt(r.outstanding_minor)) throw new Error("That's more than they owe.");
      const ok = await confirm({
        title: "Record this repayment?",
        body: `${r.counterparty_name} paid back ${formatMoney(money(amountMinor, cur))}.`,
        confirmLabel: "Record",
      });
      if (!ok) return;
      await payment.mutateAsync({ receivable: r, cashAccountId: fromId, amountMinor, date: todayIso() });
      setRepaying(false); setAmount("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <li className="rounded-xl bg-surface px-4 py-3 ring-1 ring-ink/5">
      <div className="flex items-center justify-between text-sm">
        <div>
          <p className="font-medium">{r.counterparty_name}</p>
          <p className="text-xs text-ink/50">
            {STATUS_LABEL[r.status]}{r.due_date ? ` · due ${formatDate(r.due_date)}` : ""}
          </p>
        </div>
        <Money value={money(BigInt(r.outstanding_minor), cur)} tone={active ? "balance" : "loss"} />
      </div>

      {active && (repaying ? (
        <div className="mt-3 space-y-2">
          <Select className={field} value={fromId} onChange={(e) => setFromId(e.target.value)}>
            <option value="">Money went to…</option>
            {moneyAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
          <input className={field} inputMode="decimal" placeholder={`Amount (${cur})`} value={amount} onChange={(e) => setAmount(e.target.value)} />
          {error && <p className="text-sm text-loss">{error}</p>}
          <div className="flex gap-2">
            <button onClick={recordPayment} disabled={payment.isPending} className="rounded-lg bg-forest px-3 py-2 text-sm font-medium text-paper disabled:opacity-50">Save</button>
            <button onClick={() => setRepaying(false)} className="rounded-lg px-3 py-2 text-sm text-ink/55">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex gap-4">
          <button onClick={() => setRepaying(true)} className="text-xs text-brass hover:underline">Record a repayment</button>
          <button
            onClick={async () => {
              const ok = await confirm({
                title: "Write this off?",
                body: `This records the ${formatMoney(money(BigInt(r.outstanding_minor), cur))} ${r.counterparty_name} owes as a loss. It can't be undone without a correction.`,
                confirmLabel: "Write off",
                danger: true,
              });
              if (ok) writeoff.mutate({ receivable: r, date: todayIso() });
            }}
            className="text-xs text-loss hover:underline"
          >
            Write it off
          </button>
        </div>
      ))}
    </li>
  );
}
