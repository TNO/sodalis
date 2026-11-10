# Security review: read-only email journey

> **Scope and status (2026-11-10): Historical review only.** This static
> review examined the prior real-provider implementation. That implementation
> has been removed and real account access is deferred by the current
> mock-only revision. The historical “no vulnerabilities found” result does
> **not** assess, review, or certify this revision. It is not approval to
> restore provider code or connect accounts.

Status: Historical static review of the prior real-provider branch; no
vulnerabilities were reported in that reviewed scope.
Date: 2026-11-10
Task: [0072](../../TASKS/0072-complete-read-only-email-journey.md)

## Summary and recommendation

At the time, we reviewed the read-only email journey on branch
`integration/0072-read-only-email-journey` and found **no exploitable
vulnerabilities in that implementation**. This finding and the branch-specific
merge opinion apply only to the reviewed code, which is no longer present. The
current mock-only revision has a different scope and has not been assessed by
this report. Any future real-account work is deferred and must first satisfy
the [readiness gates](../../TASKS/0084-gating-future-real-provider-access.md).

## Scope

The review compares merge base `acf068f` (origin/main) with the branch head.
It covers commits `0ec940c`, `cabc2fd` and `308c6ca`, plus merge `1ceca1a`;
the working tree had no uncommitted changes.

- **Server** (`apps/server/src/assistant/harness/`):
  - `emailAuthorization.ts`: the OAuth flow, session, CSRF and the
    credential store.
  - `emailReader.ts`: the Graph, Gmail and mock readers.
  - `emailRoutes.ts`: the email HTTP routes.
  - `boundedResponseBody.ts`: response size limits.
  - Changes to `config.ts`, `settings.ts`, `tools.ts`, `routes.ts`,
    `workflow.ts`, `prompt.ts` and `app.ts`.
- **Desktop:** `EmailConnectionClient.ts`, `EmailConnectionPanel.ts`,
  `main.ts` and the Vite `/api/email` proxy.
- **Deployment:** the Caddy gateways, `compose.yaml`, `.env.example`,
  `scripts/stack-config.ts` and the related docs.

We also checked these repository invariants:

- the Aster iframe sandbox and adapter boundary
- `packages/desktop-host` isolation
- no secrets in CI
- no licensed avatar assets in the public repository
- consent before cloud processing
- privacy, memory consent and audit behaviour

Aster, `packages/desktop-host` and the avatar assets are unchanged by this
branch.

## Method and hardware

This was a manual, static review of the code, with a focus on exploitable
issues. We read the diff and the code paths it calls, then checked the key
controls against the source lines cited below. We did not run anything
dynamically and contacted no cloud or OAuth provider. No code was changed.

## Results

| # | Severity | File | Lines | Vulnerability | Confidence |
| --- | --- | --- | --- | --- | --- |
| — | — | — | — | No vulnerabilities found | — |

The table below lists the controls we verified.

