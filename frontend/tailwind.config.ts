import type { Config } from "tailwindcss";

// Design system — "private ledger" (§13.2). Deep forest + brass on cool paper.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      // Semantic tokens resolve to CSS variables (see index.css) so the same
      // class works in light and dark. `<alpha-value>` keeps `/opacity` modifiers.
      colors: {
        ink: "rgb(var(--color-ink) / <alpha-value>)",
        canvas: "rgb(var(--color-canvas) / <alpha-value>)",
        paper: "rgb(var(--color-paper) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        forest: "rgb(var(--color-forest) / <alpha-value>)",
        brass: "rgb(var(--color-brass) / <alpha-value>)",
        gain: "rgb(var(--color-gain) / <alpha-value>)", // unrealized appreciation / inflow
        loss: "rgb(var(--color-loss) / <alpha-value>)", // money leaving / unrealized loss (clay)
      },
      fontFamily: {
        display: ['"Space Grotesk"', "system-ui", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
        // figures in tabular monospace so columns align like a statement (§13.2)
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
