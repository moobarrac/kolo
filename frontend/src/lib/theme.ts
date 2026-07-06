import { useEffect, useState } from "react";

// Light/dark theme. The chosen value is stored in localStorage and applied as a
// `.dark` class on <html> (see index.html for the pre-paint bootstrap). Tokens in
// index.css do the actual recoloring, so nothing else needs to know the theme.
export type Theme = "light" | "dark";

const KEY = "kolo-theme";
const EVENT = "kolo-theme";

export function getTheme(): Theme {
  const stored = localStorage.getItem(KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function setTheme(theme: Theme): void {
  localStorage.setItem(KEY, theme);
  document.documentElement.classList.toggle("dark", theme === "dark");
  // Match the mobile browser chrome to the page (canvas dark / brand forest).
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#0f1512" : "#20503b");
  window.dispatchEvent(new Event(EVENT));
}

// Subscribes to theme changes so every toggle in the UI stays in sync.
export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, set] = useState<Theme>(getTheme);
  useEffect(() => {
    const onChange = () => set(getTheme());
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);
  return [theme, setTheme];
}
