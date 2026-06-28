// Entry-kind -> leg-pattern map (§8). [INVARIANT §2.5: single source of truth]
//
// This describes the shape of each entry: which roles its legs play and on which
// side (Dr = positive amount_minor, Cr = negative). The engine consumes this to
// write balanced legs; do not hand-roll leg signs elsewhere.

import type { EntryKind } from "./types.js";

export type Side = "debit" | "credit";

export interface LegSpec {
  /** human role of this leg, e.g. "expense", "cash/bank", "card_liability" */
  role: string;
  side: Side;
  /** the line side is fixed (e.g. expense is always debit) vs. resolved at runtime */
  fixed: boolean;
  notes?: string;
}

export interface LegPattern {
  kind: EntryKind;
  legs: LegSpec[];
  notes?: string;
}

export const LEG_PATTERNS: Record<EntryKind, LegPattern> = {
  opening_balance: {
    kind: "opening_balance",
    legs: [
      { role: "asset_or_liability", side: "debit", fixed: false, notes: "Dr asset / Cr liability" },
      { role: "opening_balance_equity", side: "credit", fixed: false, notes: "offset (base ccy)" },
    ],
    notes: "Each starting balance offsets to opening_balance_equity (§5.5).",
  },
  income: {
    kind: "income",
    legs: [
      { role: "cash_or_bank", side: "debit", fixed: true },
      { role: "income_account", side: "credit", fixed: true },
    ],
  },
  expense: {
    kind: "expense",
    legs: [
      { role: "expense_account", side: "debit", fixed: true },
      { role: "cash_bank_or_card_liability", side: "credit", fixed: true, notes: "cash, or credit-card liability if on card" },
    ],
    notes: "Credit-card purchase credits the card liability; paying the card later is a transfer (§5.3).",
  },
  transfer: {
    kind: "transfer",
    legs: [
      { role: "destination", side: "debit", fixed: false, notes: "card liability when paying a card" },
      { role: "source", side: "credit", fixed: false },
    ],
  },
  fx_conversion: {
    kind: "fx_conversion",
    legs: [
      { role: "destination_base_ccy", side: "debit", fixed: true },
      { role: "source_foreign_at_carried", side: "credit", fixed: true },
      { role: "realized_fx", side: "credit", fixed: false, notes: "residue: gain (Cr) or loss (Dr)" },
    ],
    notes: "Balanced in base; gap between transacted and carried rate -> realized FX (§6.3).",
  },
  asset_purchase: {
    kind: "asset_purchase",
    legs: [
      { role: "asset_account", side: "debit", fixed: true, notes: "at cost" },
      { role: "cash_bank_or_loan", side: "credit", fixed: false },
    ],
  },
  asset_sale: {
    kind: "asset_sale",
    legs: [
      { role: "cash", side: "debit", fixed: true },
      { role: "asset_account", side: "credit", fixed: true, notes: "at carrying value" },
      { role: "realized_gain_loss", side: "credit", fixed: false },
      { role: "reserve_release", side: "debit", fixed: false, notes: "release reserve for disposed portion (§6.4)" },
    ],
  },
  asset_revaluation: {
    kind: "asset_revaluation",
    legs: [
      { role: "asset_account", side: "debit", fixed: false, notes: "up = Dr, down = Cr" },
      { role: "asset_revaluation_reserve", side: "credit", fixed: false, notes: "equity, never income (§5.4)" },
    ],
  },
  fx_revaluation: {
    kind: "fx_revaluation",
    legs: [
      { role: "foreign_account", side: "debit", fixed: false, notes: "up = Dr, down = Cr" },
      { role: "fx_translation_reserve", side: "credit", fixed: false, notes: "equity, unrealized (§6.4)" },
    ],
  },
  loan_drawdown: {
    kind: "loan_drawdown",
    legs: [
      { role: "cash", side: "debit", fixed: true },
      { role: "loan_liability", side: "credit", fixed: true },
    ],
  },
  loan_payment: {
    kind: "loan_payment",
    legs: [
      { role: "loan_liability_principal", side: "debit", fixed: true },
      { role: "interest_expense", side: "debit", fixed: true },
      { role: "cash", side: "credit", fixed: true },
    ],
    notes: "Interest is expense; principal retires liability. Never expense principal (§5.3).",
  },
  receivable_issue: {
    kind: "receivable_issue",
    legs: [
      { role: "receivable_asset", side: "debit", fixed: true },
      { role: "cash_or_bank", side: "credit", fixed: true },
    ],
  },
  receivable_payment: {
    kind: "receivable_payment",
    legs: [
      { role: "cash_or_bank", side: "debit", fixed: true },
      { role: "receivable_asset", side: "credit", fixed: true },
    ],
    notes: "Asset->asset, NOT income. Only interest charged is income (§5.3).",
  },
  receivable_writeoff: {
    kind: "receivable_writeoff",
    legs: [
      { role: "bad_debt_expense", side: "debit", fixed: true },
      { role: "receivable_asset", side: "credit", fixed: true },
    ],
    notes: "Runs through bad_debt expense — must appear on the income statement (§5.3).",
  },
  reversal: {
    kind: "reversal",
    legs: [],
    notes: "Mirror of the referenced entry (reverses_entry_id set). Legs generated from the original.",
  },
  adjustment: {
    kind: "adjustment",
    legs: [],
    notes: "Arbitrary balanced legs (manual correction).",
  },
};
