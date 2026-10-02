# Sodalis

Sodalis is a local-first personal desktop with an embodied assistant. This
initial slice hosts the MIT-licensed Aster desktop beside an accessible
placeholder for the future assistant and 3D avatar.

## Run locally

```sh
pnpm install
pnpm dev
```

Open the local URL printed by Vite. Aster runs in a same-origin iframe and
retains its own app sandboxing. The desktop host bridge can enumerate visible
built-in apps and open them; it does not expose app DOM or inspect untrusted
web apps.

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

This version includes the pnpm workspace, Aster baseline, typed desktop host
adapter, and assistant/avatar host region. It does not yet include an avatar
model, speech, an LLM, memory, or Mail integration. See `TASKS.md` and
`docs/architecture/desktop-foundation.md` for implementation boundaries and
next steps.
