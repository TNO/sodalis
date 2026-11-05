# 0074 Complete a read-only calendar journey

Status: open
Priority: medium
Subsystem: assistant
Depends on: 0073

## Context

Implement the provider-neutral read-only calendar interface selected in
[0073](0073-decide-read-only-calendar-access.md), with **both Microsoft Graph
and Google Calendar adapters initially**. The
[architecture contract](../docs/architecture/companion-harness.md#approved-read-only-calendar-contract-planned)
is the source of truth for authorization, normalized outcomes, interval/source
semantics, and exclusions. This ticket is ready for implementation from that
decision; neither adapter is implemented by the decision itself.

## Setup

- Document server-owned source configuration binding a resident to one verified
  provider subject and default Microsoft calendar or Google `primary`, plus a
  safe display label and explicit resident IANA timezone. Graph references are
  discovery only. No configured source is unavailable; ambiguous selection asks
  for clarification. Do not expose provider URLs or account selectors as model
  inputs.
- Implement and document both adapters using the authoritative provider table in
  [Delegated authorization and provider setup](../docs/architecture/companion-harness.md#delegated-authorization-and-provider-setup)
  for required registration/configuration, OAuth grants, approved read endpoints
  and request fields, and provider-specific restrictions. Verify the actual
  registered-client requirements and consented scopes. Handle and document
  tenant/admin policy denial without broader scopes, testing-mode grant expiry,
  and any production verification requirement.
- Implement host-owned code/PKCE exchange, state/nonce and verified account
  binding. Document exact callback routes, validated configuration names, and
  how to connect, reconnect, and disconnect. Reject callback replay, wrong
  issuer/audience/resident/account, insufficient scope, and unconfigured
  redirects. Disconnect removes local authority immediately, deletes tokens,
  and attempts upstream revocation where supported.
- Select and document a concrete OS credential store or encrypted server store
  with a separately managed key. Provision secrets outside version control,
  browser storage, fixtures, and CI; fail closed if secure storage is missing.
  Keep configuration examples non-secret. Redact callbacks, tokens, and raw
  provider payloads from logs/audit/errors and model evidence.

## Acceptance Criteria

- Provide "What appointments are in my selected calendar tomorrow?" for each
  adapter through one shared `readCalendar` interface and the harness's
  evidence/settled-answer path. Report period, resident timezone/offset,
  provider/calendar label, and check time. Preserve minimal occurrence evidence
  and the distinction between timed and all-day events.
- Enforce resident/grant/source binding before every read, including reused
  results. No read without explicit account authorization and no silent switch
  to another account, calendar, provider, or timezone. Do not expose titles as
  instructions, or bodies, attendees, attachments, meeting links, or credentials
  as model context.
- Enforce half-open overlap semantics, maximum 48 elapsed hours, complete
  recurrence/exception handling and pagination, deterministic ordering, and
  cancellation. Cap reads at 100 expanded occurrences/five pages within existing
  workflow limits; incomplete evidence must not become a complete appointment
  list or "no appointments."
- Preserve `ok`, `empty`, `unauthorized`, `unavailable`, `stale`,
  `invalid_request`, and `ambiguous` calendar meanings through tool and answer
  delivery. Provider 401/403 or failed permitted refresh means unauthorized;
  network/timeout/429/5xx, malformed payloads and incomplete reads mean
  unavailable. At most one refresh, no unbounded retry. An old modification time
  alone is not stale; introduce no persistent cache/offline fallback.
- Add the deterministic behavior tests below at the public calendar and
  harness evidence/answer seams. Run `pnpm test`, `pnpm typecheck`, and
  `pnpm build` for implementation changes.
- Do not create, edit, delete, invite, respond, subscribe/watch, poll in the
  background, discover/shared-read other calendars, or synthesize across
  calendars, email, Home, memory, or other sources.
- Update architecture documentation with implemented behavior and verification
  limits; update the server setup guide and placeholder configuration only when
  actual configuration and routes exist.

## Deterministic acceptance cases

Run the same literal expected normalized outcomes against both adapters using
synthetic provider-shaped payloads and an injected clock/transport. No real
provider credentials, live network, or live LLM is required.

- At clock `2026-03-28T11:00:00Z`, "tomorrow" in `Europe/Amsterdam` resolves to
  `[2026-03-28T23:00:00Z, 2026-03-29T22:00:00Z)` (23 hours). An appointment
  `2026-03-29T08:00:00Z`–`08:30:00Z` displays as 10:00–10:30 CEST, with the
  selected source and interval. Add the 25-hour autumn day
  `[2026-10-24T22:00:00Z, 2026-10-25T23:00:00Z)` and distinct instants for the
  repeated local hour; missing/invalid zone asks or rejects without fetching.
- Include an ongoing appointment; exclude one ending exactly at query start
  or starting exactly at query end. Preserve an all-day span
  `2026-03-29`–`2026-03-30` (exclusive) and its calendar zone, with no invented
  clock time. Cover a calendar zone differing from the resident's.
- Expand recurring events, moved exceptions, cancellations, untitled events,
  and duplicates across pages into the same sorted occurrence set for Graph
  and Google. A populated second page prevents a false empty first-page result;
  failed later pages, page loops, off-origin pagination and caps are unavailable.
- A complete authorized zero-event response alone yields `empty`; missing
  configuration, missing consent, expired/revoked tokens, 401/403, failed
  refresh, timeout, 429/5xx, invalid payloads, and incomplete reads never do.
  Check stale evidence cannot be presented as current or used for current
  emptiness; no stale fallback is fetched from previous workflows.
- Reject wrong resident/account/source, missing/overbroad grants, malicious
  endpoint/calendar inputs, invalid/reversed/over-wide intervals, and OAuth
  state/nonce/issuer/audience mismatch/replay before calendar access. Clarify
  multiple sources without reading both. Verify refresh preserves the grant
  binding and disconnect prevents further reads.
- Capture outbound methods and paths to prove only approved reads/token
  lifecycle calls occur; event mutation and arbitrary URL attempts fail.
  Adversarial event titles cannot invoke tools or synthesize other sources.
  Verify secrets/raw payloads never enter evidence, resident answers, or audit.
- Exercise the harness with deterministic model responses to verify source/
  timezone attribution, truthful empty/failure answers, and cancellation or
  steering preventing outdated results from becoming a settled resident answer.

## Live verification constraints

Live checks are opt-in, separate from deterministic tests, never run in CI,
and self-skip without explicit enablement or credentials. Before **each run**,
inspect `.env` and any selected `--env` overlay, state the chosen calendar
adapter/account alias and every cloud provider the command could contact, and
obtain explicit user consent for that run/adapter. OAuth account consent is
not blanket consent for agent-driven verification. Do not run broad stack
commands that incidentally contact unapproved LLM/speech providers.

Use dedicated consenting test accounts with manually preseeded synthetic
appointments; the read-only adapter must not create fixtures. For each adapter,
check a known timed/all-day/recurring appointment, a known empty period,
timezone/source attribution, and disconnect/reconnect or revoked-grant behavior.
Keep writes used to prepare the calendar outside this journey. Record sanitized
adapter/configuration requirements, interval/zone, observed result classes, and
any unverified cases, without secrets or personal content. Lack of credentials,
tenant approval, or consent is a documented live-verification limit, not a
passing live check and not a reason to broaden permissions.
