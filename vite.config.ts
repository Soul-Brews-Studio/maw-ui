import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { resolve } from "path";
import pkg from "./package.json";

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
      "/api": "http://10.20.0.7:3456",
      "/ws/pty": { target: "ws://10.20.0.7:3456", ws: true },
      "/ws": { target: "ws://10.20.0.7:3456", ws: true },
    },
  },
});
