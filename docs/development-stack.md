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
explicit. The example uses host Ollama with `llama3.2:3b` and the Home
Assistant simulator. `STT_PROVIDER` defaults to `whisper-cpp` and
`TTS_PROVIDER` to `piper`, both running in Compose on CPU without a GPU.

| Role | Local selection | External selection |
| --- | --- | --- |
| STT | `whisper-cpp`, `whistle`, `parakeet-tdt` (blank matching URL), or `mock` | Matching provider with `WHISPER_CPP_URL`, `WHISTLE_URL`, or `PARAKEET_TDT_URL` |
| TTS | `piper` (blank `PIPER_HTTP_URL`) or `mock` | `piper`/`piper-http` with `PIPER_HTTP_URL` |
| LLM | `mock`, or `openai-compatible` with `LLM_MODEL` naming a local `.gguf` and blank `LLM_BASE_URL` (Compose llama.cpp) | `openai-compatible` with `LLM_BASE_URL` and `LLM_MODEL`; the example targets host Ollama |
| Home | `simulator` with Core and its dedicated `HOME_ASSISTANT_TOKEN` | `external-api` with `HOME_API_URL` |

External URLs must be reachable **from the containers**, not just the host.
For a host-native service, use `host.docker.internal` with Docker Desktop;
Podman on macOS resolves both `host.docker.internal` and
`host.containers.internal`. Linux Docker Engine may need a configured host
gateway or another reachable address. Never expose an unauthenticated
Ollama endpoint on a public network.
An external Whisper endpoint must speak the Whisper.cpp server protocol.
External Whistle and Parakeet TDT endpoints must speak Sodalis's local
`POST /transcribe` protocol (raw audio, `x-sodalis-language`, JSON `{text}`).
TTS must speak Piper HTTP (`POST /synthesize` with a WAV response); the LLM endpoint
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

### Improve Dutch recognition on a Mac

The default `ggml-base.bin` keeps the CPU Compose setup lightweight, but it
misrecognized a short Dutch question in testing. To choose a stronger local
model, download it into `models/whisper/` and set its filename in your
ignored `.env` (leave `WHISPER_CPP_URL` empty):

```sh
curl -fL https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin \
  -o models/whisper/ggml-small.bin
# In .env: WHISPER_MODEL=ggml-small.bin
pnpm stack:up
```

`small` needs more than the default 2 GB Podman Mac VM in our testing
(the isolated container exited 137). Increase the VM memory *before*
selecting it, without resetting the existing machine or its Home Assistant
data. The larger `ggml-medium.bin` (about 1.4 GB of weights) needs still
more memory. Alternatively, run Whisper.cpp natively with Metal, avoiding
CPU-only model inference inside the VM:

```sh
brew install whisper-cpp ffmpeg
curl -fL https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin \
  -o models/whisper/ggml-medium.bin
whisper-server -m models/whisper/ggml-medium.bin --host 127.0.0.1 \
  --port 4304 --convert
```

Keep that server running. In another terminal run
`STT_PROVIDER=whisper-cpp WHISPER_CPP_URL=http://127.0.0.1:4304
TTS_PROVIDER=mock pnpm dev:speech`, then use the **Develop one service at a
time** Vite command below to proxy speech to the native port 3001 and
other APIs to Compose. Set `TTS_PROVIDER=piper-http` and a reachable
`PIPER_HTTP_URL` instead of `mock` if native speech playback is needed.
The browser never connects directly to Whisper. For a Compose speech
container to call host-native Whisper, bind Whisper to a **private,
container-reachable host interface** and configure `WHISPER_CPP_URL`
accordingly; a listener bound to `127.0.0.1` is only accessible to host
processes. Do not expose the unauthenticated engine to a public network.

Whisper now supplies replaceable interim transcripts while speech continues:
the speech API re-transcribes a growing audio snapshot at most once per
1.5 seconds, and only the final transcript is submitted to the assistant.
This is **not** incremental model decoding. CPU inference may lag behind
incoming speech. Voice activity waits about 700 ms of silence before ending
an utterance (rather than 240 ms); short questions may still end before
the first interim transcript. There is not yet a speech pre-roll or a
long-utterance rollover. One 46-second probe made by repeating the same
MLS passage three times returned only two copies, while a different
44-second probe with three distinct passages transcribed all three.
Repetition suppression, not a proven 30-second cutoff, is the likely
explanation. Natural uninterrupted speech and open-microphone quality
still need real-device testing.

To reproduce the Dutch comparison against the MLS **test** split, install
`ffmpeg`, start the speech API locally, and run:

```sh
pnpm exec tsx scripts/stt-benchmark.ts /path/to/mls_dutch/mls_dutch \
  http://127.0.0.1:3001
```

