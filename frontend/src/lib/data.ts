import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  toRpcLines,
  buildIncomeLegs,
  buildExpenseLegs,
  buildAssetPurchaseLegs,
  buildAssetRevaluationLegs,
  buildOpeningBalanceLegs,
  buildLoanPaymentLegs,
  buildReceivableIssueLegs,
  buildReceivablePaymentLegs,
  buildReceivableWriteoffLegs,
  buildFxConversionLegs,
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_SOURCES,
  type JournalLineInput,
  type EntryKind,
  type AccountType,
  type AssetClass,
  type Frequency,
  type RecurringTemplate,
} from "@kolo/shared";
import { supabase } from "./supabase";
import { useAuth } from "./auth";
import { todayIso } from "./dates";
import { toast } from "./toast";

async function systemAccountId(tag: string): Promise<string> {
  const { data, error } = await supabase.from("accounts").select("id").eq("system_tag", tag).single();
  if (error) throw error;
  return data.id as string;
}

// Data layer for Phase 1: accounts, profile, posting entries, the overview, and
// recent transactions — all over the RLS-protected tables and the SQL engine
// (post_entry / fn_overview from migration 0005).

export interface AccountRow {
  id: string;
  name: string;
  type: AccountType;
  subtype: string | null;
  currency: string;
  system_tag: string | null;
  metadata: Record<string, unknown>;
}

export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("base_currency, display_name")
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useAccounts() {
  return useQuery({
    queryKey: ["accounts"],
    queryFn: async (): Promise<AccountRow[]> => {
      const { data, error } = await supabase
        .from("accounts")
        .select("id, name, type, subtype, currency, system_tag, metadata")
        .eq("is_archived", false)
        .order("type")
        .order("name");
      if (error) throw error;
      return data as AccountRow[];
    },
  });
}

/** Accounts a person creates (hides the system accounts that run the ledger). */
export function useUserAccounts() {
  const q = useAccounts();
  return { ...q, data: q.data?.filter((a) => !a.system_tag) };
}

export function useCreateAccount() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      type: AccountType;
      subtype?: string;
      currency: string;
    }): Promise<string> => {
      const { data, error } = await supabase
        .from("accounts")
        .insert({ ...input, user_id: session!.user.id })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["accounts"] }); toast.success("Account added"); },
  });
}

// One-tap setup for existing users: add any missing default categories/sources.
export function useAddCommonCategories() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (): Promise<number> => {
      const userId = session!.user.id;
      const { data: prof } = await supabase.from("profiles").select("base_currency").single();
      const base = prof?.base_currency ?? "NGN";
      const { data: existing, error } = await supabase
        .from("accounts").select("name, type").in("type", ["expense", "income"]);
      if (error) throw error;
      const have = new Set((existing ?? []).map((a) => `${a.type}:${a.name}`));
      const rows: { user_id: string; name: string; type: string; currency: string }[] = [];
      for (const c of DEFAULT_EXPENSE_CATEGORIES)
        if (!have.has(`expense:${c}`)) rows.push({ user_id: userId, name: c, type: "expense", currency: base });
      for (const c of DEFAULT_INCOME_SOURCES)
        if (!have.has(`income:${c}`)) rows.push({ user_id: userId, name: c, type: "income", currency: base });
      if (rows.length) {
        const { error: insErr } = await supabase.from("accounts").insert(rows);
        if (insErr) throw insErr;
      }
      return rows.length;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      toast.success(n > 0 ? `Added ${n} categories` : "You already have these");
    },
  });
}

export function usePostEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      kind: EntryKind;
      entryDate: string;
      description?: string;
      lines: JournalLineInput[];
    }) => {
      const { data, error } = await supabase.rpc("post_entry", {
        p_kind: args.kind,
        p_entry_date: args.entryDate,
        p_description: args.description ?? null,
        p_lines: toRpcLines(args.lines),
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["overview"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["cashflow"] });
      toast.success("Saved");
    },
  });
}

export interface OverviewData {
  net_worth: number;
  cash: number;
  receivables: number;
  other_assets: number;
  liabilities: number;
  bridge: {
    opening_net_worth: number;
    net_income: number;
    asset_revaluation: number;
    fx_revaluation: number;
    capital_events: number;
    closing_net_worth: number;
  };
}