| Area | Control | Evidence |
| --- | --- | --- |
| Cross-site request forgery (CSRF) on connect/disconnect | Needs an existing session, an exact `Origin` match and `x-sodalis-csrf`, compared in constant time. The token is returned only in JSON, with no CORS. | `emailRoutes.ts:53-60`, `:93`; `emailAuthorization.ts:111` |
| Session cookie | `HttpOnly; SameSite=Lax; Path=/api`, and `Secure` when served over HTTPS | `emailAuthorization.ts:247` |
| OAuth callback | Single-use state with a 10-minute lifetime, bound to the session and an authorization version. PKCE uses S256. | `emailAuthorization.ts:414` |
| ID token | RS256 only, with a JWKS `kid` signature check. Audience, `azp`, `exp`, `nbf`, nonce and tenant-aware issuer are all checked. | `emailAuthorization.ts:203` |
| Least privilege | Granted scopes must exactly match the request. A returned `refresh_token` is rejected. | `emailAuthorization.ts:488` |
| Open redirect | Error redirects use fixed codes and go to the relative path `/` | `emailRoutes.ts` |
| SSRF and token leakage | Provider URLs are constants and every request uses `redirect: "error"`. Graph `@odata.nextLink` must match the expected origin and path before the bearer token is sent. Message IDs are URL-encoded, and response sizes are bounded. | `emailReader.ts:165`, `:186`, `:499`; `boundedResponseBody.ts` |
| Desktop navigation | Before redirecting, the client requires `https:` and a host of `accounts.google.com` or `login.microsoftonline.com` | `EmailConnectionClient.ts:111` |
| Command injection | The credential store calls `execFile` with an argument array (no shell), with a timeout and an output limit. The secret reference is regex-validated. | `emailAuthorization.ts:41`; `settings.ts` |
| Config validation | Defaults to `off`. Unknown or incomplete providers are rejected, and the mock provider rejects OAuth fields. The redirect must be HTTPS (HTTP only on loopback) at `/api/email/callback`. | `config.ts`, `settings.ts` |
| Model can't widen access | The tool takes no parameters. The host fixes the account handle, the seven-day UTC window and the limit of five. The tool is offered only for the approved question, with no other tools. Connecting is a UI action the model can't call. | `tools.ts`, `workflow.ts` |
| Prompt injection from email text | HTML is reduced to plain text, and the prompt marks message text as untrusted. The desktop has no `m.trust`/`innerHTML` rendering sink. Injected text can reach only the fixed read. | `emailReader.ts`, `prompt.ts` |
| Session binding | Reads go through `resolveForSession`. Source references are per-connection HMAC values, so raw provider IDs and tokens are not exposed. | `emailAuthorization.ts` |
| Logs, audit and memory | Email workflows are sensitive, so audit records and detailed error logs are suppressed. The tool refuses to run while content-capturing audit is on. The workflow never writes to memory. | `tools.ts:272` |
| Cloud consent | The connect panel says the selected model, which may be cloud-hosted, processes the message evidence. A connection must be made explicitly. The mock provider uses synthetic data only. | `EmailConnectionPanel.ts` |
| Secrets | `.env.example` and compose add only empty placeholders and a secret-store reference name. No CI workflow files changed. | `.env.example`, `compose.yaml` |

## Analysis

The design stops most attack classes structurally rather than by filtering:

- The model has no parameters to misuse.
- Tokens stay in memory only and are never refreshed.
- Every outbound URL is fixed or checked against an allow-list.
- Connecting is a UI action the model can't trigger.

Because of this, a successful prompt injection in an email can at most change
the summary the user sees. It can't read more mail, exfiltrate data through a
tool or affect another session. The OAuth checks follow current guidance
(PKCE S256, nonce, exact scopes, a tenant-aware issuer). The CSRF protection
has several layers: `SameSite=Lax`, an exact `Origin` match and a header token
that can't be read across origins.

## Limitations

- This review was static only. We did no dynamic testing, fuzzing or live run
  against Microsoft Graph or Gmail. Provider-side settings, such as app
  registration, consent screens and tenant restrictions, were not checked.
- Prompt injection can't be fully ruled out. An attacker-written email can
  still mislead the summary the user sees, for example with false urgency or
  phishing wording, even though it can't reach any other capability.
- Data sent to a cloud-hosted LLM relies on the connect panel disclosure. The
  quality of that consent has not been tested with users.
- Dependencies were not audited, for example with `pnpm audit`.

## Open items

These are historical findings and future gates, not approval to add provider
code or connect accounts. [Task 0084](../../TASKS/0084-gating-future-real-provider-access.md)
records them and explicitly does not authorize implementation.

### Before any future staging account checks

