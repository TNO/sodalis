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
TTS_PROVIDER=piper PIPER_MODEL_PATH=/path/to/nl_BE-nathalie-medium.onnx \
pnpm dev:speech
```

The desktop Vite development server proxies `/api/speech` to port 3001 and
`/api/assistant` to port 3002.

Whisper.cpp is used because its self-hosted multilingual models provide a
privacy-preserving server-side path and support Dutch without binding Sodalis
to a hosted speech API. Its HTTP interface returns a final transcript rather
than meaningful partials, so the provider advertises final-only results and
does not synthesize confidence values.

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

The streamed TTS endpoint uses the Piper CLI and the female Belgian-Dutch
`nl_BE-nathalie-medium` voice. Install Piper separately, then download both the
`.onnx` model and its matching `.onnx.json` configuration from the
[official Piper voice catalog](https://huggingface.co/rhasspy/piper-voices/tree/main/nl/nl_BE/nathalie/medium).
The model is not bundled with Sodalis.

Configure the server with the model path and, if `piper` is not on `PATH`, its
executable path:

```sh
STT_PROVIDER=whisper-cpp WHISPER_CPP_URL=http://127.0.0.1:8081 \
TTS_PROVIDER=piper PIPER_MODEL_PATH=/path/to/nl_BE-nathalie-medium.onnx \
PIPER_EXECUTABLE=piper \
pnpm dev:speech
```

The endpoint streams mono, signed 16-bit little-endian PCM at 22,050 Hz. The
desktop's “Read aloud” control plays the response and drives approximate,
amplitude-based mouth movement; Piper's CLI does not provide phoneme or viseme
timing. `STT_PROVIDER` defaults to `whisper-cpp` (requires `WHISPER_CPP_URL`);
`TTS_PROVIDER` defaults to `piper` (requires `PIPER_MODEL_PATH` and the
matching `.onnx.json`). The speech service fails startup for missing settings
or unknown provider IDs rather than falling back. Either role can instead
select `mock`, a deterministic fixture with no engine dependencies.
`TTS_PROVIDER=piper-http` uses an explicitly configured `PIPER_HTTP_URL`;
that Piper HTTP service must return standard 22,050 Hz mono PCM16 WAV for a
JSON `{"text": "..."}` request. STT's Whisper.cpp URL can likewise point to
a remote/native host instance; keep such endpoints private and trusted.
Piper HTTP's format is specific to that adapter, not a generic engine
protocol. STT and TTS can be mixed freely, retain the existing browser
session/stream contract, and require no GPU; model CPU performance varies.

Piper is GPL-3.0. The voice card lists the underlying training dataset under
CC0; check the upstream voice repository's terms for the separate model files
before redistributing them.

## Conversation assistant

The AI service requires `LLM_PROVIDER=mock` for deterministic local development,
or `LLM_PROVIDER=openai-compatible` for an OpenAI Chat Completions-compatible
streaming provider. For the latter, set `LLM_BASE_URL` to the service's API base (for example,
`http://127.0.0.1:1234/v1`) and `LLM_MODEL` to an enabled model. Set
`LLM_API_KEY` only when that service requires it; the key remains on the server.
Local, remote, and cloud endpoints can use this adapter when they implement
its protocol; unsupported vendors need their own explicit adapter. Missing
or unknown provider IDs and incomplete model configuration fail startup rather
than silently switching to another endpoint. Generation remains behind the AI
service's provider interface, where future memory can be added without a
browser API change.

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
