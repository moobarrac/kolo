// Posting engine (§4–5, §8). Turns a friendly action into balanced journal legs.
// The UI never types debits/credits; these builders write both. amount_minor is
// signed: + debit, - credit (§5.1). base_amount_minor is the line translated to
// base currency at the line's fx_rate.

import { minorUnitDigits } from "./currencies.js";
import type { EntryKind, JournalLineInput } from "./types.js";

const RATE_SCALE = 100_000_000n; // fx_rate is numeric(20,8)

/** Round a bigint division half-away-from-zero. */
function roundDiv(num: bigint, denom: bigint): bigint {
  const neg = num < 0n !== denom < 0n;
  const a = num < 0n ? -num : num;
  const b = denom < 0n ? -denom : denom;
  const q = a / b;
  const r = a % b;
  const rounded = r * 2n >= b ? q + 1n : q;
  return neg ? -rounded : rounded;
}

/**
 * Translate a signed minor-unit amount in `lineCurrency` to base minor units at
 * `rate` (units of base per 1 unit of line currency). Handles currencies whose
 * minor-unit scales differ (e.g. JPY 0 vs NGN 2).
 */
export function toBaseMinor(
  amountMinor: bigint,
  rate: number,
  lineCurrency: string,
  baseCurrency: string,
): bigint {
  const rateScaled = BigInt(Math.round(rate * 1e8));
  let num = amountMinor * rateScaled;
  let denom = RATE_SCALE;
  const diff = minorUnitDigits(baseCurrency) - minorUnitDigits(lineCurrency);
  if (diff >= 0) num *= 10n ** BigInt(diff);
  else denom *= 10n ** BigInt(-diff);
  return roundDiv(num, denom);
}

/** One leg with its base amount computed from the rate. */
export function leg(
  accountId: string,
  currency: string,
  signedAmountMinor: bigint,
  fxRate: number,
  baseCurrency: string,
  memo?: string,
): JournalLineInput {
  return {
    accountId,
    amountMinor: signedAmountMinor,
    currency,
    fxRate,
    baseAmountMinor: toBaseMinor(signedAmountMinor, fxRate, currency, baseCurrency),
    memo,
  };
}

// ── Leg builders for the Phase-1 entry kinds (§8) ────────────────────────────

export interface SimpleEntryInput {
  /** the money account touched (bank/cash) */
  cashAccountId: string;
  /** the income or expense category account */
  categoryAccountId: string;
  /** account currency (both legs share it for a single-currency entry) */
  currency: string;
  amountMinor: bigint;
  /** line currency -> base on the entry date (1 when currency === base) */
  fxRate: number;
  baseCurrency: string;
}

/** Income: Dr cash/bank · Cr income account. */
export function buildIncomeLegs(i: SimpleEntryInput): JournalLineInput[] {
  return [
    leg(i.cashAccountId, i.currency, i.amountMinor, i.fxRate, i.baseCurrency),
    leg(i.categoryAccountId, i.currency, -i.amountMinor, i.fxRate, i.baseCurrency),
  ];
}

/** Expense: Dr expense account · Cr cash/bank (or card liability). */
export function buildExpenseLegs(i: SimpleEntryInput): JournalLineInput[] {
  return [
    leg(i.categoryAccountId, i.currency, i.amountMinor, i.fxRate, i.baseCurrency),
    leg(i.cashAccountId, i.currency, -i.amountMinor, i.fxRate, i.baseCurrency),
  ];
}

export interface TransferInput {
  fromAccountId: string;
  toAccountId: string;
  currency: string;
  amountMinor: bigint;
  fxRate: number;
  baseCurrency: string;
}

/** Same-currency transfer: Dr destination · Cr source. */
export function buildTransferLegs(t: TransferInput): JournalLineInput[] {
  return [
    leg(t.toAccountId, t.currency, t.amountMinor, t.fxRate, t.baseCurrency),
    leg(t.fromAccountId, t.currency, -t.amountMinor, t.fxRate, t.baseCurrency),
  ];
}

export interface OpeningBalanceLine {
  accountId: string;
  currency: string;
  /** native amount (positive); assets are debits, liabilities are credits */
  amountMinor: bigint;
  /** rate to base on the opening date */
  fxRate: number;
  /** 'asset' debits the account; 'liability' credits it */
  side: "asset" | "liability";
}

/**
 * Opening balances (§5.5): each starting balance debits the asset (or credits
 * the liability) and offsets to Opening Balance Equity, denominated in base.
 * Returns one entry's lines: the asset/liability legs plus the single balancing
 * OBE leg (so the entry is balanced in base by construction).
 */
