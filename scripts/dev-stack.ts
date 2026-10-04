import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { parseEnv } from "node:util";
import { ALL_LOCAL_PROFILES, resolveStack } from "./stack-config.js";

const root = resolve(import.meta.dirname, "..");
const envPath = resolve(root, ".env");
if (!existsSync(envPath)) throw new Error("Copy .env.example to .env and select LLM and Home providers.");
const settings = parseEnv(readFileSync(envPath, "utf8"));
const selection = resolveStack(settings);
const operation = process.argv[2];
if (!["up", "down", "config", "ps"].includes(operation ?? "")) {
  throw new Error("Usage: pnpm stack:up | stack:down | stack:config (or dev-stack.ts ps).");
}
if (operation === "up") {
  for (const model of selection.models) {
    if (!existsSync(resolve(root, model))) {
      throw new Error(`Missing ${model}; see docs/development-stack.md for model setup.`);
    }
  }
}

const environment = { ...process.env, ...settings, ...selection.environment };
environment.COMPOSE_PROJECT_NAME = `sodalis-${basename(root).toLowerCase().replace(/[^a-z0-9-]/g, "-")}`;
environment.COMPOSE_PROFILES = "";
const compose = spawnSync("docker", ["compose", "version"], { stdio: "ignore" }).status === 0
  ? { command: "docker", prefix: ["compose"] }
  : { command: "docker-compose", prefix: [] };

if (!environment.DOCKER_HOST && compose.command === "docker-compose") {
  const machine = spawnSync("podman", [
    "machine", "inspect", "--format", "{{.ConnectionInfo.PodmanSocket.Path}}",
  ], { encoding: "utf8" });
  if (machine.status === 0 && machine.stdout.trim()) {
    environment.DOCKER_HOST = `unix://${machine.stdout.trim()}`;
  } else {
    const local = spawnSync("podman", [
      "info", "--format", "{{.Host.RemoteSocket.Path}}",
    ], { encoding: "utf8" });
    if (local.status === 0 && local.stdout.trim()) {
      environment.DOCKER_HOST = `unix://${local.stdout.trim()}`;
    }
  }
}

const baseArgs = [
  ...compose.prefix,
  "--env-file", envPath,
  "-f", resolve(root, "compose.yaml"),
];
function run(args: readonly string[]): void {
  const result = spawnSync(compose.command, [...baseArgs, ...args], {
    cwd: root, env: environment, stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(`Sodalis Compose profiles: ${selection.profiles.join(", ") || "none"}`);
const allProfiles = ALL_LOCAL_PROFILES.flatMap((profile) => ["--profile", profile]);
if (operation === "up" || operation === "down") {
  run([...allProfiles, "down", "--remove-orphans"]);
}
if (operation === "up") {
  run([...selection.profiles.flatMap((profile) => ["--profile", profile]),
    "up", "--build", "-d"]);
} else if (operation === "config") {
  run([...selection.profiles.flatMap((profile) => ["--profile", profile]),
    "config", "--quiet"]);
} else if (operation === "ps") {
  run([...allProfiles, "ps"]);
}
