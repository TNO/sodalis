# Sodalis services

Speech and AI run as separate Hono processes. The speech service owns
`/api/speech/*` (STT session lifecycle and streamed TTS); the AI service owns
`/api/assistant/turns` (streamed generation and future memory). Neither service
calls the other. The browser uses the same-origin Vite proxy during development;
it never receives provider URLs or credentials. Each service has `/healthz`
(process liveness) and `/readyz` (configured API readiness); these do not probe
the availability of external models. Speech listens on port 3001 and AI on
3002 by default; use `HOST` and `PORT` to override either process. Start them
in separate terminals with `pnpm dev:speech` and `pnpm dev:ai`.
For the containerized gateway and independently selected engines, see
[`docs/development-stack.md`](../../docs/development-stack.md).

## Speech

The speech API is implemented with Hono. Its STT route accepts bounded audio
segments and delegates recognition to the Whisper.cpp HTTP server, keeping the
recognition engine replaceable.

Start Whisper.cpp with a multilingual model and audio conversion enabled, for
example:

```sh
whisper-server -m /path/to/ggml-base.bin --host 127.0.0.1 --port 8081 --convert
```

Then start the Sodalis server:

```sh
STT_PROVIDER=whisper-cpp WHISPER_CPP_URL=http://127.0.0.1:8081 \
TTS_PROVIDER=piper PIPER_MODEL_PATH=/path/to/nl_NL-ronnie-medium.onnx \
pnpm dev:speech
```

The desktop Vite development server proxies `/api/speech` to port 3001 and
`/api/assistant` to port 3002.

Whisper.cpp is used because its self-hosted multilingual models provide a
privacy-preserving server-side path and support Dutch without binding Sodalis
to a hosted speech API. Its HTTP interface returns only a final transcript;
the speech API derives replaceable interim transcripts by re-transcribing the
growing audio snapshot, and does not synthesize confidence values. Streaming
engines (Azure STT) instead receive each audio chunk as it arrives: the speech
API converts WebM/Opus to 16 kHz PCM with FFmpeg, `/partial` returns the
recognizer's latest hypothesis without new recognition, and session creation
returns `partialIntervalMs`, `provider`, and `cloud` so the browser polls more
often and can disclose cloud processing.

`WhisperCppHttpEngine` sends whisper.cpp's `no_speech_thold` form field
(default `0.6`, overridable via `noSpeechThreshold`) on every request so the
engine suppresses low-confidence output on silence or background noise. This
guards against a known whisper.cpp failure mode where near-silent audio is
transcribed as unrelated hallucinated text (e.g. stock phrases from its
training data). It works together with the microphone VAD's energy threshold
and end-of-speech hangover (see `packages/speech/src/voiceActivity.ts`) and the
minimum speech-segment duration gate (see `SpeechInputControllerOptions.minSegmentDurationMs`
in `packages/speech/src/SpeechInputController.ts`), which keep short noise
blips from ever reaching Whisper.

The requested Whistle comparison used two synthetic Dutch utterances. Whistle
misheard “Anne” as “alle” once and changed “afspraak” to “afspraken” once.
Whisper.cpp with `ggml-base.bin` also misheard “Anne” (“aan de”) and differed
in tokenization on the second clip. This sample is too small to establish a
general accuracy ranking. On the M4 Max test machine, warm Whistle inference
was fast, but the first call included a 5-second model setup/download; Whisper
processed both clips in 0.67 seconds. Whistle's Python package enabled
anonymous function/version/OS telemetry by default; the evaluation disabled
it. These measurements are specific to synthetic samples and that machine.

## Text-to-speech

