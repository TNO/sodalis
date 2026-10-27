# Sodalis

The name comes from Latin *sodalis*, meaning a companion, friend, or
associate: an assistant that accompanies you at your desktop.

Sodalis is a local-first personal desktop with an embodied assistant. The
initial avatar vertical slice hosts the MIT-licensed Aster desktop beside an
optional Three.js/TalkingHead avatar runtime and an accessible assistant panel.

## Run the full stack on macOS

Use Docker Desktop with Docker Compose v2, or a running Podman machine with
the standalone Docker Compose v2 `docker-compose` executable (not
`podman-compose`). Install Node.js 24 and pnpm 12.4.1. Models are not
included in the repository: `models/` is git-ignored, so **every fresh
checkout needs its own downloads**. From the repository root, download the
default Piper voice before starting the stack. The default Parakeet TDT v3
image downloads its own weights at build time:

```sh
mkdir -p models/piper
curl -fL https://huggingface.co/rhasspy/piper-voices/resolve/main/nl/nl_NL/ronnie/medium/nl_NL-ronnie-medium.onnx \
  -o models/piper/nl_NL-ronnie-medium.onnx
curl -fL https://huggingface.co/rhasspy/piper-voices/resolve/main/nl/nl_NL/ronnie/medium/nl_NL-ronnie-medium.onnx.json \
  -o models/piper/nl_NL-ronnie-medium.onnx.json
```

If both Piper files already exist in this checkout, skip the downloads. The
default voice changed from `nl_BE-nathalie-medium` to `nl_NL-ronnie-medium`
after the [Dutch TTS evaluation](docs/evaluations/tts-providers.md); existing
checkouts need the Ronnie files before `pnpm stack:up`.
Parakeet needs more than a 2 GB Podman machine; 8 GB worked alongside the
development containers. Changing the Podman VM memory requires stopping
it, which briefly stops all its containers:

```sh
podman machine stop
podman machine set --memory 8192
podman machine start
```

