import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme";

// Light/dark switch. `variant="full"` is a labelled row for Settings; the default
// is a compact icon button (used in the sidebar footer).
export function ThemeToggle({ variant = "icon" }: { variant?: "icon" | "full" }) {
  const [theme, setTheme] = useTheme();
  const dark = theme === "dark";
  const toggle = () => setTheme(dark ? "light" : "dark");
  const Icon = dark ? Sun : Moon;

  if (variant === "full") {
    return (
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between rounded-xl bg-surface px-4 py-3 text-sm ring-1 ring-ink/5"
      >
        <span className="flex items-center gap-2 text-ink/80">
          <Icon size={16} strokeWidth={1.75} />
          {dark ? "Dark mode" : "Light mode"}
        </span>
        <span className="text-xs text-brass">{dark ? "Switch to light" : "Switch to dark"}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink/70 hover:bg-ink/5"
    >
      <Icon size={18} strokeWidth={1.75} />
      <span>{dark ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}
