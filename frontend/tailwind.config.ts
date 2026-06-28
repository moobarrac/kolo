import type { Config } from "tailwindcss";

// Design system — "private ledger" (§13.2). Deep forest + brass on cool paper.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink: "#16271E",
        paper: "#F3F4F0",
        surface: "#FFFFFF",
        forest: "#20503B",
        brass: "#B07D2B",
        gain: "#20503B", // unrealized appreciation / inflow
        loss: "#A23C2B", // money leaving / unrealized loss (clay)
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
