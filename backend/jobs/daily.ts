import { fileURLToPath } from "node:url";
import { nextRunDate, isOnOrBefore, money, formatMoney, type Frequency, type RecurringTemplate } from "@kolo/shared";
import { admin } from "./client.js";

const MAX_BACKFILL = 60; // cap iterations per rule per run (§12.1)

interface RecurringRule {
  id: string;
  user_id: string;
  template: RecurringTemplate;
  frequency: Frequency;
  interval: number;
  day_of_month: number | null;
  end_date: string | null;
  next_run: string;
  auto_post: boolean;
}

// §12.1 — for each due rule, clone its template into a journal entry dated at the
// occurrence, advance next_run, set last_run. Future occurrences are NOT posted
// (projection is a read-time concern). Backfill is capped to avoid runaways.
async function materializeRecurring(userId: string, asOf: string): Promise<number> {
  const { data, error } = await admin
    .from("recurring_rules")
    .select("id, user_id, template, frequency, interval, day_of_month, end_date, next_run, auto_post")
    .eq("user_id", userId)
    .eq("is_active", true)
    .lte("next_run", asOf);
  if (error) throw error;

  let posted = 0;
  for (const rule of (data ?? []) as RecurringRule[]) {
    let runDate = rule.next_run;
    let lastRun: string | null = null;
    let iterations = 0;

    while (isOnOrBefore(runDate, asOf) && iterations < MAX_BACKFILL) {
      if (rule.end_date && !isOnOrBefore(runDate, rule.end_date)) break;

      const { error: postErr } = await admin.rpc("post_entry_system", {
        p_user: userId,
        p_kind: rule.template.kind,
        p_entry_date: runDate,
        p_description: rule.template.description ?? null,
        p_lines: rule.template.lines,
        p_source: "recurring",
        p_recurring_id: rule.id,
        p_status: rule.auto_post ? "posted" : "draft",
      });
      if (postErr) throw postErr;

      posted++;
      iterations++;
      lastRun = runDate;
      runDate = nextRunDate(runDate, {
        frequency: rule.frequency,
        interval: rule.interval,
        dayOfMonth: rule.day_of_month,
      });
    }

    const passedEnd = rule.end_date != null && !isOnOrBefore(runDate, rule.end_date);
    await admin
      .from("recurring_rules")
      .update({ next_run: runDate, last_run: lastRun ?? undefined, is_active: !passedEnd })
      .eq("id", rule.id);
  }
  return posted;
}

// Daily job (§12). Runs per user. Because it always writes rows, it also keeps
// the free Supabase project warm (§2.2). Activated incrementally across phases —
// this is the scaffold + the integrity gate, which is needed from Phase 1.
//
//   1. Materialize recurring  (Phase 2)
//   2. Net-worth snapshot      (Phase 1) — skip + alert if ledger imbalanced
//   3. Notifications           (Phase 4)
//   4. Backup to object storage (free tier has no backups, §2.2)

interface Profile {
  id: string;
  base_currency: string;
}

async function listProfiles(): Promise<Profile[]> {
  const { data, error } = await admin.from("profiles").select("id, base_currency");
  if (error) throw error;
  return (data ?? []) as Profile[];
}

async function checkIntegrity(userId: string): Promise<bigint> {
  // fn_ledger_imbalance must return 0 (§10.6). Non-zero -> refuse to snapshot.
  const { data, error } = await admin.rpc("fn_ledger_imbalance", { p_user: userId });
  if (error) throw error;
  return BigInt(data ?? 0);
}

async function writeSnapshot(profile: Profile, asOf: string): Promise<void> {
  // Point-in-time net worth + components (§11.2). from=to=asOf → bridge is zero.
  const { data, error } = await admin.rpc("fn_overview", {
    p_user: profile.id,
    p_from: asOf,
    p_to: asOf,
  });
  if (error) throw error;
  const o = data as {
    net_worth: number; cash: number; other_assets: number; receivables: number; liabilities: number;
  };

  // net_worth_snapshots stores the figures (and rates, for reproducibility §6.5).
  const { error: upErr } = await admin.from("net_worth_snapshots").upsert(
    {
      user_id: profile.id,
      as_of_date: asOf,
      base_currency: profile.base_currency,
      cash_minor: o.cash,
      other_assets_minor: o.other_assets,
      receivables_minor: o.receivables,
      liabilities_minor: o.liabilities,
      net_worth_minor: o.net_worth,
      breakdown: {},
      rates: {},
    },
    { onConflict: "user_id,as_of_date" },
  );
  if (upErr) throw upErr;
}

// §12.3 — scan receivables for due-soon (≤3 days) and overdue, raising one
// deduped notification each. dedupe_key + the unique (user_id, dedupe_key) index
// guarantee a reminder fires exactly once, not daily.
function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}
function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = to.split("-").map(Number) as [number, number, number];
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}
const clamp = (n: number) => Math.max(0, Math.min(1, n));

interface Note {
  type: string;
  title: string;
  body: string;
  severity: string;
  dedupe_key: string;
  entity_type?: string;
  entity_id?: string;
  due_date?: string;
}

