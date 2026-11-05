import { describe, expect, it } from "vitest";
import { validateEmailSettings } from "./settings.js";

describe("email provider settings", () => {
  it("defaults to off and accepts credential-free mock mode", () => {
    expect(validateEmailSettings({})).toBe("off");
    expect(validateEmailSettings({ COMPANION_HARNESS: "pi", EMAIL_PROVIDER: "mock", EMAIL_RESIDENT_ID: "resident-1" }))
      .toBe("mock");
  });

  it("rejects unknown, incomplete and mode-inconsistent configuration", () => {
    expect(() => validateEmailSettings({ EMAIL_PROVIDER: "automatic" })).toThrow(/EMAIL_PROVIDER/);
    expect(() => validateEmailSettings({ EMAIL_PROVIDER: "mock" })).toThrow(/COMPANION_HARNESS/);
    expect(() => validateEmailSettings({
      COMPANION_HARNESS: "pi",
      EMAIL_PROVIDER: "mock",
      EMAIL_RESIDENT_ID: "resident-1",
      EMAIL_OAUTH_CLIENT_ID: "unexpected",
    })).toThrow(/not used/);
    expect(() => validateEmailSettings({ EMAIL_RESIDENT_ID: "resident-1" })).toThrow(/requires EMAIL_PROVIDER/);
  });

  it("requires the complete exact Graph or Gmail client setup", () => {
    const graph = {
      COMPANION_HARNESS: "pi",
      EMAIL_PROVIDER: "graph",
      EMAIL_RESIDENT_ID: "resident-1",
      EMAIL_OAUTH_CLIENT_ID: "email-client",
      EMAIL_OAUTH_CLIENT_SECRET_REF: "sodalis-email-client",
      EMAIL_OAUTH_REDIRECT_URI: "http://localhost:3002/api/email/callback",
      EMAIL_GRAPH_TENANT: "common",
    };
    expect(validateEmailSettings(graph)).toBe("graph");
    expect(validateEmailSettings({
      ...graph,
      EMAIL_PROVIDER: "gmail",
      EMAIL_GRAPH_TENANT: undefined,
      EMAIL_OAUTH_REDIRECT_URI: "https://sodalis.example.test/api/email/callback",
    })).toBe("gmail");
    expect(() => validateEmailSettings({ ...graph, EMAIL_GRAPH_TENANT: "not-a-tenant" })).toThrow(/EMAIL_GRAPH_TENANT/);
    expect(() => validateEmailSettings({ ...graph, EMAIL_OAUTH_REDIRECT_URI: "http://example.test/api/email/callback" }))
      .toThrow(/HTTPS/);
    expect(() => validateEmailSettings({ ...graph, EMAIL_OAUTH_CLIENT_SECRET_REF: "test-credential-ref" })).not.toThrow();
    expect(() => validateEmailSettings({ ...graph, EMAIL_OAUTH_REDIRECT_URI: "http://localhost/other" })).toThrow(/callback/);
  });
});
