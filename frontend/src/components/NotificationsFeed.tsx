import { Bell, X } from "lucide-react";
import { useNotifications, useDismissNotification, useDismissAllNotifications } from "@/lib/data";

// In-app notification feed (§12.3, §13). Shown at the top of the Overview when
// there's anything to see; each can be dismissed.
const dot: Record<string, string> = {
  info: "bg-brass",
  warning: "bg-loss",
  critical: "bg-loss",
};

export function NotificationsFeed() {
  const notifications = useNotifications();
  const dismiss = useDismissNotification();
  const dismissAll = useDismissAllNotifications();
  const items = notifications.data ?? [];
  if (items.length === 0) return null;

  return (
    <section className="mb-6 rounded-2xl bg-surface p-5 shadow-sm ring-1 ring-ink/5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm uppercase tracking-wide text-ink/50">
          <Bell size={15} strokeWidth={1.75} /> Reminders
        </div>
        {items.length > 1 && (
          <button
            onClick={() => dismissAll.mutate()}
            disabled={dismissAll.isPending}
            className="text-xs text-brass hover:underline disabled:opacity-50"
          >
            Clear all
          </button>
        )}
      </div>
      <ul className="space-y-2">
        {items.map((n) => (
          <li key={n.id} className="flex items-start justify-between gap-3 rounded-xl bg-canvas/60 px-4 py-3">
            <div className="flex items-start gap-3">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot[n.severity] ?? "bg-brass"}`} />
              <div>
                <p className="text-sm font-medium">{n.title}</p>
                {n.body && <p className="text-xs text-ink/55">{n.body}</p>}
              </div>
            </div>
            <button
              onClick={() => dismiss.mutate(n.id)}
              aria-label="Dismiss"
              className="rounded-md p-1 text-ink/40 hover:bg-ink/5 hover:text-ink/70"
            >
              <X size={15} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