This tool picks one 10–18-second clip from each of six test speakers,
converts the audio locally, and uploads it only to a **loopback** Sodalis
speech API. Its word error rate compares lowercase words but does not
normalize historical Dutch spelling; it is a small diagnostic sample,
not a population-level quality estimate. Against the same six clips
(215 reference words), Compose `base` scored 77 errors (35.8% WER),
native `small` 49 (22.8%), and native `medium` 25 (11.6%).
The synthetic short question still became "Hoe uit bent u?" with the
native `medium` HTTP server, so the benchmark does not guarantee that
particular question will be correct. Pure silence sent **directly** to
Whisper can hallucinate text; the microphone's energy gate avoids
submitting silent segments, but noisy rooms need real-microphone testing.

### Try local Whistle or Parakeet TDT in Compose

Set `STT_PROVIDER=whistle` or `STT_PROVIDER=parakeet-tdt` in `.env`,
leave its matching URL blank, and run `pnpm stack:config` then
`pnpm stack:up`. These opt-in profiles build their own CPU services;
neither changes the default Whisper setup. The speech API remains the
only browser-facing STT endpoint. Both builds download model weights;
Parakeet uses a pinned conversion revision, while Whistle currently uses
the default model fetched by the pinned Needle runtime. No recording is
sent to a hosted ASR service. Whistle/Needle
is Apache-2.0 and its model is Apache-2.0. Original NVIDIA Parakeet TDT
v3 weights are CC BY 4.0; its `sherpa-onnx` runtime is Apache-2.0.
Keep the model attribution when distributing an image. The Parakeet
image includes roughly 670 MB of int8 weights; it consumed about 1.85 GB
when idle and a 2 GB Podman machine could not start it (exit 137). An
8 GB machine ran it alongside the existing development containers. Both
services use FFmpeg to decode microphone WebM to 16-kHz mono
audio and limit a single recognition request to 30 seconds. Snapshot
interim transcripts still re-run inference on growing audio; neither
engine has true incremental decoding through this adapter. Cancellation
stops the Sodalis request but cannot interrupt an inference already
running inside these experimental CPU services.

