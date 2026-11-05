# 0072 Complete a read-only email journey

Status: open
Priority: medium
Subsystem: assistant
Depends on: 0071

## Context

Ready for implementation following completed
[0071](0071-decide-read-only-email-access.md). The
[read-only email contract](../docs/architecture/companion-harness.md#read-only-email-access-decision-0071)
is the source of truth. Implement both Microsoft Graph (Outlook) and Gmail API,
not a provider-specific shortcut or an extension of the fixture Mail app.
This ticket covers a local, single-resident foreground journey, not a
production multi-user identity system or a claim of live provider acceptance.

## Contract and setup

- Put a Sodalis-owned `ReadOnlyEmailReader` interface and its `graph`, `gmail`
  and deterministic `mock` adapters in the AI server, keeping provider SDKs,
  OAuth, query generation and parsing out of the model and desktop.
- The host supplies the session-bound connection, fixed seven-day UTC window
  and limit of five. Neither the model nor graph metadata can choose arbitrary
  accounts, scopes, queries, URLs or folders. Use an explicit read-only harness
  tool; do not broaden `read_external_data` to arbitrary account endpoints.
- Add the planned configuration documented in the architecture to validation,
  `.env.example`, stack wiring and the server guide. Default to `off`; reject
  unknown or incomplete provider settings. Mock setup needs no credentials.
- Add same-origin connect, callback, status and disconnect operations for the
  foreground desktop session. Connect is an explicit user action, not a tool
  the model can invoke. Implement or reuse the shared
  [delegated account authorization](../docs/architecture/companion-harness.md#delegated-account-authorization)
  protocol ([ADR 0008](../docs/adr/0008-delegated-personal-account-access.md)).
  The server has no host session today. If [0074](0074-complete-read-only-calendar-journey.md)
  has not landed first, this task introduces the host-session cookie, CSRF
  protection, OAuth coordinator, tenant-aware ID-token validation and the
  host-only secure credential store, and documents the selected store.
- Use email-only client registrations and exactly the scopes in the
  architecture's provider table (Graph adds `profile` for the account label;
  Gmail reads it from its profile endpoint). Never reuse calendar grants or
  silently combine scopes. Configure the client secret only as a secure-store
  reference.
- Keep account tokens in memory only. Reconnect after expiry, disconnect or
  restart. Disconnect cancels reads, discards evidence, deletes local tokens,
  then revokes the Google token; Graph disconnect is local only, and the UI
  points residents to their Microsoft account settings to remove consent.
  Document that Google verification/security assessment and organizational
  policies can gate real deployments; do not silently widen access.

## Acceptance Criteria

- Answer **"What are my five most recent inbox emails from the last seven
  days? Summarize each."** through the desktop workflow for either selected
  provider. Use the architecture's half-open UTC window, inbox-only filtering,
  received-time ordering, stable ID tie-break, candidate/page/body bounds and
  explicit coverage flag. Never silently search a different account/source.
- Every summary retains the normalized sender (or explicitly unknown),
  received date, provider/account label and opaque message source reference.
  Claims use only returned text; missing or truncated bodies are disclosed.
  No invented sender, date, source, full-body coverage or successful lookup.
- Return and render distinct `ok`, `empty`, `unauthorized`, `unavailable` and
  `partial` outcomes. Empty requires a completed successful lookup; page caps,
  interrupted reads and partial failures never become empty or complete.
  Fetch afresh per workflow; never use a previous answer as current evidence.
- Keep tokens, callback codes, client secrets and raw provider payloads out of
  desktop/tool responses, model context and logs. Only minimized normalized
  evidence enters the workflow. Treat email text as untrusted data, never
  instructions, tools, URLs to follow or consent to another capability.
- The consent screen explains inbox/body access and processing by the selected
  model. Do not persist email to memory or developer audit logs. If a
  content-capturing audit is active, refuse email reads rather than leaking it.
- Do not send, draft, modify, mark read/unread, relabel, delete, retrieve
  attachments or remote content, or synthesize with calendar, Home, memory,
  another mailbox/provider or fixture Mail content. Requests outside the
  approved question receive an explicit limitation, not a wider lookup.
- Update architecture and server/desktop setup documentation to distinguish
  implemented, deterministically verified and live-unverified behavior.

## Deterministic acceptance cases

Exercise public interfaces, not SDK internals. Use the architecture's fixed
clock and synthetic fixture table as an independent expected result.

| Seam | Required behavior cases |
| --- | --- |
| Configuration and connection operations | `off` default; mock without secrets; invalid settings or missing secure-store entry fail closed; explicit connect; CSRF, state/nonce/callback mismatch and denied/reduced-scope consent rejected; ID-token audience/issuer checks, including Microsoft `tid` versus issuer and each tenant selector; valid subject binding and account label from `preferred_username` or Gmail profile; copied references denied across sessions/residents; email/calendar grants and token use are not interchangeable; disconnect revokes upstream for Google only and never disconnects calendar; expiry, disconnect and restart require reconnect; no token/secret leakage. |
| `ReadOnlyEmailReader`, shared contract suite for graph/gmail/mock | Equivalent normalized fixtures select exactly M01–M05; inclusive lower/exclusive upper UTC edges; inbox-only, drafts/spam/trash excluded; received time rather than header date; deterministic ties; multiple pages, duplicates and unordered payloads; Graph ordered-prefix coverage completes without a further page only when the last consumed candidate is strictly older than the fifth, and a tie at the page boundary requires the next page; Gmail beyond the candidate cap is partial; missing sender/subject/body disclosed; no extra body/attachment fetches. |
| Provider HTTP adapters using synthetic transport responses | Correct own-mailbox endpoints/scopes and local exact-time filtering; Gmail ID listing followed by metadata then selected-body reads; Graph filter/order/projection; 401/403 map to unauthorized; 429/5xx/network timeout map to unavailable or partial; deleted messages, page caps, oversized payloads, cancellation and deadline preserve truthful coverage; no write requests, refresh loop, external URL fetch or provider fallback. |
| Harness tool and settled-answer delivery, scripted model | Sender/date/source on each of five summaries; genuinely empty success; missing/expired grant; unavailable source; partial evidence cannot claim complete newest-five coverage; stale prior-workflow evidence is not reused; malicious email cannot invoke tools or expand scope; cross-source and mutation requests remain excluded; active content audit blocks reads. |
| Desktop workflow/connection client | Provider/account connection state and connect/disconnect behavior; actionable unauthorized/empty/unavailable/partial presentation; authorization failure discards earlier evidence; no assistant final answer after cancellation/disconnect. |

## Verification constraints

- Run `pnpm test`, `pnpm typecheck` and `pnpm build` for implementation.
  Deterministic tests use injected clocks, provider transports and scripted
  models; no network, cloud credentials, real inboxes or mailbox recordings.
- Live checks are separate, opt-in and self-skipping without credentials;
  never run them in CI or add provider secrets to GitHub Actions.
- Before **each** live external check obtain explicit user consent for the
  selected account/provider, data and run. Before any cloud-model or stack
  command, also inspect provider selection in `.env` and any `--env` overlay,
  and obtain consent covering that processing. A saved OAuth grant is not
  permission for an agent to run a live check.
- Without that consent, finish deterministic verification and record real
  OAuth/provider compatibility, model quality, latency and Google deployment
  approval as unverified. Do not present mocks as proof of live acceptance.
