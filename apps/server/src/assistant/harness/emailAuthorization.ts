import { createHash, createPublicKey, randomBytes, timingSafeEqual, verify } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { EmailConnection, EmailHttpResponse, EmailProvider } from "./emailReader.js";
import { readBoundedResponseBody } from "./boundedResponseBody.js";

const execFileAsync = promisify(execFile);
const SESSION_COOKIE = "sodalis_email_session";
const SESSION_TTL_MS = 24 * 60 * 60 * 1_000;
const AUTH_TTL_MS = 10 * 60 * 1_000;
const GOOGLE_SCOPE = "openid https://www.googleapis.com/auth/gmail.readonly";
const GRAPH_SCOPE = "openid profile https://graph.microsoft.com/Mail.Read";
const GOOGLE_KEYS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GOOGLE_PROFILE_URL = "https://gmail.googleapis.com/gmail/v1/users/me/profile";
const MAX_OAUTH_RESPONSE_BYTES = 1_048_576;
const CONSUMER_TENANT_ID = "9188040d-6c67-4c5b-b112-36a304b66dad";

export interface EmailOAuthSettings {
  readonly provider: EmailProvider | "mock";
  readonly residentId: string;
  readonly clientId?: string;
  readonly clientSecretRef?: string;
  readonly redirectUri?: string;
  readonly graphTenant?: string;
}

export interface EmailSecureCredentialStore {
  get(reference: string): Promise<string | undefined>;
}

export class SystemEmailCredentialStore implements EmailSecureCredentialStore {
  async get(reference: string): Promise<string | undefined> {
    try {
      const command = process.platform === "darwin" ? "security" : process.platform === "linux" ? "secret-tool" : undefined;
      if (!command) return undefined;
      const args = process.platform === "darwin"
        ? ["find-generic-password", "-s", "com.sodalis.email", "-a", reference, "-w"]
        : ["lookup", "service", "sodalis-email", "key", reference];
      const { stdout } = await execFileAsync(command, args, { encoding: "utf8", timeout: 2_000, maxBuffer: 8_192 });
      const value = stdout.replace(/\r?\n$/, "");
      return value || undefined;
    } catch {
      return undefined;
    }
  }
}

export interface EmailOAuthTransportResponse extends EmailHttpResponse {}
export type EmailOAuthTransport = (url: string, init?: RequestInit) => Promise<EmailOAuthTransportResponse>;

export interface EmailAuthorizationOptions {
  readonly settings: EmailOAuthSettings;
  readonly credentials: EmailSecureCredentialStore;
  readonly transport?: EmailOAuthTransport;
  readonly now?: () => number;
}

export interface EmailSession {
  readonly id: string;
  readonly csrfToken: string;
  readonly cookie: string;
  readonly created: boolean;
}

export interface EmailConnectionStatus {
  readonly provider: EmailProvider | "mock";
  readonly connected: boolean;
  readonly accountLabel?: string;
}

interface HostSession {
  readonly id: string;
  readonly csrfToken: string;
  expiresAt: number;
  authorizationVersion: number;
  handle?: string;
  mockConnected?: boolean;
  mockController?: AbortController;
}

interface PendingAuthorization {
  readonly state: string;
  readonly nonce: string;
  readonly verifier: string;
  readonly sessionId: string;
  readonly authorizationVersion: number;
  readonly expiresAt: number;
}

export type EmailAuthorizationError =
  | "invalid_callback"
  | "authorization_denied"
  | "invalid_token"
  | "insufficient_scope"
  | "credential_unavailable"
  | "provider_unavailable";

function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

function decodeBase64Url(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function defaultTransport(url: string, init?: RequestInit): Promise<EmailOAuthTransportResponse> {
  const signal = init?.signal
    ? AbortSignal.any([init.signal, AbortSignal.timeout(15_000)])
    : AbortSignal.timeout(15_000);
  const response = await fetch(url, { ...init, signal, redirect: "error" });
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers),
    body: await readBoundedResponseBody(response, MAX_OAUTH_RESPONSE_BYTES),
  };
}

async function json(
  transport: EmailOAuthTransport,
  url: string,
  init?: RequestInit,
): Promise<Record<string, unknown>> {
  let response: EmailOAuthTransportResponse;
  try {
    response = await transport(url, { ...init, redirect: "error" });
  } catch {
    throw new Error("provider_unavailable");
  }
  if (new TextEncoder().encode(response.body).byteLength > MAX_OAUTH_RESPONSE_BYTES ||
    response.status < 200 || response.status >= 300) {
    throw new Error("provider_unavailable");
  }
  let payload: unknown;
  try {
    payload = JSON.parse(response.body);
  } catch {
    throw new Error("provider_unavailable");
  }
  if (!isRecord(payload)) throw new Error("provider_unavailable");
  return payload;
}

