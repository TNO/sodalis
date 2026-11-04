import { accessSync, constants, statSync } from "node:fs";
import { isAbsolute } from "node:path";

export interface CompanionDataSettings {
  readonly COMPANION_HARNESS?: string;
  readonly HOME_GRAPH_URL?: string;
  readonly HOME_GRAPH_USER?: string;
  readonly HOME_GRAPH_PASSWORD?: string;
  readonly HOME_GRAPH_DATABASE?: string;
  readonly HOME_GRAPH_SCOPE?: string;
  readonly HOME_DATA_SQLITE_FILE?: string;
  readonly HOME_DATA_SQLITE_ENDPOINT?: string;
}

function companionHarnessMode(value: string | undefined): "off" | "pi" {
  const mode = value?.trim() || "off";
  if (mode !== "off" && mode !== "pi") {
    throw new Error("COMPANION_HARNESS must be off or pi.");
  }
  return mode;
}

/** Shared by native startup and Compose selection; never resolves graph-provided paths. */
export function validateCompanionSettings(settings: CompanionDataSettings): "off" | "pi" {
  const mode = companionHarnessMode(settings.COMPANION_HARNESS);
  const configured = ([
    "HOME_GRAPH_URL", "HOME_GRAPH_USER", "HOME_GRAPH_PASSWORD", "HOME_GRAPH_DATABASE",
    "HOME_GRAPH_SCOPE", "HOME_DATA_SQLITE_FILE", "HOME_DATA_SQLITE_ENDPOINT",
  ] as const).filter((key) => settings[key]?.trim());
  if (mode === "off") {
    if (configured.length) throw new Error(`${configured[0]} requires COMPANION_HARNESS=pi.`);
    return mode;
  }
  const graphUrl = settings.HOME_GRAPH_URL?.trim();
  if (graphUrl) {
    const url = new URL(graphUrl);
    if (
      !["bolt:", "bolt+s:", "neo4j:", "neo4j+s:"].includes(url.protocol) ||
      !url.hostname || url.username || url.password || url.search || url.hash ||
      (url.pathname !== "" && url.pathname !== "/")
    ) {
      throw new Error("HOME_GRAPH_URL must be a bolt:// or neo4j:// origin without credentials, path, query or fragment.");
    }
    if (!settings.HOME_GRAPH_PASSWORD?.trim()) throw new Error("Set HOME_GRAPH_PASSWORD for HOME_GRAPH_URL.");
  } else if (configured.length) {
    throw new Error(`${configured[0]} requires HOME_GRAPH_URL.`);
  }
  if (settings.HOME_DATA_SQLITE_ENDPOINT?.trim() && !settings.HOME_DATA_SQLITE_FILE?.trim()) {
    throw new Error("HOME_DATA_SQLITE_ENDPOINT requires HOME_DATA_SQLITE_FILE.");
  }
  return mode;
}

export function validateReadingsFile(file: string): void {
  if (!isAbsolute(file)) throw new Error("HOME_DATA_SQLITE_FILE must be an absolute file path.");
  if (!statSync(file).isFile()) throw new Error("HOME_DATA_SQLITE_FILE must be a regular file.");
  accessSync(file, constants.R_OK);
}