export function buildOpeningBalanceLegs(
  lines: OpeningBalanceLine[],
  obeAccountId: string,
  baseCurrency: string,
): JournalLineInput[] {
  const legs: JournalLineInput[] = [];
  let obeBase = 0n;
  for (const l of lines) {
    const signed = l.side === "asset" ? l.amountMinor : -l.amountMinor;
    const built = leg(l.accountId, l.currency, signed, l.fxRate, baseCurrency);
    legs.push(built);
    obeBase += built.baseAmountMinor;
  }
  // OBE leg balances the entry in base (credit if assets exceed liabilities).
  legs.push(leg(obeAccountId, baseCurrency, -obeBase, 1, baseCurrency));
  return legs;
}

export interface AssetPurchaseInput {
  assetAccountId: string;
  fundingAccountId: string; // cash/bank/loan
  currency: string;
  costMinor: bigint;
  fxRate: number;
  baseCurrency: string;
}

/** Asset purchase (§8): Dr asset account (cost) · Cr cash/bank/loan. */
export function buildAssetPurchaseLegs(i: AssetPurchaseInput): JournalLineInput[] {
  return [
    leg(i.assetAccountId, i.currency, i.costMinor, i.fxRate, i.baseCurrency),
    leg(i.fundingAccountId, i.currency, -i.costMinor, i.fxRate, i.baseCurrency),
  ];
}

export interface AssetRevaluationInput {
  assetAccountId: string;
  reserveAccountId: string; // asset_revaluation_reserve (equity)
  /** signed native change to carrying value: market value − current carried balance */
  deltaMinor: bigint;
  currency: string;
  fxRate: number;
  baseCurrency: string;
}

/**
 * Asset revaluation (§5.4): move the asset account to market value, offsetting
 * to the asset_revaluation_reserve (equity) — NEVER income. Unrealized gains are
 * not earnings. Works in both directions (a write-down debits the reserve).
 */
export function buildAssetRevaluationLegs(i: AssetRevaluationInput): JournalLineInput[] {
  const assetLeg = leg(i.assetAccountId, i.currency, i.deltaMinor, i.fxRate, i.baseCurrency);
  const reserveLeg = leg(i.reserveAccountId, i.baseCurrency, -assetLeg.baseAmountMinor, 1, i.baseCurrency);
  return [assetLeg, reserveLeg];
}

export interface LoanDrawdownInput {
  cashAccountId: string;
  loanAccountId: string;
  currency: string;
  amountMinor: bigint;
  fxRate: number;
  baseCurrency: string;
}

/** Loan drawdown (§8): Dr cash · Cr loan liability. */
export function buildLoanDrawdownLegs(i: LoanDrawdownInput): JournalLineInput[] {
  return [
    leg(i.cashAccountId, i.currency, i.amountMinor, i.fxRate, i.baseCurrency),
    leg(i.loanAccountId, i.currency, -i.amountMinor, i.fxRate, i.baseCurrency),
  ];
}

export interface LoanPaymentInput {
  loanAccountId: string;
  interestExpenseAccountId: string;
  cashAccountId: string;
  currency: string;
  /** the part that retires the debt */
  principalMinor: bigint;
  /** the part that is an expense */
  interestMinor: bigint;
  fxRate: number;
  baseCurrency: string;
}

/**
 * Loan payment (§5.3): Dr loan liability (principal) · Dr interest expense · Cr
 * cash. The principal retires the liability; ONLY the interest is an expense.
 * Never expense the principal.
 */
export function buildLoanPaymentLegs(i: LoanPaymentInput): JournalLineInput[] {
  const total = i.principalMinor + i.interestMinor;
  return [
    leg(i.loanAccountId, i.currency, i.principalMinor, i.fxRate, i.baseCurrency),
    leg(i.interestExpenseAccountId, i.currency, i.interestMinor, i.fxRate, i.baseCurrency),
    leg(i.cashAccountId, i.currency, -total, i.fxRate, i.baseCurrency),
  ];
}

export interface ReceivableIssueInput {
  receivableAccountId: string;
  fundingAccountId: string; // cash/bank the money left from
  currency: string;
  amountMinor: bigint;
  fxRate: number;
  baseCurrency: string;
}

/** Lending money (§8 receivable_issue): Dr receivable asset · Cr cash/bank. */
export function buildReceivableIssueLegs(i: ReceivableIssueInput): JournalLineInput[] {
  return [
    leg(i.receivableAccountId, i.currency, i.amountMinor, i.fxRate, i.baseCurrency),
    leg(i.fundingAccountId, i.currency, -i.amountMinor, i.fxRate, i.baseCurrency),
  ];
}

export interface ReceivablePaymentInput {
  receivableAccountId: string;
  cashAccountId: string;
  currency: string;
  amountMinor: bigint;
  fxRate: number;
  baseCurrency: string;
}