The streamed TTS endpoint uses the Piper CLI and the male Netherlands-Dutch
`nl_NL-ronnie-medium` voice. It was chosen in the
[Dutch TTS evaluation](../../docs/evaluations/tts-providers.md) and replaces
the earlier `nl_BE-nathalie-medium`. Install Piper separately, then download
both the `.onnx` model and its matching `.onnx.json` configuration from the
[official Piper voice catalog](https://huggingface.co/rhasspy/piper-voices/tree/main/nl/nl_NL/ronnie/medium).
The model is not bundled with Sodalis.

Configure the server with the model path and, if `piper` is not on `PATH`, its
executable path:

```sh
STT_PROVIDER=whisper-cpp WHISPER_CPP_URL=http://127.0.0.1:8081 \
TTS_PROVIDER=piper PIPER_MODEL_PATH=/path/to/nl_NL-ronnie-medium.onnx \
PIPER_EXECUTABLE=piper \
pnpm dev:speech
```

The endpoint streams mono, signed 16-bit little-endian PCM at 22,050 Hz. The
desktop's “Read aloud” control plays the response and drives approximate,
amplitude-based mouth movement; Piper's CLI does not provide phoneme or viseme
timing. `STT_PROVIDER` defaults to `parakeet-tdt` (requires `PARAKEET_TDT_URL`);
other choices are `whisper-cpp` (`WHISPER_CPP_URL`), `whistle`
(`WHISTLE_URL`), and opt-in cloud `azure` (`AZURE_STT_ENDPOINT`,
`AZURE_STT_KEY`; Azure Speech real-time recognition, never selected
implicitly; requires `ffmpeg` on `PATH` when run natively).
`TTS_PROVIDER` defaults to `piper` (requires `PIPER_MODEL_PATH` and the
matching `.onnx.json`). The speech service fails startup for missing settings
or unknown provider IDs rather than falling back. Either role can instead
select `mock`, a deterministic fixture with no engine dependencies.
`TTS_PROVIDER=piper-http` uses an explicitly configured `PIPER_HTTP_URL`;
that Piper HTTP service must return standard 22,050 Hz mono PCM16 WAV for a
JSON `{"text": "..."}` request to `/synthesize`. STT's Whisper.cpp URL can likewise point to
a remote/native host instance; keep such endpoints private and trusted.
Piper HTTP's format is specific to that adapter, not a generic engine
protocol. `TTS_PROVIDER=azure` streams from Azure AI Speech instead. It
requires `AZURE_TTS_URL`, `AZURE_TTS_KEY`, and `AZURE_TTS_VOICE`.

- `AZURE_TTS_URL` is a Speech or Foundry resource endpoint, or a regional
  `/cognitiveservices/v1` endpoint.
- `AZURE_TTS_VOICE` is any Azure voice name, such as
  `nl-NL-Sander:MAI-Voice-2.1-Flash`.

Azure is only ever an explicit choice, never a fallback. See the
[configuration guide](../../docs/development-stack.md#use-azure-ai-speech-opt-in).

STT and TTS can be mixed freely, retain the existing browser
session/stream contract, and require no GPU; model CPU performance varies.

The Piper engine (`piper-tts`, piper1-gpl) is GPL-3.0-or-later; whether that
is acceptable for a distributed build is an open legal review item. The
Ronnie voice card lists its training dataset under CC0. Check the upstream
voice repository's terms for the separate model files before redistributing
them.

## Conversation assistant

The AI service requires `LLM_PROVIDER=mock` for deterministic local development,
`LLM_PROVIDER=openai-compatible` for an OpenAI Chat Completions-compatible
streaming provider, or `LLM_PROVIDER=azure` for Azure OpenAI. For
`openai-compatible`, set `LLM_BASE_URL` to the service's API base (for example,
`http://127.0.0.1:1234/v1`) and `LLM_MODEL` to an enabled model. Set
`LLM_API_KEY` only when that service requires it; the key remains on the server.
Local, remote, and cloud endpoints can use this adapter when they implement
its protocol; unsupported vendors need their own explicit adapter.

`LLM_PROVIDER=azure` uses the same streaming adapter against the Azure OpenAI
v1 API (provider ID `azure-openai-v1`). It requires:

- `AZURE_LLM_URL`: the HTTPS resource endpoint
  `https://<resource>.openai.azure.com/openai/v1` (`.services.ai.azure.com`
  and `.cognitiveservices.azure.com` resource hosts are also accepted; a bare
  host is completed to `/openai/v1`). Deployment URLs and Foundry project
  endpoints (`/api/projects/...`) are rejected.
- `AZURE_LLM_KEY`: the resource key, sent server-side as the `api-key` header.
- `AZURE_LLM_DEPLOYMENT`: the deployment name, sent as `model` (for example
  `gpt-5`).
- `AZURE_LLM_REASONING_EFFORT` (optional): `minimal` (default), `low`,
  `medium`, or `high`; `off` omits the field for non-reasoning deployments
  such as `gpt-4.1-mini`.

No temperature or token limit is sent, and 429/5xx responses are surfaced as
errors without retries. Azure content-filter blocks fail the turn with an
`LlmContentFilterError`. A generation request may pass an `onUsage` callback
(used by the evaluation scripts); only then is `stream_options.include_usage`
requested and token usage, including reasoning tokens, reported. Only the selected provider's settings are read, so
local `LLM_*` and `AZURE_LLM_*` values may coexist; `mock` ignores both.
Missing or unknown provider IDs and incomplete configuration fail startup
rather than silently switching to another endpoint. Generation remains behind the AI
service's provider interface; long-term memory (below) adds context there
without a browser API change.

Conversation turns include a short in-memory history (at most 12 messages) and,
when available, the current built-in Aster app's semantic identity (app ID,
name, and category). Document contents are not included. No history is
persisted. The server requests streamed JSON with a semantic utterance
(`text`, `affect`, optional `gesture`, and `interruptible`). The desktop
validates and clamps affect before using the existing avatar controller; only
the validated `text` is captioned, spoken, and retained in conversation
history. Configure a local or otherwise trusted endpoint appropriate for the
data Sodalis may send.

