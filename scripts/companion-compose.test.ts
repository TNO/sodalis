import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveStack } from "./stack-config.js";
import { validateReadingsFile } from "../apps/server/src/assistant/harness/settings.js";

const root = resolve(import.meta.dirname, "..");
const compose = spawnSync("docker", ["compose", "version"], { stdio: "ignore" }).status === 0
  ? { command: "docker", prefix: ["compose"] }
  : { command: "docker-compose", prefix: [] };
const available = spawnSync(compose.command, [...compose.prefix, "version"], { stdio: "ignore" }).status === 0;
const base = {
  STT_PROVIDER: "mock", TTS_PROVIDER: "mock", LLM_PROVIDER: "mock",
  HOME_PROVIDER: "external-api", HOME_API_URL: "http://home.test",
};

interface ComposeConfig {
  services: Record<string, {
    environment?: Record<string, string>;
    command?: string[];
    networks?: Record<string, unknown>;
    volumes?: { type: string; source: string; target: string; read_only?: boolean; bind?: { create_host_path?: boolean } }[];
  }>;
  networks?: Record<string, { external?: boolean; name?: string }>;
}

describe.skipIf(!available)("companion Compose configuration (no daemon or model required)", () => {
  it.each([false, true])("renders the AI configuration with readings enabled=%s", (readings) => {
    const directory = mkdtempSync(join(tmpdir(), "sodalis-compose-"));
    try {
      const envFile = join(directory, "empty.env");
      writeFileSync(envFile, "");
      const source = join(directory, "readings.sqlite");
      writeFileSync(source, "synthetic fixture; configuration rendering does not open SQLite");
      const settings = readings
        ? {
            ...base, COMPANION_HARNESS: "pi", HOME_GRAPH_URL: "bolt://graph.test:7687",
            HOME_GRAPH_PASSWORD: "synthetic-test-password", HOME_DATA_SQLITE_FILE: source,
          }
        : base;
      const selected = resolveStack(settings);
      const args = [
        ...compose.prefix, "--env-file", envFile, "-f", join(root, "compose.yaml"),
        ...(selected.environment.HOME_DATA_SQLITE_SOURCE
          ? ["-f", join(root, "compose.companion-data.yaml")] : []),
        "config", "--format", "json",
      ];
      const result = spawnSync(compose.command, args, {
        cwd: root, encoding: "utf8", timeout: 10_000,
        env: {
          PATH: process.env.PATH, HOME: process.env.HOME, SystemRoot: process.env.SystemRoot,
          ...selected.environment,
        },
      });
      expect(result.status, result.stderr).toBe(0);
      const config = JSON.parse(result.stdout) as ComposeConfig;
      const ai = config.services.ai!;
      expect(ai.command).toEqual(["pnpm", "--filter", "@sodalis/server", "start:ai"]);
      expect(ai.environment).toMatchObject({
        COMPANION_HARNESS: readings ? "pi" : "off",
        HOME_DATA_SQLITE_FILE: readings ? "/data/home/readings.sqlite" : "",
      });
      if (readings) {
        expect(ai.environment).toMatchObject({
          HOME_GRAPH_URL: "bolt://graph.test:7687", HOME_GRAPH_PASSWORD: "synthetic-test-password",
        });
        const readingsVolume = ai.volumes?.find((volume) => volume.target === "/data/home/readings.sqlite");
        expect(readingsVolume).toMatchObject({
          type: "bind", source, target: "/data/home/readings.sqlite", read_only: true,
        });
        // Older Compose versions omit false fields from their JSON output.
        expect(readingsVolume?.bind?.create_host_path ?? false).toBe(false);
      } else {
        expect(ai.volumes?.some((volume) => volume.type === "bind")).toBe(false);
      }
      expect(config.services.speech?.environment).not.toHaveProperty("HOME_GRAPH_PASSWORD");
      expect(config.services.gateway?.environment).not.toHaveProperty("HOME_GRAPH_PASSWORD");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("shares only the AI service on a graph network named after the worktree prefix", () => {
    const directory = mkdtempSync(join(tmpdir(), "sodalis-compose-"));
    try {
      const envFile = join(directory, "empty.env");
      writeFileSync(envFile, "");
      const args = [
        ...compose.prefix, "--env-file", envFile, "-f", join(root, "compose.yaml"),
        "config", "--format", "json",
      ];
      const result = spawnSync(compose.command, args, {
        cwd: root, encoding: "utf8", timeout: 10_000,
        env: {
          PATH: process.env.PATH, HOME: process.env.HOME, SystemRoot: process.env.SystemRoot,
          ...resolveStack(base).environment, SODALIS_SERVICE_PREFIX: "sodalis-feature",
        },
      });
      expect(result.status, result.stderr).toBe(0);
      const config = JSON.parse(result.stdout) as ComposeConfig;
      expect(Object.keys(config.services.ai?.networks ?? {}).sort()).toEqual(["default", "graph"]);
      expect(config.networks?.graph).toMatchObject({ name: "sodalis-feature" });
      expect(config.networks?.graph?.external).toBeFalsy();
      expect(config.services.speech?.networks).not.toHaveProperty("graph");
      expect(config.services.gateway?.networks).not.toHaveProperty("graph");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe("companion readings preflight", () => {
  it("accepts only an existing readable regular file before the stack is restarted", () => {
    const directory = mkdtempSync(join(tmpdir(), "sodalis-readings-preflight-"));
    try {
      expect(() => validateReadingsFile("relative.sqlite")).toThrow("absolute");
      expect(() => validateReadingsFile(directory)).toThrow("regular file");
      expect(() => validateReadingsFile(join(directory, "missing.sqlite"))).toThrow("ENOENT");
      const file = join(directory, "readings.sqlite");
      writeFileSync(file, "synthetic fixture");
      expect(() => validateReadingsFile(file)).not.toThrow();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
