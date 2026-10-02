# ADR 0001: Vendor Aster as an unchanged snapshot

- **Status:** Accepted
- **Date:** 2026-10-02

## Context

Sodalis needs a functioning browser desktop foundation before it can validate
assistant integration. Aster already supplies the shell, windows, apps,
virtual storage, sandboxed web apps, settings, accessibility controls, and
browser tests. Rebuilding those systems would delay the first vertical slice.

## Decision

Vendor Aster's source snapshot under `apps/desktop/public/aster/`, initially
pinned to upstream commit
`c61c1d1db7fc8de4717becc2d0dab108512520a4`. Serve its multi-file `index.html`
unchanged under `/aster/`. Preserve its MIT license, notices, and tests. Keep
Sodalis-specific behavior in the outer desktop app and the `DesktopHost`
adapter. Run upstream tests against a temporary copy because the smoke runner
updates a tracked report file.

## Consequences

- Aster is immediately usable and independently testable.
- Upstream changes are explicit snapshot updates rather than a runtime
  dependency or uncontrolled fork.
- Updates require reviewing upstream changes and bundled third-party
  components, then rerunning the baseline.
- Aster source changes are not needed for the initial adapter; any future
  patch must be documented and kept minimal.
