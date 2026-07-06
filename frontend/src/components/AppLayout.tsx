import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { LogOut, MoreHorizontal } from "lucide-react";
import { NAV_ITEMS } from "@/app/nav";
import { useAuth } from "@/lib/auth";
import { ThemeToggle } from "@/components/ThemeToggle";

const MOBILE_PRIMARY = NAV_ITEMS.filter((i) => i.primary);
const MOBILE_MORE = NAV_ITEMS.filter((i) => !i.primary);

// App shell (§13.1): left sidebar on desktop, bottom nav on mobile.
// Both navs render from NAV_ITEMS so they never drift apart.
export function AppLayout() {
  const { session, signOut } = useAuth();
  const email = session?.user.email ?? "";
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = MOBILE_MORE.some((i) => pathname === i.path || pathname.startsWith(`${i.path}/`));

  return (
    <div className="min-h-screen bg-canvas text-ink">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-ink/10 bg-surface md:flex">
        <div className="px-6 py-6">
          <span className="font-display text-2xl font-bold text-forest">Kólò</span>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV_ITEMS.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              end={path === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive ? "bg-forest/10 font-medium text-forest" : "text-ink/70 hover:bg-ink/5"
                }`
              }
            >
              <Icon size={18} strokeWidth={1.75} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-ink/10 px-3 py-4">
          <p className="truncate px-3 pb-2 text-xs text-ink/50">{email}</p>
          <ThemeToggle />
          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink/70 hover:bg-ink/5"
          >
            <LogOut size={18} strokeWidth={1.75} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="md:pl-60">
        <main className="mx-auto max-w-4xl px-5 pb-24 pt-8 md:pb-12">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav: 4 primary tabs + a "More" sheet for the rest */}
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-ink/10 bg-surface/95 px-1 py-1 backdrop-blur md:hidden">
        {MOBILE_PRIMARY.map(({ path, label, short, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === "/"}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[0.65rem] ${
                isActive ? "text-forest" : "text-ink/55"
              }`
            }
          >
            <Icon size={20} strokeWidth={1.75} />
            <span className="leading-none">{short ?? label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-label="More"
          className={`flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[0.65rem] ${
            moreActive ? "text-forest" : "text-ink/55"
          }`}
        >
          <MoreHorizontal size={20} strokeWidth={1.75} />
          <span className="leading-none">More</span>
        </button>
      </nav>

      {/* "More" sheet — overflow destinations plus theme + sign out (mobile only) */}
      {moreOpen && (
        <div className="fixed inset-0 z-30 md:hidden" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-ink/40" />
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-surface p-4 pb-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink/15" />
            {email && <p className="mb-3 truncate px-1 text-xs text-ink/50">{email}</p>}
            <div className="grid grid-cols-3 gap-2">
              {MOBILE_MORE.map(({ path, label, icon: Icon }) => (
                <NavLink
                  key={path}
                  to={path}
                  onClick={() => setMoreOpen(false)}
                  className={({ isActive }) =>
                    `flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-center text-xs leading-tight ${
                      isActive ? "bg-forest/10 text-forest" : "text-ink/70 hover:bg-ink/5"
                    }`
                  }
                >
                  <Icon size={20} strokeWidth={1.75} />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-ink/10 pt-3">
              <ThemeToggle />
              <button
                onClick={() => { setMoreOpen(false); signOut(); }}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink/70 hover:bg-ink/5"
              >
                <LogOut size={18} strokeWidth={1.75} />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