export function useOverview(from: string, to: string) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const { data: profile } = useProfile();
  return useQuery({
    queryKey: ["overview", from, to, userId],
    queryFn: async (): Promise<{ overview: OverviewData; base: string }> => {
      const { data, error } = await supabase.rpc("fn_overview", { p_user: userId!, p_from: from, p_to: to });
      if (error) throw error;
      return { overview: data as OverviewData, base: profile?.base_currency ?? "NGN" };
    },
    enabled: !!userId && !!profile,
  });
}

export interface TransactionRow {
  id: string;
  entry_date: string;
  description: string | null;
  kind: string;
  journal_lines: {
    amount_minor: number;
    currency: string;
    accounts: { name: string; type: string } | null;
  }[];
}

export interface CashFlowCategory {
  id: string;
  name: string;
  total: number;
}
export interface CashFlowData {
  income_total: number;
  expense_total: number;
  income_categories: CashFlowCategory[];
  expense_categories: CashFlowCategory[];
}

export function useCashFlow(from: string, to: string) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const { data: profile } = useProfile();
  return useQuery({
    queryKey: ["cashflow", from, to, userId],
    queryFn: async (): Promise<{ flow: CashFlowData; base: string }> => {
      const { data, error } = await supabase.rpc("fn_cash_flow", { p_user: userId!, p_from: from, p_to: to });
      if (error) throw error;
      return { flow: data as CashFlowData, base: profile?.base_currency ?? "NGN" };
    },
    enabled: !!userId && !!profile,
  });
}

export interface RecurringRuleRow {
  id: string;
  name: string;
  frequency: Frequency;
  interval: number;
  next_run: string;
  auto_post: boolean;
  is_active: boolean;
  template: RecurringTemplate;
}

export function useRecurringRules() {
  return useQuery({
    queryKey: ["recurring"],
    queryFn: async (): Promise<RecurringRuleRow[]> => {
      const { data, error } = await supabase
        .from("recurring_rules")
        .select("id, name, frequency, interval, next_run, auto_post, is_active, template")
        .order("next_run");
      if (error) throw error;
      return data as RecurringRuleRow[];
    },
  });
}

export function useCreateRecurringRule() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      kind: EntryKind;
      description?: string;
      lines: JournalLineInput[];
      frequency: Frequency;
      interval: number;
      dayOfMonth?: number;
      startDate: string;
      autoPost: boolean;
    }) => {
      const template: RecurringTemplate = {
        kind: input.kind,
        description: input.description,
        lines: toRpcLines(input.lines),
      };
      const { error } = await supabase.from("recurring_rules").insert({
        user_id: session!.user.id,
        name: input.name,
        template,
        frequency: input.frequency,
        interval: input.interval,
        day_of_month: input.dayOfMonth ?? null,
        start_date: input.startDate,
        next_run: input.startDate,
        auto_post: input.autoPost,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["recurring"] }); toast.success("Recurring set up"); },
  });
}

// ── Assets (§7.7, Phase 3) ───────────────────────────────────────────────────
export interface AssetRow {
  id: string;
  account_id: string;
  name: string;
  asset_class: AssetClass;
  currency: string | null;
  quantity: number | null;
  unit: string | null;
  purchase_price_minor: number | null;
  current_value_minor: number;
}

export function useAssets() {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: ["assets", userId],
    queryFn: async (): Promise<{ assets: AssetRow[]; base: string }> => {
      const { data, error } = await supabase.rpc("fn_assets", { p_user: userId!, p_as_of: todayIso() });
      if (error) throw error;
      const { data: prof } = await supabase.from("profiles").select("base_currency").single();
      return { assets: data as AssetRow[], base: prof?.base_currency ?? "NGN" };
    },
    enabled: !!userId,
  });
}

export function useCreateAsset() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      assetClass: AssetClass;
      currency: string;
      costMinor: bigint;
      fundingAccountId: string;
      purchaseDate: string;
      fxRate: number;
      quantity?: number;
      unit?: string;
    }) => {
      const userId = session!.user.id;
      const { data: acct, error: aErr } = await supabase
        .from("accounts")
        .insert({ user_id: userId, name: input.name, type: "asset", subtype: input.assetClass, currency: input.currency })
        .select("id").single();
      if (aErr) throw aErr;
      const { error: insErr } = await supabase.from("assets").insert({
        user_id: userId, account_id: acct.id, name: input.name, asset_class: input.assetClass,
        purchase_date: input.purchaseDate, purchase_price_minor: Number(input.costMinor),
        purchase_currency: input.currency, quantity: input.quantity ?? null, unit: input.unit ?? null,
      });
      if (insErr) throw insErr;
      const lines = buildAssetPurchaseLegs({
        assetAccountId: acct.id, fundingAccountId: input.fundingAccountId, currency: input.currency,
        costMinor: input.costMinor, fxRate: input.fxRate, baseCurrency: input.currency,
      });
      const { error: pErr } = await supabase.rpc("post_entry", {
        p_kind: "asset_purchase", p_entry_date: input.purchaseDate, p_description: `Bought ${input.name}`,
        p_lines: toRpcLines(lines),
      });
      if (pErr) throw pErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["overview"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      toast.success("Added");
    },
  });
}

