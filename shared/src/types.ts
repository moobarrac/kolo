// Domain enumerations & types (§4, §7, Appendix B). Single source of truth —
// frontend and backend import these; neither redefines them.

export const ACCOUNT_TYPES = ["asset", "liability", "income", "expense", "equity"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

// system_tag — at most one of each per user (accounts.unique(user_id, system_tag)).
export const SYSTEM_TAGS = [
  "opening_balance_equity",
  "retained_earnings",
  "fx_translation_reserve",
  "asset_revaluation_reserve",
  "realized_fx",
  "bad_debt",
] as const;
export type SystemTag = (typeof SYSTEM_TAGS)[number];

export const ENTRY_KINDS = [
  "opening_balance",
  "income",
  "expense",
  "transfer",
  "fx_conversion",
  "asset_purchase",
  "asset_sale",
  "asset_revaluation",
  "fx_revaluation",
  "loan_drawdown",
  "loan_payment",
  "receivable_issue",
  "receivable_payment",
  "receivable_writeoff",
  "reversal",
  "adjustment",
] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

export const ENTRY_STATUSES = ["draft", "posted", "void"] as const;
export type EntryStatus = (typeof ENTRY_STATUSES)[number];

export const RECEIVABLE_STATUSES = [
  "outstanding",
  "partially_paid",
  "settled",
  "written_off",
] as const;
export type ReceivableStatus = (typeof RECEIVABLE_STATUSES)[number];

export const NOTIFICATION_TYPES = [
  "receivable_due",
  "receivable_overdue",
  "recurring_upcoming",
  "goal_off_track",
  "low_balance",
  "integrity_error",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const ASSET_CLASSES = [
  "real_estate",
  "land",
  "gold",
  "equities",
  "vehicle",
  "business",
  "crypto",
  "other",
] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

export const GOAL_TYPES = ["savings", "debt_payoff", "net_worth", "custom"] as const;
export type GoalType = (typeof GOAL_TYPES)[number];

// A journal line as the engine builds it. amount_minor is signed: + debit, - credit (§5.1).
export interface JournalLineInput {
  accountId: string;
  /** signed minor units in the line's own currency: + debit, - credit */
  amountMinor: bigint;
  currency: string;
  /** line currency -> base, on entry_date */
  fxRate: number;
  /** signed minor units in base currency */
  baseAmountMinor: bigint;
  memo?: string;
}

export interface JournalEntryInput {
  entryDate: string; // ISO date
  kind: EntryKind;
  description?: string;
  lines: JournalLineInput[];
}
