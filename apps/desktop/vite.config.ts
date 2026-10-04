import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: {
    proxy: {
      "/api/speech": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
      "/api/assistant": {
        target: "http://127.0.0.1:3002",
        changeOrigin: true,
      },
      "/api/home": {
        target: "http://127.0.0.1:3003",
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
