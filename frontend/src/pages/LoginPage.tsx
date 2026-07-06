import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

// Sign in / create account (§15 Phase 0). On sign-up, the database seeds the new
// user's starting accounts automatically. Copy is plain English.
type Mode = "signin" | "signup";

export function LoginPage() {
  const { session, loading } = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already signed in → go where they were headed (or the overview).
  if (!loading && session) {
    const to = (location.state as { from?: Location })?.from?.pathname ?? "/";
    return <Navigate to={to} replace />;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } =
      mode === "signup"
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setBusy(false);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="font-display text-4xl font-bold text-forest">Kólò</h1>
      <p className="mb-8 mt-1 text-ink/60">
        {mode === "signup" ? "Create your account." : "Welcome back."}
      </p>

      <form onSubmit={submit} className="space-y-4">
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-ink/15 bg-surface px-4 py-3 outline-none focus:border-forest"
        />
        <input
          type="password"
          required
          minLength={6}
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-ink/15 bg-surface px-4 py-3 outline-none focus:border-forest"
        />
        {error && <p className="text-sm text-loss">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-forest px-4 py-3 font-medium text-paper disabled:opacity-50"
        >
          {busy ? "…" : mode === "signup" ? "Create account" : "Sign in"}
        </button>
      </form>

      <button
        onClick={() => {
          setMode(mode === "signup" ? "signin" : "signup");
          setError(null);
        }}
        className="mt-6 text-sm text-brass hover:underline"
      >
        {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
      </button>
    </main>
  );
}
