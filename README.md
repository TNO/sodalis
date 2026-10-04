# Sodalis

Sodalis is a local-first personal desktop with an embodied assistant. The
initial avatar vertical slice hosts the MIT-licensed Aster desktop beside an
optional Three.js/TalkingHead avatar runtime and an accessible assistant panel.

## Run the full stack on macOS

Use Docker Desktop with Docker Compose v2, or a running Podman machine with
the standalone Docker Compose v2 `docker-compose` executable (not
`podman-compose`). Install Node.js 24 and pnpm 12.4.1. Download the Whisper
and Piper models into `models/` as described in
[`docs/development-stack.md`](docs/development-stack.md) unless they are
already present in this checkout.

From the repository root:

```sh
pnpm install
cp .env.example .env
pnpm stack:config
pnpm stack:up
```

Open **http://127.0.0.1:4176**. On the first launch the gateway shows Home
Assistant Core onboarding, **not** the Sodalis desktop. Create an admin
account, then a separate non-admin Sodalis user under Settings > People >
Users. Sign in as the Sodalis user and create a long-lived token under
Profile > Security. In your ignored `.env`, set `HOME_ASSISTANT_TOKEN` to that
token and change `HOME_ADMIN_UI=1` to `HOME_ADMIN_UI=0`; then run
`pnpm stack:up` again. The same URL now serves the desktop, with the Home
simulator behind its own API. Do not commit `.env` or use this simulator
configuration to control a real home.

```sh
pnpm stack:smoke  # check the running gateway and selected services
pnpm stack:down   # stop containers without deleting Core's data volume
```

The example `.env` uses local CPU Whisper.cpp and Piper for speech and a
**mock LLM**, not a real model or cloud service. See the
[development stack guide](docs/development-stack.md) for model downloads,
Docker/Podman setup, external provider options, other platforms, and
troubleshooting.

## Frontend-only development

`pnpm dev` starts the Vite desktop without the Compose services; it is
useful for UI work, but speech, assistant, and Home API calls need their
respective services. For manual service development, run `pnpm dev:speech`,
`pnpm dev:ai`, and `pnpm dev:home` with the settings in
[`apps/server/README.md`](apps/server/README.md). The desktop proxies their
APIs by path. Aster runs in a same-origin iframe and retains its app
sandboxing; the host bridge does not expose app DOM or untrusted web apps.
First-party desktop apps can register scoped semantic actions and avatar
targets with [`@sodalis/app-sdk`](packages/app-sdk/README.md); the bundled
Sample Notes panel is an example.

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
Speech, AI, and the simulated Home API are available as separate services.
The default LLM is a mock; real Home Assistant integration, long-term memory,
and real Mail delivery remain future work. See `TASKS/README.md` and
`docs/architecture/desktop-foundation.md` for boundaries and later work.
