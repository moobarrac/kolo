import { Select } from "@/components/Select";
import { useMemo, useState } from "react";
import { money, parseToMinor } from "@kolo/shared";
import { PageHeader } from "@/components/PageHeader";
import { Money } from "@/components/Money";
import { DateField } from "@/components/DateField";
import { todayIso } from "@/lib/dates";
import {
  useUserAccounts,
  useReconcileLines,
  useClearedBalance,
  useAccountBalance,
  useToggleCleared,
  useReconciliations,
  useCompleteReconciliation,
  type AccountRow,
} from "@/lib/data";

const MONEY_SUBS = new Set(["cash", "bank", "mobile_money"]);
const field = "w-full rounded-lg border border-ink/15 bg-surface px-3 py-2.5 text-sm outline-none focus:border-forest";

// Reconciliation (§7.17). Tick off transactions against a real bank statement so
// you know the books match reality. Only the cleared/reconciled flags change — the
// underlying entries are never touched (0012 keeps posted lines append-only).
export function ReconcilePage() {
  const { data: accounts } = useUserAccounts();
  const reconcilable = useMemo(
    () => (accounts ?? []).filter(
      (a: AccountRow) =>
        a.type === "liability" || (a.type === "asset" && !!a.subtype && MONEY_SUBS.has(a.subtype)),
    ),
    [accounts],
  );

  const [accountId, setAccountId] = useState<string | null>(null);
  const [statementDate, setStatementDate] = useState(todayIso());
  const [statementBalance, setStatementBalance] = useState("");
  const [showCleared, setShowCleared] = useState(false);

  const account = reconcilable.find((a) => a.id === accountId) ?? reconcilable[0] ?? null;
  const currency = account?.currency ?? "NGN";
  const selectedId = account?.id ?? null;

  const lines = useReconcileLines(selectedId, statementDate, showCleared);
  const toggle = useToggleCleared();
  const history = useReconciliations(selectedId);
  const complete = useCompleteReconciliation();

  const clearedTotal = useClearedBalance(selectedId, statementDate).data ?? 0n;
  const bookTotal = useAccountBalance(selectedId, statementDate).data ?? 0n;

  let statementMinor: bigint | null = null;
  try {
    statementMinor = statementBalance.trim() ? parseToMinor(statementBalance, currency) : null;
  } catch {
    statementMinor = null;
  }
  const difference = statementMinor != null ? statementMinor - clearedTotal : null;
  const matched = difference === 0n;

  async function finish() {
    if (!account || statementMinor == null || !matched) return;
    await complete.mutateAsync({
      accountId: account.id,
      statementDate,
      statementBalanceMinor: statementMinor,
      reconciledBalanceMinor: clearedTotal,
    });
  }

  return (
    <>
      <PageHeader
        title="Statement check"
        subtitle="Tick off transactions against your bank statement to make sure everything lines up."
      />

      {reconcilable.length === 0 ? (
        <p className="text-ink/50">Add a bank, cash, or debt account first.</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-[minmax(0,20rem)_1fr]">
          <div className="space-y-4">
            <div className="rounded-2xl bg-surface p-6 shadow-sm ring-1 ring-ink/5">
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs text-ink/55">Which account?</label>
                  <Select className={field} value={selectedId ?? ""} onChange={(e) => setAccountId(e.target.value)}>
                    {reconcilable.map((a) => (
                      <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-ink/55">Statement date</label>
                  <DateField value={statementDate} onChange={setStatementDate} />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-ink/55">Balance on your statement</label>
                  <input
                    className={field}
                    inputMode="decimal"
                    placeholder="0.00"
                    value={statementBalance}
                    onChange={(e) => setStatementBalance(e.target.value)}
                  />
                </div>
              </div>

              <dl className="mt-5 space-y-2 border-t border-ink/5 pt-4 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-ink/55">Ticked off</dt>
                  <dd><Money value={money(clearedTotal, currency)} /></dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-ink/55">Your statement</dt>
                  <dd><Money value={money(statementMinor ?? 0n, currency)} /></dd>
                </div>
                <div className="flex items-center justify-between font-medium">
                  <dt className="text-ink/70">Difference</dt>
                  <dd><Money value={money(difference ?? -clearedTotal, currency)} tone={matched ? "balance" : "loss"} /></dd>
                </div>
              </dl>

              <button
                type="button"
                onClick={finish}
                disabled={!matched || statementMinor == null || complete.isPending}
                className="mt-4 w-full rounded-lg bg-forest px-4 py-3 text-sm font-medium text-paper disabled:opacity-50"
              >
                {complete.isPending ? "Saving…" : matched && statementMinor != null ? "Everything matches — save" : "Tick until the difference is zero"}
              </button>
              <p className="mt-2 text-xs text-ink/45">
                Book balance to this date: {" "}
                <Money value={money(bookTotal, currency)} className="text-xs" />
              </p>
            </div>

            {(history.data?.length ?? 0) > 0 && (
              <div>
                <p className="mb-2 text-xs uppercase tracking-wide text-ink/50">Past checks</p>
                <ul className="space-y-1.5">
                  {history.data!.map((r) => (
                    <li key={r.id} className="flex items-center justify-between rounded-lg bg-surface px-4 py-2 text-sm ring-1 ring-ink/5">
                      <span className="text-ink/70">{r.statement_date}</span>
                      <Money value={money(BigInt(r.statement_balance_minor), currency)} className="text-xs" />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm uppercase tracking-wide text-ink/50">
                {showCleared ? "All transactions" : "Still to tick"} up to {statementDate}
              </p>
              <button type="button" onClick={() => setShowCleared((v) => !v)} className="shrink-0 text-xs text-brass hover:underline">
                {showCleared ? "Hide ticked" : "Show ticked"}
              </button>
            </div>
            {lines.isLoading ? (
              <p className="text-ink/50">Loading…</p>
            ) : (lines.data?.length ?? 0) === 0 ? (
              <p className="text-ink/50">{showCleared ? "No transactions on this account yet." : "Nothing left to tick — everything's reconciled."}</p>
            ) : (
              <ul className="divide-y divide-ink/5 overflow-hidden rounded-2xl bg-surface ring-1 ring-ink/5">
                {lines.data!.map((l) => (
                  <li key={l.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-ink/[0.02]">
                      <input
                        type="checkbox"
                        checked={l.cleared}
                        disabled={toggle.isPending}
                        onChange={(e) => toggle.mutate({ lineId: l.id, cleared: e.target.checked })}
                        className="h-4 w-4 accent-forest"
                      />
                      <span className="flex-1 truncate text-sm text-ink/80">{l.description ?? "—"}</span>
                      <span className="text-xs text-ink/40">{l.entry_date}</span>
                      <Money value={money(BigInt(l.amount_minor), currency)} tone="auto" className="text-sm" />
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </>
  );
}
