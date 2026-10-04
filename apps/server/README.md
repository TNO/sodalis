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
