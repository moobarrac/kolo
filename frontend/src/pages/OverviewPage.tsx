import { Link } from "react-router-dom";
import { money } from "@kolo/shared";
import { PageHeader } from "@/components/PageHeader";
import { Money } from "@/components/Money";
import { NetWorthBridge } from "@/components/NetWorthBridge";
import { NetWorthTimeline } from "@/components/NetWorthTimeline";
import { NotificationsFeed } from "@/components/NotificationsFeed";
import { Skeleton } from "@/components/Skeleton";
import { useOverview, useUserAccounts } from "@/lib/data";
import { currentMonth } from "@/lib/dates";

export function OverviewPage() {
  const month = currentMonth();
  const overview = useOverview(month.from, month.to);
  const accounts = useUserAccounts();

  const base = overview.data?.base ?? "NGN";
  const ov = overview.data?.overview;
  const hasAccounts = (accounts.data?.length ?? 0) > 0;

  return (
    <>
      <PageHeader title="Overview" subtitle="Everything you have, in one place." />

      <NotificationsFeed />

      {!accounts.isLoading && !hasAccounts && (
        <div className="mb-6 rounded-2xl border border-brass/30 bg-brass/5 p-6">
          <p className="font-medium text-ink">Let's set up your money</p>
          <p className="mt-1 text-sm text-ink/60">
            Add your bank accounts, cash, and savings with what's in them today.
          </p>
          <Link
            to="/settings"
            className="mt-4 inline-block rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper"
          >
            Get started
          </Link>
        </div>
      )}

      <section className="rounded-2xl bg-surface p-8 shadow-sm ring-1 ring-ink/5">
        <p className="text-sm uppercase tracking-wide text-ink/50">Net worth</p>
        <div className="mt-2 text-5xl">
          {overview.isLoading ? (
            <Skeleton className="h-12 w-64" />
          ) : (
            <Money value={money(BigInt(ov?.net_worth ?? 0), base)} tone="balance" />
          )}
        </div>
        {ov && (
          <div className="mt-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <Stat label="Cash" value={ov.cash} base={base} />
            <Stat label="Other things you own" value={ov.other_assets} base={base} />
            <Stat label="Owed to you" value={ov.receivables} base={base} />
            <Stat label="What you owe" value={ov.liabilities} base={base} tone="loss" />
          </div>
        )}
      </section>

      {ov && (
        <div className="mt-6">
          <NetWorthBridge bridge={ov.bridge} base={base} label={month.label} />
        </div>
      )}

      <NetWorthTimeline base={base} />
    </>
  );
}

function Stat({
  label,
  value,
  base,
  tone = "balance",
}: {
  label: string;
  value: number;
  base: string;
  tone?: "balance" | "loss";
}) {
  return (
    <div>
      <p className="text-ink/50">{label}</p>
      <Money value={money(BigInt(value), base)} tone={tone} />
    </div>
  );
}
