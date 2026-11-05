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

export interface CompanionAuditSettings {
  readonly COMPANION_AUDIT?: string;
  readonly NODE_ENV?: string;
}

export interface EmailSettings {
  readonly COMPANION_HARNESS?: string;
  readonly EMAIL_PROVIDER?: string;
  readonly EMAIL_RESIDENT_ID?: string;
  readonly EMAIL_OAUTH_CLIENT_ID?: string;
  readonly EMAIL_OAUTH_CLIENT_SECRET_REF?: string;
  readonly EMAIL_OAUTH_REDIRECT_URI?: string;
  readonly EMAIL_GRAPH_TENANT?: string;
}

export type EmailProviderSetting = "off" | "mock" | "graph" | "gmail";

function emailProvider(value: string | undefined): EmailProviderSetting {
  const provider = value?.trim() || "off";
  if (provider !== "off" && provider !== "mock" && provider !== "graph" && provider !== "gmail") {
    throw new Error("EMAIL_PROVIDER must be off, mock, graph or gmail.");
  }
  return provider;
}

function validateEmailRedirect(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("EMAIL_OAUTH_REDIRECT_URI must be an absolute same-origin callback URL.");
  }
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
    url.username || url.password || url.search || url.hash ||
    url.pathname !== "/api/email/callback"
  ) {
    throw new Error("EMAIL_OAUTH_REDIRECT_URI must be HTTPS, except HTTP on loopback, and use /api/email/callback.");
  }
}

/** Validate exact provider selection before constructing the host reader. */
export function validateEmailSettings(settings: EmailSettings): EmailProviderSetting {
  const provider = emailProvider(settings.EMAIL_PROVIDER);
  const fields = [
    "EMAIL_RESIDENT_ID",
    "EMAIL_OAUTH_CLIENT_ID",
    "EMAIL_OAUTH_CLIENT_SECRET_REF",
    "EMAIL_OAUTH_REDIRECT_URI",
    "EMAIL_GRAPH_TENANT",
  ] as const;
  const configured = fields.filter((key) => settings[key]?.trim());
  if (provider === "off") {
    if (configured.length) throw new Error(`${configured[0]} requires EMAIL_PROVIDER to be enabled.`);
    return provider;
  }
  if (settings.COMPANION_HARNESS?.trim() !== "pi") {
    throw new Error("EMAIL_PROVIDER requires COMPANION_HARNESS=pi.");
  }
  if (!settings.EMAIL_RESIDENT_ID?.trim()) throw new Error("Set EMAIL_RESIDENT_ID for email access.");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(settings.EMAIL_RESIDENT_ID.trim())) {
    throw new Error("EMAIL_RESIDENT_ID must be a non-secret local resident identifier.");
  }
  if (provider === "mock") {
    const oauth = configured.find((key) => key !== "EMAIL_RESIDENT_ID");
    if (oauth) throw new Error(`${oauth} is not used by EMAIL_PROVIDER=mock.`);
    return provider;
  }
  if (!settings.EMAIL_OAUTH_CLIENT_ID?.trim()) throw new Error("Set EMAIL_OAUTH_CLIENT_ID for the selected email provider.");
  if (!settings.EMAIL_OAUTH_CLIENT_SECRET_REF?.trim()) throw new Error("Set EMAIL_OAUTH_CLIENT_SECRET_REF for the selected email provider.");
  if (!settings.EMAIL_OAUTH_REDIRECT_URI?.trim()) throw new Error("Set EMAIL_OAUTH_REDIRECT_URI for the selected email provider.");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(settings.EMAIL_OAUTH_CLIENT_SECRET_REF.trim())) {
    throw new Error("EMAIL_OAUTH_CLIENT_SECRET_REF must be a non-secret credential-store key.");
  }
  validateEmailRedirect(settings.EMAIL_OAUTH_REDIRECT_URI.trim());
  if (provider === "graph") {
    const tenant = settings.EMAIL_GRAPH_TENANT?.trim();
    if (!tenant) throw new Error("Set EMAIL_GRAPH_TENANT for Microsoft Graph email access.");
    if (!["common", "consumers", "organizations"].includes(tenant) &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenant)) {
      throw new Error("EMAIL_GRAPH_TENANT must be common, consumers, organizations or a tenant UUID.");
    }
  } else if (settings.EMAIL_GRAPH_TENANT?.trim()) {
    throw new Error("EMAIL_GRAPH_TENANT is only valid with EMAIL_PROVIDER=graph.");
  }
  return provider;
}

export function validateCompanionAuditSettings(settings: CompanionAuditSettings): boolean {
  const value = settings.COMPANION_AUDIT?.trim() || "false";
  if (value !== "true" && value !== "false") {
    throw new Error("COMPANION_AUDIT must be true or false.");
  }
  const nodeEnv = settings.NODE_ENV?.trim() || process.env.NODE_ENV;
  if (value === "true" && nodeEnv === "production") {
    throw new Error("COMPANION_AUDIT cannot be enabled in production.");
  }
  return value === "true";
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
