import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  buildOpeningBalanceLegs, buildIncomeLegs, buildExpenseLegs,
  buildReceivableIssueLegs, buildReceivablePaymentLegs, buildReceivableWriteoffLegs,
  buildAssetPurchaseLegs, buildAssetRevaluationLegs,
  buildFxConversionLegs, buildFxRevaluationLegs,
  toRpcLines, type JournalLineInput,
} from "@kolo/shared";

// GOLDEN FIXTURE — Appendix A (Jan–Mar 2026, base ₦, with a USD account).
// The Phase 5 acceptance gate (§15/§16): the full run must reproduce every
// closing net worth AND every bridge line to the minor unit. Amounts are minor
// units (₦1 = 100, $1 = 100). Rates: 1 Jan 1500 · 31 Jan 1550 · 18 Feb 1640 ·
// 28 Feb 1650 · 31 Mar 1600.
const url = process.env.SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.SUPABASE_ANON_KEY!;
const BASE = "NGN";
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

let failures = 0;
function expect(label: string, got: number | bigint, want: number | bigint) {
  const ok = BigInt(got) === BigInt(want);
  console.log(`  ${ok ? "✅" : "❌"} ${label}: ${got}${ok ? "" : ` (expected ${want})`}`);
  if (!ok) failures++;
}

async function mkAccount(c: SupabaseClient, userId: string, name: string, type: string, currency: string, subtype?: string) {
  const { data, error } = await c.from("accounts").insert({ user_id: userId, name, type, currency, subtype }).select("id").single();
  if (error) throw new Error(`${name}: ${error.message}`);
  return data.id as string;
}

