export type EmailConnectionProvider = "mock" | "graph" | "gmail";

export interface EmailConnectionView {
  readonly provider: EmailConnectionProvider;
  readonly connected: boolean;
  readonly accountLabel?: string;
  readonly disclosure: string;
  readonly disconnectNotice: string;
  readonly scopes: readonly string[];
}

export type EmailConnectionResult =
  | { readonly status: "unavailable" }
  | { readonly status: "ready"; readonly connection: EmailConnectionView };

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function json(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

export class EmailConnectionClient {
  private readonly baseUrl: string;
  private readonly fetcher: FetchLike;
  private csrfToken: string | undefined;

  constructor(options: { readonly baseUrl?: string; readonly fetch?: FetchLike } = {}) {
    this.baseUrl = (options.baseUrl ?? "/api").replace(/\/+$/, "");
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async status(): Promise<EmailConnectionResult> {
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}/email/connection`, {
        method: "GET",
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
    } catch {
      return { status: "unavailable" };
    }
    if (response.status === 404) return { status: "unavailable" };
    const payload: unknown = await json(response);
    if (
      !response.ok ||
      !isRecord(payload) ||
      !["mock", "graph", "gmail"].includes(String(payload.provider)) ||
      typeof payload.connected !== "boolean" ||
      typeof payload.disclosure !== "string" ||
      typeof payload.disconnectNotice !== "string" ||
      !Array.isArray(payload.scopes) ||
      !payload.scopes.every((scope) => typeof scope === "string") ||
      typeof payload.csrfToken !== "string"
    ) {
      return { status: "unavailable" };
    }
    this.csrfToken = payload.csrfToken;
    return {
      status: "ready",
      connection: {
        provider: payload.provider as EmailConnectionProvider,
        connected: payload.connected,
        ...(typeof payload.accountLabel === "string" ? { accountLabel: payload.accountLabel } : {}),
        disclosure: payload.disclosure,
        disconnectNotice: payload.disconnectNotice,
        scopes: payload.scopes as string[],
      },
    };
  }

  async connect(): Promise<{ readonly connected: boolean; readonly authorizeUrl?: string }> {
    if (!this.csrfToken) throw new Error("Refresh email connection status before connecting.");
    const response = await this.fetcher(`${this.baseUrl}/email/connect`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "x-sodalis-csrf": this.csrfToken, accept: "application/json" },
    });
    const payload: unknown = await json(response);
    if (!response.ok && isRecord(payload) && typeof payload.error === "string") {
      if (payload.error === "credential_unavailable") {
        throw new Error("Email access is not configured in the server's secure credential store.");
      }
      if (payload.error === "provider_unavailable") {
        throw new Error("The email provider is unavailable. Try again.");
      }
    }
    if (!response.ok || !isRecord(payload) || typeof payload.status !== "string") {
      throw new Error("Email connection could not be started.");
    }
    if (payload.status === "connected") return { connected: true };
    if (payload.status !== "redirect" || typeof payload.authorizeUrl !== "string") {
      throw new Error("Email connection could not be started.");
    }
    let authorizeUrl: URL;
    try {
      authorizeUrl = new URL(payload.authorizeUrl);
    } catch {
      throw new Error("Email provider returned an invalid authorization address.");
    }
    if (
      authorizeUrl.protocol !== "https:" ||
      !["accounts.google.com", "login.microsoftonline.com"].includes(authorizeUrl.hostname)
    ) {
      throw new Error("Email provider returned an invalid authorization address.");
    }
    return { connected: false, authorizeUrl: authorizeUrl.toString() };
  }

  async disconnect(): Promise<void> {
    if (!this.csrfToken) throw new Error("Refresh email connection status before disconnecting.");
    const response = await this.fetcher(`${this.baseUrl}/email/connection`, {
      method: "DELETE",
      credentials: "same-origin",
      headers: { "x-sodalis-csrf": this.csrfToken, accept: "application/json" },
    });
    const payload: unknown = await json(response);
    if (!response.ok || !isRecord(payload) || payload.status !== "disconnected") {
      throw new Error("Email connection could not be disconnected.");
    }
  }
}
