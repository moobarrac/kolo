import { money } from "@kolo/shared";
import { Money } from "./Money";
import type { OverviewData } from "@/lib/data";

// The net-worth bridge (§13.4): what changed your wealth this period, and why —
// earning/spending vs. the markets and the currency moving. Plain English.
export function NetWorthBridge({
  bridge,
  base,
  label,
}: {
  bridge: OverviewData["bridge"];
  base: string;
  label: string;
}) {
  const rows: { label: string; value: number; kind: "start" | "change" | "end" }[] = [
    { label: "You started with", value: bridge.opening_net_worth, kind: "start" },
    { label: "Earned minus spent", value: bridge.net_income, kind: "change" },
    { label: "Currency changes", value: bridge.fx_revaluation, kind: "change" },
    { label: "Value changes", value: bridge.asset_revaluation, kind: "change" },
    { label: "Money added or taken out", value: bridge.capital_events, kind: "change" },
    { label: "You now have", value: bridge.closing_net_worth, kind: "end" },
  ];

  return (
    <section className="rounded-2xl bg-surface p-8 shadow-sm ring-1 ring-ink/5">
      <p className="text-sm uppercase tracking-wide text-ink/50">What changed in {label}</p>
      <ul className="mt-4 divide-y divide-ink/5">
        {rows.map((r) => {
          const hide = r.kind === "change" && r.value === 0;
          if (hide) return null;
          return (
            <li key={r.label} className="flex items-center justify-between py-2.5 text-sm">
              <span className={r.kind === "end" ? "font-medium" : "text-ink/70"}>{r.label}</span>
              <Money
                value={money(BigInt(r.value), base)}
                tone={r.kind === "change" ? "auto" : "balance"}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
