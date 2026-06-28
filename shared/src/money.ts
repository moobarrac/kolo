// Money [INVARIANT §3]
//
// All monetary amounts are integers in minor units (bigint), never floats.
// ₦1,000.00 -> 100000n. A monetary value is meaningless without its currency,
// so the two always travel together.

import { minorUnitDigits, currencySymbol } from "./currencies.js";

export interface Money {
  /** signed integer minor units */
  amountMinor: bigint;
  /** ISO-4217 code */
  currency: string;
}

export function money(amountMinor: bigint | number, currency: string): Money {
  return { amountMinor: BigInt(amountMinor), currency };
}

export const zero = (currency: string): Money => ({ amountMinor: 0n, currency });

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new Error(`currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amountMinor: a.amountMinor + b.amountMinor, currency: a.currency };
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amountMinor: a.amountMinor - b.amountMinor, currency: a.currency };
}

export function negate(a: Money): Money {
  return { amountMinor: -a.amountMinor, currency: a.currency };
}

export const isZero = (a: Money): boolean => a.amountMinor === 0n;
export const isNegative = (a: Money): boolean => a.amountMinor < 0n;
export const isPositive = (a: Money): boolean => a.amountMinor > 0n;

/**
 * Convert a human decimal string (e.g. "1000.50") into minor units for a currency.
 * Display/parse is a frontend concern (§3); storage is always integer minor units.
 */
export function parseToMinor(input: string, currency: string): bigint {
  const digits = minorUnitDigits(currency);
  const trimmed = input.trim().replace(/,/g, "");
  const neg = trimmed.startsWith("-");
  const unsigned = neg ? trimmed.slice(1) : trimmed;
  const [whole = "0", frac = ""] = unsigned.split(".");
  if (frac.length > digits) {
    throw new Error(`${currency} supports at most ${digits} fractional digits`);
  }
  const paddedFrac = frac.padEnd(digits, "0");
  const combined = `${whole}${paddedFrac}`.replace(/^0+(?=\d)/, "");
  const value = BigInt(combined || "0");
  return neg ? -value : value;
}

/** Format minor units to a plain decimal string (no symbol, no grouping). */
export function formatMinor(amountMinor: bigint, currency: string): string {
  const digits = minorUnitDigits(currency);
  const neg = amountMinor < 0n;
  const abs = neg ? -amountMinor : amountMinor;
  const s = abs.toString().padStart(digits + 1, "0");
  const whole = s.slice(0, s.length - digits) || "0";
  const frac = digits > 0 ? "." + s.slice(s.length - digits) : "";
  return `${neg ? "-" : ""}${whole}${frac}`;
}

/** Format with grouping + currency symbol, e.g. "₦1,000.50". */
export function formatMoney(m: Money, opts: { withSymbol?: boolean } = {}): string {
  const { withSymbol = true } = opts;
  const plain = formatMinor(m.amountMinor, m.currency);
  const neg = plain.startsWith("-");
  const unsigned = neg ? plain.slice(1) : plain;
  const [whole = "0", frac] = unsigned.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = `${grouped}${frac ? "." + frac : ""}`;
  const symbol = withSymbol ? currencySymbol(m.currency) : "";
  return `${neg ? "-" : ""}${symbol}${body}`;
}