/**
 * Getting paid back (§5.3 receivable_payment): Dr cash · Cr receivable asset.
 * This is asset→asset, NOT income — only interest charged would be income.
 */
export function buildReceivablePaymentLegs(i: ReceivablePaymentInput): JournalLineInput[] {
  return [
    leg(i.cashAccountId, i.currency, i.amountMinor, i.fxRate, i.baseCurrency),
    leg(i.receivableAccountId, i.currency, -i.amountMinor, i.fxRate, i.baseCurrency),
  ];
}

export interface ReceivableWriteoffInput {
  receivableAccountId: string;
  badDebtAccountId: string; // bad_debt expense (system account)
  currency: string;
  amountMinor: bigint; // the outstanding amount being written off
  fxRate: number;
  baseCurrency: string;
}

/**
 * Writing off a bad debt (§5.3): Dr bad_debt expense · Cr receivable asset.
 * It must hit the income statement — never silently vanish from net worth.
 */
export function buildReceivableWriteoffLegs(i: ReceivableWriteoffInput): JournalLineInput[] {
  return [
    leg(i.badDebtAccountId, i.currency, i.amountMinor, i.fxRate, i.baseCurrency),
    leg(i.receivableAccountId, i.currency, -i.amountMinor, i.fxRate, i.baseCurrency),
  ];
}

export interface FxConversionInput {
  /** destination (base-currency) account receiving the proceeds */
  destAccountId: string;
  /** proceeds in base minor units */
  proceedsMinor: bigint;
  /** the foreign account being sold from */
  sourceAccountId: string;
  sourceCurrency: string;
  /** native foreign units sold (positive) */
  soldMinor: bigint;
  /** the source account's CURRENT carried state (from the ledger) */
  sourceNativeBalanceMinor: bigint;
  sourceBaseBalanceMinor: bigint;
  realizedFxAccountId: string;
  baseCurrency: string;
}

/**
 * Currency conversion / realized FX (§6.3). Sell foreign for base; the gap
 * between the transacted proceeds and the carried book value of the units sold
 * is recognized as realized FX (income). Carried-rate method (§6.4): the disposed
 * units leave at the account's carried rate (a proportional slice of carried base).
 *   Dr destination (base, proceeds)
 *   Cr source (foreign, at carried base)
 *   Cr/Dr realized_fx (the residue)
 */
export function buildFxConversionLegs(i: FxConversionInput): JournalLineInput[] {
  const baseRemoved = roundDiv(i.sourceBaseBalanceMinor * i.soldMinor, i.sourceNativeBalanceMinor);
  const carriedRate = Number(i.sourceBaseBalanceMinor) / Number(i.sourceNativeBalanceMinor);
  const realizedBase = i.proceedsMinor - baseRemoved; // gain if positive
  return [
    leg(i.destAccountId, i.baseCurrency, i.proceedsMinor, 1, i.baseCurrency),
    {
      accountId: i.sourceAccountId,
      amountMinor: -i.soldMinor,
      currency: i.sourceCurrency,
      fxRate: carriedRate,
      baseAmountMinor: -baseRemoved,
    },
    leg(i.realizedFxAccountId, i.baseCurrency, -realizedBase, 1, i.baseCurrency),
  ];
}

export interface FxRevaluationInput {
  foreignAccountId: string;
  foreignCurrency: string;
  reserveAccountId: string; // fx_translation_reserve (equity)
  /** signed base-currency change: native × closingRate − current carried base */
  deltaBaseMinor: bigint;
  closingRate: number;
  baseCurrency: string;
}

/**
 * Period-end FX revaluation (§6.4). Retranslate a foreign monetary account to the
 * closing rate; the delta posts to fx_translation_reserve (equity, unrealized).
 * The native balance is unchanged — only the base carrying value moves.
 */
export function buildFxRevaluationLegs(i: FxRevaluationInput): JournalLineInput[] {
  return [
    {
      accountId: i.foreignAccountId,
      amountMinor: 0n,
      currency: i.foreignCurrency,
      fxRate: i.closingRate,
      baseAmountMinor: i.deltaBaseMinor,
    },
    leg(i.reserveAccountId, i.baseCurrency, -i.deltaBaseMinor, 1, i.baseCurrency),
  ];
}

/** Serialize lines for the post_entry RPC (snake_case, bigints as strings). */
export function toRpcLines(lines: JournalLineInput[]) {
  return lines.map((l, idx) => ({
    line_no: idx + 1,
    account_id: l.accountId,
    amount_minor: l.amountMinor.toString(),
    currency: l.currency,
    fx_rate: l.fxRate,
    base_amount_minor: l.baseAmountMinor.toString(),
    memo: l.memo ?? null,
  }));
}

export interface PostEntryArgs {
  kind: EntryKind;
  entryDate: string;
  description?: string;
  lines: JournalLineInput[];
}
