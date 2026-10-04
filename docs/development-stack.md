# Local development stack

This Compose v2 stack runs the desktop gateway, speech API, and AI API.
Optional local engines and the Home Assistant Core simulator are selected from
one ignored `.env` file. The gateway is the **only** published service, bound
to `127.0.0.1:4176` by default; this is not a production deployment.

## Prerequisites

- Node.js 24 and pnpm 12.4.1 (or Corepack with the repository's pinned pnpm).
- Docker Desktop with Docker Compose v2 on Windows, macOS, or Linux; alternatively
  Docker Engine with the Compose v2 plugin on Linux.
- Podman with a running machine on macOS/Windows, or a running Podman socket on
  Linux, plus the standalone **Docker Compose v2** `docker-compose` executable.
  The launcher uses `docker compose` if available, otherwise `docker-compose`;
  for Podman it discovers the machine/socket and sets `DOCKER_HOST`. Do not use
  `podman-compose`, whose profiles and interpolation are not a compatibility
  target. The Podman Compose v2 route has been exercised on macOS ARM64; check
  socket availability on your own host before launching.

Install dependencies with `pnpm install`, then copy `.env.example` to `.env`
(`cp .env.example .env` on macOS/Linux, or `Copy-Item .env.example .env` in
PowerShell). Never commit `.env`, downloaded models, or access tokens.

## Choose providers

Edit `.env` before each launch. `LLM_PROVIDER` and `HOME_PROVIDER` **must** be
explicit. The example uses a deterministic local LLM mock and the Home
Assistant simulator. `STT_PROVIDER` defaults to `whisper-cpp` and
`TTS_PROVIDER` to `piper`, both running on CPU without a GPU.

| Role | Local selection | External selection |
| --- | --- | --- |
| STT | `whisper-cpp` (blank `WHISPER_CPP_URL`) or `mock` | `whisper-cpp` with `WHISPER_CPP_URL` |
| TTS | `piper` (blank `PIPER_HTTP_URL`) or `mock` | `piper`/`piper-http` with `PIPER_HTTP_URL` |
| LLM | `mock`, or `openai-compatible` with `LLM_MODEL` naming a local `.gguf` and blank `LLM_BASE_URL` | `openai-compatible` with `LLM_BASE_URL` and `LLM_MODEL`; optional `LLM_API_KEY` |
| Home | `simulator` with Core and its dedicated `HOME_ASSISTANT_TOKEN` | `external-api` with `HOME_API_URL` |

External URLs must be reachable **from the containers**, not just the host.
For a host-native service, use `host.docker.internal` with Docker Desktop or
`host.containers.internal` with Podman (verify your host's resolution); Linux
Docker Engine may need its own host gateway or a reachable network address.
An external STT endpoint must speak the Whisper.cpp server protocol; TTS must
speak Piper HTTP (`POST /synthesize` with a WAV response); the LLM endpoint
must stream OpenAI-compatible Chat Completions; and the Home endpoint must
implement Sodalis's `/api/home/*` contract. Azure and other hosted services
are usable **only when their endpoint implements the selected protocol**,
possibly through a separately managed adapter. No Azure-specific wire
protocol, automatic provider discovery, or remote fallback is included.
For a legacy Piper-compatible service that accepts `POST /`, set
`TTS_PROVIDER=piper-http` and end `PIPER_HTTP_URL` with `/`. An explicit
non-root endpoint path is also honored. `HOME_API_URL` must be an origin
without a path or query, since Caddy proxies the existing `/api/home/*` path.
Keep external endpoints private and trusted. Browser code receives neither
provider URLs nor credentials.

For local speech, download a multilingual Whisper.cpp model and both Piper
voice files into these ignored paths:

```sh
mkdir -p models/whisper models/piper
curl -fL https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin \
  -o models/whisper/ggml-base.bin
curl -fL https://huggingface.co/rhasspy/piper-voices/resolve/main/nl/nl_BE/nathalie/medium/nl_BE-nathalie-medium.onnx \
  -o models/piper/nl_BE-nathalie-medium.onnx
curl -fL https://huggingface.co/rhasspy/piper-voices/resolve/main/nl/nl_BE/nathalie/medium/nl_BE-nathalie-medium.onnx.json \
  -o models/piper/nl_BE-nathalie-medium.onnx.json
```

On Windows, download those URLs with a browser or `Invoke-WebRequest -Uri URL
-OutFile PATH` after creating the `models/whisper` and `models/piper` folders.
The launcher checks model paths before startup. For a local OpenAI-compatible
LLM, put a compatible `.gguf` model under `models/llm/` and set `LLM_MODEL`
to its filename. Model licenses and memory requirements vary; obtain an
appropriately licensed model yourself. The pinned Whisper.cpp CPU build
(`v1.9.4`) avoids the upstream image's missing ARM64 manifest. Piper HTTP is
version `1.8.0`. The local llama.cpp server image is CPU-capable; GPU
acceleration and hardware-specific builds are optional, not configured here.
CPU latency and RAM needs depend on the selected model, especially the LLM.

## Start, smoke, and stop

```sh
pnpm stack:config   # validate selection and Compose configuration
pnpm stack:up       # build and start only the selected profiles
pnpm stack:smoke    # exercise gateway, UI, AI, STT, TTS, and Home route
pnpm stack:down     # stop this worktree's containers, retain Core's volume
```

Open `http://127.0.0.1:4176` (or the `SODALIS_PORT` you chose). Each `stack:up`
stops this worktree's previously selected profiles before rebuilding the
current selection, so switching to an external endpoint does not leave a
local engine running. It does not delete Home Assistant's named data volume.
In a checkout named `sodalis`, containers and locally built images use
`sodalis-*` names rather than `sodalis-sodalis-*`. The existing Compose
project and Home Assistant data volume keep their names, so restarting an
already configured simulator does not reset onboarding.
Run `pnpm exec tsx scripts/dev-stack.ts ps` to inspect active services. The
gateway's `/healthz` checks gateway liveness only, not provider readiness.

### First-time Home Assistant simulator onboarding

With `HOME_PROVIDER=simulator`, leave `HOME_ADMIN_UI=1` and
`HOME_ASSISTANT_TOKEN=` empty. Start the stack and open the gateway URL: its
root serves Core's onboarding UI instead of the desktop. Core's bundled
`demo:` configuration supplies fake entities; never point this setup at your
real home.

1. At `http://127.0.0.1:4176/`, create a Core administrator and complete
   onboarding (including location and units). If setup takes a moment,
   revisit the gateway root rather than a stale `/onboarding.html` URL.
2. Under **Settings > People > Users**, create a separate **non-admin**
   Sodalis user. Sign out of the admin account, sign in as that user, and
   create a long-lived access token in **Profile > Security**.
3. Put the token only in your ignored `.env` as `HOME_ASSISTANT_TOKEN=...`,
   set `HOME_ADMIN_UI=0`, and run `pnpm stack:up` again. The same gateway
   root now serves the Sodalis desktop, and `/api/home/*` uses Core's
   simulated devices through the private Home API.
4. Run `pnpm stack:smoke`. This checks the Home route, speech, AI, and
   gateway; it does not exercise authenticated Home controls or replace
   checking the dedicated user's access in Core.

`HOME_SAFE_MIN_C` and `HOME_SAFE_MAX_C` bound climate controls. The admin
UI is intentionally localhost-only and intended solely for onboarding.
`stack:smoke` in admin mode checks the Core UI rather than an authenticated
Home API. Core's HTTP settings are UI-managed in 2026.8 and later; the
development gateway does not send `X-Forwarded-For` to Core, so no proxy
trust configuration or broad trusted-network allowlist is needed.

## Troubleshooting

- **Compose not found or cannot connect:** Check `docker compose version`,
  or `docker-compose version` and the Podman machine/socket. On Podman, run
  `podman machine start` on macOS/Windows or enable the Podman socket on
  Linux. `DOCKER_HOST` can explicitly select your Podman socket.
- **Port 4176 is busy:** Stop the other stack using that port, or change
  `SODALIS_PORT` in `.env`. The gateway never binds to a LAN interface by
  default.
- **Model path error:** Download the named file and matching Piper JSON to
  the exact paths above, or set an external engine URL. On first use the CPU
  images can take several minutes to build.
- **Gateway returns 502:** Inspect `pnpm exec tsx scripts/dev-stack.ts ps`
  and Compose logs for `speech`, `ai`, or the selected engine. Confirm the
  external URL is reachable from the container and speaks the expected
  protocol. A host `127.0.0.1` URL points at the container itself.
- **Home route unavailable:** Complete Core onboarding, set the dedicated
  user's token, disable admin mode, and restart. If using `external-api`,
  verify that service implements Sodalis's semantic Home API rather than
  Core's raw REST API.
- **Core onboarding disconnects or returns 400:** Older stack versions
  included YAML `http:` proxy settings. Core 2026.8+ migrates those to a
  pending UI setting and can revert after five minutes, rejecting requests
  forwarded by the old gateway. Pull the current stack and run
  `pnpm stack:up` again; it keeps the named Core data volume. Return to
  `http://127.0.0.1:4176/` instead of reloading `/onboarding.html`.
  If it still returns 400, inspect the Home Assistant container log for
  `not set-up for reverse proxies`; do not delete the volume or disable
  proxy checks globally.
- **Podman image/platform failure:** The Whisper profile builds locally
  instead of pulling an ARM64-incompatible prebuilt image. Confirm enough
  disk/RAM for model builds; optional GPU acceleration is not required.
