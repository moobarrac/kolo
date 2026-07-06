import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  buildIncomeLegs,
  buildExpenseLegs,
  buildTransferLegs,
  buildOpeningBalanceLegs,
  leg,
  toRpcLines,
  type JournalLineInput,
} from "@kolo/shared";

// Golden fixture — Appendix A, January 2026 (the Phase 1 acceptance gate, §15/§16).
// Seeds January through the REAL engine (shared leg builders + post_entry RPC),
// then asserts net worth = ₦13,100,000 and that the net-worth bridge reconciles.
// Amounts are in minor units (₦1 = 100). Base currency NGN. Jan rate 1,500; close 1,550.
const url = process.env.SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.SUPABASE_ANON_KEY!;
const BASE = "NGN";

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

let failures = 0;
function expect(label: string, got: bigint | number, want: bigint | number) {
  const ok = BigInt(got) === BigInt(want);
  console.log(`${ok ? "✅" : "❌"} ${label}: ${got}${ok ? "" : ` (expected ${want})`}`);
  if (!ok) failures++;
}

async function mkAccount(
  c: SupabaseClient,
  userId: string,
  name: string,
  type: string,
  currency: string,
  subtype?: string,
): Promise<string> {
  const { data, error } = await c
    .from("accounts")
    .insert({ user_id: userId, name, type, currency, subtype })
    .select("id")
    .single();
  if (error) throw new Error(`create ${name}: ${error.message}`);
  return data.id as string;
}

async function post(
  c: SupabaseClient,
  kind: string,
  entryDate: string,
  description: string,
  lines: JournalLineInput[],
) {
  const { error } = await c.rpc("post_entry", {
    p_kind: kind,
    p_entry_date: entryDate,
    p_description: description,
    p_lines: toRpcLines(lines),
  });
  if (error) throw new Error(`post ${description}: ${error.message}`);
}

async function main() {
  const email = `golden+${Date.now()}@kolo.test`;
  const password = "password123";
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (cErr) throw cErr;
  const userId = created.user.id;

  const c = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: sErr } = await c.auth.signInWithPassword({ email, password });
  if (sErr) throw sErr;

  // system OBE / fx reserve accounts were seeded on signup
  const { data: sys } = await c.from("accounts").select("id, system_tag").not("system_tag", "is", null);
  const tag = (t: string) => sys!.find((a) => a.system_tag === t)!.id as string;
  const obe = tag("opening_balance_equity");
  const fxReserve = tag("fx_translation_reserve");

  // accounts
  const gtbank = await mkAccount(c, userId, "GTBank", "asset", "NGN", "bank");
  const cash = await mkAccount(c, userId, "Cash", "asset", "NGN", "cash");
  const usd = await mkAccount(c, userId, "USD Dom", "asset", "USD", "bank");
  const tunde = await mkAccount(c, userId, "Owed by Tunde", "asset", "NGN", "receivable");
  const salary = await mkAccount(c, userId, "Salary", "income", "NGN");
  const freelance = await mkAccount(c, userId, "Freelance", "income", "USD");
  const rent = await mkAccount(c, userId, "Rent", "expense", "NGN");
  const groceries = await mkAccount(c, userId, "Groceries & utilities", "expense", "NGN");

  // 1 Jan — opening balances @1500 (₦2,000,000 + $5,000 + ₦100,000 = NW ₦9,600,000)
  await post(c, "opening_balance", "2026-01-01", "Opening balances",
    buildOpeningBalanceLegs(
      [
        { accountId: gtbank, currency: "NGN", amountMinor: 200_000_000n, fxRate: 1, side: "asset" },
        { accountId: usd, currency: "USD", amountMinor: 500_000n, fxRate: 1500, side: "asset" },
        { accountId: cash, currency: "NGN", amountMinor: 10_000_000n, fxRate: 1, side: "asset" },
      ],
      obe,
      BASE,
    ));

  // January activity
  await post(c, "income", "2026-01-05", "Salary",
    buildIncomeLegs({ cashAccountId: gtbank, categoryAccountId: salary, currency: "NGN", amountMinor: 120_000_000n, fxRate: 1, baseCurrency: BASE }));

  await post(c, "income", "2026-01-12", "Freelance ($2,000 @1500)",
    buildIncomeLegs({ cashAccountId: usd, categoryAccountId: freelance, currency: "USD", amountMinor: 200_000n, fxRate: 1500, baseCurrency: BASE }));

  await post(c, "expense", "2026-01-02", "Rent",
    buildExpenseLegs({ cashAccountId: gtbank, categoryAccountId: rent, currency: "NGN", amountMinor: 80_000_000n, fxRate: 1, baseCurrency: BASE }));

  await post(c, "expense", "2026-01-15", "Groceries & utilities",
    buildExpenseLegs({ cashAccountId: gtbank, categoryAccountId: groceries, currency: "NGN", amountMinor: 25_000_000n, fxRate: 1, baseCurrency: BASE }));

  await post(c, "receivable_issue", "2026-01-20", "Lent Tunde ₦200,000",
    buildTransferLegs({ fromAccountId: gtbank, toAccountId: tunde, currency: "NGN", amountMinor: 20_000_000n, fxRate: 1, baseCurrency: BASE }));

  // 31 Jan — FX revaluation: $7,000 × 1550 = ₦10,850,000; carried ₦10,500,000 → +₦350,000.
  // The foreign leg adjusts base carrying value only (native unchanged); offset to the reserve.
  await post(c, "fx_revaluation", "2026-01-31", "FX revaluation (close 1,550)", [
    { accountId: usd, currency: "USD", amountMinor: 0n, fxRate: 1550, baseAmountMinor: 35_000_000n },
    leg(fxReserve, BASE, -35_000_000n, 1, BASE),
  ]);

  // ── Assertions (§16) ──────────────────────────────────────────────────────
  const { data: ov, error: ovErr } = await c.rpc("fn_overview", {
    p_user: userId,
    p_from: "2026-01-01",
    p_to: "2026-01-31",
  });
  if (ovErr) throw ovErr;
  const b = ov.bridge;

  console.log("\n-- January close --");
  expect("net worth (₦13,100,000)", ov.net_worth, 1_310_000_000n);
  expect("opening net worth (₦9,600,000)", b.opening_net_worth, 960_000_000n);
  expect("net income (₦3,150,000)", b.net_income, 315_000_000n);
  expect("unrealized FX (₦350,000)", b.fx_revaluation, 35_000_000n);
  expect("asset revaluation (₦0)", b.asset_revaluation, 0n);
  expect("capital events (₦0)", b.capital_events, 0n);

  // bridge must reconcile: closing - opening = net_income + asset_reval + fx_reval + capital
  const bridgeSum = BigInt(b.net_income) + BigInt(b.asset_revaluation) + BigInt(b.fx_revaluation) + BigInt(b.capital_events);
  expect("bridge reconciles (Δ = ₦3,500,000)", bridgeSum, BigInt(ov.net_worth) - BigInt(b.opening_net_worth));

  // ledger integrity: Σ base of all posted lines = 0
  const { data: imb } = await admin.rpc("fn_ledger_imbalance", { p_user: userId });
  expect("ledger imbalance = 0", Number(imb), 0);

  await admin.auth.admin.deleteUser(userId);
  console.log(failures === 0 ? "\nJANUARY FIXTURE: PASS ✅" : `\nJANUARY FIXTURE: ${failures} FAILURE(S) ❌`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("fixture crashed:", err);
  process.exit(1);
});
