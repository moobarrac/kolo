import { Select } from "@/components/Select";
import { useState } from "react";
import { CURRENCIES } from "@kolo/shared";
import { useExchangeRates, useUpsertRate, useProfile } from "@/lib/data";
import { DateField } from "@/components/DateField";
import { todayIso } from "@/lib/dates";

const field = "w-full rounded-lg border border-ink/15 bg-surface px-3 py-2.5 text-sm outline-none focus:border-forest";

// Exchange rates (§6.5): the single place rates live. Used to translate foreign
// balances and to drive month-end revaluation. Rate = how much 1 unit of the
// foreign currency is worth in your main currency.
export function ExchangeRates() {
  const { data: profile } = useProfile();
  const rates = useExchangeRates();
  const upsert = useUpsertRate();
  const base = profile?.base_currency ?? "NGN";

  const [from, setFrom] = useState("USD");
  const [rate, setRate] = useState("");
  const [date, setDate] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const value = Number(rate);
    if (!value || value <= 0) { setError("Enter a rate greater than zero."); return; }
    try {
      await upsert.mutateAsync({ rateDate: date, from, to: base, rate: value });
      setRate("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  const others = Object.values(CURRENCIES).filter((c) => c.code !== base);

  return (
    <section className="mt-8">
      <p className="mb-3 text-sm uppercase tracking-wide text-ink/50">Exchange rates</p>
      <form onSubmit={submit} className="rounded-2xl bg-surface p-6 shadow-sm ring-1 ring-ink/5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs text-ink/55">Currency</label>
            <Select className={field} value={from} onChange={(e) => setFrom(e.target.value)}>
              {others.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
            </Select>
          </div>
          <div className="col-span-1">
            <label className="mb-1 block text-xs text-ink/55">1 {from} = ? {base}</label>
            <input className={field} inputMode="decimal" placeholder="0.00" value={rate} onChange={(e) => setRate(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink/55">On</label>
            <DateField value={date} onChange={setDate} />
          </div>
          <div className="flex items-end">
            <button type="submit" disabled={upsert.isPending} className="w-full rounded-lg bg-forest px-4 py-2.5 text-sm font-medium text-paper disabled:opacity-50">
              {upsert.isPending ? "Saving…" : "Save rate"}
            </button>
          </div>
        </div>
        {error && <p className="mt-2 text-sm text-loss">{error}</p>}
      </form>

      {(rates.data?.length ?? 0) > 0 && (
        <ul className="mt-3 space-y-1.5">
          {rates.data!.slice(0, 8).map((r) => (
            <li key={r.id} className="flex items-center justify-between rounded-lg bg-surface px-4 py-2 text-sm ring-1 ring-ink/5">
              <span className="text-ink/70">1 {r.from_currency} = {r.rate} {r.to_currency}</span>
              <span className="text-xs text-ink/45">{r.rate_date}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
