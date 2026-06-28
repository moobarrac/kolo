// Zod schemas for runtime validation at the client/engine boundary. Mirrors §7.
// bigint columns are validated as bigint; dates as ISO strings.

import { z } from "zod";
import {
  ACCOUNT_TYPES,
  ENTRY_KINDS,
  ENTRY_STATUSES,
  RECEIVABLE_STATUSES,
  ASSET_CLASSES,
  GOAL_TYPES,
  SYSTEM_TAGS,
} from "./types.js";

const currencyCode = z.string().length(3).toUpperCase();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const accountSchema = z.object({
  name: z.string().min(1),
  type: z.enum(ACCOUNT_TYPES),
  subtype: z.string().optional(),
  currency: currencyCode,
  parentId: z.string().uuid().nullable().optional(),
  systemTag: z.enum(SYSTEM_TAGS).nullable().optional(),
});
export type AccountInput = z.infer<typeof accountSchema>;

export const journalLineSchema = z.object({
  accountId: z.string().uuid(),
  amountMinor: z.bigint(),
  currency: currencyCode,
  fxRate: z.number().positive(),
  baseAmountMinor: z.bigint(),
  memo: z.string().optional(),
});

export const journalEntrySchema = z
  .object({
    entryDate: isoDate,
    kind: z.enum(ENTRY_KINDS),
    status: z.enum(ENTRY_STATUSES).default("posted"),
    description: z.string().optional(),
    lines: z.array(journalLineSchema).min(2),
  })
  .refine(
    (e) =>
      e.status !== "posted" ||
      e.lines.reduce((s, l) => s + l.baseAmountMinor, 0n) === 0n,
    { message: "posted entry must balance: Σ base_amount_minor = 0 (§4.2)" },
  );
export type JournalEntryInputParsed = z.infer<typeof journalEntrySchema>;

export const receivableSchema = z.object({
  counterpartyName: z.string().optional(),
  contactId: z.string().uuid().nullable().optional(),
  principalMinor: z.bigint().positive(),
  currency: currencyCode,
  interestRate: z.number().min(0).default(0),
  lentDate: isoDate,
  dueDate: isoDate.nullable().optional(),
  status: z.enum(RECEIVABLE_STATUSES).default("outstanding"),
  notes: z.string().optional(),
});

export const assetSchema = z.object({
  name: z.string().min(1),
  assetClass: z.enum(ASSET_CLASSES),
  purchaseDate: isoDate.optional(),
  purchasePriceMinor: z.bigint().optional(),
  purchaseCurrency: currencyCode.optional(),
  quantity: z.number().optional(),
  unit: z.string().optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
});

export const goalSchema = z.object({
  name: z.string().min(1),
  type: z.enum(GOAL_TYPES),
  targetMinor: z.bigint().positive(),
  currency: currencyCode,
  targetDate: isoDate.nullable().optional(),
  linkedAccountId: z.string().uuid().nullable().optional(),
  baselineMinor: z.bigint().default(0n),
});