// Insert one notification, skipping if its dedupe_key already exists for the user
// (the unique (user_id, dedupe_key) index makes the reminder fire once, not daily).
async function raiseNote(userId: string, note: Note): Promise<void> {
  const { error } = await admin
    .from("notifications")
    .upsert({ user_id: userId, ...note }, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true });
  if (error) throw error;
}

async function receivableReminders(userId: string, asOf: string): Promise<number> {
  const soon = addDays(asOf, 3);
  const { data, error } = await admin
    .from("receivables")
    .select("id, counterparty_name, contact_id, due_date, status")
    .eq("user_id", userId)
    .in("status", ["outstanding", "partially_paid"])
    .not("due_date", "is", null);
  if (error) throw error;

  const rows = (data ?? []) as { id: string; counterparty_name: string | null; due_date: string; status: string }[];
  let raised = 0;
  for (const r of rows) {
    const who = r.counterparty_name ?? "someone";
    let note: Note | null = null;
    if (r.due_date < asOf) {
      note = {
        type: "receivable_overdue",
        title: "A repayment is overdue",
        body: `${who} was due to pay you back by ${r.due_date}.`,
        severity: "warning",
        dedupe_key: `receivable:${r.id}:overdue`,
        entity_type: "receivable",
        entity_id: r.id,
        due_date: r.due_date,
      };
    } else if (r.due_date <= soon) {
      note = {
        type: "receivable_due",
        title: "A repayment is due soon",
        body: `${who} is due to pay you back by ${r.due_date}.`,
        severity: "info",
        dedupe_key: `receivable:${r.id}:due`,
        entity_type: "receivable",
        entity_id: r.id,
        due_date: r.due_date,
      };
    }
    if (note) {
      await raiseNote(userId, note);
      raised++;
    }
  }
  return raised;
}

// §12.3 — remind about scheduled entries coming due in the next 3 days. Rules due
// on/before today are already posted by the materializer, so only look ahead. The
// dedupe_key carries the occurrence date, so each future run reminds exactly once.
async function recurringReminders(userId: string, asOf: string): Promise<number> {
  const soon = addDays(asOf, 3);
  const { data, error } = await admin
    .from("recurring_rules")
    .select("id, name, next_run")
    .eq("user_id", userId)
    .eq("is_active", true)
    .gt("next_run", asOf)
    .lte("next_run", soon);
  if (error) throw error;

  const rows = (data ?? []) as { id: string; name: string; next_run: string }[];
  for (const r of rows) {
    await raiseNote(userId, {
      type: "recurring_upcoming",
      title: "An upcoming scheduled entry",
      body: `"${r.name}" is scheduled for ${r.next_run}.`,
      severity: "info",
      dedupe_key: `recurring:${r.id}:${r.next_run}`,
      entity_type: "recurring_rule",
      entity_id: r.id,
      due_date: r.next_run,
    });
  }
  return rows.length;
}

interface GoalProgress {
  id: string;
  name: string;
  type: string;
  target_minor: number;
  baseline_minor: number;
  target_date: string | null;
  status: string;
  current_minor: number;
}

// Fraction (0..1) of the goal achieved, mirroring the frontend's progress() so the
// notification agrees with what the user sees. Ratio math on Number is safe here:
// money stays bigint everywhere it's stored; this is only a display-side proportion.
function goalProgress(g: GoalProgress): number {
  if (g.type === "debt_payoff") {
    const paid = g.baseline_minor - g.current_minor;
    return g.baseline_minor > 0 ? clamp(paid / g.baseline_minor) : g.current_minor <= 0 ? 1 : 0;
  }
  const span = g.target_minor - g.baseline_minor;
  return span > 0 ? clamp((g.current_minor - g.baseline_minor) / span) : 0;
}

// §12.3 — flag active, dated goals that are lagging: either the deadline has passed
// unmet, or actual progress trails the share of time elapsed by >10%. Deduped per
// calendar month so a persistently off-track goal reminds monthly, not daily.
async function goalReminders(userId: string, asOf: string): Promise<number> {
  const { data: json, error } = await admin.rpc("fn_goals", { p_user: userId, p_as_of: asOf });
  if (error) throw error;
  const { data: rows, error: rowsErr } = await admin
    .from("goals")
    .select("id, created_at")
    .eq("user_id", userId);
  if (rowsErr) throw rowsErr;
  const createdById = new Map((rows ?? []).map((r: { id: string; created_at: string }) => [r.id, r.created_at.slice(0, 10)]));

  const goals = (json ?? []) as GoalProgress[];
  const month = asOf.slice(0, 7);
  let raised = 0;
  for (const g of goals) {
    if (g.status !== "active" || !g.target_date) continue;
    const pct = goalProgress(g);
    if (pct >= 1) continue; // already reached

    const created = createdById.get(g.id) ?? asOf;
    const total = daysBetween(created, g.target_date);
    const elapsed = daysBetween(created, asOf);
    const pctTime = total > 0 ? clamp(elapsed / total) : 1;
    const overdue = asOf >= g.target_date;
    if (!overdue && pctTime - pct <= 0.1) continue;

    await raiseNote(userId, {
      type: "goal_off_track",
      title: overdue ? "A goal passed its target date" : "A goal is falling behind",
      body: overdue
        ? `"${g.name}" hasn't been reached and its target date (${g.target_date}) has passed.`
        : `"${g.name}" is behind the pace needed to reach it by ${g.target_date}.`,
      severity: "warning",
      dedupe_key: `goal:${g.id}:off_track:${month}`,
      entity_type: "goal",
      entity_id: g.id,
      due_date: g.target_date,
    });
    raised++;
  }
  return raised;
}

