import { useEffect, useState } from "react";
import { Check, AlertCircle, Info, X } from "lucide-react";
import { subscribeToasts, type ToastItem } from "@/lib/toast";

const ICON = { success: Check, error: AlertCircle, info: Info };
const ACCENT = { success: "text-forest", error: "text-loss", info: "text-brass" };

// Renders the toast stack (bottom-center on mobile, bottom-right on desktop).
// Each toast auto-dismisses after a few seconds.
export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    return subscribeToasts((t) => {
      setItems((cur) => [...cur, t]);
      setTimeout(() => setItems((cur) => cur.filter((x) => x.id !== t.id)), 4000);
    });
  }, []);

  const dismiss = (id: number) => setItems((cur) => cur.filter((x) => x.id !== id));

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6">
      {items.map((t) => {
        const Icon = ICON[t.kind];
        return (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl bg-surface px-4 py-3 text-sm shadow-lg ring-1 ring-ink/10"
          >
            <Icon size={18} strokeWidth={2} className={`mt-0.5 shrink-0 ${ACCENT[t.kind]}`} />
            <span className="flex-1 text-ink/80">{t.message}</span>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-ink/35 hover:text-ink/70">
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
