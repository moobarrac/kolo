import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";

// Installable PWA (§2.1). Server state via TanStack Query; charts via Recharts.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Kólò",
        short_name: "Kólò",
        description: "Personal financial operating system",
        theme_color: "#20503B",
        background_color: "#F3F4F0",
        display: "standalone",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@kolo/shared": fileURLToPath(new URL("../shared/src/index.ts", import.meta.url)),
    },
  },
});