export function useRevalueAsset() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (input: { assetId: string; accountId: string; currency: string; newValueMinor: bigint; asOfDate: string }) => {
      const reserveId = await systemAccountId("asset_revaluation_reserve");
      const base = (await supabase.from("profiles").select("base_currency").single()).data?.base_currency ?? "NGN";
      const { data: carried, error: bErr } = await supabase.rpc("fn_account_balance", { p_account: input.accountId, p_as_of: input.asOfDate });
      if (bErr) throw bErr;
      const delta = input.newValueMinor - BigInt(carried ?? 0);
      if (delta === 0n) return;
      const lines = buildAssetRevaluationLegs({
        assetAccountId: input.accountId, reserveAccountId: reserveId, deltaMinor: delta,
        currency: input.currency, fxRate: 1, baseCurrency: base,
      });
      const { data: entryId, error: pErr } = await supabase.rpc("post_entry", {
        p_kind: "asset_revaluation", p_entry_date: input.asOfDate, p_description: "Updated value", p_lines: toRpcLines(lines),
      });
      if (pErr) throw pErr;
      await supabase.from("asset_valuations").insert({
        user_id: session!.user.id, asset_id: input.assetId, as_of_date: input.asOfDate,
        value_minor: Number(input.newValueMinor), currency: input.currency, valuation_entry_id: entryId,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["overview"] });
      toast.success("Value updated");
    },
  });
}

// ── Liabilities (§7.9, Phase 3) ──────────────────────────────────────────────
export interface LiabilityRow {
  id: string;
  account_id: string;
  name: string;
  type: string;
  currency: string;
  interest_rate: number | null;
  balance_minor: number;
}

export function useLiabilities() {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: ["liabilities", userId],
    queryFn: async (): Promise<{ liabilities: LiabilityRow[]; base: string }> => {
      const { data, error } = await supabase.rpc("fn_liabilities", { p_user: userId!, p_as_of: todayIso() });
      if (error) throw error;
      const { data: prof } = await supabase.from("profiles").select("base_currency").single();
      return { liabilities: data as LiabilityRow[], base: prof?.base_currency ?? "NGN" };
    },
    enabled: !!userId,
  });
}

export function useCreateLiability() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (input: { name: string; type: string; currency: string; balanceMinor: bigint; interestRate?: number; date: string }) => {
      const userId = session!.user.id;
      const obe = await systemAccountId("opening_balance_equity");
      const { data: acct, error: aErr } = await supabase
        .from("accounts")
        .insert({ user_id: userId, name: input.name, type: "liability", subtype: input.type, currency: input.currency })
        .select("id").single();
      if (aErr) throw aErr;
      const { error: insErr } = await supabase.from("liabilities").insert({
        user_id: userId, account_id: acct.id, name: input.name, type: input.type, currency: input.currency,
        original_principal_minor: Number(input.balanceMinor), interest_rate: input.interestRate ?? null,
      });
      if (insErr) throw insErr;
      // Record the current balance owed as an opening balance (Cr liability · Dr OBE).
      const lines = buildOpeningBalanceLegs(
        [{ accountId: acct.id, currency: input.currency, amountMinor: input.balanceMinor, fxRate: 1, side: "liability" }],
        obe, input.currency,
      );
      const { error: pErr } = await supabase.rpc("post_entry", {
        p_kind: "opening_balance", p_entry_date: input.date, p_description: `${input.name} balance`, p_lines: toRpcLines(lines),
      });
      if (pErr) throw pErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["liabilities"] });
      qc.invalidateQueries({ queryKey: ["overview"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      toast.success("Debt added");
    },
  });
}

