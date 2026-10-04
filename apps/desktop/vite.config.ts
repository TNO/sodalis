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
    },
  },
  build: {
    outDir: "../../dist/desktop",
    emptyOutDir: true,
  },
});
