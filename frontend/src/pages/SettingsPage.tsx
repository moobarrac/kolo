import { Select } from "@/components/Select";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import {
  parseToMinor,
  buildOpeningBalanceLegs,
  CURRENCIES,
  type AccountType,
} from "@kolo/shared";
import { PageHeader } from "@/components/PageHeader";
import { ExchangeRates } from "@/components/ExchangeRates";
import { PeriodLocks } from "@/components/PeriodLocks";
import { LowBalanceAlerts } from "@/components/LowBalanceAlerts";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  useAccounts,
  useUserAccounts,
  useCreateAccount,
  useAddCommonCategories,
  usePostEntry,
  useProfile,
  type AccountRow,
} from "@/lib/data";

const MONEY_SUBS = new Set(["cash", "bank", "mobile_money"]);

const field = "w-full rounded-lg border border-ink/15 bg-surface px-3 py-2.5 text-sm outline-none focus:border-forest";

// What kind of account, in plain words → (type, subtype).
const ACCOUNT_KINDS: { label: string; type: AccountType; subtype?: string; opening: boolean }[] = [
  { label: "Bank account", type: "asset", subtype: "bank", opening: true },
  { label: "Cash", type: "asset", subtype: "cash", opening: true },
  { label: "Mobile money", type: "asset", subtype: "mobile_money", opening: true },
  { label: "Income source (e.g. salary)", type: "income", opening: false },
  { label: "Spending category (e.g. rent)", type: "expense", opening: false },
];