The desktop also sends its registered semantic action descriptions to the LLM
for discovery. Action execution remains in the desktop's trusted action
registry; external-effect and destructive risks always require a separate
confirmation, regardless of the LLM response. Confirmation is bound to the
pending action and arguments, and conversational confirmation requires the
action-specific phrase shown in the companion card. The initial Mail actions
operate on deterministic in-memory fixtures only; mock sending never delivers
real email.

## Long-term memory

`@sodalis/memory` implements [ADR 0005](../../docs/adr/0005-long-term-memory.md)
in the AI service. It is off unless `MEMORY_ENABLED=true`, and even then
stores nothing until the user records consent with
`PUT /api/memory/consent` (`{"kind":"memory","granted":true}`; health facts
need a separate `health` consent). When active:

- every user turn is stored verbatim (L1) in SQLite, then queued for a
  background write path: a small **gate** model decides whether the turn is
  worth analysing, an **extraction** model extracts memories (L2 events,
  L3 transient states, L4 facts), and the same model **reconciles** them
  against similar memories (ADD, UPDATE, SUPERSEDE, NOOP) while keeping
  history;
- before generating a reply, the server retrieves a token-budgeted memory
  block (vector and full-text search plus pinned identity and upcoming
  dates) and adds it to the prompt; the model may answer with a
  `recall_memory` request for an older or more specific search first;
- when idle and at most once every 20 hours, **consolidation** (System 2)
  induces L5–L7 patterns, preferences, and routines from clusters of related
  memories, with their evidence.

Settings (defaults in brackets):

- `MEMORY_DB_PATH` [`data/memory.db`; `/data/memory/memory.db` in Compose],
  `MEMORY_REQUIRE_CONSENT` [`true`], `MEMORY_CONSOLIDATION` [`true`],
  `MEMORY_OBSERVATION_SOURCES` [`home`].
- `MEMORY_HEALTH_CONSENT` [`false`]: for development, records the `health`
  consent at startup when none has been recorded yet (policy version `env`).
  A later withdrawal through the API is kept, so it never re-grants a
  withdrawn consent. Real users should give it through the API instead.
- Embeddings: `MEMORY_EMBED_PROVIDER` (`openai-compatible` or `mock`),
  `MEMORY_EMBED_BASE_URL`, `MEMORY_EMBED_MODEL`, `MEMORY_EMBED_DIMS` [512],
  `MEMORY_EMBED_API_KEY`.
- Gate: `MEMORY_GATE_PROVIDER` (`openai-compatible` or `pass-through`),
  `MEMORY_GATE_BASE_URL`, `MEMORY_GATE_MODEL`, `MEMORY_GATE_API_KEY`,
  `MEMORY_GATE_EXTRA_BODY` (JSON), `MEMORY_GATE_THRESHOLD` [0.3].
