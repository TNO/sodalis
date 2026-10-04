import { defineConfig } from "vite";

const gateway = process.env.SODALIS_API_GATEWAY_URL;

export default defineConfig({
  base: "./",
  server: {
    proxy: {
      "/api/speech": {
        target:
          process.env.SODALIS_SPEECH_API_URL ?? gateway ?? "http://127.0.0.1:3001",
        changeOrigin: true,
      },
      "/api/assistant": {
        target:
          process.env.SODALIS_AI_API_URL ?? gateway ?? "http://127.0.0.1:3002",
        changeOrigin: true,
      },
      "/api/home": {
        target:
          process.env.SODALIS_HOME_API_URL ?? gateway ?? "http://127.0.0.1:3003",
        changeOrigin: true,
      },
      ...(process.env.HOME_ADMIN_UI === "1"
        ? {
            "/": {
              target: process.env.HOME_ASSISTANT_URL ||
                "http://127.0.0.1:8123",
              changeOrigin: true,
              ws: true,
            },
          }
        : {}),
    },
  },
  build: {
    outDir: "../../dist/desktop",
    emptyOutDir: true,
  },
});