async function main() {
  const email = `golden+${Date.now()}@kolo.test`;
  const password = "password123";
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const userId = created.user.id;
  const c = createClient(url, anonKey, { auth: { persistSession: false } });
  await c.auth.signInWithPassword({ email, password });

  const post = async (kind: string, date: string, desc: string, lines: JournalLineInput[]) => {
    const { error } = await c.rpc("post_entry", { p_kind: kind, p_entry_date: date, p_description: desc, p_lines: toRpcLines(lines) });
    if (error) throw new Error(`${desc}: ${error.message}`);
  };
  const carried = async (account: string, date: string) => {
    const { data: nat } = await c.rpc("fn_account_balance", { p_account: account, p_as_of: date });
    const { data: bas } = await c.rpc("fn_account_base_balance", { p_account: account, p_as_of: date });
    return { native: BigInt(nat), base: BigInt(bas) };
  };
  const overview = async (from: string, to: string) => (await c.rpc("fn_overview", { p_user: userId, p_from: from, p_to: to })).data;

  const { data: sys } = await c.from("accounts").select("id, system_tag").not("system_tag", "is", null);
  const tag = (t: string) => sys!.find((a) => a.system_tag === t)!.id as string;
  const obe = tag("opening_balance_equity"), fxReserve = tag("fx_translation_reserve");
  const assetReserve = tag("asset_revaluation_reserve"), realizedFx = tag("realized_fx");

  const gtbank = await mkAccount(c, userId, "GTBank", "asset", "NGN", "bank");
  const cash = await mkAccount(c, userId, "Cash", "asset", "NGN", "cash");
  const usd = await mkAccount(c, userId, "USD Dom", "asset", "USD", "bank");
  const salary = await mkAccount(c, userId, "Salary", "income", "NGN");
  const freelance = await mkAccount(c, userId, "Freelance", "income", "USD");
  const rent = await mkAccount(c, userId, "Rent", "expense", "NGN");
  const groceries = await mkAccount(c, userId, "Groceries & utilities", "expense", "NGN");

  // ── Opening 1 Jan @1500 ────────────────────────────────────────────────────
  await post("opening_balance", "2026-01-01", "Opening", buildOpeningBalanceLegs([
    { accountId: gtbank, currency: "NGN", amountMinor: 200_000_000n, fxRate: 1, side: "asset" },
    { accountId: usd, currency: "USD", amountMinor: 500_000n, fxRate: 1500, side: "asset" },
    { accountId: cash, currency: "NGN", amountMinor: 10_000_000n, fxRate: 1, side: "asset" },
  ], obe, BASE));

  // ── January ────────────────────────────────────────────────────────────────
  await post("income", "2026-01-05", "Salary", buildIncomeLegs({ cashAccountId: gtbank, categoryAccountId: salary, currency: "NGN", amountMinor: 120_000_000n, fxRate: 1, baseCurrency: BASE }));
  await post("income", "2026-01-12", "Freelance", buildIncomeLegs({ cashAccountId: usd, categoryAccountId: freelance, currency: "USD", amountMinor: 200_000n, fxRate: 1500, baseCurrency: BASE }));
  await post("expense", "2026-01-02", "Rent", buildExpenseLegs({ cashAccountId: gtbank, categoryAccountId: rent, currency: "NGN", amountMinor: 80_000_000n, fxRate: 1, baseCurrency: BASE }));
  await post("expense", "2026-01-15", "Groceries", buildExpenseLegs({ cashAccountId: gtbank, categoryAccountId: groceries, currency: "NGN", amountMinor: 25_000_000n, fxRate: 1, baseCurrency: BASE }));
  const tundeAcct = await mkAccount(c, userId, "Owed by Tunde", "asset", "NGN", "receivable");
  await c.from("receivables").insert({ user_id: userId, account_id: tundeAcct, counterparty_name: "Tunde", principal_minor: 20_000_000, currency: "NGN", lent_date: "2026-01-20" });
  await post("receivable_issue", "2026-01-20", "Lent Tunde", buildReceivableIssueLegs({ receivableAccountId: tundeAcct, fundingAccountId: gtbank, currency: "NGN", amountMinor: 20_000_000n, fxRate: 1, baseCurrency: BASE }));
  // 31 Jan FX revaluation @1550
  let st = await carried(usd, "2026-01-31");
  await post("fx_revaluation", "2026-01-31", "FX reval Jan", buildFxRevaluationLegs({ foreignAccountId: usd, foreignCurrency: "USD", reserveAccountId: fxReserve, deltaBaseMinor: st.native * 1550n - st.base, closingRate: 1550, baseCurrency: BASE }));

  // ── February ─────────────────────────────────────────────────────────────
  await post("income", "2026-02-05", "Salary", buildIncomeLegs({ cashAccountId: gtbank, categoryAccountId: salary, currency: "NGN", amountMinor: 120_000_000n, fxRate: 1, baseCurrency: BASE }));
  await post("receivable_payment", "2026-02-10", "Tunde repaid", buildReceivablePaymentLegs({ receivableAccountId: tundeAcct, cashAccountId: gtbank, currency: "NGN", amountMinor: 20_000_000n, fxRate: 1, baseCurrency: BASE }));
  const gold = await mkAccount(c, userId, "Gold", "asset", "NGN", "gold");
  await c.from("assets").insert({ user_id: userId, account_id: gold, name: "Gold", asset_class: "gold", purchase_date: "2026-02-12", purchase_price_minor: 100_000_000, purchase_currency: "NGN" });
  await post("asset_purchase", "2026-02-12", "Buy gold", buildAssetPurchaseLegs({ assetAccountId: gold, fundingAccountId: gtbank, currency: "NGN", costMinor: 100_000_000n, fxRate: 1, baseCurrency: BASE }));
  // Convert $1,000 @ bank 1640 (carried 1550)
  st = await carried(usd, "2026-02-18");
  await post("fx_conversion", "2026-02-18", "Convert $1,000", buildFxConversionLegs({
    destAccountId: gtbank, proceedsMinor: 164_000_000n, sourceAccountId: usd, sourceCurrency: "USD",
    soldMinor: 100_000n, sourceNativeBalanceMinor: st.native, sourceBaseBalanceMinor: st.base, realizedFxAccountId: realizedFx, baseCurrency: BASE,
  }));
  // 28 Feb FX revaluation @1650
  st = await carried(usd, "2026-02-28");
  await post("fx_revaluation", "2026-02-28", "FX reval Feb", buildFxRevaluationLegs({ foreignAccountId: usd, foreignCurrency: "USD", reserveAccountId: fxReserve, deltaBaseMinor: st.native * 1650n - st.base, closingRate: 1650, baseCurrency: BASE }));

  // ── March (a loss month) ───────────────────────────────────────────────────
  await post("income", "2026-03-05", "Salary", buildIncomeLegs({ cashAccountId: gtbank, categoryAccountId: salary, currency: "NGN", amountMinor: 120_000_000n, fxRate: 1, baseCurrency: BASE }));
  const bolaAcct = await mkAccount(c, userId, "Owed by Bola", "asset", "NGN", "receivable");
  await c.from("receivables").insert({ user_id: userId, account_id: bolaAcct, counterparty_name: "Bola", principal_minor: 15_000_000, currency: "NGN", lent_date: "2026-03-08" });
  await post("receivable_issue", "2026-03-08", "Lent Bola", buildReceivableIssueLegs({ receivableAccountId: bolaAcct, fundingAccountId: gtbank, currency: "NGN", amountMinor: 15_000_000n, fxRate: 1, baseCurrency: BASE }));
  await post("expense", "2026-03-02", "Rent", buildExpenseLegs({ cashAccountId: gtbank, categoryAccountId: rent, currency: "NGN", amountMinor: 80_000_000n, fxRate: 1, baseCurrency: BASE }));
  await post("expense", "2026-03-15", "Groceries", buildExpenseLegs({ cashAccountId: gtbank, categoryAccountId: groceries, currency: "NGN", amountMinor: 30_000_000n, fxRate: 1, baseCurrency: BASE }));
  await post("receivable_writeoff", "2026-03-25", "Bola defaulted", buildReceivableWriteoffLegs({ receivableAccountId: bolaAcct, badDebtAccountId: tag("bad_debt"), currency: "NGN", amountMinor: 15_000_000n, fxRate: 1, baseCurrency: BASE }));
  // 31 Mar: USD reval @1600 (loss) + gold reval to ₦1,250,000
  st = await carried(usd, "2026-03-31");
  await post("fx_revaluation", "2026-03-31", "FX reval Mar", buildFxRevaluationLegs({ foreignAccountId: usd, foreignCurrency: "USD", reserveAccountId: fxReserve, deltaBaseMinor: st.native * 1600n - st.base, closingRate: 1600, baseCurrency: BASE }));
  const gst = await carried(gold, "2026-03-31");
  await post("asset_revaluation", "2026-03-31", "Gold reval", buildAssetRevaluationLegs({ assetAccountId: gold, reserveAccountId: assetReserve, deltaMinor: 125_000_000n - gst.native, currency: "NGN", fxRate: 1, baseCurrency: BASE }));

  // ── Assertions ─────────────────────────────────────────────────────────────
  console.log("January:");
  const jan = await overview("2026-01-01", "2026-01-31");
  expect("net worth ₦13,100,000", jan.net_worth, 1_310_000_000n);
  expect("net income ₦3,150,000", jan.bridge.net_income, 315_000_000n);
  expect("unrealized FX ₦350,000", jan.bridge.fx_revaluation, 35_000_000n);

  console.log("February:");
  const feb = await overview("2026-01-31", "2026-02-28");
  expect("net worth ₦14,990,000", feb.net_worth, 1_499_000_000n);
  expect("net income ₦1,290,000 (incl. realized FX)", feb.bridge.net_income, 129_000_000n);
  expect("unrealized FX ₦600,000", feb.bridge.fx_revaluation, 60_000_000n);
  expect("asset revaluation ₦0", feb.bridge.asset_revaluation, 0n);

  console.log("March:");
  const mar = await overview("2026-02-28", "2026-03-31");
  expect("net worth ₦14,890,000", mar.net_worth, 1_489_000_000n);
  expect("net income −₦50,000", mar.bridge.net_income, -5_000_000n);
  expect("unrealized FX −₦300,000", mar.bridge.fx_revaluation, -30_000_000n);
  expect("unrealized gold +₦250,000", mar.bridge.asset_revaluation, 25_000_000n);

  const { data: imb } = await admin.rpc("fn_ledger_imbalance", { p_user: userId });
  expect("ledger imbalance = 0", Number(imb), 0);

  await admin.auth.admin.deleteUser(userId);
  console.log(failures === 0 ? "\nAPPENDIX-A FULL RUN: PASS ✅" : `\nAPPENDIX-A FULL RUN: ${failures} FAILURE(S) ❌`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => { console.error("fixture crashed:", err); process.exit(1); });
