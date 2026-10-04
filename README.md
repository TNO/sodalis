# Sodalis

Sodalis is a local-first personal desktop with an embodied assistant. The
initial avatar vertical slice hosts the MIT-licensed Aster desktop beside an
optional Three.js/TalkingHead avatar runtime and an accessible assistant panel.

## Run locally

```sh
pnpm install
pnpm dev
```

Open the local URL printed by Vite. Aster runs in a same-origin iframe and
retains its own app sandboxing. The desktop host bridge can enumerate visible
built-in apps and open them; it does not expose app DOM or inspect untrusted
web apps.

Speech and AI can run independently with `pnpm dev:speech` and `pnpm dev:ai`.
The desktop proxies their APIs by path; see
[`apps/server/README.md`](apps/server/README.md) for model configuration.

## Checks

```sh
pnpm test
pnpm typecheck
pnpm build
```

Aster is vendored at `apps/desktop/public/aster/`. Its upstream `TESTING.md`
describes the standalone browser suite. At the pinned upstream commit, the
unchanged smoke suite passed 54 checks in Chromium. The test runner writes its
report into the Aster tree, so run it against a temporary copy when rechecking
to keep the vendored upstream snapshot clean. Host restrictions prevent
retaining Aster's `src/win32/examples/pad.exe` fixture. The Win32 Pad demo,
source, and fixture-dependent tests are removed from this snapshot. See
`TASKS.md` for details.

## Current scope

Phase 1 includes the Aster desktop, typed host adapter, Sodalis-owned avatar
scene, TalkingHead behavior adapter, developer-only Avatar Lab, and GLB
profile/validator. The avatar uses `@met4citizen/talkinghead@1.7.0` and
`three@0.180.0`; see
[`docs/avatar/SODALIS_AVATAR_PROFILE.md`](docs/avatar/SODALIS_AVATAR_PROFILE.md)
for rig, morph, asset provenance, quality, and validation requirements. No
commercially approved avatar model is selected. The desktop includes the
TalkingHead brunette example under its separate CC BY-NC 4.0 license as a
non-commercial pipeline sample; actual model-render FPS is not yet measured.
Speech, an LLM, memory, Mail, and Home Assistant remain out of scope. See
`TASKS.md` and
`docs/architecture/desktop-foundation.md` for boundaries and later work.
