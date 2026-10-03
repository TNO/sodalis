# Sodalis implementation tasks

> Active task status and resumable details are maintained in
> [`TASKS/README.md`](TASKS/README.md). This file retains the original Phase 0
> checklist and implementation boundaries.

## Initial repository slice

- [x] Initialize a pnpm workspace with a strict TypeScript desktop app.
- [x] Pin Aster at upstream commit
  `c61c1d1db7fc8de4717becc2d0dab108512520a4`, preserving its MIT license,
  notices, documentation, and tests.
- [x] Run the unchanged Aster Chromium smoke suite: 54 passed, 0 failed.
- [x] Document Aster module boundaries and the vendoring decision.
- [x] Add a typed `DesktopHost` interface and a narrow Aster adapter.
- [x] Show Aster alongside a visible, accessible assistant/avatar placeholder.
- [x] Test built-in app discovery, launch completion, and refusal of untrusted
  app IDs.
- [x] Remove the unavailable Win32 Pad demo, source, and fixture-dependent
  tests without bypassing host protection; omit the missing executable from
  service-worker precaching and bump the cache revision.

## Phase 1 completion

The sequential Phase 1 avatar implementation tasks are complete; see
[`TASKS/README.md`](TASKS/README.md), the avatar profile, and ADR 0004. No
licensed avatar model is included. Later protocol, trusted-app, Mail, speech,
LLM, memory, and Home Assistant work is outside the Phase 1 scope.

## Findings and boundaries

- Aster is a static vanilla-JavaScript desktop, not a pnpm package. Its pinned
  multi-file `index.html` is served under `/aster/` with a documented local
  compatibility patch.
- Aster exposes a narrow runtime entry point as `window.Aster`; the adapter
  awaits `Aster.ready`, enumerates visible built-in apps, and uses `openApp`.
- The adapter excludes hidden/system features, imported custom apps, and
  catalog web apps. It does not expose semantic app state or DOM access.
- Aster's published test instructions warn that the smoke runner writes
  `tests/results.json`; reruns should use a temporary copy.
- Host restrictions prevent retaining Aster's `pad.exe` sample. Its demo,
  source, and tests were removed; the service worker excludes the missing
  executable to avoid a broken launch or corrupt offline cache entry.
- Persistent memory, speech, model choice, real Mail providers, and Home
  Assistant remain out of scope until the vertical slice has working tests.
