import { describe, expect, it } from "vitest";
import { emailCallbackNotice } from "./EmailConnectionPanel.js";

describe("email OAuth callback notice", () => {
  it("explains expected authorization failures without exposing provider details", () => {
    expect(emailCallbackNotice("authorization_denied")).toMatch(/denied or cancelled/i);
    expect(emailCallbackNotice("insufficient_scope")).toMatch(/email-only permissions/i);
    expect(emailCallbackNotice("credential_unavailable")).toMatch(/OS password manager/i);
    expect(emailCallbackNotice("invalid_token")).toMatch(/No access was saved/i);
    expect(emailCallbackNotice("provider_unavailable")).toMatch(/Try again/i);
    expect(emailCallbackNotice("connected")).toBeUndefined();
    expect(emailCallbackNotice("unrecognized-provider-error")).toBeUndefined();
  });
});
