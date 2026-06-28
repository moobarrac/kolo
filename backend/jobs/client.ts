import { createClient } from "@supabase/supabase-js";

// [INVARIANT §2.4 / §2.5] The service-role key is used EXCLUSIVELY by these
// server-side scheduled jobs. It must never be shipped to the client or
// committed to the repo. It is read from the job runtime environment only.
const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error(
    "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the job environment.",
  );
}

// Service-role bypasses RLS — jobs must scope every query by user_id themselves.
export const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
