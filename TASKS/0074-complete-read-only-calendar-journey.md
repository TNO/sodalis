# 0074 Complete a mock-only read-only calendar journey

Status: open
Priority: medium
Subsystem: assistant
Depends on: 0073

## Context and scope

Task [0073](0073-decide-read-only-calendar-access.md) preserves calendar
provider choices as future design. This open implementation task is narrowed to
a provider-neutral `readCalendar` contract and deterministic synthetic
calendar fixture only. It must not add Microsoft Graph or Google Calendar
readers, OAuth/OIDC, account sessions, credential handling, provider network
calls, or account connection UI. **No calendar runtime is implemented by the
current 0072 email revision.**

Keep calendar separate from the mock-only email contract in
[0072](0072-complete-read-only-email-journey.md); do not combine capabilities
or reuse email fixture data. The [architecture](../docs/architecture/companion-harness.md#read-only-calendar-design-deferred-no-runtime)
retains provider-specific scopes, endpoints, and authorization only as deferred
design. Future real-account readiness is tracked by
[0084](0084-gating-future-real-provider-access.md), which does not authorize
real-provider code or access.

## Mock contract

- Implement the provider-neutral calendar interface only against a fixed,
  deterministic synthetic fixture. Label the result and every appointment
  clearly as synthetic/mock; never describe it as a connected or selected
  account/calendar.
- Support only **"What appointments are in my selected calendar tomorrow?"**
  over the fixture, using an injected clock and explicit IANA timezone. If
  fixture selection or timezone is ambiguous/invalid, ask or reject without
  reading.
- Resolve local-day intervals to half-open UTC ranges, including 23-hour and
  25-hour DST days. Preserve timed versus all-day events; enforce overlap
  semantics, deterministic ordering, and bounded output.
- Keep evidence minimal: synthetic source label/reference, optional title,
  timed start/end or all-day date span, resident timezone, query interval and
  checked time. Treat titles as untrusted text; do not expose bodies, attendees,
  links, attachments, or credentials.
- Keep unsupported appointment/calendar requests limitation-only. Do not write,
  invite, respond, subscribe/watch, poll, discover other calendars, or
  synthesize with email, Home, memory, or other sources.
- Do not add provider configuration, auth UI, HTTP routes, HTTP transports,
  secrets, or live checks. Graph/Google parity and OAuth requirements remain
  deferred architecture design, not acceptance for this mock-only task.

## Deterministic behavior tests

Use the public reader and harness answer seams with literal expected fixtures:

- At `2026-03-28T11:00:00Z`, "tomorrow" in `Europe/Amsterdam` resolves to
  `[2026-03-28T23:00:00Z, 2026-03-29T22:00:00Z)` (23 hours). An event at
  `2026-03-29T08:00:00Z`–`08:30:00Z` renders at 10:00–10:30 CEST.
- Cover the 25-hour autumn day
  `[2026-10-24T22:00:00Z, 2026-10-25T23:00:00Z)`, distinct instants in the
  repeated local hour, ongoing events, half-open overlap edges, all-day
  exclusive-end dates, and a fixture calendar zone differing from the resident's.
- Verify complete synthetic empty versus unavailable, invalid timezone/range,
  deterministic order, source/time attribution, no credentials/raw payloads,
  and that unsupported questions cannot read the fixture.
- Prove the mock makes no provider/network calls and never calls auth/account
  APIs.

No live provider, cloud, account, or real-model tests. When this mock-only
runtime is implemented, run `pnpm test`, `pnpm typecheck`, `pnpm build`, and
`git diff --check`. Any future real-account proposal requires explicit
approval and readiness work tracked separately by 0084.