function authorizationEndpoint(settings: EmailOAuthSettings): string {
  if (settings.provider === "gmail") return "https://accounts.google.com/o/oauth2/v2/auth";
  if (settings.provider === "mock") throw new Error("credential_unavailable");
  return `https://login.microsoftonline.com/${encodeURIComponent(settings.graphTenant ?? "common")}/oauth2/v2.0/authorize`;
}

function tokenEndpoint(settings: EmailOAuthSettings): string {
  if (settings.provider === "gmail") return GOOGLE_TOKEN_URL;
  if (settings.provider === "mock") throw new Error("credential_unavailable");
  return `https://login.microsoftonline.com/${encodeURIComponent(settings.graphTenant ?? "common")}/oauth2/v2.0/token`;
}

function scopes(provider: EmailProvider): string {
  return provider === "gmail" ? GOOGLE_SCOPE : GRAPH_SCOPE;
}

function issuerValid(issuer: unknown, tenant: unknown, setting: EmailOAuthSettings): boolean {
  if (setting.provider === "gmail") {
    return issuer === "https://accounts.google.com" || issuer === "accounts.google.com";
  }
  if (typeof tenant !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenant)) {
    return false;
  }
  if (issuer !== `https://login.microsoftonline.com/${tenant}/v2.0`) return false;
  const selector = setting.graphTenant ?? "common";
  if (selector === "common") return true;
  if (selector === "organizations") return tenant.toLowerCase() !== CONSUMER_TENANT_ID;
  if (selector === "consumers") return tenant.toLowerCase() === CONSUMER_TENANT_ID;
  return selector.toLowerCase() === tenant.toLowerCase();
}

async function validateIdToken(
  token: string,
  settings: EmailOAuthSettings,
  nonce: string,
  transport: EmailOAuthTransport,
  now: () => number,
): Promise<Record<string, unknown>> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("invalid_token");
  let header: unknown;
  let claims: unknown;
  try {
    header = JSON.parse(decodeBase64Url(parts[0]!).toString("utf8"));
    claims = JSON.parse(decodeBase64Url(parts[1]!).toString("utf8"));
  } catch {
    throw new Error("invalid_token");
  }
  if (!isRecord(header) || !isRecord(claims) || header.alg !== "RS256" || typeof header.kid !== "string") {
    throw new Error("invalid_token");
  }
  const keyUrl = settings.provider === "gmail"
    ? GOOGLE_KEYS_URL
    : "https://login.microsoftonline.com/common/discovery/v2.0/keys";
  const keys = await json(transport, keyUrl);
  if (!Array.isArray(keys.keys)) throw new Error("invalid_token");
  const jwk = keys.keys.find((candidate) =>
    isRecord(candidate) && candidate.kid === header.kid && candidate.kty === "RSA" &&
    (candidate.use === undefined || candidate.use === "sig"),
  );
  if (!isRecord(jwk)) throw new Error("invalid_token");
  let validSignature = false;
  try {
    validSignature = verify(
      "RSA-SHA256",
      Buffer.from(`${parts[0]}.${parts[1]}`),
      createPublicKey({ key: jwk as import("node:crypto").JsonWebKey, format: "jwk" }),
      decodeBase64Url(parts[2]!),
    );
  } catch {
    validSignature = false;
  }
  const currentSeconds = Math.floor(now() / 1_000);
  const audience = claims.aud;
  const audienceValid = audience === settings.clientId ||
    (Array.isArray(audience) && audience.length === 1 && audience[0] === settings.clientId);
  if (
    !validSignature ||
    !audienceValid ||
    (claims.azp !== undefined && claims.azp !== settings.clientId) ||
    typeof claims.exp !== "number" || claims.exp <= currentSeconds ||
    (claims.nbf !== undefined && (typeof claims.nbf !== "number" || claims.nbf > currentSeconds)) ||
    claims.nonce !== nonce ||
    typeof claims.sub !== "string" || !claims.sub ||
    !issuerValid(claims.iss, claims.tid, settings)
  ) {
    throw new Error("invalid_token");
  }
  return claims;
}

function setCookie(sessionId: string, secure: boolean): string {
  return `${SESSION_COOKIE}=${sessionId}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1_000}${secure ? "; Secure" : ""}`;
}