- Run the [dynamic connect/callback security checks](#dynamic-check-of-the-connect-and-callback-flow)
  against a staging deployment, but only after explicit future approval.
- Review dependencies before any real-provider deployment.

### Before any future real-resident pilot

- Complete [Google verification and the organisational review](#google-verification-and-organisational-review)
  applicable to the selected provider and tenant.
- Complete a DPIA; execute DPAs with no-retention/no-training terms for model
  and hosting providers; obtain privacy and information-security approval.
- Decide on user-facing disclosure and misleading/phishing-email guidance.

### Google verification and organisational review

The code limits access as far as the providers allow. Whether real residents
may connect at all is decided outside the code: by Google's policy for
restricted scopes, by the policy of the resident's Microsoft or Workspace
tenant, and by TNO's own privacy process. None of these is a code defect, but
each can block a real deployment.

**Google: restricted-scope verification.** The Gmail adapter requests
`gmail.readonly` (`emailAuthorization.ts:11`). Google classes this as a
*restricted* scope, the strictest tier
([Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes),
[restricted scopes list](https://support.google.com/cloud/answer/13464325)).
There is no narrower scope that still returns message bodies: `gmail.metadata`
is also restricted and cannot supply bodies.

- **While in testing:** an OAuth client whose consent screen is in *Testing*
  works only for test users listed on that screen. Google also shows them an
  "unverified app" warning. Testing-mode access alone does not approve any
  pilot; residents cannot connect by themselves.
- **For any other users:** the app needs restricted-scope OAuth app
  verification. Google checks the app's domain, privacy policy, a demo video
  of the consent and scope use, and a justification of why a narrower scope
  won't do.
- **Security assessment:** Google requires a security assessment when
  restricted-scope data is stored on or transmitted through servers. Sodalis
  does this: the host server fetches message bodies and passes them to the
  selected LLM. Under Google's
  [User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)
  ("Secure Data Handling"), the assessment is done annually by a
  Google-designated third party and produces a Letter of Assessment. Plan for
  its cost and lead time, and for repeating it every year.
- **Limited Use:**
  - Restricted data may be used only for prominent, user-facing features.
  - It may be transferred only to provide those features and with the user's
    consent.
  - Humans may read it only with the user's affirmative agreement, or for
    security or legal reasons.

  Sending email bodies to a cloud LLM to produce the summary fits "providing a
  user-facing feature". It does need:
  - a disclosure on the consent screen, the privacy policy and the connect
    panel that names the LLM processor
  - an LLM contract that forbids the provider from keeping the data or using
    it for training

  The disclosure that the content-capturing audit block and the connect panel
  already provide supports this, but Google's reviewers will assess it.
- **Workspace accounts:** a Google Workspace administrator can block or
  restrict third-party apps that ask for Gmail scopes (API access controls). In
  that case connecting fails with an access error even after verification. The
  journey must report this as "not available"; it must not fall back to
  another account. The previously reviewed code failed closed for this case;
  that provider path has since been removed.

**Microsoft: tenant and consent policy.** `Mail.Read` is a delegated
permission that users can normally consent to. Many organisational tenants,
however, turn off user consent or send it to an admin-consent workflow. For an
app used across tenants, Microsoft may also require a verified publisher before
users of other tenants can consent. Personal Outlook.com accounts are not
affected. For a work or school pilot, decide early whether a tenant admin
grants consent, and record which tenant setting (`common`, `organizations`, a
specific tenant UUID) the deployment uses.

**TNO organisational review.** Read access to a resident's mailbox, combined
with processing by a model that may be cloud-hosted, is high-risk processing of
personal data, including that of third-party senders. Before a pilot with real
residents:

- Run a data protection impact assessment (GDPR Art. 35) covering email
  content, the third parties whose messages are summarized, and the LLM
  provider.
- Have data-processing agreements and terms that forbid data retention or
  training with the LLM provider, and with any hosting provider of the Sodalis
  server.
- Have the privacy officer and information security officer approve them.
- Agree who owns the Google Cloud project and Entra app registration, the
  client secrets, and the verification relationship with Google.

Until these steps are done and real access is explicitly approved in a future
decision, keep `EMAIL_PROVIDER=off` or use the explicitly selected synthetic
`mock`. Do not connect real accounts, including named test users or
development tenants.

### Dynamic check of the connect and callback flow

The historical unit tests exercised the flow's logic against mocked providers:
`emailRoutes.test.ts`, `emailAuthorization.test.ts` and the desktop
`EmailConnectionClient.test.ts`. They cover:

- same-origin CSRF
- CSRF tokens copied from another session
- state replay and cross-session callbacks
- the required ID token and exact scopes
- refusal of offline refresh
- disconnect races
- revocation failure

Those tests and implementation were removed in the mock-only revision. They
cannot show how a future real deployment behaves. Only after explicit future
approval and applicable organizational gates, run the dynamic check before any
staging real-account use and repeat it whenever the gateway, OAuth code, or
provider registration changes. Task 0084 tracks the prerequisite gates; it
does not authorize restoring real-provider code.

**Setup.**

- Use a staging deployment behind the real Caddy gateway with TLS, the same
  `compose.yaml` and a public HTTPS redirect URI.
- Use dedicated test accounts only: one Gmail test user, and one Outlook.com
  plus one work-tenant account. The mailboxes should hold seeded test mail,
  including one email with a prompt-injection payload.
- Use a browser with developer tools and an intercepting proxy such as OWASP
  ZAP or Burp, plus `curl`.
- Select a local or mock LLM. This repository requires explicit consent for
  each run before email evidence is sent to a cloud LLM.

**Cases** (expected result in brackets):

1. *Cookie attributes behind the gateway.* `Set-Cookie` on the first
   `/api/email` response contains `HttpOnly`, `SameSite=Lax`, `Path=/api` and
   `Secure`. *(All present. A missing `Secure` means the gateway's HTTPS
   detection is wrong.)*
2. *Cross-site connect.* From a page on another origin, submit a form POST and
   a `fetch` with `credentials: "include"` to `/api/email/connect`.
   *(403 `connection_request_rejected`. No authorize URL is returned. Nothing
   in the response is readable cross-origin.)*
3. *Forged or missing headers.*
   - Replay a valid connect request with `Origin` removed, with a different
     origin, and with `x-sodalis-csrf` missing or altered.
   - Repeat for `DELETE /api/email/connection`.

   *(403 in every case.)*
4. *Origin rewriting by the gateway.* Confirm that Caddy passes the browser's
   `Origin` and `Host` through unchanged, and that the server compares them
   with the configured public origin. *(A legitimate connect from the real UI
   succeeds; the forged variants in case 3 still fail.)*
5. *Callback state handling.*
   - Complete a login and replay the same callback URL.
   - Open a callback URL captured in one browser profile in a second profile,
     which is a different session.
   - Wait more than 10 minutes before finishing the provider login.
   - Edit `state` or `code`.

   *(Each one redirects to `/` with a fixed error code, and no connection is
   created. A replay does not disturb the first, legitimate connection.)*
6. *Login CSRF.* Make the victim's browser load a callback URL containing the
   attacker's own valid `code` and `state`. *(Rejected: the state is bound to
   the attacker's session, so the victim's session never connects to the
   attacker's mailbox.)*
7. *Consent edge cases with real providers.*
   - On Google's granular consent screen, uncheck the Gmail permission.
   - Deny consent outright.
   - Use a Workspace account whose admin blocks the app.
   - Use a work-tenant account where user consent is turned off.

   *(Clear "not connected" or "not available" states with
   `insufficient_scope` or a provider error. The app never connects with
   reduced scope, and never silently uses another account.)*
8. *Token response checks with real providers.*
   - Check that the real ID tokens pass signature, issuer, audience and nonce
     validation for each Entra tenant setting in use (`consumers`,
     `organizations` or a specific tenant).
   - Check that no refresh token is ever issued or stored.

   *(Each tenant setting that is meant to work connects; an account from a
   tenant outside the configured setting is rejected on issuer.)*
9. *Navigation target.* Change the authorize URL in the connect response
   through the proxy to an attacker host, or to `http:`. *(The desktop client
   refuses to navigate.)*
10. *Disconnect and lifetime.*
    - Disconnect while a read is running.
    - Restart the server while connected.
    - Wait for the access token to expire.

    *(The read is aborted and no answer is published. After a restart or
    expiry, the user must reconnect. For Gmail, the grant disappears from the
    Google account's third-party access page. For Graph, the UI points to
    Microsoft account settings.)*
11. *Leakage.* Search the server logs, gateway access logs, browser history
    and audit output for codes, tokens, ID tokens, message IDs and email text.
    *(None present. The `services/gateway` Caddyfiles don't turn on access
    logging today. If anyone turns it on later, exclude query strings for
    `/api/email/callback` so the authorization `code` isn't logged.)*
12. *Prompt injection end-to-end.* Ask the approved question while the seeded
    injection email is among the five results. *(The summary may quote the
    text, but there are no extra tool calls, no reads beyond five messages or
    seven days, and no unexpected navigation or rendering in the desktop.)*

Record the result of each case, the deployment commit and the date in a
short follow-up section of this document. Turn any failure into a regression
test at the public interface it affects.
