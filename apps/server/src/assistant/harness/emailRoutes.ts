import type { Hono } from "hono";
import {
  EmailConnectionCoordinator,
  emailAuthorizationFailure,
  isEmailCsrfValid,
  readEmailSessionCookie,
} from "./emailAuthorization.js";

const EMAIL_DISCLOSURE =
  "Sodalis reads up to five recent inbox messages and their bodies for this request. " +
  "The selected assistant model processes minimized message evidence and may be cloud-hosted. " +
  "Choose a local model for local-only processing. Email is not saved to long-term memory.";

function noStore(context: { header(name: string, value: string): void }) {
  context.header("cache-control", "no-store");
  context.header("referrer-policy", "no-referrer");
}

function allowedOrigin(context: {
  req: { header(name: string): string | undefined; url: string };
}, coordinator: EmailConnectionCoordinator): boolean {
  const origin = context.req.header("origin");
  return Boolean(origin && coordinator.isAllowedOrigin(origin, new URL(context.req.url).origin));
}

function sessionCookie(context: {
  req: { header(name: string): string | undefined };
}): string | undefined {
  return readEmailSessionCookie(context.req.header("cookie"));
}

export function registerEmailRoutes(app: Hono, coordinator: EmailConnectionCoordinator): void {
  app.get("/api/email/connection", (context) => {
    noStore(context);
    const session = coordinator.ensureSession(sessionCookie(context));
    context.header("set-cookie", session.cookie);
    return context.json({
      ...coordinator.status(session.id),
      csrfToken: session.csrfToken,
      disclosure: EMAIL_DISCLOSURE,
      scopes: coordinator.status(session.id).provider === "graph"
        ? ["openid", "profile", "Mail.Read"]
        : coordinator.status(session.id).provider === "gmail"
          ? ["openid", "https://www.googleapis.com/auth/gmail.readonly"]
          : [],
      reconnectAfter: "expiry, disconnect or server restart",
      disconnectNotice: coordinator.status(session.id).provider === "graph"
        ? "Disconnect removes local access. Remove Microsoft consent in your account settings."
        : "Disconnect removes local access and attempts to revoke the Google grant.",
    });
  });

  app.post("/api/email/connect", async (context) => {
    noStore(context);
    const sessionId = sessionCookie(context);
    const session = sessionId ? coordinator.ensureSession(sessionId) : undefined;
    if (!session || session.created || !allowedOrigin(context, coordinator) ||
      !isEmailCsrfValid(session, context.req.header("x-sodalis-csrf"))) {
      return context.json({ error: "connection_request_rejected" }, 403);
    }
    try {
      const authorizeUrl = await coordinator.begin(session.id, context.req.header("x-sodalis-csrf")!);
      return context.json({
        status: coordinator.status(session.id).connected ? "connected" : "redirect",
        ...(coordinator.status(session.id).connected ? {} : { authorizeUrl }),
      });
    } catch (error) {
      return context.json({ error: emailAuthorizationFailure(error) }, 503);
    }
  });

  app.get("/api/email/callback", async (context) => {
    noStore(context);
    const sessionId = sessionCookie(context);
    const state = context.req.query("state") ?? "";
    const code = context.req.query("code") ?? "";
    const providerError = context.req.query("error");
    try {
      if (!sessionId) throw new Error("invalid_callback");
      await coordinator.complete(sessionId, state, code, providerError);
      return context.redirect("/?email=connected", 303);
    } catch (error) {
      const failure = emailAuthorizationFailure(error);
      return context.redirect(`/?email=${encodeURIComponent(failure)}`, 303);
    }
  });

  app.delete("/api/email/connection", async (context) => {
    noStore(context);
    const sessionId = sessionCookie(context);
    const session = sessionId ? coordinator.ensureSession(sessionId) : undefined;
    if (!session || session.created || !allowedOrigin(context, coordinator) ||
      !isEmailCsrfValid(session, context.req.header("x-sodalis-csrf"))) {
      return context.json({ error: "connection_request_rejected" }, 403);
    }
    try {
      const { revoked } = await coordinator.disconnect(session.id, context.req.header("x-sodalis-csrf")!);
      return context.json({
        status: "disconnected",
        upstreamRevoked: revoked,
        notice: coordinator.status(session.id).provider === "graph"
          ? "Local access was removed. Remove Microsoft consent in your account settings."
          : coordinator.status(session.id).provider === "gmail"
            ? "Local access was removed; Google revocation was attempted."
            : "The synthetic inbox connection was removed.",
      });
    } catch (error) {
      return context.json({ error: emailAuthorizationFailure(error) }, 403);
    }
  });
}
