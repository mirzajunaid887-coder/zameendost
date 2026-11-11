import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath } from "node:url";

// GitHub project pages are served from /<repo>/. Set VITE_BASE=/zameendost/ in CI (see .github/workflows/pages.yml).
const base = process.env.VITE_BASE ?? "/zameendost/";

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "ZameenDost", short_name: "ZameenDost", description: "Irrigation advice for farmers / کسانوں کے لیے آبپاشی مشورہ",
        start_url: base, scope: base, display: "standalone", background_color: "#f6f8f3", theme_color: "#2f6b3a", lang: "ur", dir: "rtl",
        icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
        navigateFallback: `${base}index.html`,
        runtimeCaching: [{ urlPattern: /^https:\/\/[abc]\.tile\.openstreetmap\.org\/.*/, handler: "CacheFirst", options: { cacheName: "osm-tiles", expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 14 } } }],
      },
    }),
  ],
  resolve: { alias: { "@engine": fileURLToPath(new URL("../irrigation-engine/typescript/src/index.ts", import.meta.url)) } },
  server: { fs: { allow: [".."] } },
});