export function readEmailSessionCookie(header: string | undefined): string | undefined {
  if (!header) return undefined;
  for (const cookie of header.split(";")) {
    const [name, ...valueParts] = cookie.trim().split("=");
    if (name === SESSION_COOKIE) {
      const value = valueParts.join("=");
      return /^[A-Za-z0-9_-]{40,64}$/.test(value) ? value : undefined;
    }
  }
  return undefined;
}

export class EmailConnectionCoordinator {
  private readonly sessions = new Map<string, HostSession>();
  private readonly pending = new Map<string, PendingAuthorization>();
  private readonly connections = new Map<string, EmailConnection & {
    readonly sessionId: string;
    readonly residentId: string;
    readonly controller: AbortController;
    readonly subject: string;
  }>();
  private readonly transport: EmailOAuthTransport;
  private readonly now: () => number;

  constructor(private readonly options: EmailAuthorizationOptions) {
    this.transport = options.transport ?? defaultTransport;
    this.now = options.now ?? Date.now;
  }

  ensureSession(sessionId?: string): EmailSession {
    const now = this.now();
    for (const [state, pending] of this.pending) {
      if (pending.expiresAt <= now) this.pending.delete(state);
    }
    for (const [id, session] of this.sessions) {
      if (session.expiresAt <= now) {
        this.sessions.delete(id);
        if (session.handle) this.removeConnection(session.handle);
        session.mockController?.abort(new Error("Email connection expired."));
        for (const [state, pending] of this.pending) {
          if (pending.sessionId === id) this.pending.delete(state);
        }
      }
    }
    const existing = sessionId ? this.sessions.get(sessionId) : undefined;
    if (existing && existing.expiresAt > now) {
      existing.expiresAt = now + SESSION_TTL_MS;
      return {
        id: existing.id,
        csrfToken: existing.csrfToken,
        cookie: setCookie(existing.id, this.options.settings.redirectUri?.startsWith("https:") ?? false),
        created: false,
      };
    }
    const id = randomToken();
    const csrfToken = randomToken();
    this.sessions.set(id, { id, csrfToken, expiresAt: now + SESSION_TTL_MS, authorizationVersion: 0 });
    return {
      id,
      csrfToken,
      cookie: setCookie(id, this.options.settings.redirectUri?.startsWith("https:") ?? false),
      created: true,
    };
  }

  private validSession(sessionId: string): HostSession | undefined {
    const session = this.sessions.get(sessionId);
    if (!session || session.expiresAt <= this.now()) return undefined;
    session.expiresAt = this.now() + SESSION_TTL_MS;
    return session;
  }

  private requireCsrf(sessionId: string, csrfToken: string): HostSession {
    const session = this.validSession(sessionId);
    if (!session || !safeEqual(session.csrfToken, csrfToken)) throw new Error("invalid_callback");
    return session;
  }

  status(sessionId: string): EmailConnectionStatus {
    const session = this.validSession(sessionId);
    if (!session) return { provider: this.options.settings.provider, connected: false };
    if (this.options.settings.provider === "mock") {
      return session.mockConnected
        ? { provider: "mock", connected: true, accountLabel: "Synthetic inbox" }
        : { provider: "mock", connected: false };
    }
    const connection = session.handle ? this.connections.get(session.handle) : undefined;
    if (connection && connection.expiresAt <= this.now()) {
      this.removeConnection(connection.handle);
      session.handle = undefined;
    }
    return connection && connection.expiresAt > this.now() && !connection.controller.signal.aborted
      ? { provider: connection.provider, connected: true, accountLabel: connection.accountLabel }
      : { provider: this.options.settings.provider, connected: false };
  }

  connectionHandleForSession(sessionId: string): string | undefined {
    const session = this.validSession(sessionId);
    if (!session) return undefined;
    if (this.options.settings.provider === "mock") return session.mockConnected ? "mock-email" : undefined;
    const connection = session.handle ? this.connections.get(session.handle) : undefined;
    if (connection && connection.expiresAt <= this.now()) {
      this.removeConnection(connection.handle);
      session.handle = undefined;
    }
    return connection && connection.expiresAt > this.now() ? connection.handle : undefined;
  }

  connectionSignalForSession(sessionId: string): AbortSignal | undefined {
    const session = this.validSession(sessionId);
    if (this.options.settings.provider === "mock") {
      return session?.mockConnected ? session.mockController?.signal : undefined;
    }
    const connection = session?.handle ? this.connections.get(session.handle) : undefined;
    if (connection && connection.expiresAt <= this.now()) {
      this.removeConnection(connection.handle);
      if (session) session.handle = undefined;
      return undefined;
    }
    return connection?.controller.signal;
  }

