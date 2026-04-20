import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync("package.json", "utf-8"));

export default defineConfig({
  plugins: [tailwindcss(), react()],
  define: {
    __MAW_VERSION__: JSON.stringify(pkg.version),
    __MAW_BUILD__: JSON.stringify(new Date().toLocaleString("sv-SE", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" })),
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  root: ".",
  base: "/maw/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    host: true,
    allowedHosts: ["white.local"],
    proxy: {
      "/maw/api": { target: "http://localhost:3456", rewrite: (path) => path.replace(/^\/maw/, "") },
      "/maw/ws/pty": { target: "ws://localhost:3456", ws: true, rewrite: (path) => path.replace(/^\/maw/, "") },
      "/maw/ws": { target: "ws://localhost:3456", ws: true, rewrite: (path) => path.replace(/^\/maw/, "") },
    },
  },
});
