# Sodalis implementation tasks

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
- [ ] Resolve host denial/removal of Aster's `src/win32/examples/pad.exe`
  fixture before claiming the vendored snapshot or Win32 test coverage is
  complete. Do not bypass the host's file protection.

## Next

- [ ] Define `AvatarController` and test the initial avatar state transitions;
  do not require WebGPU.
- [ ] Record the runtime protocol/schema-validation decision before adding
  cross-boundary messages.
- [ ] Add a trusted-app SDK with semantic context and typed action definitions.
- [ ] Add the deterministic mock Mail app and test search, read, draft, and
  confirmation behavior without an LLM.
- [ ] Add an attention manager that uses semantic targets and respects reduced
  motion.
- [ ] Introduce independent STT and TTS provider interfaces with cancellation
  and deterministic mock providers.

## Findings and boundaries

- Aster is a static vanilla-JavaScript desktop, not a pnpm package. Its
  upstream `index.html` is served unchanged under `/aster/`.
- Aster exposes a narrow runtime entry point as `window.Aster`; the adapter
  awaits `Aster.ready`, enumerates visible built-in apps, and uses `openApp`.
- The adapter excludes hidden/system features, imported custom apps, and
  catalog web apps. It does not expose semantic app state or DOM access.
- Aster's published test instructions warn that the smoke runner writes
  `tests/results.json`; reruns should use a temporary copy.
- This host removes or denies access to Aster's `pad.exe` sample after it is
  extracted. The 54-check baseline passed against the original upstream
  checkout before the restriction; the local vendor/build tree cannot preserve
  that fixture, which may affect the Win32 sample and service-worker precache.
- Persistent memory, speech, model choice, real Mail providers, and Home
  Assistant remain out of scope until the vertical slice has working tests.
