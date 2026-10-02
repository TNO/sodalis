# ADR 0003: Keep assistant access behind a trusted desktop host

- **Status:** Accepted
- **Date:** 2026-10-02

## Context

Aster contains built-in applications, imported apps, and sandboxed web apps.
The assistant must not inspect arbitrary DOM or inherit access to untrusted
content.

## Decision

Keep Aster in a same-origin iframe and expose it to Sodalis code only through
`DesktopHost`. For now, that host lists visible built-in app descriptors and
opens a visible built-in app. It excludes hidden/system features, custom apps,
and catalog web apps; it does not expose DOM, application context, or raw
runtime objects. Preserve all existing Aster iframe sandbox settings.

## Consequences

- Traditional Aster UI continues to work independently of assistant code.
- The adapter can support desktop navigation without making screenshots or
  DOM inspection part of the trusted-app protocol.
- Semantic app context and actions require a separate, typed SDK and permission
  layer before the assistant can act inside applications.
