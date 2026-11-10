import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const gateway = process.env.SODALIS_API_GATEWAY_URL;

/** GLB files in a licensed-avatar folder; a missing folder means none. */
export function licensedAvatarFiles(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".glb"))
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if ((error as { code?: unknown }).code === "ENOENT") return [];
    throw error;
  }
}

// Tests must not depend on which licensed avatars a developer has copied in.
const licensedAvatars = process.env.VITEST
  ? []
  : licensedAvatarFiles(
      fileURLToPath(new URL("./public/avatars/licensed/", import.meta.url)),
    );

export default defineConfig({
  base: "./",
  define: {
    __SODALIS_LICENSED_AVATARS__: JSON.stringify(licensedAvatars),
  },
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