export function usePayLoan() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (input: { loanAccountId: string; cashAccountId: string; currency: string; principalMinor: bigint; interestMinor: bigint; date: string }) => {
      const userId = session!.user.id;
      // Find or create a "Loan interest" expense account in this currency.
      let interestId: string;
      const { data: existing } = await supabase
        .from("accounts").select("id").eq("type", "expense").eq("name", "Loan interest").eq("currency", input.currency).maybeSingle();
      if (existing) interestId = existing.id;
      else {
        const { data: made, error } = await supabase
          .from("accounts").insert({ user_id: userId, name: "Loan interest", type: "expense", currency: input.currency })
          .select("id").single();
        if (error) throw error;
        interestId = made.id;
      }
      const lines = buildLoanPaymentLegs({
        loanAccountId: input.loanAccountId, interestExpenseAccountId: interestId, cashAccountId: input.cashAccountId,
        currency: input.currency, principalMinor: input.principalMinor, interestMinor: input.interestMinor, fxRate: 1, baseCurrency: input.currency,
      });
      const { error: pErr } = await supabase.rpc("post_entry", {
        p_kind: "loan_payment", p_entry_date: input.date, p_description: "Loan payment", p_lines: toRpcLines(lines),
      });
      if (pErr) throw pErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["liabilities"] });
      qc.invalidateQueries({ queryKey: ["overview"] });
      qc.invalidateQueries({ queryKey: ["cashflow"] });
      toast.success("Payment saved");
    },
  });
}

// ── Receivables (§7.11, Phase 4) ─────────────────────────────────────────────
export interface ReceivableRow {
  id: string;
  account_id: string;
  counterparty_name: string | null;
  principal_minor: number;
  currency: string;
  lent_date: string;
  due_date: string | null;
  status: "outstanding" | "partially_paid" | "settled" | "written_off";
  outstanding_minor: number;
}

export function useReceivables() {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: ["receivables", userId],
    queryFn: async (): Promise<{ receivables: ReceivableRow[]; base: string }> => {
      const { data, error } = await supabase.rpc("fn_receivables", { p_user: userId!, p_as_of: todayIso() });
      if (error) throw error;
      const { data: prof } = await supabase.from("profiles").select("base_currency").single();
      return { receivables: data as ReceivableRow[], base: prof?.base_currency ?? "NGN" };
    },
    enabled: !!userId,
  });
}

export function useCreateReceivable() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      counterpartyName: string;
      currency: string;
      amountMinor: bigint;
      fundingAccountId: string;
      lentDate: string;
      dueDate?: string;
    }) => {
      const userId = session!.user.id;
      const { data: acct, error: aErr } = await supabase
        .from("accounts")
        .insert({ user_id: userId, name: `Owed by ${input.counterpartyName}`, type: "asset", subtype: "receivable", currency: input.currency })
        .select("id").single();
      if (aErr) throw aErr;
      const { error: insErr } = await supabase.from("receivables").insert({
        user_id: userId, account_id: acct.id, counterparty_name: input.counterpartyName,
        principal_minor: Number(input.amountMinor), currency: input.currency,
        lent_date: input.lentDate, due_date: input.dueDate ?? null,
      });
      if (insErr) throw insErr;
      const lines = buildReceivableIssueLegs({
        receivableAccountId: acct.id, fundingAccountId: input.fundingAccountId, currency: input.currency,
        amountMinor: input.amountMinor, fxRate: 1, baseCurrency: input.currency,
      });
      const { error: pErr } = await supabase.rpc("post_entry", {
        p_kind: "receivable_issue", p_entry_date: input.lentDate, p_description: `Lent ${input.counterpartyName}`, p_lines: toRpcLines(lines),
      });
      if (pErr) throw pErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["receivables"] });
      qc.invalidateQueries({ queryKey: ["overview"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      toast.success("Loan recorded");
    },
  });
}

async function refreshReceivableStatus(receivableId: string, accountId: string) {
  const { data: bal } = await supabase.rpc("fn_account_balance", { p_account: accountId, p_as_of: todayIso() });
  const status = Number(bal ?? 0) <= 0 ? "settled" : "partially_paid";
  await supabase.from("receivables").update({ status }).eq("id", receivableId);
}