  async begin(sessionId: string, csrfToken: string): Promise<string> {
    const session = this.requireCsrf(sessionId, csrfToken);
    if (this.options.settings.provider === "mock") {
      session.mockController?.abort(new Error("Email connection replaced."));
      session.mockController = new AbortController();
      session.mockConnected = true;
      return "/";
    }
    const { clientId, clientSecretRef, redirectUri } = this.options.settings;
    if (!clientId || !clientSecretRef || !redirectUri) throw new Error("credential_unavailable");
    for (const [pendingState, pending] of this.pending) {
      if (pending.sessionId === sessionId) this.pending.delete(pendingState);
    }
    const authorizationVersion = ++session.authorizationVersion;
    const secret = await this.options.credentials.get(clientSecretRef);
    const activeSession = this.validSession(sessionId);
    if (!secret) throw new Error("credential_unavailable");
    if (!activeSession || activeSession.authorizationVersion !== authorizationVersion) {
      throw new Error("invalid_callback");
    }
    if (this.pending.size >= 256) throw new Error("provider_unavailable");
    const state = randomToken();
    const nonce = randomToken();
    const verifier = randomToken(32);
    this.pending.set(state, {
      state,
      nonce,
      verifier,
      sessionId,
      authorizationVersion,
      expiresAt: this.now() + AUTH_TTL_MS,
    });
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const url = new URL(authorizationEndpoint(this.options.settings));
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("response_mode", "query");
    url.searchParams.set("scope", scopes(this.options.settings.provider));
    url.searchParams.set("state", state);
    url.searchParams.set("nonce", nonce);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    if (this.options.settings.provider === "gmail") {
      url.searchParams.set("access_type", "online");
      url.searchParams.set("include_granted_scopes", "false");
    }
    session.expiresAt = this.now() + SESSION_TTL_MS;
    return url.toString();
  }

