import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// Mesma lista de prefixos de rota da API que o backend usa pro seu próprio
// notFoundHandler (server/src/app.ts): sem isso, o navigateFallback do service
// worker serviria o index.html no lugar de uma rota de API em navegação direta.
const API_PREFIXES = [
  "/auth",
  "/payables",
  "/receivables",
  "/entries",
  "/settlements",
  "/transfers",
  "/bank-accounts",
  "/categories",
  "/cost-centers",
  "/dashboard",
  "/reports",
  "/users",
  "/notifications",
  "/budgets",
  "/telegram",
  "/health",
];

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["logo.svg", "icons/apple-touch-icon.png"],
      manifest: {
        name: "FluxoCaixa",
        short_name: "FluxoCaixa",
        description: "Controle financeiro da sua empresa",
        lang: "pt-BR",
        theme_color: "#1E4E8C",
        background_color: "#0b1420",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // API sempre network: dado financeiro nunca deve vir de cache.
        navigateFallbackDenylist: API_PREFIXES.map((prefix) => new RegExp(`^${prefix}(/|$)`)),
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/auth": "http://localhost:3333",
      "/payables": "http://localhost:3333",
      "/receivables": "http://localhost:3333",
      "/entries": "http://localhost:3333",
      "/settlements": "http://localhost:3333",
      "/transfers": "http://localhost:3333",
      "/bank-accounts": "http://localhost:3333",
      "/categories": "http://localhost:3333",
      "/cost-centers": "http://localhost:3333",
      "/dashboard": "http://localhost:3333",
      "/reports": "http://localhost:3333",
      "/users": "http://localhost:3333",
      "/notifications": "http://localhost:3333",
      "/budgets": "http://localhost:3333",
      "/health": "http://localhost:3333",
    },
  },
});