export function useReceivablePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { receivable: ReceivableRow; cashAccountId: string; amountMinor: bigint; date: string }) => {
      const r = input.receivable;
      const lines = buildReceivablePaymentLegs({
        receivableAccountId: r.account_id, cashAccountId: input.cashAccountId, currency: r.currency,
        amountMinor: input.amountMinor, fxRate: 1, baseCurrency: r.currency,
      });
      const { error } = await supabase.rpc("post_entry", {
        p_kind: "receivable_payment", p_entry_date: input.date, p_description: `${r.counterparty_name} repaid`, p_lines: toRpcLines(lines),
      });
      if (error) throw error;
      await refreshReceivableStatus(r.id, r.account_id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["receivables"] });
      qc.invalidateQueries({ queryKey: ["overview"] });
      toast.success("Repayment recorded");
    },
  });
}

export function useReceivableWriteoff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { receivable: ReceivableRow; date: string }) => {
      const r = input.receivable;
      if (r.outstanding_minor <= 0) return;
      const badDebt = await systemAccountId("bad_debt");
      const lines = buildReceivableWriteoffLegs({
        receivableAccountId: r.account_id, badDebtAccountId: badDebt, currency: r.currency,
        amountMinor: BigInt(r.outstanding_minor), fxRate: 1, baseCurrency: r.currency,
      });
      const { error } = await supabase.rpc("post_entry", {
        p_kind: "receivable_writeoff", p_entry_date: input.date, p_description: `Wrote off ${r.counterparty_name}`, p_lines: toRpcLines(lines),
      });
      if (error) throw error;
      await supabase.from("receivables").update({ status: "written_off" }).eq("id", r.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["receivables"] });
      qc.invalidateQueries({ queryKey: ["overview"] });
      qc.invalidateQueries({ queryKey: ["cashflow"] });
      toast.success("Written off");
    },
  });
}

// ── Notifications (§7.16, Phase 4) ───────────────────────────────────────────
export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  severity: "info" | "warning" | "critical";
  status: "unread" | "read" | "dismissed";
  created_at: string;
}

export function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: async (): Promise<NotificationRow[]> => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, type, title, body, severity, status, created_at")
        .neq("status", "dismissed")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as NotificationRow[];
    },
  });
}

export function useDismissNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notifications").update({ status: "dismissed" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useDismissAllNotifications() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("notifications").update({ status: "dismissed" }).neq("status", "dismissed");
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

// ── Exchange rates & conversion (§6, Phase 5) ────────────────────────────────
export interface RateRow {
  id: string;
  rate_date: string;
  from_currency: string;
  to_currency: string;
  rate: number;
}

export function useExchangeRates() {
  return useQuery({
    queryKey: ["rates"],
    queryFn: async (): Promise<RateRow[]> => {
      const { data, error } = await supabase
        .from("exchange_rates")
        .select("id, rate_date, from_currency, to_currency, rate")
        .order("rate_date", { ascending: false });
      if (error) throw error;
      return data as RateRow[];
    },
  });
}

export function useUpsertRate() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (input: { rateDate: string; from: string; to: string; rate: number }) => {
      const { error } = await supabase.from("exchange_rates").upsert(
        {
          user_id: session!.user.id,
          rate_date: input.rateDate,
          from_currency: input.from,
          to_currency: input.to,
          rate: input.rate,
          source: "manual",
        },
        { onConflict: "user_id,rate_date,from_currency,to_currency" },
      );
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["rates"] }); toast.success("Rate saved"); },
  });
}

export function useConvertCurrency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      sourceAccountId: string;
      sourceCurrency: string;
      soldMinor: bigint;
      destAccountId: string;
      proceedsMinor: bigint;
      baseCurrency: string;
      date: string;
    }) => {
      const realizedFx = await systemAccountId("realized_fx");
      const { data: nat } = await supabase.rpc("fn_account_balance", { p_account: input.sourceAccountId, p_as_of: input.date });
      const { data: bas } = await supabase.rpc("fn_account_base_balance", { p_account: input.sourceAccountId, p_as_of: input.date });
      const lines = buildFxConversionLegs({
        destAccountId: input.destAccountId, proceedsMinor: input.proceedsMinor,
        sourceAccountId: input.sourceAccountId, sourceCurrency: input.sourceCurrency, soldMinor: input.soldMinor,
        sourceNativeBalanceMinor: BigInt(nat ?? 0), sourceBaseBalanceMinor: BigInt(bas ?? 0),
        realizedFxAccountId: realizedFx, baseCurrency: input.baseCurrency,
      });
      const { error } = await supabase.rpc("post_entry", {
        p_kind: "fx_conversion", p_entry_date: input.date, p_description: "Currency conversion", p_lines: toRpcLines(lines),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["overview"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      toast.success("Converted");
    },
  });
}

