import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync("package.json", "utf-8"));

const MAW_HTTP = process.env.VITE_MAW_URL ?? "http://localhost:3456";
const MAW_WS = MAW_HTTP.replace(/^http/, "ws");

export default defineConfig({
  plugins: [tailwindcss(), react()],
  define: {
    __MAW_VERSION__: JSON.stringify(pkg.version),
    __MAW_BUILD__: JSON.stringify(new Date().toLocaleString("sv-SE", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" })),
  },
  root: ".",
  base: "/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    host: true,
    allowedHosts: ["white.local", "localhost", "127.0.0.1", "0.0.0.0"],
    proxy: {
      "/api": MAW_HTTP,
      "/ws/pty": { target: MAW_WS, ws: true },
      "/ws": { target: MAW_WS, ws: true },
    },
  },
});