**Parakeet TDT v3 is not Parakeet Redux.** Redux's weights are CC BY 4.0,
but its documented Photon package depends on `kestrel-kernels`, whose
[published license](https://pypi.org/project/kestrel-kernels/0.7.4/)
requires a separate written agreement. Sodalis does not download or
install that runtime. Cactus Whistle uses the separate Apache-2.0
[`cactus-needle`](https://github.com/cactus-compute/needle) runtime,
not the differently licensed `cactus` engine.

| Candidate | Dutch / accuracy | Interim / cancellation | Deployment / license | Decision |
| --- | --- | --- | --- | --- |
| Whisper.cpp `base`, `small`, `medium` | Measured above; short questions still imperfect | Sodalis snapshot interim API; session cancellation | macOS native or cross-platform CPU Compose; model-specific memory | Available; `medium` preferred on a sufficiently provisioned native Mac |
| Cactus Whistle/Needle | Six-speaker MLS test: 65/215 word errors (30.2% WER); fast CPU inference; short synthetic question still wrong | Sodalis snapshot interim; request cancellation, but in-flight inference continues | Apache-2.0 model and runtime; cross-platform CPU image | Opt-in Compose profile `whistle` |
| NVIDIA Parakeet TDT v3 / sherpa-onnx | Six-speaker MLS test: 37/215 word errors (17.2% WER), 394–700 ms per clip; WAV short question correct, WebM question "Who oud bent u?"; 3 s silence empty | Sodalis snapshot interim; in-flight inference continues | Original weights CC BY 4.0, Apache-2.0 runtime; 2 GB VM OOM, 8 GB VM runs | Opt-in Compose profile `parakeet-tdt`; not Redux |
| Cactus engine (other models) | Not benchmarked | Chunked `confirmed` / `pending` API; cancellation not verified | [Different license](https://github.com/cactus-compute/cactus/blob/main/LICENSE) restricts organizations above funding/revenue thresholds | Not bundled |
| Moondream Parakeet Redux / Photon | Dutch claimed; MLS accuracy not measured | Photon documents live PCM snapshots; cancellation and Sodalis WebM conversion not verified | Local CPU/Apple silicon/CUDA; weights CC BY 4.0, `kestrel-kernels` requires a written agreement | No adapter/profile until runtime terms and live path are verified |
| Azure AI Speech | Dutch supported by service; local sample not uploaded | Continuous recognition provides interim events; Sodalis cancellation not integrated | Hosted; credentials, billing, network and data transfer required | No adapter or cloud fallback without authorization and a local-only evaluation plan |

Do not upload the MLS recordings or private microphone samples to a
hosted provider without separate authorization. MLS recordings are
licensed CC BY 4.0 for the dataset, but that alone is **not** a speaker's
consent to voice cloning; keep any TTS voice-selection investigation
separate from this ASR benchmark.

### Host Ollama (the example LLM)

Install [Ollama](https://ollama.com/download) for your host OS and keep its
server running. Download the model separately; it is not in the repository
or Compose image:

```sh
ollama pull llama3.2:3b
curl -fsS http://127.0.0.1:11434/api/tags
```

The example `.env` sets `LLM_PROVIDER=openai-compatible`,
`LLM_BASE_URL=http://host.docker.internal:11434/v1`, and
`LLM_MODEL=llama3.2:3b`. The **Sodalis AI API still runs in Compose**;
only Ollama runs natively on the Mac, allowing it to use host acceleration
instead of the CPU-limited Podman VM. On Docker Desktop, the same host alias
is available. On other hosts, change the URL to an address reachable from
the AI container and secure that endpoint. `LLM_API_KEY` is only needed if
the selected endpoint requires one. Ollama's local API does not.

If you already created `.env`, a Git pull does not change it: set those
three values in your existing file and run `pnpm stack:up` to switch from
the mock provider. The service does not silently fall back if Ollama is
stopped or the model is missing.

To opt out of the model download, edit your ignored `.env`:

```dotenv
LLM_PROVIDER=mock
LLM_BASE_URL=
LLM_MODEL=
LLM_API_KEY=
```

`pnpm stack:up` then selects the deterministic mock without starting a
local LLM engine or connecting to Ollama. For a different local GGUF model,
clear `LLM_BASE_URL` and set `LLM_MODEL` to the file in `models/llm/`;
the stack selects its CPU llama.cpp profile. STT and TTS can also be
selected independently: `STT_PROVIDER=mock` skips Whisper, and
`TTS_PROVIDER=mock` skips Piper; leave the other role unchanged.

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

### Exercise speech, AI, and speech output

After Home Assistant onboarding and `HOME_ADMIN_UI=0`, open the desktop at
`http://127.0.0.1:4176/` (not `/aster/index.html`). Wait until the avatar is
ready, then click it or focus **Start a conversation with Sodalis** to open
the **Talk with Sodalis** card. Type and send a short message first: the
card should show a generated reply and Piper should speak it. This checks
AI -> TTS without requiring microphone access. For STT -> AI -> TTS,
click **Start microphone** (or hold **Hold to talk**), allow the browser
permission prompt, speak a short Dutch phrase, and pause. The card should
show the transcript, reply, and playback. The browser never requests mic
access just because the desktop loaded; use the top-level localhost URL so
the browser grants microphone access to the Sodalis origin.

`pnpm stack:smoke` checks the gateway, selected UI, streamed AI turn,
synthetic STT transcript, TTS PCM, and Home route. It does **not** test a
physical microphone, Dutch transcription accuracy, browser autoplay, or
the full spoken conversation. If the avatar is not ready, check its status
in the desktop. If a reply is shown without audio, use **Read aloud** to
isolate TTS and browser playback. To diagnose model errors, check that
Ollama is running and `llama3.2:3b` appears in `ollama list`.

### Develop one service at a time

The Compose gateway publishes only port 4176; API and engine containers
remain private. For desktop hot reload against those running APIs:

```sh
SODALIS_API_GATEWAY_URL=http://127.0.0.1:4176 pnpm dev
```

Open the URL printed by Vite (usually `http://127.0.0.1:5173/`). Do not
set `HOME_ADMIN_UI=1` in the Vite process; complete simulator onboarding
at the Compose gateway first.

To develop one API outside Compose, start it on its usual host port in
another terminal, then override only that Vite proxy while keeping the
other two APIs behind the Compose gateway:

```sh
STT_PROVIDER=mock TTS_PROVIDER=mock pnpm dev:speech
# In a separate terminal:
SODALIS_API_GATEWAY_URL=http://127.0.0.1:4176 \
SODALIS_SPEECH_API_URL=http://127.0.0.1:3001 pnpm dev
```

The speech API serves **both** STT and TTS on port 3001; the two roles
select their engines independently. The mock engines make this example
work without a second Whisper/Piper installation. For real native speech
engines, configure `WHISPER_CPP_URL` and `PIPER_HTTP_URL` (or Piper CLI with
`PIPER_MODEL_PATH`) as described in
[`apps/server/README.md`](../apps/server/README.md).

Likewise, run the AI API natively and override only its Vite proxy:

```sh
LLM_PROVIDER=openai-compatible LLM_BASE_URL=http://127.0.0.1:11434/v1 \
LLM_MODEL=llama3.2:3b pnpm dev:ai
# In a separate terminal:
SODALIS_API_GATEWAY_URL=http://127.0.0.1:4176 \
SODALIS_AI_API_URL=http://127.0.0.1:3002 pnpm dev
```

The same pattern supports
`SODALIS_HOME_API_URL=http://127.0.0.1:3003` with `pnpm dev:home` when a
separate Home Assistant Core endpoint and token are reachable from the host;
Compose's Core container has no host port by design.

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
   user (the username does not need to be `sodalis`). Enable **Local access
   only** for this local simulator: the Docker/Podman private network counts
   as local. Sign out of the admin account, sign in as that user, and
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
