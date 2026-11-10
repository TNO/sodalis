# ADR 0008: Future delegated read-only personal-account access

- **Status:** Accepted as future direction; real account authorization and provider
  implementations are deferred until further notice and are not delivered or
  supported.
- **Date:** 2026-11-05

This ADR preserves the design trade-offs for possible future work. It does not
authorize implementation, deployment, account connection, or live-provider
testing. Reconsideration requires explicit future approval and completion of
[task 0084](../../TASKS/0084-gating-future-real-provider-access.md).

## Context

Tasks [0071](../../TASKS/0071-decide-read-only-email-access.md) and
[0073](../../TASKS/0073-decide-read-only-calendar-access.md) recorded possible
future read-only email and calendar designs for Microsoft Graph and Google.
The current implementation is mock-only: no real account authorization,
provider reader, host session, or credential store is present. [ADR
0007](0007-companion-harness.md) allows configured readers but explicitly does
not authorize personal-account access.

Several choices are trade-offs rather than implementation details:

- Separate per-integration OAuth code duplicates security-critical validation,
  while one shared token store risks combining grants and widening consent.
- A Google OAuth client shares one grant per user. Revoking any of its tokens
  revokes the whole grant, so a client shared between email and calendar
  couples their disconnects.
- Storing refresh tokens enables unattended reads but keeps long-lived mailbox
  authority on disk. Email is more sensitive and the approved journey is
  foreground-only; calendar reads benefit from refresh.
- [PRODUCT.md](../../PRODUCT.md) prefers local-first handling of sensitive
  personal data, but the companion uses the configured `LLM_PROVIDER`, which
  may be a cloud model. Reading email or appointments into that model sends
  personal content off-device.

## Future direction (not implemented or approved for rollout)

- If explicitly authorized later, **one host-owned connection coordinator**
  should implement authorization-code
  OAuth with PKCE S256, `state`, `nonce`, ID-token validation (including
  Microsoft tenant-aware issuer checks), session binding and disconnect. It
  would not own a universal token store. Each capability would keep its own
  grant, scopes, token policy and source binding. A future approved capability
  task could implement it first; another could then reuse it.
- **Separate client registrations per capability and provider.** Email and
  calendar never share an OAuth client, consent, or token. Disconnect revokes
  upstream where the provider supports per-client revocation (Google) and is
  local-only otherwise (Microsoft). One capability's disconnect never affects
  the other.
- **A minimal host session.** Introduce an HttpOnly, SameSite=Lax host-session
  cookie (Secure outside loopback) with CSRF protection for connection changes.
  Bind each grant to that session, the single configured resident, and the
  verified provider subject. This is not a multi-user identity framework.
- **Capability-specific token persistence.** Email tokens stay in server
  memory only, with no refresh or offline access. Calendar tokens use the
  secure store with bounded refresh. Client secrets for both capabilities live
  in host-only secure credential storage (OS credential store or encrypted
  server store with a separately managed key); configuration holds only
  references. Missing storage fails closed.
- **Disclosed model processing.** Minimized, bounded evidence (no tokens or
  raw payloads) is processed by the configured `LLM_PROVIDER`, which may be
  cloud-hosted. Any future connect screen would state this. A resident who wants
  local-only handling selects a local model; the readers do not themselves
  require one. Account content is never ingested into long-term memory or
  developer content audits.

## Potential consequences if separately approved and implemented

- Validation, CSRF and session logic would exist once and receive one
  behavior-test suite. Both journeys would depend on whichever task implements
  it first.
- If both capabilities are separately approved, residents and operators would
  register and configure two OAuth clients per provider. That costs extra
  setup and, for Gmail, possibly separate restricted-scope verification.
- Email would require reconnecting after expiry or restart; this is accepted in
  exchange for holding no long-lived mailbox authority.
- Graph disconnect cannot revoke upstream; residents would remove consent in their
  Microsoft account settings, and the UI must say so.
- With a cloud `LLM_PROVIDER`, email and calendar content would leave the device.
  This is a disclosed, per-deployment choice that departs from the local-first
  preference; live checks still need per-run consent.
- [ADR 0003](0003-trusted-desktop-boundary.md), [ADR 0005](0005-long-term-memory.md)
  and [ADR 0007](0007-companion-harness.md) remain in force.

## Alternatives considered

- **Per-integration OAuth code.** Rejected: duplicated security logic tends
  to diverge, for example in disconnect and revocation rules.
- **One shared client with incremental consent.** Rejected: provider-wide
  revocation couples capabilities and invites silent scope unions.
- **Persistent email refresh tokens.** Deferred until a background or
  unattended email journey is approved.
- **Requiring a local model for account readers.** Deferred: no local model is
  yet evaluated for this journey; the disclosure and per-deployment choice
  keep the option open.

See the [delegated account authorization](../architecture/companion-harness.md#delegated-account-authorization)
architecture for the full protocol.