// ── Goals (§7.13, Phase 6) ───────────────────────────────────────────────────
export interface GoalRow {
  id: string;
  name: string;
  type: "savings" | "debt_payoff" | "net_worth" | "custom";
  target_minor: number;
  baseline_minor: number;
  currency: string;
  target_date: string | null;
  status: "active" | "achieved" | "abandoned";
  current_minor: number;
}

export function useGoals() {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: ["goals", userId],
    queryFn: async (): Promise<{ goals: GoalRow[]; base: string }> => {
      const { data, error } = await supabase.rpc("fn_goals", { p_user: userId!, p_as_of: todayIso() });
      if (error) throw error;
      const { data: prof } = await supabase.from("profiles").select("base_currency").single();
      return { goals: data as GoalRow[], base: prof?.base_currency ?? "NGN" };
    },
    enabled: !!userId,
  });
}

export function useCreateGoal() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      type: GoalRow["type"];
      targetMinor: bigint;
      currency: string;
      targetDate?: string;
      linkedAccountId?: string;
      baselineMinor?: bigint;
    }) => {
      // For a debt payoff, the baseline is what's owed today, so progress can
      // measure how much has been paid down since.
      let baseline = input.baselineMinor ?? 0n;
      if (input.type === "debt_payoff" && input.linkedAccountId) {
        const { data: bal } = await supabase.rpc("fn_account_balance", { p_account: input.linkedAccountId, p_as_of: todayIso() });
        baseline = BigInt(-(Number(bal) || 0));
      }
      const { error } = await supabase.from("goals").insert({
        user_id: session!.user.id, name: input.name, type: input.type,
        target_minor: Number(input.targetMinor), currency: input.currency,
        target_date: input.targetDate ?? null, linked_account_id: input.linkedAccountId ?? null,
        baseline_minor: Number(baseline),
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["goals"] }); toast.success("Goal set"); },
  });
}

// ── Period locks (§5.6, §10.5, Phase 6) ──────────────────────────────────────
export interface PeriodLock {
  id: string;
  period_start: string;
  period_end: string;
  note: string | null;
}

export function usePeriodLocks() {
  return useQuery({
    queryKey: ["locks"],
    queryFn: async (): Promise<PeriodLock[]> => {
      const { data, error } = await supabase
        .from("period_locks").select("id, period_start, period_end, note").order("period_end", { ascending: false });
      if (error) throw error;
      return data as PeriodLock[];
    },
  });
}

export function useLockPeriod() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (input: { start: string; end: string; note?: string }) => {
      const { error } = await supabase.from("period_locks").insert({
        user_id: session!.user.id, period_start: input.start, period_end: input.end, note: input.note ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["locks"] }); toast.success("Period locked"); },
  });
}

export function useUnlockPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("period_locks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["locks"] }); toast.success("Unlocked"); },
  });
}

// ── Reports (§13.5, Phase 6) ─────────────────────────────────────────────────
export interface AllocationSlice { class: string; total: number }

export function useAssetAllocation() {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: ["allocation", userId],
    enabled: !!userId,
    queryFn: async (): Promise<{ slices: AllocationSlice[]; base: string }> => {
      const { data, error } = await supabase.rpc("fn_asset_allocation", { p_user: userId!, p_as_of: todayIso() });
      if (error) throw error;
      const { data: prof } = await supabase.from("profiles").select("base_currency").single();
      return { slices: data as AllocationSlice[], base: prof?.base_currency ?? "NGN" };
    },
  });
}

export interface MonthlyFlow { month: string; income: number; expense: number }

export function useMonthlyFlow(from: string, to: string) {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: ["monthlyflow", from, to, userId],
    enabled: !!userId,
    queryFn: async (): Promise<MonthlyFlow[]> => {
      const { data, error } = await supabase.rpc("fn_monthly_flow", { p_user: userId!, p_from: from, p_to: to });
      if (error) throw error;
      return data as MonthlyFlow[];
    },
  });
}

export function useNetWorthTimeline() {
  return useQuery({
    queryKey: ["timeline"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("net_worth_snapshots")
        .select("as_of_date, net_worth_minor, base_currency")
        .order("as_of_date");
      if (error) throw error;
      return data;
    },
  });
}

export interface TransactionFilters {
  kinds?: string[];   // restrict to these entry kinds
  from?: string;      // ISO date (inclusive)
  to?: string;        // ISO date (inclusive)
  search?: string;    // matches the description
  limit?: number;
}

