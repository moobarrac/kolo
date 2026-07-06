import type { LucideIcon } from "lucide-react";

// Placeholder empty state for views not built yet. Empty states are invitations,
// in plain language (§13.6).
export function ComingSoon({ icon: Icon, message }: { icon: LucideIcon; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink/15 bg-surface/50 py-20 text-center">
      <Icon size={40} strokeWidth={1.5} className="text-brass" />
      <p className="mt-4 max-w-xs text-ink/55">{message}</p>
    </div>
  );
}
