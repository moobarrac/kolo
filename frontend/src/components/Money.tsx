import { formatMoney, type Money as MoneyValue } from "@kolo/shared";

// The signature component (§13.3) [INVARIANT for UX].
// Every monetary figure in the app renders through this: monospaced, tabular,
// right-aligned, symbol in muted brass. Color encodes meaning, not decoration:
//   red = money leaving / unrealized loss · green = appreciation / inflow · gray = a balance.
type Tone = "balance" | "gain" | "loss" | "auto";

interface MoneyProps {
  value: MoneyValue;
  /** how to color it; "auto" = sign of the amount */
  tone?: Tone;
  className?: string;
}

function toneClass(tone: Tone, amountMinor: bigint): string {
  const resolved =
    tone === "auto" ? (amountMinor < 0n ? "loss" : amountMinor > 0n ? "gain" : "balance") : tone;
  switch (resolved) {
    case "gain":
      return "text-gain";
    case "loss":
      return "text-loss";
    default:
      return "text-ink/80";
  }
}

export function Money({ value, tone = "balance", className = "" }: MoneyProps) {
  return (
    <span
      className={`font-mono tabular tracking-tight ${toneClass(tone, value.amountMinor)} ${className}`}
    >
      {formatMoney(value)}
    </span>
  );
}