export function useTransactions(filters: TransactionFilters = {}) {
  const { kinds, from, to, search, limit = 50 } = filters;
  return useQuery({
    queryKey: ["transactions", kinds, from, to, search, limit],
    queryFn: async (): Promise<TransactionRow[]> => {
      let q = supabase
        .from("journal_entries")
        .select("id, entry_date, description, kind, journal_lines(amount_minor, currency, accounts(name, type))")
        .eq("status", "posted");
      if (kinds && kinds.length) q = q.in("kind", kinds);
      if (from) q = q.gte("entry_date", from);
      if (to) q = q.lte("entry_date", to);
      if (search && search.trim()) q = q.ilike("description", `%${search.trim()}%`);
      const { data, error } = await q.order("entry_date", { ascending: false }).limit(limit);
      if (error) throw error;
      return data as unknown as TransactionRow[];
    },
  });
}

// ── Low-balance alerts (§12.3) ───────────────────────────────────────────────
// The daily job warns when a spendable account drops below metadata.low_balance_minor
// (native minor units); with no threshold it alerts only when the account goes
// negative. This writes that threshold, merging so other metadata is preserved.
export function useSetLowBalanceAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { accountId: string; thresholdMinor: bigint | null }) => {
      const { data: cur, error: readErr } = await supabase
        .from("accounts").select("metadata").eq("id", input.accountId).single();
      if (readErr) throw readErr;
      const metadata: Record<string, unknown> = { ...((cur?.metadata as Record<string, unknown>) ?? {}) };
      if (input.thresholdMinor == null) delete metadata.low_balance_minor;
      else metadata.low_balance_minor = Number(input.thresholdMinor);
      const { error } = await supabase.from("accounts").update({ metadata }).eq("id", input.accountId);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["accounts"] }); toast.success("Alert saved"); },
  });
}

// ── Reconciliation (§7.17, Phase 6) ──────────────────────────────────────────
export interface ReconcileLine {
  id: string;
  entry_date: string;
  description: string | null;
  amount_minor: number;   // signed, native to the account
  cleared: boolean;
}
export interface ReconciliationRow {
  id: string;
  statement_date: string;
  statement_balance_minor: number;
  reconciled_balance_minor: number | null;
  status: string;
  completed_at: string | null;
}

// Posted lines for an account up to the statement date. By default only the
// uncleared ones (the actionable list); pass includeCleared to show everything.
export function useReconcileLines(accountId: string | null, asOf: string, includeCleared = false) {
  return useQuery({
    queryKey: ["reconcile-lines", accountId, asOf, includeCleared],
    enabled: !!accountId,
    queryFn: async (): Promise<ReconcileLine[]> => {
      const fn = includeCleared ? "fn_reconcile_lines" : "fn_reconcile_open_lines";
      const { data, error } = await supabase.rpc(fn, { p_account: accountId!, p_as_of: asOf });
      if (error) throw error;
      return data as ReconcileLine[];
    },
  });
}

// Sum of cleared lines — the reconciled balance, computed server-side so it stays
// right even when the list above is filtered to uncleared items.
export function useClearedBalance(accountId: string | null, asOf: string) {
  return useQuery({
    queryKey: ["cleared-balance", accountId, asOf],
    enabled: !!accountId,
    queryFn: async (): Promise<bigint> => {
      const { data, error } = await supabase.rpc("fn_cleared_balance", { p_account: accountId!, p_as_of: asOf });
      if (error) throw error;
      return BigInt(data ?? 0);
    },
  });
}

// Native account balance as of a date (defaults to today).
export function useAccountBalance(accountId: string | null, asOf?: string) {
  return useQuery({
    queryKey: ["account-balance", accountId, asOf ?? "today"],
    enabled: !!accountId,
    queryFn: async (): Promise<bigint> => {
      const { data, error } = await supabase.rpc("fn_account_balance", { p_account: accountId!, p_as_of: asOf ?? todayIso() });
      if (error) throw error;
      return BigInt(data ?? 0);
    },
  });
}

// Tick a line off (or un-tick it). Permitted on posted lines by the relaxed
// append-only trigger because only the reconciliation flags change (§10.4/0012).
export function useToggleCleared() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { lineId: string; cleared: boolean }) => {
      const { error } = await supabase
        .from("journal_lines")
        .update({ cleared: input.cleared, reconciled_at: input.cleared ? new Date().toISOString() : null })
        .eq("id", input.lineId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reconcile-lines"] });
      qc.invalidateQueries({ queryKey: ["cleared-balance"] });
    },
  });
}

