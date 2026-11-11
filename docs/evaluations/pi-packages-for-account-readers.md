# Pi ecosystem packages for the read-only email and calendar readers

- **Status:** Historical package research complete; no third-party/provider
  package implemented or installed; real-provider design is deferred and not
  supported
- **Date:** 2026-11-05

## Summary and recommendation

Sodalis embeds Pi (`@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`,
`@earendil-works/pi-coding-agent`, pinned at `1.5.0` in
[`apps/server/package.json`](../../apps/server/package.json)) as the
model/tool-loop runtime, per [ADR 0007](../adr/0007-companion-harness.md).
Tasks [0072](../../TASKS/0072-complete-read-only-email-journey.md) and
[0074](../../TASKS/0074-complete-read-only-calendar-journey.md) are mock-only;
0072 implements a Sodalis-owned generic email read API. This research documents
the earlier package survey and deferred design for possible real-provider
work. If that work is explicitly approved in the future, it
would need (1) Microsoft Graph and Gmail/Google Calendar HTTP access, (2) an
authorization-code OAuth + PKCE + CSRF + ID-token-validation coordinator, and
(3) host-only secure credential storage, as specified in
[ADR 0008](../adr/0008-delegated-personal-account-access.md) and the
[delegated account authorization](../architecture/companion-harness.md#delegated-account-authorization)
and [read-only email](../architecture/companion-harness.md#read-only-email-access-decision-0071)/
[calendar](../architecture/companion-harness.md#read-only-calendar-design-deferred-no-runtime)
architecture sections.

**Recommendation: do not add any Pi-ecosystem package (official or
community) for provider access, OAuth, or credential storage.** The only
first-party Pi package already in use that is reusable is the tool-definition/
execution-loop surface (`defineTool` from `@earendil-works/pi-coding-agent`,
message types from `@earendil-works/pi-ai`) already wired in
[`apps/server/src/assistant/harness/tools.ts`](../../apps/server/src/assistant/harness/tools.ts).
Nothing in the Pi monorepo (`packages/agent`, `ai`, `chord`, `codemode`,
`coding-agent`, `durable`, `env`, `mcp`, `schema`, `telemetry`, `tui`) or the
public Pi package catalog provides a vetted Microsoft Graph, Gmail, Google
Calendar, OAuth, or credential-store integration; the catalog is explicitly
unvetted third-party npm content. Community "Pi"/MCP packages that do offer
Gmail or Microsoft 365 access (`@gongrzhe/server-gmail-autoauth-mcp`,
`@softeria/ms-365-mcp-server`, `pi-mcp-adapter`, `pi-mcp-extension`) are
ambient-tool importers that hand the model broad, self-selected provider
scopes and endpoints — the opposite of ADR 0007's and ADR 0008's host-owned,
narrowly-scoped boundary — and must not be used. The current tasks remain
mock-only. Any future real-provider proposal, after explicit approval and the
readiness gates in task 0084, should be separately designed behind Sodalis-owned
interfaces and must not infer authorization from package availability.

## Scope

- Checked: whether any `@earendil-works/*` (Pi) package, or any package
  published to the public Pi package catalog at `pi.dev/packages`, already
  implements Microsoft Graph email/calendar access, Gmail API access, Google
  Calendar access, OAuth authorization-code/PKCE flows, CSRF/session
  handling, OIDC ID-token validation, or OS/host credential storage.
  Distinguished Pi *runtime* packages (the model/tool loop Sodalis embeds)
  from *provider adapters* and *OAuth/security infrastructure* (which Sodalis
  must own per ADR 0008).
  Identified official, non-Pi, first-party SDKs for Graph, Gmail, Google
  Calendar, OAuth/PKCE, and ID-token validation that could sit behind
  Sodalis's own adapters, and recorded their maintenance status.
  Surveyed community MCP/Pi-ecosystem packages that already wrap Gmail/Graph,
  to check whether they could be reused and why ADR 0007/0008 rule that out.
- Not in scope / not done: live OAuth or API calls against Microsoft or
  Google; no package was installed, executed, or added to any `package.json`;
  no code changes beyond this report and the two listed task/README links;
  no assessment of Pi versions other than `1.5.0` (the version pinned in this
  checkout); no exhaustive audit of all 5,600+ catalog packages (a keyword
  search plus the catalog's own disclosure that entries are unvetted
  third-party npm content was judged sufficient to answer the reuse
  question).

## Method

- Read the current checkout's task specs (`TASKS/0072-complete-read-only-email-journey.md`,
  `TASKS/0074-complete-read-only-calendar-journey.md`), ADR 0007, ADR 0008,
  and the architecture sections they reference in
  [`docs/architecture/companion-harness.md`](../architecture/companion-harness.md)
  (`Delegated account authorization`, `Read-only email access decision (0071)`,
  `Approved read-only calendar contract (planned)`).
- Read `apps/server/package.json` and
  `apps/server/src/assistant/harness/tools.ts`/`companionModel.ts` to confirm
  which Pi packages and APIs the server actually imports today.
- Queried the public npm registry (`registry.npmjs.org`) for package
  metadata (description, latest version, publish date, repository,
  maintainers, license, dependencies) for every `@earendil-works/*` package
  and for candidate provider/security packages.
- Listed the `packages/` directory of the upstream Pi monorepo
  ([`github.com/earendil-works/pi`](https://github.com/earendil-works/pi))
  via the GitHub API and fetched each sub-package's `package.json` from
  `raw.githubusercontent.com` to confirm its purpose.
- Fetched [`pi.dev`](https://pi.dev/) and [`pi.dev/packages`](https://pi.dev/packages)
  (the official Pi site and public package catalog) and
  [`pi.dev/docs/latest`](https://pi.dev/docs/latest) for Pi's own
  description of its extension model and security posture.
- Searched the npm registry for Gmail/Microsoft Graph/calendar/OAuth
  packages under the `earendil-works` scope and more broadly, then fetched
  registry metadata and, for ambiguous maintenance signals, the GitHub API
  (`archived`, `pushed_at`) or repository README for each candidate.
- Spot-checked official SDK source (`google-auth-library` `oauth2client.ts`
  on GitHub; `msal-node` docs in the MSAL JS monorepo) to confirm PKCE and
  ID-token-verification APIs actually exist, rather than inferring from
  descriptions alone.
- No live network calls were made to Microsoft or Google account APIs; no
  package was installed; no OAuth client was registered.

## Results

### Pi runtime packages already in the dependency tree

| Package | Version pinned | Purpose (npm description) | Repo/dir | Used in this repo for |
| --- | --- | --- | --- | --- |
| `@earendil-works/pi-agent-core` | 1.5.0 | "General-purpose agent with transport abstraction, state management, and attachment support" ([npm](https://www.npmjs.com/package/@earendil-works/pi-agent-core)) | `earendil-works/pi`, `packages/agent` | Not directly imported by name in `apps/server/src`; pulled in transitively as the agent loop under `pi-coding-agent`/`pi-ai` usage. |
| `@earendil-works/pi-ai` | 1.5.0 | "Unified LLM API with automatic model discovery and provider configuration" ([npm](https://www.npmjs.com/package/@earendil-works/pi-ai)) | `packages/ai` | Message/assistant-response types imported in `apps/server/src/assistant/harness/companionModel.ts:7`, `companionSession.ts:1`. |
| `@earendil-works/pi-coding-agent` | 1.5.0 | "Coding agent CLI with read, bash, edit, write tools and session management" ([npm](https://www.npmjs.com/package/@earendil-works/pi-coding-agent)) | `packages/coding-agent` | `defineTool`/`ToolDefinition` imported in `apps/server/src/assistant/harness/tools.ts:1` to register Sodalis's own explicit, host-authored tools (home-graph reads, external-data reads) — never the package's own default shell/file/bash tools, consistent with ADR 0007's "without default shell/file tools ... or automatic discovery." |

Other Pi monorepo packages, confirmed by fetching each `package.json` from
`raw.githubusercontent.com/earendil-works/pi/main/packages/<name>/package.json`:
`chord` (object/plugin runtime for multi-process apps), `codemode` (sandboxed
JS execution limited to injected tools), `durable` (durable conversation/task
runtime), `env` (SSH-based remote execution daemon for `pi-durable`), `mcp`
("Standalone Model Context Protocol client for pi and other applications"),
`schema` (JSON Schema validation), `telemetry` (vendor-neutral telemetry
contracts), `tui` (terminal UI). None of these packages' descriptions or
dependency graphs mention Microsoft Graph, Gmail, Google Calendar, OAuth, or
credential storage; `pi-mcp` is a generic Model Context Protocol client, i.e.
a mechanism for attaching arbitrary external tool servers, not a vetted
first-party connector for any specific provider.

### Public Pi package catalog

[`pi.dev/packages`](https://pi.dev/packages) is a listing of "Extensions,
skills, prompt templates, and themes published to npm," installed with
`pi install npm:<package>`, currently listing "1-50 / 5618" entries, each with
a `report` link to file a GitHub issue against a package (`pi.dev/packages`,
fetched 2026-11-05). This is explicitly community-submitted, unvetted npm
content, not an Earendil-Works/Pi first-party integration registry. A catalog
and npm-registry search for `gmail`, `calendar`, and `microsoft graph` found
no Earendil-Works-maintained connector; it found only third-party MCP-style
packages (below) that Sodalis's own tool-call boundary is designed to
preclude.

### Community MCP/Pi-ecosystem packages that touch Gmail/Microsoft 365 (not recommended)

| Package | What it does | Maintainer/status | Why it is unsuitable here |
| --- | --- | --- | --- |
| `@gongrzhe/server-gmail-autoauth-mcp` | "Gmail MCP server with auto authentication support" ([npm](https://www.npmjs.com/package/@gongrzhe/server-gmail-autoauth-mcp)); depends on `googleapis`, `google-auth-library`, `nodemailer`, `@modelcontextprotocol/sdk`. | Single maintainer (`gongrzhe`), latest `1.1.11` published 2025-08-06 — over a year stale relative to this checkout's date. | Exposes Gmail as a generic MCP tool server (its own dependency on `nodemailer` indicates send capability, not a read-only surface); an MCP client import would hand the model a self-selected, broad tool rather than Sodalis's typed, read-only email operations, violating ADR 0007's "no automatic discovery of ... extensions, or packages" and the task's explicit exclusion of send/draft/modify. |
| `@softeria/ms-365-mcp-server` | "A Model Context Protocol (MCP) server for interacting with Microsoft 365 and Office services through the Graph API" ([npm](https://www.npmjs.com/package/@softeria/ms-365-mcp-server)); depends on `@azure/msal-node`, `@modelcontextprotocol/sdk`, `express`. | Actively published (latest `0.179.1`, 2026-11-04), single maintainer (`eirikb`). | Wraps broad Microsoft 365/Graph surface (mail, files, Teams, etc., not scoped to `Mail.Read`/`Calendars.ReadBasic`) behind a generic MCP tool interface — the model, not the host, would choose Graph endpoints, which ADR 0008 and the architecture's provider table explicitly forbid ("Graph metadata and model output cannot authorize arbitrary URLs ... or new capabilities"). |
| `pi-mcp-adapter` | "MCP (Model Context Protocol) adapter extension for Pi coding agent" ([npm](https://www.npmjs.com/package/pi-mcp-adapter)), a *community* Pi extension (not an `@earendil-works` package) that lets Pi load arbitrary MCP servers; depends on `@napi-rs/keyring` for local secret storage. | Actively published (latest `7.0.1`, 2026-11-04), single maintainer (`nicobailon`), ~1.4M/mo catalog downloads shown on `pi.dev/packages`. | Generic MCP-loading extension, not a Graph/Gmail-specific integration; adopting it would reintroduce exactly the ambient, model-discoverable tool surface ADR 0007 rejects ("Supply the companion prompt and tools explicitly, without default shell/file tools or automatic discovery of settings, credentials, instructions, extensions, or packages"). |
| `pi-mcp-extension` | "Full-featured, lightweight MCP extension for the Pi coding agent: ... OAuth 2.1 (PKCE + DCR)" ([npm](https://www.npmjs.com/package/pi-mcp-extension)); community extension, not `@earendil-works`. | Actively published (latest `1.13.0`, 2026-11-04), single maintainer (`irahardianto`). | Implements generic *MCP-server* OAuth (for connecting Pi to arbitrary remote MCP servers), not delegated end-user Microsoft/Google account OAuth; reusing its PKCE/DCR code would still require building Sodalis's own tenant-aware ID-token/session logic, and it still exists to let the agent attach arbitrary external tool servers. |

### Official, non-Pi provider and security SDKs (candidates to use behind Sodalis's own adapters)

| Package | Scope it serves | Maintenance (verified via npm registry + GitHub API, 2026-11-05) | Relevant verified capability |
| --- | --- | --- | --- |
| [`@microsoft/microsoft-graph-client`](https://www.npmjs.com/package/@microsoft/microsoft-graph-client) | Microsoft Graph HTTP client (would carry `Mail.Read`/`Calendars.ReadBasic` requests) | Official (`microsoftgraph`/`microsoft-oss-releases` npm maintainers), repo [`microsoftgraph/msgraph-sdk-javascript`](https://github.com/microsoftgraph/msgraph-sdk-javascript) not archived, pushed 2026-10-28; **but the stable `latest` npm release is `3.0.7` from 2023-09-19** — a `4.0.0-RestPreview.1` exists under the `restPreview` dist-tag but is not generally available. | Thin fetch-based wrapper around Graph REST calls with middleware-pluggable auth; architecture's documented endpoints (`GET /v1.0/me/mailFolders/inbox/messages`, `GET /v1.0/me/calendarView`) are plain REST and equally reachable with the Node built-in `fetch`, which avoids depending on a library whose stable release is stale. |
| [`@azure/msal-node`](https://www.npmjs.com/package/@azure/msal-node) | Microsoft identity platform OAuth (authorization-code + PKCE, token acquisition) | Official (`azuread` npm maintainer), latest `7.2.0` published 2026-11-05 (same day as this research) — actively maintained. | `getAuthCodeUrl`/`acquireTokenByCode` implement the authorization-code flow and support PKCE per RFC 7636, and MSAL validates a supplied nonce against the ID token nonce claim ([msal-node request docs](https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-node/docs/request.md)). It does **not** implement the Sodalis-specific tenant-selector-vs-`tid`/issuer mapping (`common`/`organizations`/`consumers`/explicit tenant UUID) the architecture requires — that cross-tenant policy is Sodalis business logic to add on top of standard claim checks, not something to expect from the library. |
| [`googleapis`](https://www.npmjs.com/package/googleapis) | Generated Google API clients, including Gmail and Calendar REST surfaces | Official (Google, `google-wombot` npm maintainer), latest `189.0.0` published 2026-10-30 — actively maintained. | Provides typed request builders for `gmail.users.messages.list/get` and `calendar.events.list`; the architecture's own endpoint/field choices (`gmail.readonly`, `calendar.events.readonly`, `showDeleted=false`, `singleEvents=true`) map directly onto this client's documented methods. |
| [`google-auth-library`](https://www.npmjs.com/package/google-auth-library) | Google OAuth2 (authorization-code + PKCE) and ID-token verification | Official (Google, `google-wombot` npm maintainer), latest `11.3.3` published 2026-11-03. Its own former standalone repo is marked deprecated in favor of consolidation into the `google-cloud-node-core` monorepo, where the package's source now actually lives (`repository.directory: core/packages/google-auth-library-nodejs`) — a repo move, not an abandonment, since npm releases continue. | Verified in source (`oauth2client.ts` on GitHub): `generateCodeVerifierAsync()` returns a PKCE `codeVerifier`/`codeChallenge` pair for use with `generateAuthUrl`/`getToken`, and `verifyIdToken()` validates signature, audience, and issuer for Google ID tokens — covering the architecture's PKCE S256 and ID-token-validation requirements for Google. |

None of these four packages are Pi-ecosystem packages; they are independent,
vendor-maintained SDKs that Sodalis's own `graph`/`gmail` adapters and OAuth
coordinator would call, exactly as the architecture's provider table already
specifies by citing
[Graph `calendarView`](https://learn.microsoft.com/en-us/graph/api/calendar-list-calendarview?view=graph-rest-1.0),
[Graph permissions reference](https://learn.microsoft.com/en-us/graph/permissions-reference#calendarsreadbasic),
[Google `events.list`](https://developers.google.com/workspace/calendar/api/v3/reference/events/list),
and [Google server-side OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)
(consulted 2026-11-05 per `docs/architecture/companion-harness.md`).

### Credential storage (not a Pi concern)

ADR 0008 requires "host-only secure credential storage (OS credential store
or encrypted server store with a separately managed key)" for client secrets
and (for calendar) refresh tokens. This is infrastructure Sodalis must select
and own; it is unrelated to the Pi runtime and not something any Pi package
provides.

- [`keytar`](https://www.npmjs.com/package/keytar) (native OS keychain
  bindings) is **archived**: its GitHub repository
  [`atom/node-keytar`](https://github.com/atom/node-keytar) shows
  `archived: true`, last pushed 2022-12-12 (verified via GitHub API). It
  should not be adopted for new work.
- [`@napi-rs/keyring`](https://www.npmjs.com/package/@napi-rs/keyring)
  ("Node.js binding via napi.rs" to the Rust `keyring-rs` crate) is actively
  published (latest `2.1.2`, 2026-10-19) and has zero runtime dependencies.
  It is one viable OS-credential-store candidate for task 0072/0074's
  "selected and documented" store, but this report does not select it; that
  decision belongs to whichever of 0072/0074 lands first, per ADR 0008, and
  should weigh it against an encrypted-server-store alternative with a
  separately managed key.
- Notably, the community `pi-mcp-adapter` package (above) already depends on
  `@napi-rs/keyring` for its own local secret storage, which is incidental
  confirmation that it is an actively maintained, currently-used binding —
  not evidence that `pi-mcp-adapter` itself should be reused.

## Analysis

The task's architecture (ADR 0007, ADR 0008, and the companion-harness
sections above) draws a deliberate line: Pi supplies the model/tool-loop
*runtime*, and Sodalis supplies every *capability* — including all provider
access, OAuth, and credential handling — as explicit, host-authored code
behind narrow tool definitions. That line held up under research: no
Earendil-Works (`@earendil-works/*`) package, and no package in the public Pi
catalog, implements Microsoft Graph mail/calendar, Gmail, or Google Calendar
access, OAuth/PKCE/session/CSRF handling, ID-token validation, or credential
storage. The closest things that exist are third-party MCP servers/extensions
that *do* wrap Gmail or Microsoft 365 — but adopting any of them would mean
handing the model a self-selected, broad-scope external tool (mail send
included, in one case), which is precisely what ADR 0007 rules out ("without
... automatic discovery of settings, credentials, instructions, extensions,
or packages") and what ADR 0008 and the architecture's per-capability,
least-privilege scope tables are designed to prevent.

The pragmatic implication is that 0072/0074 should treat "Pi packages" as
answering a different question than "Graph/Gmail/Calendar SDKs": Pi stays
limited to `defineTool`-registered, host-defined tools calling Sodalis's own
`ReadOnlyEmailReader`/`readCalendar` adapters (already the pattern in
`apps/server/src/assistant/harness/tools.ts`), while those adapters call
official vendor SDKs or plain `fetch` against the documented REST endpoints.
Of the official SDKs, `@azure/msal-node`, `googleapis`, and
`google-auth-library` are actively maintained and have verified PKCE/ID-token
APIs; `@microsoft/microsoft-graph-client`'s stable release is three years
stale, which is a reason to prefer direct `fetch` calls against Graph's
documented REST endpoints (already how the architecture specifies the Graph
and Gmail requests) over adding that specific dependency. In every case, the
Sodalis-specific cross-tenant issuer/`tid` validation table, CSRF/session
cookie handling, scope separation between capabilities, and the credential
store itself remain work no package performs; they are exactly the "OAuth
coordinator" and "secure credential store" ADR 0008 assigns to whichever of
0072/0074 lands first.

## Limitations

- This is a documentation/registry/source survey, not a working
  implementation or a live-compatibility check; no package was installed,
  and no claim is made about exact version compatibility with the rest of
  this checkout's dependency tree (`apps/server/package.json` currently has
  no Microsoft/Google SDK dependency to check against).
  Package maintenance snapshots (archived flags, last-publish dates, version
  numbers) are **current as of 2026-11-05** and can change.
- The Pi package catalog has 5,618 entries; this research used targeted
  keyword searches (`gmail`, `calendar`, `microsoft graph`, `oauth`) rather
  than an exhaustive listing, on the premise that the catalog's own framing
  ("published to npm," with a per-package "report" mechanism) is sufficient
  evidence that it is unvetted third-party content regardless of whether a
  more specific connector exists somewhere in it.
- MSAL Node's and google-auth-library's documented validation behavior
  (nonce/signature/audience/issuer checks) was confirmed from official docs
  and source, but this research did not trace every edge case in the
  architecture's tenant-selector table (`common`/`organizations`/`consumers`/
  explicit tenant UUID vs `tid`) against library internals; that table is
  Sodalis-specific logic regardless of library choice and still needs its
  own implementation and tests under 0072/0074.
- No assessment was made of Google's "restricted scope" verification and
  security-assessment process, or Microsoft tenant/admin-consent policy,
  beyond what the architecture document already states; those remain
  deployment-time organizational constraints independent of package choice.

## Open items

- 0072/0074 implementation still needs to pick and document the concrete
  credential store (OS credential store via a binding such as
  `@napi-rs/keyring`, or an encrypted server store with a separately managed
  key) per ADR 0008; this report surfaces one actively-maintained candidate
  but does not select one.
- Confirm, when implementation starts, whether `@microsoft/microsoft-graph-client`'s
  `4.0.0-RestPreview.*` line has reached general availability; if not, prefer
  direct `fetch` calls against the documented Graph REST endpoints as the
  architecture already specifies.
- No live check of real OAuth consent screens, tenant admin policy, or
  Google verification/security-assessment requirements was performed or is
  authorized by this report; those remain separate, opt-in, consented steps
  per the tasks' live-verification constraints.
