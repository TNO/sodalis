# 0072 Complete a mock-only read-only email journey

Status: in progress
Priority: medium
Subsystem: assistant
Depends on: 0071

## Context and scope

Task [0071](0071-decide-read-only-email-access.md) records future provider
design choices. They are not delivered or supported. This task implements a
provider-neutral set of typed read operations with a deterministic synthetic
mock. It does not implement Microsoft Graph, Gmail, OAuth/OIDC, account
sessions, credentials, provider networking, or connection UI. The mutable
[`MockMailApplication`](../apps/desktop/src/assistant/MockMailApplication.ts)
fixture app is separate and must remain unchanged.

The [architecture](../docs/architecture/companion-harness.md#read-only-email-access-decision-0071)
is the source of truth for the current API and deferred design. The
[historical security review](../docs/evaluations/email-journey-security-review.md)
covers the earlier removed real-provider implementation; it does not assess or
certify this mock-only revision. Future real-account readiness is tracked by
[0084](0084-gating-future-real-provider-access.md).

## Confirmed generic contract

- Implement `listMessages(filters, sort, pageSize, cursor)`,
  `getMessageContent(opaqueMessageRef)`, and `countUnread(container?)`. The
  model interprets natural language and supplies structured arguments; the
  adapter never parses free-form questions.
- When `EMAIL_PROVIDER=mock`, expose all three operations in every workflow.
  Do not gate tool availability on an exact question or email keywords. Keep
  `off` as the default; mock requires explicit selection and the Pi harness.
- Bind one mailbox/source at the host. Support `inbox` (default) and
  `all_mail`; `all_mail` includes inbox, archive, and sent, and excludes
  drafts, spam, trash, and deleted. Other containers return unsupported rather
  than silently switching.
- Combine sender, subject, unread/read, and UTC half-open sent/received time
  filters with AND; sender and subject matching is case-insensitive substring
  matching. Do not search message bodies. Default to newest
  `receivedAt` first with a stable reference tie-break; allow ascending or
  descending sort by `sentAt` or `receivedAt`.
- List metadata includes an opaque source-bound message reference, sender,
  subject, sent timestamp with explicit availability and provider,
  sender-supplied, synthetic, or missing provenance, optional received
  timestamp, unread state, and a safe source kind/label/container. Do not
  expose provider IDs or URLs in source evidence.
- Messages with missing timestamps remain listable. They do not satisfy a time
  filter and sort after available timestamps in either direction, with stable
  message-reference ties.
- Fetch content only on demand by opaque reference. Normalize to plain text,
  cap at 64 KiB UTF-8 with explicit truncation, and return no attachments or
  remote links.
- Count unread messages by container (default inbox), with exact/estimated
  accuracy. Never describe counts of non-mail items as exact email counts.
- Use source/query-bound opaque cursors and at most 100 messages per page.
  There is no fixed total-result ceiling apart from existing workflow, time,
  and tool-call budgets. Distinguish complete empty, complete results,
  continuation, unavailable/unsupported, invalid request, and cancellation.
- Preserve the read-only boundary, synthetic evidence labels, cancellation,
  workflow budgets, and content-audit protection. The mock makes no provider,
  auth, or network calls. Do not change the fixture Mail application or
  calendar runtime.

## Deterministic behavior tests

Test the public reader and harness seams for:

- Different structured filters, AND semantics, UTC half-open windows,
  inbox/all-mail membership, received/sent ordering, and stable pagination.
- Provider-style reader implementations using safe source and timestamp
  provenance types, including sent mail without `receivedAt`.
- Opaque source/query-bound refs and cursors, invalid filters/cursors,
  unsupported containers, missing and truncated body content, and explicit
  plain-text availability.
- Inbox/all-mail unread counts with exact mock accuracy; unavailable and
  cancelled operations.
- Every generic operation being available for alternate email questions when
  mock mode is selected, without an exact-question or keyword classifier.
- Default-off/explicit-mock configuration, visibly synthetic evidence, no
  network or authentication calls, and no content-audit reads.

No live provider, cloud, or account tests are in scope. Real-provider
compatibility, security, and policy readiness remain deferred to 0084 and
require explicit future approval.

## Verification

Run targeted behavior tests, then `pnpm test`, `pnpm typecheck`, `pnpm build`,
and `git diff --check`. Do not run live/cloud commands.

This task stays **in progress** until the pull request merges. The historical
security report remains linked and unchanged in its findings and scope.
