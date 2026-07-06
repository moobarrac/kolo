import { Select } from "@/components/Select";
import { useMemo, useState } from "react";
import { parseToMinor, formatMoney, money } from "@kolo/shared";
import { useUserAccounts, useProfile, useConvertCurrency } from "@/lib/data";
import { useConfirm } from "@/components/Confirm";
import { todayIso } from "@/lib/dates";

const field = "w-full rounded-lg border border-ink/15 bg-surface px-3 py-2.5 text-sm outline-none focus:border-forest";
const MONEY = new Set(["cash", "bank", "mobile_money"]);

// Currency conversion (§6.3): sell foreign currency for your main currency. The
// app records the realized gain or loss automatically.
export function ConvertForm() {
  const { data: profile } = useProfile();
  const { data: accounts } = useUserAccounts();
  const convert = useConvertCurrency();
  const confirm = useConfirm();
  const base = profile?.base_currency ?? "NGN";

  const foreign = useMemo(
    () => (accounts ?? []).filter((a) => a.type === "asset" && a.currency !== base && a.subtype && MONEY.has(a.subtype)),
    [accounts, base],
  );
  const baseAccounts = useMemo(
    () => (accounts ?? []).filter((a) => a.type === "asset" && a.currency === base && a.subtype && MONEY.has(a.subtype)),
    [accounts, base],
  );

  const [sourceId, setSourceId] = useState("");
  const [destId, setDestId] = useState("");
  const [sold, setSold] = useState("");
  const [proceeds, setProceeds] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (foreign.length === 0) return null; // nothing to convert

  const source = foreign.find((a) => a.id === sourceId);
  const sourceCur = source?.currency ?? "USD";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (!sourceId || !destId) throw new Error("Choose both accounts.");
      const soldMinor = parseToMinor(sold, sourceCur);
      const proceedsMinor = parseToMinor(proceeds, base);
      if (soldMinor <= 0n || proceedsMinor <= 0n) throw new Error("Enter both amounts.");
      const ok = await confirm({
        title: "Convert this?",
        body: `Sell ${formatMoney(money(soldMinor, sourceCur))} for ${formatMoney(money(proceedsMinor, base))}.`,
        confirmLabel: "Convert",
      });
      if (!ok) return;
      await convert.mutateAsync({
        sourceAccountId: sourceId, sourceCurrency: sourceCur, soldMinor,
        destAccountId: destId, proceedsMinor, baseCurrency: base, date: todayIso(),
      });
      setSold(""); setProceeds("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl bg-surface p-6 shadow-sm ring-1 ring-ink/5">
      <p className="mb-4 text-sm uppercase tracking-wide text-ink/50">Convert currency</p>
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs text-ink/55">Sell from</label>
          <Select className={field} value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
            <option value="">Choose a foreign account</option>
            {foreign.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-ink/55">Amount to sell ({sourceCur})</label>
          <input className={field} inputMode="decimal" placeholder="0.00" value={sold} onChange={(e) => setSold(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-ink/55">Money received into</label>
          <Select className={field} value={destId} onChange={(e) => setDestId(e.target.value)}>
            <option value="">Choose an account</option>
            {baseAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-ink/55">What you got ({base})</label>
          <input className={field} inputMode="decimal" placeholder="0.00" value={proceeds} onChange={(e) => setProceeds(e.target.value)} />
        </div>
        {error && <p className="text-sm text-loss">{error}</p>}
        <button type="submit" disabled={convert.isPending} className="w-full rounded-lg bg-forest px-4 py-3 text-sm font-medium text-paper disabled:opacity-50">
          {convert.isPending ? "Saving…" : "Convert"}
        </button>
      </div>
    </form>
  );
}