Install and start [Ollama](https://ollama.com/download) on your Mac and
download the example LLM (it is not included in this repository):

```sh
ollama pull llama3.2:3b
```

Ollama's app normally starts its local server. If it is not running, use
`ollama serve` in another terminal. The AI API runs in Compose and calls
Ollama on the host; Ollama itself does not run in a container by default.
If you already have an ignored `.env`, pulling these changes will not
update it: set `LLM_PROVIDER=openai-compatible`,
`LLM_BASE_URL=http://host.docker.internal:11434/v1`, and
`LLM_MODEL=llama3.2:3b` there before restarting the stack. To use the
deterministic mock instead, set `LLM_PROVIDER=mock`; other LLM settings are
then ignored. An explicit Azure OpenAI opt-in (`LLM_PROVIDER=azure`) is
described in the
[LLM guide](docs/development-stack.md#use-an-azure-openai-llm-opt-in); the
[LLM provider evaluation](docs/evaluations/llm-providers.md) compares it with
the local model.

Then start the stack:

```sh
pnpm install
cp .env.example .env
pnpm stack:config
pnpm stack:up
```

Open **http://127.0.0.1:4176**. On the first launch the gateway shows Home
Assistant Core onboarding, **not** the Sodalis desktop. Create an admin
account, then a separate non-admin Sodalis user under Settings > People >
Users. The dedicated user can be non-admin and **Local access only**;
Docker's private network counts as local. Sign in as that user and create
a long-lived token under Profile > Security. In your ignored `.env`, set
`HOME_ASSISTANT_TOKEN` to that token and change `HOME_ADMIN_UI=1` to
`HOME_ADMIN_UI=0`; then run
`pnpm stack:up` again. The same URL now serves the desktop, with the Home
simulator behind its own API. Do not commit `.env` or use this simulator
configuration to control a real home. If Core onboarding disconnects or
returns 400, pull the latest stack, run `pnpm stack:up`, and reopen the
gateway root; the Core data volume is retained. See the
[onboarding and troubleshooting guide](docs/development-stack.md#first-time-home-assistant-simulator-onboarding).

```sh
pnpm stack:smoke  # check the running gateway and selected services
pnpm stack:down   # stop containers without deleting Core's data volume
```

The example `.env` uses local CPU Parakeet TDT v3 and Piper for speech and the
host's `llama3.2:3b` via Ollama for AI. To exercise the full chain, wait for
the avatar to load, click it to open **Talk with Sodalis**, then click
**Start microphone** and allow the browser prompt. Speak, pause for
transcription, and listen for the spoken reply. Microphone permission is
requested on activation, never on page load. You can type a message first
to test AI and TTS without STT. See the
[development stack guide](docs/development-stack.md) for model downloads,
Docker/Podman setup, individual-service development, and troubleshooting.

The **Avatar** picker also offers **Three dots**, a lightweight alternative
that needs no 3D viewer. Large dots move sequentially while thinking and
pulse while speaking; a text label conveys the state even with reduced
motion. Human avatars and the existing default remain available.
Expand **Speech and subtitles** in the Assistant sidebar to set speech speed
(0.75–1.25x), additional sentence pauses (0–1000 ms), short-sentence responses,
and subtitle visibility, size and text/background colors. Settings are saved
on this device and pacing changes apply to the next response. Hidden
subtitles remain available under **Read response**; action confirmations and
errors are never hidden. Low-contrast color choices show a warning.

To select a different STT service, set `STT_PROVIDER=whisper-cpp` (download
its model as described in the guide), `STT_PROVIDER=whistle`, or the
explicit cloud opt-in `STT_PROVIDER=azure` in `.env`,
then run `pnpm stack:up`. The default is original Parakeet TDT v3, **not**
Parakeet Redux. See the
[STT provider evaluation](docs/evaluations/stt-providers.md).
Piper with the `nl_NL-ronnie-medium` voice is the default TTS. An explicit
Azure Speech opt-in (including Microsoft Foundry resources), and a
standalone, non-commercial Fish Speech 1.5 evaluation profile that is not
connected to Sodalis playback, are described in the
[TTS guide](docs/development-stack.md#evaluate-alternative-speech-synthesis).
Final analyses of these provider evaluations are collected in
[`docs/evaluations/`](docs/evaluations/README.md).

## Long-term memory and consent

Long-term memory ([ADR 0005](docs/adr/0005-long-term-memory.md)) is **off**
by default. With `MEMORY_ENABLED=true`, it still stores nothing until
consent is recorded. There are two separate consents, both kept in the
memory database (the `memory_data` volume), so they survive restarts:

| Consent | Allows | Without it |
| --- | --- | --- |
| `memory` | Storing turns and extracting general memories (facts, people, dates, preferences), and using them in replies | Memory is inactive: nothing is stored, queued, or retrieved |
| `health` | Also storing and recalling health memories (diagnoses, medication, allergies) | Health memories are dropped before storage; existing ones are hidden from replies |

Grant or withdraw either consent at runtime; the latest record wins:

```sh
curl -fsS -X PUT http://127.0.0.1:4176/api/memory/consent \
  -H 'content-type: application/json' -d '{"kind":"health","granted":true}'
curl -fsS http://127.0.0.1:4176/api/memory/status   # shows both consents
```

Two **development-only** `.env` settings change the defaults:

- `MEMORY_REQUIRE_CONSENT=false` skips the `memory` consent check entirely.
  It does not grant `health`.
- `MEMORY_HEALTH_CONSENT=true` records the `health` consent at startup,
  but **only when no health consent was ever recorded**. It is stored with
  policy version `env`. If you later withdraw it through the API, a restart
  does not grant it again. To reset the stored consent, record it again
  through the API.

Health memories from observed events (for example Home sensors) are never
stored, even with `health` consent. Withdrawing a consent does not delete
anything: use `DELETE /api/memory/items/<id>` or `DELETE
/api/memory/transcripts`, or remove the volume to forget everything. With
`MEMORY_EXTRACT_PROVIDER=azure`, user messages are sent to your
`AZURE_LLM_*` resource for extraction. See the
[memory settings](apps/server/README.md#long-term-memory) for all
`MEMORY_*` options.

## Frontend-only development

`pnpm dev` starts the Vite desktop. To use the already running Compose
backends while editing the desktop, run
`SODALIS_API_GATEWAY_URL=http://127.0.0.1:4176 pnpm dev` and open Vite's
printed URL (usually port 5173). Open the developer-only **Avatar Lab**
controls by expanding **Avatar Lab** in the **Assistant** sidebar of that
Vite page. It is not shown in the production build at
`http://127.0.0.1:4176`; there, click the avatar to open the
**Talk with Sodalis** conversation panel. For manual service development, run
`pnpm dev:speech`, `pnpm dev:ai`, or `pnpm dev:home` with the settings in
[`apps/server/README.md`](apps/server/README.md). The desktop proxies their
APIs by path; see the
[service development guide](docs/development-stack.md#develop-one-service-at-a-time)
for per-service overrides. Aster runs in a same-origin iframe and retains
its app sandboxing; the host bridge does not expose app DOM or untrusted web apps.
First-party desktop apps can register scoped semantic actions and avatar
targets with [`@sodalis/app-sdk`](packages/app-sdk/README.md); the bundled
Sample Notes panel is an example.

## Licensed avatars (collaborators)

Some avatars, such as the MetaHuman Anna, may ship inside Sodalis builds but
may not be published on their own. Their GLBs live in the private repository
[TNO/sodalis-licensed-avatars](https://github.com/TNO/sodalis-licensed-avatars),
never in this public one. Without them, Sodalis builds and runs with the open
avatars only; forks work the same way.

Sodalis collaborators get read access from a maintainer; ask one to add your
GitHub account. Then, from the repository root:

```sh
git clone https://github.com/TNO/sodalis-licensed-avatars ../sodalis-licensed-avatars
pnpm avatars:licensed ../sodalis-licensed-avatars
pnpm dev     # or pnpm build; restart a running dev server
```

The script copies the GLBs and their `NOTICE.md` into the git-ignored
`apps/desktop/public/avatars/licensed/`. Use them only inside Sodalis and
share them only through the private repository: no public uploads, forks,
CI artefacts or tokens. Release builds contain these files, so distribute
them only as the Sodalis app. See
[Licensed avatars](docs/avatar/licensed-avatars.md) for adding an avatar and
the licence rules.

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
The example connects AI to a host Ollama model. Opt-in, consent-based
long-term memory (`packages/memory`, ADR 0005) runs in the AI service; real
Home Assistant integration, its memory consent UI, and real Mail delivery
remain future work.
See `TASKS/README.md` and
`docs/architecture/desktop-foundation.md` for boundaries and later work.