  async complete(
    sessionId: string,
    stateValue: string,
    code: string,
    providerError?: string,
  ): Promise<void> {
    const pending = this.pending.get(stateValue);
    this.pending.delete(stateValue);
    const session = this.validSession(sessionId);
    if (
      !pending ||
      pending.expiresAt <= this.now() ||
      !safeEqual(pending.state, stateValue) ||
      pending.sessionId !== sessionId ||
      !session ||
      pending.authorizationVersion !== session.authorizationVersion
    ) {
      throw new Error("invalid_callback");
    }
    if (providerError || !code) throw new Error("authorization_denied");
    if (
      this.options.settings.provider === "mock" ||
      !this.options.settings.clientId ||
      !this.options.settings.clientSecretRef ||
      !this.options.settings.redirectUri
    ) {
      throw new Error("credential_unavailable");
    }
    const secret = await this.options.credentials.get(this.options.settings.clientSecretRef);
    if (!secret) throw new Error("credential_unavailable");
    const sessionBeforeExchange = this.validSession(sessionId);
    if (!sessionBeforeExchange || sessionBeforeExchange.authorizationVersion !== pending.authorizationVersion) {
      throw new Error("invalid_callback");
    }
    const body = new URLSearchParams({
      client_id: this.options.settings.clientId,
      client_secret: secret,
      code,
      code_verifier: pending.verifier,
      grant_type: "authorization_code",
      redirect_uri: this.options.settings.redirectUri,
    });
    const tokenResponse = await json(this.transport, tokenEndpoint(this.options.settings), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body,
    });
    const accessToken = tokenResponse.access_token;
    const idToken = tokenResponse.id_token;
    const currentSession = this.validSession(sessionId);
    if (!currentSession || currentSession.authorizationVersion !== pending.authorizationVersion) {
      if (typeof accessToken === "string" && this.options.settings.provider === "gmail") {
        await this.revokeGoogleToken(accessToken);
      }
      throw new Error("invalid_callback");
    }
    const granted = typeof tokenResponse.scope === "string" ? tokenResponse.scope.split(/\s+/).filter(Boolean) : [];
    const required = scopes(this.options.settings.provider).split(" ");
    if (
      typeof accessToken !== "string" || !accessToken ||
      typeof idToken !== "string" ||
      typeof tokenResponse.expires_in !== "number" || tokenResponse.expires_in <= 0 ||
      tokenResponse.expires_in > 86_400 ||
      required.some((scope) => !granted.includes(scope)) ||
      granted.some((scope) => !required.includes(scope)) ||
      tokenResponse.refresh_token !== undefined
    ) {
      throw new Error("insufficient_scope");
    }
    const claims = await validateIdToken(idToken, this.options.settings, pending.nonce, this.transport, this.now);
    const verifiedSession = this.validSession(sessionId);
    if (!verifiedSession || verifiedSession.authorizationVersion !== pending.authorizationVersion ||
      typeof claims.sub !== "string") {
      if (this.options.settings.provider === "gmail") await this.revokeGoogleToken(accessToken as string);
      throw new Error("invalid_callback");
    }
    let accountLabel: string | undefined;
    if (this.options.settings.provider === "gmail") {
      const profile = await json(this.transport, GOOGLE_PROFILE_URL, {
        headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
      });
      accountLabel = typeof profile.emailAddress === "string" && profile.emailAddress.includes("@")
        ? profile.emailAddress.slice(0, 320)
        : undefined;
    } else {
      accountLabel = typeof claims.preferred_username === "string" ? claims.preferred_username.slice(0, 320) : undefined;
    }
    const activeSession = this.validSession(sessionId);
    if (!activeSession || activeSession.authorizationVersion !== pending.authorizationVersion) {
      if (this.options.settings.provider === "gmail") await this.revokeGoogleToken(accessToken as string);
      throw new Error("invalid_callback");
    }
    if (!accountLabel) throw new Error("invalid_token");
    if (activeSession.handle) this.removeConnection(activeSession.handle);
    const handle = randomToken();
    const controller = new AbortController();
    const connection: EmailConnection & {
      readonly sessionId: string;
      readonly residentId: string;
      readonly controller: AbortController;
      readonly subject: string;
    } = {
      handle,
      provider: this.options.settings.provider,
      accountLabel,
      accessToken,
      expiresAt: this.now() + tokenResponse.expires_in * 1_000,
      sourceKey: randomToken(),
      sessionId,
      residentId: this.options.settings.residentId,
      controller,
      signal: controller.signal,
      subject: claims.sub,
    };
    this.connections.set(handle, connection);
    activeSession.handle = handle;
  }

  async disconnect(sessionId: string, csrfToken: string): Promise<{ readonly revoked: boolean }> {
    const session = this.requireCsrf(sessionId, csrfToken);
    session.authorizationVersion += 1;
    for (const [state, pending] of this.pending) {
      if (pending.sessionId === sessionId) this.pending.delete(state);
    }
    if (this.options.settings.provider === "mock") {
      session.mockController?.abort(new Error("Email connection disconnected."));
      session.mockController = undefined;
      session.mockConnected = false;
      return { revoked: false };
    }
    const connection = session.handle ? this.connections.get(session.handle) : undefined;
    if (session.handle) this.removeConnection(session.handle);
    session.handle = undefined;
    if (!connection || connection.provider !== "gmail") return { revoked: false };
    return { revoked: await this.revokeGoogleToken(connection.accessToken) };
  }

  private async revokeGoogleToken(accessToken: string): Promise<boolean> {
    try {
      const response = await this.transport(GOOGLE_REVOKE_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: accessToken }),
        redirect: "error",
      });
      return response.status >= 200 && response.status < 300;
    } catch {
      return false;
    }
  }

  async resolveForSession(sessionId: string, handle: string): Promise<EmailConnection | undefined> {
    if (this.options.settings.provider === "mock") return undefined;
    const session = this.validSession(sessionId);
    if (!session || session.handle !== handle) return undefined;
    const connection = this.connections.get(handle);
    if (connection?.expiresAt !== undefined && connection.expiresAt <= this.now()) {
      this.removeConnection(handle);
      session.handle = undefined;
      return undefined;
    }
    if (!connection || connection.sessionId !== sessionId ||
      connection.residentId !== this.options.settings.residentId ||
      connection.controller.signal.aborted) {
      return undefined;
    }
    return connection;
  }

  isAllowedOrigin(origin: string, requestOrigin: string): boolean {
    const expected = this.options.settings.redirectUri
      ? new URL(this.options.settings.redirectUri).origin
      : requestOrigin;
    return origin === expected;
  }

  private removeConnection(handle: string): void {
    const connection = this.connections.get(handle);
    if (connection) {
      connection.controller.abort(new Error("Email connection disconnected."));
      this.connections.delete(handle);
    }
  }
}

export function emailAuthorizationFailure(error: unknown): EmailAuthorizationError {
  const message = error instanceof Error ? error.message : "";
  if (message === "invalid_callback" || message === "authorization_denied" || message === "invalid_token" ||
    message === "insufficient_scope" || message === "credential_unavailable") {
    return message;
  }
  return "provider_unavailable";
}

export function isEmailCsrfValid(session: EmailSession | undefined, candidate: string | undefined): boolean {
  return Boolean(session && candidate && safeEqual(session.csrfToken, candidate));
}

export function emailSessionCookieName(): string {
  return SESSION_COOKIE;
}
