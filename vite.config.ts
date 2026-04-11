import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { resolve } from "path";
import pkg from "./package.json";

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
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        mission: resolve(__dirname, "mission.html"),
        fleet: resolve(__dirname, "fleet.html"),
        dashboard: resolve(__dirname, "dashboard.html"),
        terminal: resolve(__dirname, "terminal.html"),
        office: resolve(__dirname, "office.html"),
        overview: resolve(__dirname, "overview.html"),
        chat: resolve(__dirname, "chat.html"),
        config: resolve(__dirname, "config.html"),
        inbox: resolve(__dirname, "inbox.html"),
        arena: resolve(__dirname, "arena.html"),
        federation: resolve(__dirname, "federation.html"),
        federation_2d: resolve(__dirname, "federation_2d.html"),
        talk: resolve(__dirname, "talk.html"),
        timemachine: resolve(__dirname, "timemachine.html"),
        shrine: resolve(__dirname, "shrine.html"),
        workspace: resolve(__dirname, "workspace.html"),
      },
    },
  },
  server: {
    host: true,
    allowedHosts: true,
    proxy: {
      "/api": MAW_HTTP,
      "/ws/pty": { target: MAW_WS, ws: true },
      "/ws": { target: MAW_WS, ws: true },
    },
  },
});
