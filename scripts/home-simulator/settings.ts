import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

export function homeSimulatorEnvironment(): NodeJS.ProcessEnv {
  const path = resolve(import.meta.dirname, "../../.env");
  return { ...(existsSync(path) ? parseEnv(readFileSync(path, "utf8")) : {}), ...process.env };
}
