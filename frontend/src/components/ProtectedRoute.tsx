import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth";

// Gate for signed-in-only routes. Sends signed-out users to /login, remembering
// where they were headed so we can return them there after sign-in.
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas">
        <div className="animate-pulse font-display text-3xl font-bold text-forest/40">Kólò</div>
      </div>
    );
  }
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <>{children}</>;
}
