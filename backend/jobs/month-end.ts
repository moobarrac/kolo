import { admin } from "./client.js";

// Month-end job (§12, items 5–6). Activated in Phase 5 (FX) and Phase 3 (assets).
//
//   5. FX revaluation — post an fx_revaluation entry per foreign monetary account
//      to bring base carrying value to the closing rate (§6.4).
//   6. Asset revaluation — auto-post asset_revaluation entries for new
//      asset_valuations rows; notify on stale valuations.

export async function runMonthEnd(): Promise<void> {
  const { data, error } = await admin.from("profiles").select("id, base_currency");
  if (error) throw error;
  console.log(`[month-end] ${(data ?? []).length} user(s)`);

  for (const profile of data ?? []) {
    // TODO(phase5): retranslate foreign-currency monetary accounts at closing rate;
    //   delta posts to fx_translation_reserve (equity, unrealized). §6.4.
    // TODO(phase3): auto-post asset_revaluation entries for new asset_valuations;
    //   offset to asset_revaluation_reserve (equity, never income). §5.4.
    console.log(`[month-end] user ${profile.id} (base ${profile.base_currency}) — no-op scaffold`);
  }
}

runMonthEnd().catch((err) => {
  console.error("[month-end] failed:", err);
  process.exit(1);
});
