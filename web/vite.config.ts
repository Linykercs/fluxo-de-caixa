import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
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
      "/health": "http://localhost:3333",
    },
  },
});