export function SettingsPage() {
  const { data: profile } = useProfile();
  const all = useAccounts();
  const { data: userAccounts } = useUserAccounts();
  const createAccount = useCreateAccount();
  const addCategories = useAddCommonCategories();
  const post = usePostEntry();
  const base = profile?.base_currency ?? "NGN";

  // Group accounts so real money accounts stay clear, with the long category
  // lists tucked into collapsible sections.
  const groups = useMemo(() => {
    const a = userAccounts ?? [];
    const isMoney = (x: AccountRow) => x.type === "asset" && !!x.subtype && MONEY_SUBS.has(x.subtype);
    return {
      money: a.filter(isMoney),
      owned: a.filter((x) => x.type === "asset" && !isMoney(x) && x.subtype !== "receivable"),
      receivable: a.filter((x) => x.type === "asset" && x.subtype === "receivable"),
      debt: a.filter((x) => x.type === "liability"),
      income: a.filter((x) => x.type === "income"),
      expense: a.filter((x) => x.type === "expense"),
    };
  }, [userAccounts]);

  const [kindIdx, setKindIdx] = useState(0);
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState(base);
  const [opening, setOpening] = useState("");
  const [rate, setRate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const kind = ACCOUNT_KINDS[kindIdx]!;
  const needsRate = currency !== base;
  const obeId = all.data?.find((a) => a.system_tag === "opening_balance_equity")?.id;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (!name.trim()) throw new Error("Give the account a name.");
      const id = await createAccount.mutateAsync({
        name: name.trim(),
        type: kind.type,
        subtype: kind.subtype,
        currency,
      });

      // Optional opening balance for asset accounts.
      if (kind.opening && opening.trim()) {
        const amountMinor = parseToMinor(opening, currency);
        if (amountMinor > 0n) {
          if (!obeId) throw new Error("Couldn't find your opening-balance account.");
          const fxRate = needsRate ? Number(rate) : 1;
          if (needsRate && (!fxRate || fxRate <= 0)) throw new Error("Enter the exchange rate.");
          const lines = buildOpeningBalanceLegs(
            [{ accountId: id, currency, amountMinor, fxRate, side: "asset" }],
            obeId,
            base,
          );
          await post.mutateAsync({
            kind: "opening_balance",
            entryDate: new Date().toISOString().slice(0, 10),
            description: "Opening balance",
            lines,
          });
        }
      }

      setName("");
      setOpening("");
      setRate("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Settings" subtitle="Your accounts and how money is set up." />

      <div className="grid gap-6 md:grid-cols-[minmax(0,22rem)_1fr]">
        <form onSubmit={submit} className="rounded-2xl bg-surface p-6 shadow-sm ring-1 ring-ink/5">
          <p className="mb-4 text-sm uppercase tracking-wide text-ink/50">Add an account</p>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-ink/55">What is it?</label>
              <Select className={field} value={kindIdx} onChange={(e) => setKindIdx(Number(e.target.value))}>
                {ACCOUNT_KINDS.map((k, i) => (
                  <option key={k.label} value={i}>{k.label}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-ink/55">Name</label>
              <input className={field} placeholder="e.g. GTBank" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-ink/55">Currency</label>
              <Select className={field} value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {Object.values(CURRENCIES).map((c) => (
                  <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                ))}
              </Select>
            </div>

            {kind.opening && (
              <>
                <div>
                  <label className="mb-1 block text-xs text-ink/55">How much is in it now? (optional)</label>
                  <input className={field} inputMode="decimal" placeholder="0.00" value={opening} onChange={(e) => setOpening(e.target.value)} />
                </div>
                {needsRate && opening.trim() && (
                  <div>
                    <label className="mb-1 block text-xs text-ink/55">Exchange rate (1 {currency} = ? {base})</label>
                    <input className={field} inputMode="decimal" placeholder="0.00" value={rate} onChange={(e) => setRate(e.target.value)} />
                  </div>
                )}
              </>
            )}

            {error && <p className="text-sm text-loss">{error}</p>}
            <button type="submit" disabled={saving} className="w-full rounded-lg bg-forest px-4 py-3 text-sm font-medium text-paper disabled:opacity-50">
              {saving ? "Saving…" : "Add account"}
            </button>
          </div>
        </form>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm uppercase tracking-wide text-ink/50">Your accounts</p>
            <button
              onClick={() => addCategories.mutate()}
              disabled={addCategories.isPending}
              className="rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-medium text-ink/70 hover:bg-ink/5 disabled:opacity-50"
            >
              {addCategories.isPending ? "Adding…" : "Add common categories"}
            </button>
          </div>
          {(userAccounts?.length ?? 0) === 0 && <p className="text-ink/50">No accounts yet. Add your first one.</p>}
          <div className="space-y-3">
            <AccountGroup title="Accounts" items={groups.money} defaultOpen />
            <AccountGroup title="Things you own" items={groups.owned} defaultOpen />
            <AccountGroup title="Owed to you" items={groups.receivable} defaultOpen />
            <AccountGroup title="Debts" items={groups.debt} defaultOpen />
            <AccountGroup title="Income sources" items={groups.income} />
            <AccountGroup title="Spending categories" items={groups.expense} />
          </div>
        </section>
      </div>

      <section className="mt-8">
        <p className="mb-3 text-sm uppercase tracking-wide text-ink/50">Import</p>
        <Link to="/import" className="flex items-center justify-between rounded-2xl bg-surface px-4 py-3 text-sm ring-1 ring-ink/5 hover:bg-ink/[0.02]">
          <span className="text-ink/80">Import a bank or card statement (CSV)</span>
          <span className="text-xs text-brass">Open →</span>
        </Link>
      </section>

      <section className="mt-8">
        <p className="mb-3 text-sm uppercase tracking-wide text-ink/50">Appearance</p>
        <ThemeToggle variant="full" />
      </section>

      <ExchangeRates />
      <LowBalanceAlerts />
      <PeriodLocks />
    </>
  );
}

// A collapsible group of accounts. Hidden entirely when empty.
function AccountGroup({ title, items, defaultOpen = false }: { title: string; items: AccountRow[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  if (items.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-ink/5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between bg-surface px-4 py-2.5 text-left"
      >
        <span className="text-sm font-medium text-ink/80">
          {title} <span className="text-ink/40">· {items.length}</span>
        </span>
        <ChevronDown size={16} className={`text-ink/40 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul className="divide-y divide-ink/5 border-t border-ink/5">
          {items.map((a) => (
            <li key={a.id} className="flex items-center justify-between bg-surface px-4 py-2.5 text-sm">
              <span className="text-ink/80">{a.name}</span>
              <span className="font-mono text-xs text-ink/40">{a.currency}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
