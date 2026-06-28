import { admin } from "./client.js";

// Daily job (§12). Runs per user. Because it always writes rows, it also keeps
// the free Supabase project warm (§2.2). Activated incrementally across phases —
// this is the scaffold + the integrity gate, which is needed from Phase 1.
//
//   1. Materialize recurring  (Phase 2)
//   2. Net-worth snapshot      (Phase 1) — skip + alert if ledger imbalanced
//   3. Notifications           (Phase 4)
//   4. Backup to object storage (free tier has no backups, §2.2)

async function listUserIds(): Promise<string[]> {
  const { data, error } = await admin.from("profiles").select("id");
  if (error) throw error;
  return (data ?? []).map((r) => r.id as string);
}

async function checkIntegrity(userId: string): Promise<bigint> {
  // fn_ledger_imbalance must return 0 (§10.6). Non-zero -> refuse to snapshot.
  const { data, error } = await admin.rpc("fn_ledger_imbalance", { p_user: userId });
  if (error) throw error;
  return BigInt(data ?? 0);
}

export async function runDaily(): Promise<void> {
  const userIds = await listUserIds();
  console.log(`[daily] ${userIds.length} user(s)`);

  for (const userId of userIds) {
    const imbalance = await checkIntegrity(userId);
    if (imbalance !== 0n) {
      console.error(`[daily] user ${userId} ledger imbalanced by ${imbalance} — skipping snapshot`);
      // TODO(phase1): insert integrity_error notification (dedupe_key); refuse snapshot.
      continue;
    }
    // TODO(phase2): materialize recurring rules where next_run <= today.
    // TODO(phase1): compute + write net_worth_snapshots row with rates used.
    // TODO(phase4): notifications pass (receivables due/overdue, goals, low balance).
    // TODO: logical backup dump to object storage.
    console.log(`[daily] user ${userId} ok (imbalance=0)`);
  }
}

runDaily().catch((err) => {
  console.error("[daily] failed:", err);
  process.exit(1);
});
