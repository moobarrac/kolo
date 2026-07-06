import { fileURLToPath } from "node:url";
import { toBaseMinor, buildFxRevaluationLegs, toRpcLines } from "@kolo/shared";
import { admin } from "./client.js";

// Month-end job (§12.5). For each foreign-currency monetary account, post an
// fx_revaluation entry to bring its base carrying value to the closing rate
// (§6.4). Monetary = cash/bank/receivable/loan etc. — NOT non-cash assets like
// gold (those revalue via asset_revaluation at their own market value, §5.4).
const MONETARY = new Set([
  "cash", "bank", "mobile_money", "receivable",
  "credit_card", "loan", "mortgage", "personal", "personal_debt",
]);

interface Profile { id: string; base_currency: string }
interface Account { id: string; currency: string; type: string; subtype: string | null }

async function latestRate(userId: string, from: string, to: string, asOf: string): Promise<number | null> {
  const { data, error } = await admin
    .from("exchange_rates")
    .select("rate")
    .eq("user_id", userId).eq("from_currency", from).eq("to_currency", to)
    .lte("rate_date", asOf)
    .order("rate_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? Number(data.rate) : null;
}

async function revalueUser(profile: Profile, asOf: string): Promise<number> {
  const base = profile.base_currency;
  const { data: accts, error } = await admin
    .from("accounts")
    .select("id, currency, type, subtype")
    .eq("user_id", profile.id)
    .eq("is_archived", false);
  if (error) throw error;

  let posted = 0;
  for (const a of (accts ?? []) as Account[]) {
    if (a.currency === base) continue;
    if (!(a.type === "asset" || a.type === "liability")) continue;
    if (!(a.subtype && MONETARY.has(a.subtype))) continue;

    const { data: nat } = await admin.rpc("fn_account_balance", { p_account: a.id, p_as_of: asOf });
    const native = BigInt(nat ?? 0);
    if (native === 0n) continue;

    const rate = await latestRate(profile.id, a.currency, base, asOf);
    if (rate == null) {
      console.warn(`[month-end] no ${a.currency}->${base} rate for ${a.id} as of ${asOf} — skipping`);
      continue;
    }

    const { data: bas } = await admin.rpc("fn_account_base_balance", { p_account: a.id, p_as_of: asOf });
    const currentBase = BigInt(bas ?? 0);
    const target = toBaseMinor(native, rate, a.currency, base);
    const delta = target - currentBase;
    if (delta === 0n) continue;

    const lines = buildFxRevaluationLegs({
      foreignAccountId: a.id, foreignCurrency: a.currency, reserveAccountId: "", // resolved below
      deltaBaseMinor: delta, closingRate: rate, baseCurrency: base,
    });
    // resolve the user's fx_translation_reserve account id
    const { data: reserve } = await admin
      .from("accounts").select("id").eq("user_id", profile.id).eq("system_tag", "fx_translation_reserve").single();
    lines[1]!.accountId = reserve!.id;

    const { error: pErr } = await admin.rpc("post_entry_system", {
      p_user: profile.id, p_kind: "fx_revaluation", p_entry_date: asOf,
      p_description: `FX revaluation (${a.currency} @ ${rate})`, p_lines: toRpcLines(lines), p_source: "system",
    });
    if (pErr) throw pErr;
    posted++;
  }
  return posted;
}

export async function runMonthEnd(asOf = new Date().toISOString().slice(0, 10)): Promise<void> {
  const { data, error } = await admin.from("profiles").select("id, base_currency");
  if (error) throw error;
  console.log(`[month-end] ${(data ?? []).length} user(s), as of ${asOf}`);
  for (const profile of (data ?? []) as Profile[]) {
    const n = await revalueUser(profile, asOf);
    // TODO(phase3+): auto-post asset_revaluation for asset_valuations entered this period.
    console.log(`[month-end] user ${profile.id}: ${n} FX revaluation(s)`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMonthEnd(process.argv[2]).catch((err) => {
    console.error("[month-end] failed:", err);
    process.exit(1);
  });
}
