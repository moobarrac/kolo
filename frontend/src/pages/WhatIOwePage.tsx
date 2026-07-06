import { Select } from "@/components/Select";
import { useMemo, useState } from "react";
import { parseToMinor, formatMoney, money } from "@kolo/shared";
import { PageHeader } from "@/components/PageHeader";
import { Money } from "@/components/Money";
import { useConfirm } from "@/components/Confirm";
import {
  useLiabilities,
  useCreateLiability,
  usePayLoan,
  useUserAccounts,
  useProfile,
  type LiabilityRow,
} from "@/lib/data";
import { todayIso } from "@/lib/dates";

const field = "w-full rounded-lg border border-ink/15 bg-surface px-3 py-2.5 text-sm outline-none focus:border-forest";
const MONEY = new Set(["cash", "bank", "mobile_money"]);

const TYPES: { value: string; label: string }[] = [
  { value: "loan", label: "Loan" },
  { value: "mortgage", label: "Mortgage" },
  { value: "credit_card", label: "Credit card" },
  { value: "personal", label: "Personal debt" },
  { value: "other", label: "Other" },
];
const typeLabel = (t: string) => TYPES.find((x) => x.value === t)?.label ?? t;

export function WhatIOwePage() {
  const { data: profile } = useProfile();
  const liabilities = useLiabilities();
  const create = useCreateLiability();
  const base = profile?.base_currency ?? "NGN";

  const [name, setName] = useState("");
  const [type, setType] = useState("loan");
  const [balance, setBalance] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (!name.trim()) throw new Error("Give it a name.");
      const balanceMinor = parseToMinor(balance, base);
      if (balanceMinor <= 0n) throw new Error("Enter how much you owe.");
      await create.mutateAsync({ name: name.trim(), type, currency: base, balanceMinor, date: todayIso() });
      setName(""); setBalance("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <>
      <PageHeader title="What I owe" subtitle="Loans and other debts." />
      <div className="grid gap-6 md:grid-cols-[minmax(0,22rem)_1fr]">
        <form onSubmit={submit} className="rounded-2xl bg-surface p-6 shadow-sm ring-1 ring-ink/5">
          <p className="mb-4 text-sm uppercase tracking-wide text-ink/50">Add a debt</p>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-ink/55">What kind?</label>
              <Select className={field} value={type} onChange={(e) => setType(e.target.value)}>
                {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-ink/55">Name</label>
              <input className={field} placeholder="e.g. Car loan" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-ink/55">How much you owe now ({base})</label>
              <input className={field} inputMode="decimal" placeholder="0.00" value={balance} onChange={(e) => setBalance(e.target.value)} />
            </div>
            {error && <p className="text-sm text-loss">{error}</p>}
            <button type="submit" disabled={create.isPending} className="w-full rounded-lg bg-forest px-4 py-3 text-sm font-medium text-paper disabled:opacity-50">
              {create.isPending ? "Saving…" : "Add"}
            </button>
          </div>
        </form>

        <section>
          <p className="mb-3 text-sm uppercase tracking-wide text-ink/50">Your debts</p>
          {(liabilities.data?.liabilities.length ?? 0) === 0 && <p className="text-ink/50">Nothing owed. 🎉</p>}
          <ul className="space-y-2">
            {liabilities.data?.liabilities.map((l) => <LiabilityItem key={l.id} liability={l} />)}
          </ul>
        </section>
      </div>
    </>
  );
}

function LiabilityItem({ liability }: { liability: LiabilityRow }) {
  const { data: accounts } = useUserAccounts();
  const pay = usePayLoan();
  const confirm = useConfirm();
  const [paying, setPaying] = useState(false);
  const [fromId, setFromId] = useState("");
  const [principal, setPrincipal] = useState("");
  const [interest, setInterest] = useState("");
  const [error, setError] = useState<string | null>(null);
  const cur = liability.currency;

  const moneyAccounts = useMemo(
    () => (accounts ?? []).filter((a) => a.type === "asset" && a.subtype && MONEY.has(a.subtype) && a.currency === cur),
    [accounts, cur],
  );

  async function submit() {
    setError(null);
    try {
      if (!fromId) throw new Error("Choose where the payment comes from.");
      const principalMinor = parseToMinor(principal || "0", cur);
      const interestMinor = parseToMinor(interest || "0", cur);
      if (principalMinor + interestMinor <= 0n) throw new Error("Enter a payment amount.");
      const ok = await confirm({
        title: "Make this payment?",
        body: `Pay ${formatMoney(money(principalMinor + interestMinor, cur))} towards ${liability.name}` +
          (interestMinor > 0n ? ` (incl. ${formatMoney(money(interestMinor, cur))} interest).` : "."),
        confirmLabel: "Pay",
      });
      if (!ok) return;
      await pay.mutateAsync({ loanAccountId: liability.account_id, cashAccountId: fromId, currency: cur, principalMinor, interestMinor, date: todayIso() });
      setPaying(false); setPrincipal(""); setInterest("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <li className="rounded-xl bg-surface px-4 py-3 ring-1 ring-ink/5">
      <div className="flex items-center justify-between text-sm">
        <div>
          <p className="font-medium">{liability.name}</p>
          <p className="text-xs text-ink/50">{typeLabel(liability.type)}</p>
        </div>
        <Money value={money(BigInt(liability.balance_minor), cur)} tone="loss" />
      </div>
      {paying ? (
        <div className="mt-3 space-y-2">
          <Select className={field} value={fromId} onChange={(e) => setFromId(e.target.value)}>
            <option value="">Pay from…</option>
            {moneyAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
          <input className={field} inputMode="decimal" placeholder={`Towards the debt (${cur})`} value={principal} onChange={(e) => setPrincipal(e.target.value)} />
          <input className={field} inputMode="decimal" placeholder={`Interest charged (${cur})`} value={interest} onChange={(e) => setInterest(e.target.value)} />
          {error && <p className="text-sm text-loss">{error}</p>}
          <div className="flex gap-2">
            <button onClick={submit} disabled={pay.isPending} className="rounded-lg bg-forest px-3 py-2 text-sm font-medium text-paper disabled:opacity-50">Save payment</button>
            <button onClick={() => setPaying(false)} className="rounded-lg px-3 py-2 text-sm text-ink/55">Cancel</button>
          </div>
        </div>
      ) : (
        Number(liability.balance_minor) > 0 && (
          <button onClick={() => setPaying(true)} className="mt-2 text-xs text-brass hover:underline">Make a payment</button>
        )
      )}
    </li>
  );
}
