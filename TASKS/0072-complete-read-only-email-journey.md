# 0072 Complete a mock-only read-only email journey

Status: in progress
Priority: medium
Subsystem: assistant
Depends on: 0071

## Context and scope

Task [0071](0071-decide-read-only-email-access.md) records future provider
design choices. They are not delivered or supported now. This task narrows
implementation to a provider-neutral `ReadOnlyEmailReader` contract and a
deterministic synthetic mock. It does not implement Microsoft Graph, Gmail,
OAuth/OIDC, account sessions, credentials, provider networking, or connection
UI. The mutable
[`MockMailApplication`](../apps/desktop/src/assistant/MockMailApplication.ts)
fixture app is separate and must remain unchanged.

The [architecture](../docs/architecture/companion-harness.md#read-only-email-access-decision-0071)
is the source of truth for the current contract and explicitly deferred design.
The [historical security review](../docs/evaluations/email-journey-security-review.md)
covers the removed real-provider implementation only; its historical result
does not assess or certify this mock-only revision. Future real-account
readiness is tracked by [0084](0084-gating-future-real-provider-access.md).

## Contract and acceptance criteria

- Keep the provider-neutral `ReadOnlyEmailReader` interface and deterministic
  mock. The allowed question is exactly
  **"What are my five most recent inbox emails from the last seven days?
  Summarize each."** Use a fixed seven-day half-open UTC window and limit five.
- Return only deterministic fixture evidence. Every result and message must be
  visibly labeled `mock`/`synthetic`, including its source; retain sender,
  received date, source reference, body-availability and coverage evidence.
  Answer text must not imply that fixture evidence came from a real mailbox.
- `EMAIL_PROVIDER` defaults to `off` and accepts only `off|mock`; mock requires
  explicit selection and the Pi harness. Reject legacy `graph`/`gmail` and
  every unsupported value. Do not silently fall back to mock or a real provider.
- Remove all generated code for Microsoft Graph/Gmail authentication or HTTP:
  OAuth/OIDC/ID-token logic; email-only session, CSRF, credential and token
  handling; provider readers/transports; connect/status/callback/disconnect
  routes; provider configuration/secrets; gateway auth routing; and desktop
  account-connected/authentication UI.
- Requests for unsupported mail operations or broader email questions expose
  only a limitation response and no source-reading tool. Keep the approved
  question bounded. The mock makes no provider network requests.
- Preserve the Aster iframe sandbox and leave its source unchanged. Do not
  change the separate mutable fixture Mail app.
- Leave a concise adapter seam comment, e.g.
  `Future adapter to a real provider starts here.` Any future real-account
  code requires explicit future approval and the readiness process in 0084;
  this task does not authorize restoring it.

## Deterministic behavior tests

Test public interfaces and prove:

- Configuration defaults to `off`, accepts explicitly selected `mock`, and
  rejects `graph`, `gmail`, unknown values, and mock mode without the Pi
  harness.
- The reader returns five known synthetic fixture messages with visibly
  synthetic source evidence, honors half-open UTC boundaries and distinguishes
  a successful empty fixture from an unavailable lookup.
- Mock reads make no network calls; unsupported mail questions receive only a
  limitation and do not call the reader.
- The email connect/status/callback/disconnect routes return not-found, and
  desktop/gateway configuration no longer exposes email account-auth routes or
  controls.

No live provider, cloud, or account tests are in scope. Real-provider
compatibility, security, and policy readiness remain deferred to 0084 and
require explicit future approval.

## Verification

Run the relevant targeted behavior tests, then `pnpm test`, `pnpm typecheck`,
`pnpm build`, and `git diff --check`. Do not run any live/cloud commands.

This task stays **in progress** until the narrowed pull request merges. The
historical security report remains linked and unchanged in its findings; its
scope notice explains that it is not a review of this revision.