- Extraction, reconciliation, and consolidation: `MEMORY_EXTRACT_PROVIDER`
  (`openai-compatible` or `azure`, which reuses the `AZURE_LLM_*` resource),
  `MEMORY_EXTRACT_BASE_URL`, `MEMORY_EXTRACT_MODEL`,
  `MEMORY_EXTRACT_API_KEY`, `MEMORY_EXTRACT_EXTRA_BODY` (JSON),
  `MEMORY_EXTRACT_RESPONSE_FORMAT` (`json_schema`, `json_object`, or `none`).
- Retrieval: `MEMORY_TOKEN_BUDGET` [800], `MEMORY_MIN_SIMILARITY` [0.35].

With the `azure` extraction provider, the user's messages leave the machine;
obtain consent for that separately. Credentials are redacted before
storage and extraction.

The `/api/memory/*` routes, reachable through the gateway, let the desktop
show and manage what is remembered: `status`, `consent`, `retention` (how long transcripts are kept),
`items` (list, show with sources and history, `PATCH` to correct, `DELETE`
to forget, cascading to inferred items that lose their evidence), `search`,
`about?q=` (what is known about a person or topic), `DELETE transcripts`, and
`POST observations`, through which trusted sources (by default `home`) add
observed events. Health details in observations are dropped.

## Home Assistant simulator

`pnpm dev:home` starts the independent Home API on port 3003. Set
`HOME_PROVIDER=simulator`, `HOME_ASSISTANT_URL` to the Home Assistant Core
instance (for example `http://127.0.0.1:8123`), and
`HOME_ASSISTANT_TOKEN` to a dedicated non-admin user's long-lived token.
The token stays in ignored local `.env` configuration, never in the browser.
The bundled `services/homeassistant/configuration.yaml` enables Core's
built-in demo integration: `light.bed_light` starts off,
`fan.living_room_fan` starts off, `media_player.walkman` starts playing,
and `climate.hvac` starts cooling at 21 °C. Core's demo also includes other
fake entities; these four have repeatable initial state on a fresh Core
configuration. Core owns the simulator; the Home API does not impersonate it.

`GET /api/home/entities?q=...` discovers semantic entities,
`GET /api/home/entities/:entityId` reads state, and
`GET /api/home/actions` lists the typed operation descriptors. Submit
`{ "id": "home.light.turn-on", "arguments": { "entityId": "light.bed_light" } }`
to `POST /api/home/actions`. Light on/off and brightness 0–100%, fan on/off
and speed 0–100%, media play/pause and volume 0–100%, and climate target
temperature 16–26 °C are available without confirmation. Set
`HOME_SAFE_MIN_C` and `HOME_SAFE_MAX_C` to change the climate range;
the target-temperature operation requires a Celsius entity.
HVAC mode, scripts, scenes, locks, alarms, and covers require a returned
confirmation ID, submitted alone as
`{ "confirmationId": "..." }` to `POST /api/home/confirm`. The existing
assistant confirmation runtime binds it to one exact action and arguments;
unknown domains/services are rejected, never forwarded as arbitrary HA calls.
The Home API returns explicit errors if Core or a requested entity is
unavailable. `/healthz` checks the process, `/readyz` checks Core connectivity.

For first-time setup, run the desktop gateway with `HOME_ADMIN_UI=1` and
`HOME_ASSISTANT_URL` pointing to Core. While enabled, the gateway's root
route serves Core's admin UI instead of the desktop, on the **same local
origin**; `/api/speech`, `/api/assistant`, and `/api/home` still route to their
own services. Complete onboarding with an admin user, then
create a separate **non-admin** user for Sodalis under Settings → People →
Users. Sign in as that user and create a long-lived access token in its
Profile → Security page. Put the token only in your ignored `.env`, restart
the Home API, and unset `HOME_ADMIN_UI` after setup. Home Assistant
Core's standard non-admin user can still control configured demo devices; it
does not provide per-entity token scopes. Do not point the simulator provider
at a real home. A real Home adapter is deferred to task 0038.
