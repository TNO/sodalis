import { createSign, generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  EmailConnectionCoordinator,
  emailAuthorizationFailure,
  type EmailAuthorizationOptions,
  type EmailOAuthTransport,
  type EmailOAuthTransportResponse,
} from "./emailAuthorization.js";

const NOW = Date.parse("2026-11-05T12:00:00.000Z");
const keyPair = generateKeyPairSync("rsa", { modulusLength: 2_048 });
const jwk = { ...keyPair.publicKey.export({ format: "jwk" }), kid: "email-test-key", use: "sig" };
const { privateKey } = keyPair;

function token(claims: Record<string, unknown>, audience = "email-client") {
  const head = Buffer.from(JSON.stringify({ alg: "RS256", kid: "email-test-key" })).toString("base64url");
  const body = Buffer.from(JSON.stringify({
    iss: "https://accounts.google.com",
    aud: audience,
    sub: "stable-google-subject",
    exp: Math.floor(NOW / 1_000) + 3_600,
    ...claims,
  })).toString("base64url");
  const signer = createSign("RSA-SHA256");
  signer.update(`${head}.${body}`);
  const signature = signer.sign(privateKey).toString("base64url");
  return `${head}.${body}.${signature}`;
}

function response(body: unknown, status = 200): EmailOAuthTransportResponse {
  return { status, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

const requiredGmailScopes = "openid https://www.googleapis.com/auth/gmail.readonly";
const requiredGraphScopes = "openid profile https://graph.microsoft.com/Mail.Read";

function harness(
  overrides: Partial<EmailAuthorizationOptions["settings"]> = {},
  transportOverride?: EmailOAuthTransport,
  revokeStatus = 200,
) {
  let nonce = "";
  const calls: { url: string; init?: RequestInit }[] = [];
  const transport: EmailOAuthTransport = transportOverride ?? (async (url, init) => {
    calls.push({ url, init });
    if (url === "https://oauth2.googleapis.com/token") {
      return response({
        access_token: "provider-access-token",
        id_token: token({ nonce }),
        scope: requiredGmailScopes,
        expires_in: 3_600,
      });
    }
    if (url === "https://www.googleapis.com/oauth2/v3/certs") return response({ keys: [jwk] });
    if (url === "https://gmail.googleapis.com/gmail/v1/users/me/profile") {
      return response({ emailAddress: "resident@example.test" });
    }
    if (url === "https://oauth2.googleapis.com/revoke") return response({}, revokeStatus);
    throw new Error("unexpected_test_endpoint");
  });
  const options: EmailAuthorizationOptions = {
    settings: {
      provider: "gmail",
      residentId: "resident-1",
      clientId: "email-client",
      clientSecretRef: "email-client-secret",
      redirectUri: "https://desktop.example.test/api/email/callback",
      ...overrides,
    },
    credentials: { get: vi.fn(async () => "synthetic-client-secret") },
    transport,
    now: () => NOW,
  };
  const coordinator = new EmailConnectionCoordinator(options);
  return {
    coordinator,
    calls,
    options,
    async begin() {
      const session = coordinator.ensureSession();
      const url = new URL(await coordinator.begin(session.id, session.csrfToken));
      nonce = url.searchParams.get("nonce")!;
      return { session, url, state: url.searchParams.get("state")! };
    },
  };
}

function graphHarness(selector: string, tenant = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", issuerTenant = tenant) {
  let nonce = "";
  const tokenUrl = `https://login.microsoftonline.com/${selector}/oauth2/v2.0/token`;
  const coordinator = new EmailConnectionCoordinator({
    settings: {
      provider: "graph",
      residentId: "resident-1",
      clientId: "graph-client",
      clientSecretRef: "graph-client-secret",
      redirectUri: "https://desktop.example.test/api/email/callback",
      graphTenant: selector,
    },
    credentials: { get: async () => "synthetic-client-secret" },
    now: () => NOW,
    transport: async (url) => {
      if (url === tokenUrl) {
        return response({
          access_token: "graph-access-token",
          id_token: token({
            iss: `https://login.microsoftonline.com/${issuerTenant}/v2.0`,
            tid: tenant,
            nonce,
            preferred_username: "resident@outlook.example.test",
          }, "graph-client"),
          scope: requiredGraphScopes,
          expires_in: 3_600,
        });
      }
      if (url === "https://login.microsoftonline.com/common/discovery/v2.0/keys") return response({ keys: [jwk] });
      throw new Error("unexpected_graph_test_endpoint");
    },
  });
  return {
    coordinator,
    async begin() {
      const session = coordinator.ensureSession();
      const authorizationUrl = new URL(await coordinator.begin(session.id, session.csrfToken));
      nonce = authorizationUrl.searchParams.get("nonce")!;
      return { session, authorizationUrl };
    },
  };
}

describe("delegated email connection coordinator", () => {
  it("maps an oversized streamed OAuth response to provider_unavailable", async () => {
    const coordinator = new EmailConnectionCoordinator({
      settings: {
        provider: "gmail",
        residentId: "resident-1",
        clientId: "email-client",
        clientSecretRef: "email-client-secret",
        redirectUri: "https://desktop.example.test/api/email/callback",
      },
      credentials: { get: async () => "synthetic-client-secret" },
      now: () => NOW,
    });
    const session = coordinator.ensureSession();
    const authorizationUrl = new URL(await coordinator.begin(session.id, session.csrfToken));

    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(1_048_577))));
    try {
      await expect(coordinator.complete(
        session.id,
        authorizationUrl.searchParams.get("state")!,
        "auth-code",
      )).rejects.toThrow("provider_unavailable");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("uses a secure host session, CSRF, PKCE and exact email-only scopes", async () => {
    const { coordinator, calls, begin } = harness();
    const { session, url, state } = await begin();
    expect(session.cookie).toMatch(/HttpOnly; SameSite=Lax; Max-Age=86400; Secure/);
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("scope")).toBe(requiredGmailScopes);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    await expect(coordinator.complete(session.id, state, "auth-code")).resolves.toBeUndefined();
    const status = coordinator.status(session.id);
    expect(status).toEqual({ provider: "gmail", connected: true, accountLabel: "resident@example.test" });
    const handle = coordinator.connectionHandleForSession(session.id)!;
    const connection = await coordinator.resolveForSession(session.id, handle);
    expect(connection).toMatchObject({
      handle,
      provider: "gmail",
      accountLabel: "resident@example.test",
      accessToken: "provider-access-token",
      expiresAt: NOW + 3_600_000,
    });
    expect(JSON.stringify(status)).not.toMatch(/provider-access-token|synthetic-client-secret/);
    const otherSession = coordinator.ensureSession();
    expect(await coordinator.resolveForSession(otherSession.id, handle)).toBeUndefined();
    expect(calls.map(({ url: target }) => target)).toEqual([
      "https://oauth2.googleapis.com/token",
      "https://www.googleapis.com/oauth2/v3/certs",
      "https://gmail.googleapis.com/gmail/v1/users/me/profile",
    ]);
  });

  it("rejects state replay, cross-session callbacks and missing CSRF", async () => {
    const { coordinator, begin } = harness();
    const { session, state } = await begin();
    await expect(coordinator.begin(session.id, "wrong-csrf")).rejects.toThrow("invalid_callback");
    const other = coordinator.ensureSession();
    await expect(coordinator.complete(other.id, state, "auth-code")).rejects.toThrow("invalid_callback");
    await expect(coordinator.complete(session.id, state, "auth-code")).rejects.toThrow("invalid_callback");
    expect(coordinator.status(session.id).connected).toBe(false);
  });

  it("requires the verified ID token and full approved scope and never accepts offline refresh", async () => {
    const missingScope = harness({}, async (url) => {
      if (url === "https://oauth2.googleapis.com/token") {
        return response({
          access_token: "provider-access-token",
          id_token: token({ nonce: activeNonce }),
          scope: "openid",
          expires_in: 3_600,
        });
      }
      return response({ keys: [jwk] });
    });
    let activeNonce = "";
    const { session, url } = await missingScope.begin();
    activeNonce = url.searchParams.get("nonce")!;
    await expect(missingScope.coordinator.complete(session.id, url.searchParams.get("state")!, "auth-code"))
      .rejects.toThrow("insufficient_scope");
    expect(missingScope.coordinator.status(session.id).connected).toBe(false);

    const offline = harness({}, async (target) => {
      if (target === "https://oauth2.googleapis.com/token") {
        return response({
          access_token: "provider-access-token",
          refresh_token: "must-not-be-held",
          id_token: token({ nonce: activeNonce }),
          scope: requiredGmailScopes,
          expires_in: 3_600,
        });
      }
      return response({ keys: [jwk] });
    });
    const second = await offline.begin();
    activeNonce = second.url.searchParams.get("nonce")!;
    await expect(offline.coordinator.complete(second.session.id, second.url.searchParams.get("state")!, "auth-code"))
      .rejects.toThrow("insufficient_scope");
  });

  it("disconnects locally before upstream revocation and aborts active reads", async () => {
    const { coordinator, begin, calls } = harness();
    const { session, state } = await begin();
    await coordinator.complete(session.id, state, "auth-code");
    const handle = coordinator.connectionHandleForSession(session.id)!;
    const connection = await coordinator.resolveForSession(session.id, handle);
    const signal = connection!.signal!;
    await expect(coordinator.disconnect(session.id, session.csrfToken)).resolves.toEqual({ revoked: true });
    expect(signal.aborted).toBe(true);
    expect(await coordinator.resolveForSession(session.id, handle)).toBeUndefined();
    expect(coordinator.status(session.id).connected).toBe(false);
    expect(calls.at(-1)?.url).toBe("https://oauth2.googleapis.com/revoke");
  });

  it("reports failed Google revocation without restoring the local grant", async () => {
    const { coordinator, begin } = harness({}, undefined, 503);
    const { session, state } = await begin();
    await coordinator.complete(session.id, state, "auth-code");
    await expect(coordinator.disconnect(session.id, session.csrfToken)).resolves.toEqual({ revoked: false });
    expect(coordinator.status(session.id).connected).toBe(false);
  });

  it("fails closed when the client secret reference is unavailable", async () => {
    const noSecret = harness();
    const fresh = new EmailConnectionCoordinator({
      ...noSecret.options,
      credentials: { get: async () => undefined },
    });
    const session = fresh.ensureSession();
    await expect(fresh.begin(session.id, session.csrfToken)).rejects.toThrow("credential_unavailable");
    expect(emailAuthorizationFailure(new Error("credential_unavailable"))).toBe("credential_unavailable");
  });

  it("does not restore access when disconnect races an in-flight OAuth callback", async () => {
    let nonce = "";
    let exchangeStarted!: () => void;
    let finishExchange!: (response: EmailOAuthTransportResponse) => void;
    const started = new Promise<void>((resolve) => {
      exchangeStarted = resolve;
    });
    const calls: string[] = [];
    const { options } = harness();
    const coordinator = new EmailConnectionCoordinator({
      ...options,
      transport: async (url) => {
        calls.push(url);
        if (url === "https://oauth2.googleapis.com/token") {
          exchangeStarted();
          return new Promise((resolve) => {
            finishExchange = resolve;
          });
        }
        if (url === "https://www.googleapis.com/oauth2/v3/certs") return response({ keys: [jwk] });
        if (url === "https://oauth2.googleapis.com/revoke") return response({}, 200);
        if (url === "https://gmail.googleapis.com/gmail/v1/users/me/profile") {
          return response({ emailAddress: "resident@example.test" });
        }
        throw new Error("unexpected_test_endpoint");
      },
    });
    const session = coordinator.ensureSession();
    const authorizeUrl = new URL(await coordinator.begin(session.id, session.csrfToken));
    nonce = authorizeUrl.searchParams.get("nonce")!;
    const completing = coordinator.complete(session.id, authorizeUrl.searchParams.get("state")!, "auth-code");
    await started;
    await coordinator.disconnect(session.id, session.csrfToken);
    finishExchange(response({
      access_token: "raced-access-token",
      id_token: token({ nonce }),
      scope: requiredGmailScopes,
      expires_in: 3_600,
    }));

    await expect(completing).rejects.toThrow("invalid_callback");
    expect(coordinator.status(session.id).connected).toBe(false);
    expect(calls).toContain("https://oauth2.googleapis.com/revoke");
  });

  it.each([
    ["common", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
    ["organizations", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
    ["consumers", "9188040d-6c67-4c5b-b112-36a304b66dad"],
    ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
  ])("validates Microsoft tenant selector %s against the signed issuer and tid", async (selector, tenant) => {
    const graph = graphHarness(selector, tenant);
    const { session, authorizationUrl } = await graph.begin();
    expect(authorizationUrl.origin).toBe("https://login.microsoftonline.com");
    expect(authorizationUrl.pathname).toBe(`/${selector}/oauth2/v2.0/authorize`);
    expect(authorizationUrl.searchParams.get("scope")).toBe(requiredGraphScopes);
    await expect(graph.coordinator.complete(session.id, authorizationUrl.searchParams.get("state")!, "auth-code"))
      .resolves.toBeUndefined();
    expect(graph.coordinator.status(session.id)).toEqual({
      provider: "graph",
      connected: true,
      accountLabel: "resident@outlook.example.test",
    });
  });

  it.each([
    ["organizations", "9188040d-6c67-4c5b-b112-36a304b66dad"],
    ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
  ])("rejects Microsoft tenant-selector mismatch %s", async (selector, tenant) => {
    const graph = graphHarness(selector, tenant);
    const { session, authorizationUrl } = await graph.begin();
    await expect(graph.coordinator.complete(session.id, authorizationUrl.searchParams.get("state")!, "auth-code"))
      .rejects.toThrow("invalid_token");
    expect(graph.coordinator.status(session.id).connected).toBe(false);
  });
});
