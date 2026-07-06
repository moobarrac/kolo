import { Select } from "@/components/Select";
import { useMemo, useState } from "react";
import { parseToMinor, money } from "@kolo/shared";
import { PageHeader } from "@/components/PageHeader";
import { Money } from "@/components/Money";
import { useGoals, useCreateGoal, useUserAccounts, useProfile, type GoalRow } from "@/lib/data";

const field = "w-full rounded-lg border border-ink/15 bg-surface px-3 py-2.5 text-sm outline-none focus:border-forest";

const TYPES: { value: GoalRow["type"]; label: string; needs: "asset" | "liability" | "none" }[] = [
  { value: "savings", label: "Save up to an amount", needs: "asset" },
  { value: "debt_payoff", label: "Pay off a debt", needs: "liability" },
  { value: "net_worth", label: "Grow my net worth", needs: "none" },
];

function progress(g: GoalRow): number {
  if (g.type === "debt_payoff") {
    const paid = g.baseline_minor - g.current_minor;
    return g.baseline_minor > 0 ? clamp(paid / g.baseline_minor) : g.current_minor <= 0 ? 1 : 0;
  }
  const span = g.target_minor - g.baseline_minor;
  return span > 0 ? clamp((g.current_minor - g.baseline_minor) / span) : 0;
}
const clamp = (n: number) => Math.max(0, Math.min(1, n));

export function GoalsPage() {
  const { data: profile } = useProfile();
  const { data: accounts } = useUserAccounts();
  const goals = useGoals();
  const create = useCreateGoal();
  const base = profile?.base_currency ?? "NGN";

  const [typeIdx, setTypeIdx] = useState(0);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [linkedId, setLinkedId] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  const type = TYPES[typeIdx]!;
  const linkOptions = useMemo(
    () => (accounts ?? []).filter((a) => (type.needs === "asset" ? a.type === "asset" : type.needs === "liability" ? a.type === "liability" : false)),
    [accounts, type.needs],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (!name.trim()) throw new Error("Give your goal a name.");
      const targetMinor = type.value === "debt_payoff" ? 0n : parseToMinor(target, base);
      if (type.value !== "debt_payoff" && targetMinor <= 0n) throw new Error("Enter a target amount.");
      if (type.needs !== "none" && !linkedId) throw new Error("Choose an account to track.");
      await create.mutateAsync({
        name: name.trim(), type: type.value, targetMinor, currency: base,
        targetDate: targetDate || undefined, linkedAccountId: type.needs !== "none" ? linkedId : undefined,
      });
      setName(""); setTarget(""); setTargetDate("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <>
      <PageHeader title="Goals" subtitle="What you're working towards." />
      <div className="grid gap-6 md:grid-cols-[minmax(0,22rem)_1fr]">
        <form onSubmit={submit} className="rounded-2xl bg-surface p-6 shadow-sm ring-1 ring-ink/5">
          <p className="mb-4 text-sm uppercase tracking-wide text-ink/50">Set a goal</p>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-ink/55">What kind?</label>
              <Select className={field} value={typeIdx} onChange={(e) => { setTypeIdx(Number(e.target.value)); setLinkedId(""); }}>
                {TYPES.map((t, i) => <option key={t.value} value={i}>{t.label}</option>)}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-ink/55">Name</label>
              <input className={field} placeholder="e.g. Emergency fund" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            {type.needs !== "none" && (
              <div>
                <label className="mb-1 block text-xs text-ink/55">{type.needs === "asset" ? "Track this account" : "Which debt"}</label>
                <Select className={field} value={linkedId} onChange={(e) => setLinkedId(e.target.value)}>
                  <option value="">Choose one</option>
                  {linkOptions.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </Select>
              </div>
            )}
            {type.value !== "debt_payoff" && (
              <div>
                <label className="mb-1 block text-xs text-ink/55">Target amount ({base})</label>
                <input className={field} inputMode="decimal" placeholder="0.00" value={target} onChange={(e) => setTarget(e.target.value)} />
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs text-ink/55">By when (optional)</label>
              <input type="date" className={field} value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
            </div>
            {error && <p className="text-sm text-loss">{error}</p>}
            <button type="submit" disabled={create.isPending} className="w-full rounded-lg bg-forest px-4 py-3 text-sm font-medium text-paper disabled:opacity-50">
              {create.isPending ? "Saving…" : "Set goal"}
            </button>
          </div>
        </form>

        <section>
          <p className="mb-3 text-sm uppercase tracking-wide text-ink/50">Your goals</p>
          {(goals.data?.goals.length ?? 0) === 0 && <p className="text-ink/50">No goals yet.</p>}
          <ul className="space-y-3">
            {goals.data?.goals.map((g) => {
              const pct = progress(g);
              const done = pct >= 1;
              return (
                <li key={g.id} className="rounded-xl bg-surface px-4 py-3 ring-1 ring-ink/5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{g.name}</span>
                    <span className="text-ink/55">
                      <Money value={money(BigInt(g.current_minor), base)} tone="balance" />
                      {g.type !== "debt_payoff" && <> {" / "} <Money value={money(BigInt(g.target_minor), base)} tone="balance" /></>}
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink/5">
                    <div className={done ? "h-full bg-gain" : "h-full bg-forest/60"} style={{ width: `${Math.round(pct * 100)}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-ink/45">
                    {done ? "Reached 🎉" : `${Math.round(pct * 100)}%`}{g.target_date ? ` · by ${g.target_date}` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </>
  );
}