// §12.3 — low cash balance on spendable accounts (bank/cash/mobile money). The
// threshold is metadata.low_balance_minor (native minor units) when set, else 0 so
// an overdrawn account always alerts. Deduped per month to avoid daily repeats.
async function lowBalanceReminders(userId: string, asOf: string): Promise<number> {
  const { data, error } = await admin
    .from("accounts")
    .select("id, name, currency, metadata")
    .eq("user_id", userId)
    .eq("type", "asset")
    .eq("is_archived", false)
    .in("subtype", ["bank", "cash", "mobile_money"]);
  if (error) throw error;

  const rows = (data ?? []) as { id: string; name: string; currency: string; metadata: { low_balance_minor?: number | string } }[];
  const month = asOf.slice(0, 7);
  let raised = 0;
  for (const a of rows) {
    const { data: bal, error: balErr } = await admin.rpc("fn_account_balance", { p_account: a.id, p_as_of: asOf });
    if (balErr) throw balErr;
    const balance = BigInt(bal ?? 0);
    const raw = a.metadata?.low_balance_minor;
    const threshold = raw != null ? BigInt(raw) : 0n;
    if (balance >= threshold) continue;

    const balanceStr = formatMoney(money(balance, a.currency));
    const body = raw != null
      ? `Your ${a.name} balance is ${balanceStr}, under your alert of ${formatMoney(money(threshold, a.currency))}.`
      : `Your ${a.name} balance is ${balanceStr} — it's gone below zero.`;
    await raiseNote(userId, {
      type: "low_balance",
      title: "A balance is running low",
      body,
      severity: "warning",
      dedupe_key: `account:${a.id}:low:${month}`,
      entity_type: "account",
      entity_id: a.id,
    });
    raised++;
  }
  return raised;
}

// §12.3 — warn once a month when a category's spend passes its budget cap. The
// month is derived from asOf so a persistently over-budget category reminds once
// per calendar month, not daily.
async function budgetReminders(userId: string, asOf: string): Promise<number> {
  const { data, error } = await admin.rpc("fn_budget_status", { p_user: userId, p_month: asOf });
  if (error) throw error;
  const rows = (data ?? []) as { id: string; name: string; currency: string; amount_minor: number; spent_minor: number }[];
  const month = asOf.slice(0, 7);
  let raised = 0;
  for (const b of rows) {
    const cap = BigInt(b.amount_minor);
    const spent = BigInt(b.spent_minor);
    if (spent <= cap) continue;
    await raiseNote(userId, {
      type: "budget_exceeded",
      title: "You're over budget",
      body: `${b.name} spending is ${formatMoney(money(spent, b.currency))}, over your ${formatMoney(money(cap, b.currency))} budget this month.`,
      severity: "warning",
      dedupe_key: `budget:${b.id}:${month}`,
      entity_type: "budget",
      entity_id: b.id,
    });
    raised++;
  }
  return raised;
}

async function raiseIntegrityAlert(userId: string, imbalance: bigint): Promise<void> {
  await raiseNote(userId, {
    type: "integrity_error",
    title: "Something doesn't add up",
    body: "We paused today's update because the books didn't balance.",
    severity: "critical",
    dedupe_key: `integrity:${imbalance}`,
  });
}

export async function runDaily(asOf = new Date().toISOString().slice(0, 10)): Promise<void> {
  const profiles = await listProfiles();
  console.log(`[daily] ${profiles.length} user(s), as of ${asOf}`);

  for (const profile of profiles) {
    const imbalance = await checkIntegrity(profile.id);
    if (imbalance !== 0n) {
      console.error(`[daily] user ${profile.id} ledger imbalanced by ${imbalance} — skipping snapshot`);
      await raiseIntegrityAlert(profile.id, imbalance);
      continue;
    }
    const postedCount = await materializeRecurring(profile.id, asOf);
    await writeSnapshot(profile, asOf);
    const reminders =
      (await receivableReminders(profile.id, asOf)) +
      (await recurringReminders(profile.id, asOf)) +
      (await goalReminders(profile.id, asOf)) +
      (await lowBalanceReminders(profile.id, asOf)) +
      (await budgetReminders(profile.id, asOf));
    // TODO: logical backup dump to object storage.
    console.log(`[daily] user ${profile.id}: ${postedCount} recurring, ${reminders} reminders, snapshot written (imbalance=0)`);
  }
}

// Auto-run only when invoked directly (so tests can import runDaily).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runDaily().catch((err) => {
    console.error("[daily] failed:", err);
    process.exit(1);
  });
}
