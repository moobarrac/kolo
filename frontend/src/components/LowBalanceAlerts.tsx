import { useState } from "react";
import { Bell } from "lucide-react";
import { parseToMinor, formatMinor, money } from "@kolo/shared";
import { Money } from "@/components/Money";
import { useUserAccounts, useSetLowBalanceAlert, useAccountBalance, type AccountRow } from "@/lib/data";

const MONEY_SUBS = new Set(["cash", "bank", "mobile_money"]);
// Fixed-width amount input (no w-full, so the account name keeps its space).
const numField = "w-28 shrink-0 rounded-lg border border-ink/15 bg-surface px-3 py-2 text-sm outline-none focus:border-forest";

// Low-balance alerts (§12.3). Set a floor per spendable account; the daily job
// warns once a month if the balance drops under it. Left blank, you're only
// warned if the account goes below zero.
export function LowBalanceAlerts() {
  const { data: accounts } = useUserAccounts();
  const money = (accounts ?? []).filter(
    (a: AccountRow) => a.type === "asset" && !!a.subtype && MONEY_SUBS.has(a.subtype),
  );
  if (money.length === 0) return null;

  return (
    <section className="mt-8">
      <p className="mb-3 flex items-center gap-2 text-sm uppercase tracking-wide text-ink/50">
        <Bell size={14} strokeWidth={1.75} /> Low-balance alerts
      </p>
      <div className="rounded-2xl bg-surface p-6 shadow-sm ring-1 ring-ink/5">
        <p className="mb-4 text-sm text-ink/55">
          Get a heads-up when an account runs low. Leave it blank to only be warned if it goes below zero.
        </p>
        <ul className="space-y-3">
          {money.map((a) => <AlertRow key={a.id} account={a} />)}
        </ul>
      </div>
    </section>
  );
}

function AlertRow({ account }: { account: AccountRow }) {
  const save = useSetLowBalanceAlert();
  const { data: balance } = useAccountBalance(account.id);
  const stored = account.metadata?.low_balance_minor;
  const initial = stored != null ? formatMinor(BigInt(stored as number | string), account.currency) : "";
  const [value, setValue] = useState(initial);
  const dirty = value.trim() !== initial;

  async function submit() {
    const threshold = value.trim() ? parseToMinor(value, account.currency) : null;
    await save.mutateAsync({ accountId: account.id, thresholdMinor: threshold });
    setValue(threshold != null ? formatMinor(threshold, account.currency) : "");
  }

  return (
    <li className="flex items-center gap-3">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-ink/80">{account.name}</span>
        <span className="text-xs text-ink/45">
          {balance != null ? <>Now: <Money value={money(balance, account.currency)} className="text-xs" /></> : "…"}
        </span>
      </span>
      <input
        className={numField}
        inputMode="decimal"
        placeholder="0.00"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button
        type="button"
        onClick={submit}
        disabled={!dirty || save.isPending}
        className="rounded-lg border border-ink/15 px-3 py-2 text-xs font-medium text-ink/70 hover:bg-ink/5 disabled:opacity-40"
      >
        Save
      </button>
    </li>
  );
}