export function useReconciliations(accountId: string | null) {
  return useQuery({
    queryKey: ["reconciliations", accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<ReconciliationRow[]> => {
      const { data, error } = await supabase
        .from("reconciliations")
        .select("id, statement_date, statement_balance_minor, reconciled_balance_minor, status, completed_at")
        .eq("account_id", accountId!)
        .order("statement_date", { ascending: false });
      if (error) throw error;
      return data as ReconciliationRow[];
    },
  });
}

// Record a finished reconciliation once the cleared total matches the statement.
export function useCompleteReconciliation() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      accountId: string; statementDate: string; statementBalanceMinor: bigint; reconciledBalanceMinor: bigint;
    }) => {
      const { error } = await supabase.from("reconciliations").insert({
        user_id: session!.user.id,
        account_id: input.accountId,
        statement_date: input.statementDate,
        statement_balance_minor: Number(input.statementBalanceMinor),
        reconciled_balance_minor: Number(input.reconciledBalanceMinor),
        status: "completed",
        completed_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["reconciliations"] }); toast.success("Statement matched"); },
  });
}

// ── Budgets (§13.5) ──────────────────────────────────────────────────────────
export interface BudgetRow {
  id: string;
  category_id: string;
  name: string;
  currency: string;
  amount_minor: number;
  spent_minor: number;
}

// Budgets with this month's spend, keyed by category. Includes the derived spend
// so the UI shows progress without a second round-trip.
export function useBudgets() {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: ["budgets", userId],
    enabled: !!userId,
    queryFn: async (): Promise<BudgetRow[]> => {
      const { data, error } = await supabase.rpc("fn_budget_status", { p_user: userId!, p_month: todayIso() });
      if (error) throw error;
      return data as BudgetRow[];
    },
  });
}

// Set (or clear) a category's monthly cap. A null amount removes the budget.
export function useSetBudget() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (input: { categoryId: string; amountMinor: bigint | null; currency: string }) => {
      if (input.amountMinor == null) {
        const { error } = await supabase.from("budgets").delete().eq("category_id", input.categoryId);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("budgets").upsert(
        {
          user_id: session!.user.id,
          category_id: input.categoryId,
          amount_minor: Number(input.amountMinor),
          currency: input.currency,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,category_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["budgets"] }); toast.success("Budget saved"); },
  });
}

// ── CSV / bank-statement import (§16) ────────────────────────────────────────
export interface ImportRow {
  date: string;            // ISO
  description: string;
  amountMinor: bigint;     // absolute value
  direction: "in" | "out";
  categoryId: string;
}

// Posts each row via import_entry (idempotent on external_ref). Returns how many
// were newly imported vs. skipped as already-present duplicates.
export function useImportEntries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { accountId: string; currency: string; base: string; rows: ImportRow[] }) => {
      let imported = 0, skipped = 0;
      for (const r of input.rows) {
        const legs = r.direction === "out"
          ? buildExpenseLegs({ categoryAccountId: r.categoryId, cashAccountId: input.accountId, currency: input.currency, amountMinor: r.amountMinor, fxRate: 1, baseCurrency: input.base })
          : buildIncomeLegs({ categoryAccountId: r.categoryId, cashAccountId: input.accountId, currency: input.currency, amountMinor: r.amountMinor, fxRate: 1, baseCurrency: input.base });
        const ref = `import:${input.accountId}:${r.date}:${r.direction === "out" ? "-" : ""}${r.amountMinor}:${r.description.trim().toLowerCase().slice(0, 60)}`;
        const { data, error } = await supabase.rpc("import_entry", {
          p_kind: r.direction === "out" ? "expense" : "income",
          p_entry_date: r.date,
          p_description: r.description.trim() || (r.direction === "out" ? "Imported payment" : "Imported deposit"),
          p_lines: toRpcLines(legs),
          p_external_ref: ref,
        });
        if (error) throw error;
        if (data) imported++; else skipped++;
      }
      return { imported, skipped };
    },
    onSuccess: ({ imported, skipped }) => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["overview"] });
      qc.invalidateQueries({ queryKey: ["reconcile-lines"] });
      toast.success(`Imported ${imported}${skipped ? `, skipped ${skipped} already there` : ""}`);
    },
  });
}
