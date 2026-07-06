import { useState } from "react";
import { Lock } from "lucide-react";
import { usePeriodLocks, useLockPeriod, useUnlockPeriod } from "@/lib/data";
import { DateField } from "@/components/DateField";

// Period locking (§5.6, §10.5). Once a period is locked, the database rejects any
// posting dated inside it — "my net worth on 31 Dec was X" stays true forever.
export function PeriodLocks() {
  const locks = usePeriodLocks();
  const lock = useLockPeriod();
  const unlock = useUnlockPeriod();
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!start || !end) { setError("Choose a start and end date."); return; }
    if (end < start) { setError("The end date must be after the start."); return; }
    try {
      await lock.mutateAsync({ start, end });
      setStart(""); setEnd("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <section className="mt-8">
      <p className="mb-3 flex items-center gap-2 text-sm uppercase tracking-wide text-ink/50">
        <Lock size={14} strokeWidth={1.75} /> Lock the books
      </p>
      <form onSubmit={submit} className="rounded-2xl bg-surface p-6 shadow-sm ring-1 ring-ink/5">
        <p className="mb-3 text-sm text-ink/55">
          Lock a finished period so nothing dated inside it can change later.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs text-ink/55">From</label>
            <DateField value={start} onChange={setStart} placeholder="Start date" clearable />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink/55">To</label>
            <DateField value={end} onChange={setEnd} placeholder="End date" clearable />
          </div>
          <div className="flex items-end">
            <button type="submit" disabled={lock.isPending} className="w-full rounded-lg bg-forest px-4 py-2.5 text-sm font-medium text-paper disabled:opacity-50">
              {lock.isPending ? "Locking…" : "Lock"}
            </button>
          </div>
        </div>
        {error && <p className="mt-2 text-sm text-loss">{error}</p>}
      </form>

      {(locks.data?.length ?? 0) > 0 && (
        <ul className="mt-3 space-y-1.5">
          {locks.data!.map((l) => (
            <li key={l.id} className="flex items-center justify-between rounded-lg bg-surface px-4 py-2 text-sm ring-1 ring-ink/5">
              <span className="text-ink/70">{l.period_start} → {l.period_end}</span>
              <button onClick={() => unlock.mutate(l.id)} className="text-xs text-brass hover:underline">Unlock</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
