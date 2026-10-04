# Sodalis speech server

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
WHISPER_CPP_URL=http://127.0.0.1:8081 pnpm --filter @sodalis/server dev
```

The desktop Vite development server proxies `/api` to `http://127.0.0.1:3000`.
For a deployed environment, route `/api` to the Sodalis server using the
deployment's same-origin reverse proxy.

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
PIPER_MODEL_PATH=/path/to/nl_BE-nathalie-medium.onnx \
PIPER_EXECUTABLE=piper \
pnpm --filter @sodalis/server dev
```

The endpoint streams mono, signed 16-bit little-endian PCM at 22,050 Hz. The
desktop's “Read aloud” control plays the response and drives approximate,
amplitude-based mouth movement; Piper's CLI does not provide phoneme or viseme
timing. When `PIPER_MODEL_PATH` is unset, TTS responds with service unavailable
while STT remains usable.

Piper is GPL-3.0. The voice card lists the underlying training dataset under
CC0; check the upstream voice repository's terms for the separate model files
before redistributing them.

## Conversation assistant

The server exposes an OpenAI Chat Completions-compatible streaming provider.
Set `LLM_BASE_URL` to the service's API base (for example,
`http://127.0.0.1:1234/v1`) and `LLM_MODEL` to an enabled model. Set
`LLM_API_KEY` only when that service requires it; the key remains on the server.
The assistant endpoint is disabled when URL and model are both unset, and the
server rejects a partial configuration.

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
