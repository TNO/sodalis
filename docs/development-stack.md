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
Assistant simulator. `STT_PROVIDER` defaults to `parakeet-tdt` and
`TTS_PROVIDER` to `piper`, both running in Compose on CPU without a GPU.
Parakeet needs more than a 2 GB Podman VM; see the
[local STT comparison](#try-local-whistle-or-parakeet-tdt-in-compose).

| Role | Local selection | External selection |
| --- | --- | --- |
| STT | `whisper-cpp`, `whistle`, `parakeet-tdt` (blank matching URL), or `mock` | Matching provider with `WHISPER_CPP_URL`, `WHISTLE_URL`, or `PARAKEET_TDT_URL`; `azure` with `AZURE_STT_ENDPOINT` and `AZURE_STT_KEY` (real-time, max 30 s per utterance) |
| TTS | `piper` (blank `PIPER_HTTP_URL`) or `mock` | `piper`/`piper-http` with `PIPER_HTTP_URL`; `azure` with `AZURE_TTS_URL` and `AZURE_TTS_KEY` (`AZURE_TTS_VOICE` defaults to `nl-NL-ColetteNeural`) |
| LLM | `mock`, or `openai-compatible` with `LLM_MODEL` naming a local `.gguf` and blank `LLM_BASE_URL` (Compose llama.cpp) | `openai-compatible` with `LLM_BASE_URL` and `LLM_MODEL` (the example targets host Ollama); `azure` with `AZURE_LLM_URL`, `AZURE_LLM_KEY`, and `AZURE_LLM_DEPLOYMENT` |
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
External Piper TTS must speak Piper HTTP (`POST /synthesize` with a WAV
response); Azure TTS uses its own HTTPS SSML endpoint and streams raw
22,050 Hz PCM through the speech API. The LLM endpoint
must stream OpenAI-compatible Chat Completions (Azure OpenAI uses its v1 API
with an `api-key` header); and the Home endpoint must
implement Sodalis's `/api/home/*` contract. Azure STT (real-time Speech SDK)
and Azure TTS (SSML) have explicit server-side adapters; other hosted
services are usable **only when their
endpoint implements the selected protocol**, possibly through a separately
managed adapter. No automatic provider discovery or remote fallback is
included.
For a legacy Piper-compatible service that accepts `POST /`, set
`TTS_PROVIDER=piper-http` and end `PIPER_HTTP_URL` with `/`. An explicit
non-root endpoint path is also honored. `HOME_API_URL` must be an origin
without a path or query, since Caddy proxies the existing `/api/home/*` path.
Keep external endpoints private and trusted. Browser code receives neither
provider URLs nor credentials.

For the default stack, download both Piper voice files into these ignored
paths. Only download a multilingual Whisper.cpp model if you explicitly
select `STT_PROVIDER=whisper-cpp`:

```sh
mkdir -p models/piper
curl -fL https://huggingface.co/rhasspy/piper-voices/resolve/main/nl/nl_NL/ronnie/medium/nl_NL-ronnie-medium.onnx \
  -o models/piper/nl_NL-ronnie-medium.onnx
curl -fL https://huggingface.co/rhasspy/piper-voices/resolve/main/nl/nl_NL/ronnie/medium/nl_NL-ronnie-medium.onnx.json \
  -o models/piper/nl_NL-ronnie-medium.onnx.json
```

For the optional Whisper.cpp profile:

```sh
mkdir -p models/whisper
curl -fL https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin \
  -o models/whisper/ggml-small.bin
```

On Windows, download those URLs with a browser or `Invoke-WebRequest -Uri URL
-OutFile PATH` after creating the matching `models/` folders.
The launcher checks model paths before startup. For a local OpenAI-compatible
LLM, put a compatible `.gguf` model under `models/llm/` and set `LLM_MODEL`
to its filename. Model licenses and memory requirements vary; obtain an
appropriately licensed model yourself. The pinned Whisper.cpp CPU build
(`v1.9.4`) avoids the upstream image's missing ARM64 manifest. Piper HTTP is
version `1.8.0`. The local llama.cpp server image is CPU-capable; GPU
acceleration and hardware-specific builds are optional, not configured here.
CPU latency and RAM needs depend on the selected model, especially the LLM.

### Improve Dutch recognition on a Mac

The optional Whisper profile now defaults to `ggml-small.bin` for better Dutch
recognition. The lighter `ggml-base.bin` misrecognized a short Dutch question
in testing; to use it instead, download it into `models/whisper/` and set its
filename in your ignored `.env` (leave `WHISPER_CPP_URL` empty):

```sh
curl -fL https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin \
  -o models/whisper/ggml-base.bin
# In .env: WHISPER_MODEL=ggml-base.bin
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

Set `STT_PROVIDER=whistle` or keep the default `STT_PROVIDER=parakeet-tdt`
in `.env`, leave its matching URL blank, and run `pnpm stack:config` then
`pnpm stack:up`. These profiles build their own CPU services;
neither changes the TTS or LLM selection. The speech API remains the
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

The compatibility and configuration matrix for every STT candidate, with
the consolidated measurements and recommendation, is in
[evaluations/stt-providers.md](evaluations/stt-providers.md).

### Optional Azure AI Speech STT

`STT_PROVIDER=azure` streams microphone audio to Azure Speech
[real-time speech to text](https://learn.microsoft.com/azure/ai-services/speech-service/how-to-recognize-speech)
on your own Speech (Foundry Tools) resource. Select it only with consent to
send recordings to Azure, and use a resource in an EU region.

Keep the Azure values in a separate, git-ignored overlay file, `.env.azure`,
next to your `.env`. Its values replace the matching `.env` settings only
when you pass it explicitly:

```dotenv
STT_PROVIDER=azure
AZURE_STT_ENDPOINT=https://<resource>.cognitiveservices.azure.com/
AZURE_STT_KEY=<your Speech resource key>
WHISPER_CPP_URL=
WHISPER_MODEL=
WHISTLE_URL=
PARAKEET_TDT_URL=
```

```sh
pnpm stack:config --env .env.azure   # lists profiles; no local STT container
pnpm stack:up --env .env.azure
```

Without `--env .env.azure` the stack uses `.env` alone, normally local
Parakeet. You can also put the same values directly in `.env`.

To run the live smoke test (it sends a one-second synthetic tone):

```sh
set -a; . ./.env.azure; set +a
pnpm --filter @sodalis/server exec vitest run src/speech/AzureRealtimeSttEngine.live.test.ts
```

The test needs `ffmpeg` on `PATH`.

- **Streaming:** per utterance, the speech API opens one Azure recognizer
  when the first audio chunk arrives, converts the browser's WebM/Opus to
  16 kHz mono PCM with FFmpeg, and streams it with the official Speech SDK
  (continuous recognition, fixed `nl-NL` or `en-US`, no language detection).
- **Captions:** `/partial` returns Azure's latest hypothesis immediately,
  and the browser polls it every 250 ms instead of 1.5 s. The final
  transcript is Azure's recognized segments when the utterance ends.
- **30-second cap:** at most **30 seconds of audio per utterance** is sent
  to Azure. Later audio in the same utterance is dropped, and `finish`
  returns the transcript recognized up to that point. This bounds cost if
  voice detection never ends an utterance (for example in a noisy room).
  The local Whistle and Parakeet services instead **fail** an utterance
  over 30 seconds.
- **Disclosure:** session creation reports `provider: "azure"` and
  `cloud: true`; the conversation card then shows "Speech recognized by
  Azure (cloud)" while the microphone is listening.
- **Failures:** cancellation stops recognition and closes the connection.
  The speech API also closes a live recognizer if its client sends nothing
  for 30 seconds.
  Endpoint and key are required at startup and use separate `AZURE_STT_*`
  settings from Azure TTS. A missing or failing service never falls back to
  a local engine, and the browser receives none of these settings.
- **Cost:** Azure bills real-time recognition per audio hour (about $1 per
  hour on standard S1 pricing in West Europe, October 2026).

The API image contains a minimal LGPL FFmpeg build (about 2 MB; see
`services/api/Dockerfile`). When you run `pnpm dev:speech` natively, install
`ffmpeg` and keep it on `PATH`.

Contract tests use fakes. `AzureRealtimeSttEngine.live.test.ts` is skipped
unless `AZURE_STT_ENDPOINT` and `AZURE_STT_KEY` are set in the test
environment.

#### Measure live captions

`scripts/stt-live-captions.ts` replays recordings through the public STT API
the way the browser does:

- each clip is converted to WebM/Opus and sent in 200 ms chunks at real-time
  pace;
- `/partial` is polled at the interval the server advertises.

It reports time to first caption, final latency after the audio ends,
caption updates and rewrites, and WER against the references. Put the clips
and a `references.tsv` (clip ID, whitespace, reference text) in a folder
outside the repository, start a local stack with the provider under test,
and run (requires `ffmpeg` with libopus):

```sh
pnpm exec tsx scripts/stt-live-captions.ts /path/to/clips/references.tsv \
  http://127.0.0.1:4176
```

Only run it against Azure with authorization to send those recordings.

### Evaluate alternative speech synthesis

All results, listening grades, and the provider recommendation are in
[evaluations/tts-providers.md](evaluations/tts-providers.md). This section
covers only configuration and reproduction. Generated audio, weights, and
metrics stay in the ignored `models/` folder.

#### Use Azure AI Speech (opt-in)

Piper (`nl_NL-ronnie-medium`) is the default. The optional `azure` TTS
selection calls Azure Speech **only when explicitly selected**. It sends
assistant reply text (not microphone audio) to your own Speech or Foundry
resource. Set these values in your ignored `.env`, then run
`pnpm stack:config` and `pnpm stack:up`:

```dotenv
TTS_PROVIDER=azure
AZURE_TTS_URL=https://<resource>.cognitiveservices.azure.com/
AZURE_TTS_KEY=<your Speech or Foundry resource key>
# Optional; blank uses nl-NL-ColetteNeural.
AZURE_TTS_VOICE=
```

**`AZURE_TTS_URL`** accepts either of two endpoints:

- the **Foundry resource** endpoint, `https://<resource>.cognitiveservices.azure.com/`
  (Foundry's Keys and Endpoint page). The adapter appends the text-to-speech
  path `/tts/cognitiveservices/v1`.
- a regional endpoint such as
  `https://westeurope.tts.speech.microsoft.com/cognitiveservices/v1`. Use the
  region where your resource lives.

A Foundry **project** endpoint (`https://<resource>.services.ai.azure.com/api/projects/<name>`)
has no speech route and is rejected. The resource key works with both endpoint
forms.

**`AZURE_TTS_VOICE`** is optional. When blank, Sodalis uses
`nl-NL-ColetteNeural`, the voice the project owner preferred. It accepts any
Azure voice name, including model-suffixed voices:

- **Native Dutch:** standard voices such as `nl-NL-FennaNeural`, and the
  preview MAI voices such as `nl-NL-Sander:MAI-Voice-2.1-Flash`.
- **Multilingual voices from other locales:** for example the HD voice
  `en-US-Adam:DragonHDLatestNeural`. For these, the adapter marks the reply as
  Dutch with SSML `<lang xml:lang="nl-NL">`.

Keep `PIPER_HTTP_URL` blank.

- **Streaming:** the adapter requests `raw-22050hz-16bit-mono-pcm` and
  relays PCM chunks through the existing Sodalis TTS endpoint.
- **Cancellation** aborts the upstream HTTP response.
- **Required settings:** endpoint, voice, and key must be set at startup. A
  missing or failing service never falls back to Piper.
- **Browser:** receives none of these settings.

Never put a real key in `.env.example` or commit your `.env`.

#### Compare the fifty Dutch avatar utterances

`scripts/tts-sentences.json` is a fixed set of 50 synthetic avatar replies.
For each engine, `scripts/tts-compare.py` writes one WAV per sentence, plus
`metrics.json` with:

- synthesis time and CPU time where measurable;
- audio duration and real-time factor;
- process high-water RSS and, on Apple Silicon, the MLX Metal allocator peak.

A separate warm-up phrase per engine, which includes model loading, is
excluded from the scored timings. `--limit N` pilots the first N sentences;
a later full run skips existing clips. Compare matching clips in
`<out>/index.html`.

Points to keep in mind:

- **One engine at a time.** Do not run engines concurrently when comparing
  throughput.
- **Apple Silicon memory.** RSS is not GPU memory, and RSS and the MLX
  allocator peak must not be added together.

```sh
# Native CPU Piper; other Dutch voices download into models/piper on first use.
uv venv --python 3.11 models/piper-native/.venv
uv pip install --python models/piper-native/.venv/bin/python 'piper-tts==1.8.0'
models/piper-native/.venv/bin/python scripts/tts-compare.py --backend piper
models/piper-native/.venv/bin/python scripts/tts-compare.py --backend piper --voice nl_NL-ronnie-medium

# Use the *existing* tts-mlx Python environment and cached weights, read-only.
# Pin this to your checkout's location; nothing is installed into that project.
TTS_MLX_ROOT="$HOME/dev/tts-mlx"
PYTHONDONTWRITEBYTECODE=1 HF_HUB_OFFLINE=1 \
  "$TTS_MLX_ROOT/.venv/bin/python" scripts/tts-compare.py \
  --backend voxtral --tts-mlx-root "$TTS_MLX_ROOT"
PYTHONDONTWRITEBYTECODE=1 HF_HUB_OFFLINE=1 \
  "$TTS_MLX_ROOT/.venv/bin/python" scripts/tts-compare.py \
  --backend kugelaudio --tts-mlx-root "$TTS_MLX_ROOT"
```

The run directory `piper` holds the former default `nl_BE-nathalie-medium`.
Every other voice gets `piper-<voice>`.

Engine-specific notes:

- **Voxtral** uses the cached 6-bit MLX model and the `nl_female` preset.
- **KugelAudio** uses its `warm` preset and the `nl` language hint.
- **MMS** needs `torch` and `transformers`.
- **Parler** needs `parler_tts==0.2.2`.
- **Chatterbox Multilingual V3** uses its built-in voice with
  `language_id="nl"` on CPU (fixed seed, no cloning). PyPI `chatterbox-tts`
  0.1.7 predates V3, so install the pinned source commit over it. The first
  run downloads about 3 GB of weights:

```sh
python3 -m venv ~/.venvs/tts-chatterbox
~/.venvs/tts-chatterbox/bin/pip install torch==2.6.0 torchaudio==2.6.0 \
  --index-url https://download.pytorch.org/whl/cpu
~/.venvs/tts-chatterbox/bin/pip install chatterbox-tts
~/.venvs/tts-chatterbox/bin/pip install --force-reinstall --no-deps \
  'git+https://github.com/resemble-ai/chatterbox.git@5de7a54aa4e5e2baadb0182dde554908b48b85c2'
~/.venvs/tts-chatterbox/bin/python scripts/tts-compare.py \
  --backend chatterbox --limit 5 --out models/tts-comparison-wsl
```

To add **Fish 1.5**, start the native MPS server described below, note its
Python PID, and run the benchmark against it:

```sh
models/fish-native/.venv/bin/python scripts/tts-compare.py \
  --backend fish --fish-pid <server-python-PID>
```

- `rss_gib` samples that server PID. CPU time and Metal peak are not
  available through its HTTP API.
- The benchmark rewraps Fish's 44.1 kHz PCM, because the streamed WAV
  header reports zero frames.

#### Score intelligibility and listen

With the Parakeet STT profile running locally, in a separate Compose project
so a running stack is not touched:

```sh
COMPOSE_PROJECT_NAME=sodalis-tts-eval SODALIS_SERVICE_PREFIX=sodalis-tts-eval \
  SODALIS_PORT=4186 STT_PROVIDER=parakeet-tdt PARAKEET_TDT_URL=http://parakeet-tdt:8080 \
  TTS_PROVIDER=piper-http PIPER_HTTP_URL=http://piper:5000 LLM_PROVIDER=mock \
  docker compose -f compose.yaml --profile parakeet-tdt up --build -d gateway speech parakeet-tdt
# Transcribe every clip (resumable) into <run>/intelligibility.json.
pnpm exec tsx scripts/tts-intelligibility.ts models/tts-comparison-wsl http://127.0.0.1:4186
# Listening page for runs passing both gates (--review-all includes the others).
python3 scripts/tts-compare.py --out models/tts-comparison-wsl --review
# After exporting review-scores.json from review.html:
python3 scripts/tts-compare.py --out models/tts-comparison-wsl --score review-scores.json
python3 -m unittest scripts/test_tts_compare.py
```

**Gates:** median synthesis ≤ 1.5 s and corpus word error rate ≤ 10%.

**The review page** (`review.html`) covers ten sentences: five fixed
representative ones plus the five with the highest mean word error rate.

- **Fixed sentences.** Once `review.json` exists, later `--review` runs
  reuse its sentences; `--repick-review` chooses them afresh.
- **Azure runs** are always added with all 50 clips.
- **Scoring:** each clip gets a 1–5 score for Dutch pronunciation and for
  naturalness, plus error flags.
- **Ranking:** `--score` ranks gate-passing runs on the shared sentences and
  reports each run's mean over all of its reviewed clips.

Clips are sent only to a local HTTP origin.

#### Check the live Sodalis TTS path

`scripts/tts-live-check.ts <origin> <label>` works with any configured TTS
provider and writes `models/tts-live/<label>.json`. It checks two things:

- **Latency:** it times the short, medium, and longest corpus replies (three
  times each, after an excluded warm-up), from request to first PCM chunk
  and to the end of the stream.
- **Cancellation:** it times one uncancelled 1,007-character reply, then
  cancels one more copy of that reply than the speech API admits at once.
  - By default each cancel comes just after the first audio arrives;
    `--cancel-after-ms <ms>` cancels after a fixed delay instead.
  - A cancellation counts only if it came before half the uncancelled
    reply's duration.
  - Afterwards a new reply must start within 3 s, and a further reply must
    succeed.

Piper HTTP returns audio only after full synthesis, so measure Piper with a
fixed delay:

```sh
COMPOSE_PROJECT_NAME=sodalis-tts-eval SODALIS_SERVICE_PREFIX=sodalis-tts-eval \
  SODALIS_PORT=4186 STT_PROVIDER=mock TTS_PROVIDER=piper-http \
  PIPER_HTTP_URL=http://piper:5000 LLM_PROVIDER=mock \
  docker compose -f compose.yaml --profile piper up --build -d gateway speech piper
pnpm exec tsx scripts/tts-live-check.ts http://127.0.0.1:4186 piper-ronnie --cancel-after-ms 500
COMPOSE_PROJECT_NAME=sodalis-tts-eval LLM_PROVIDER=mock docker compose -f compose.yaml --profile "*" down
```

Against an Azure-backed stack, the live check sends about 4,600 billed
characters.

#### Probe an Azure voice

The evaluation judged Azure voices on one probe sentence each. To check a
voice yourself, put the key in the ignored `.env.azure-eval`. Never put it in
a command line, in `.env.example`, or in chat:

```dotenv
AZURE_TTS_URL=https://<resource>.cognitiveservices.azure.com/
AZURE_TTS_KEY=<your resource key>
AZURE_TTS_VOICE=nl-NL-ColetteNeural
```

```sh
set -a; . ./.env.azure-eval; set +a
# Unbilled: checks key, region, and voice, and whether the voice speaks Dutch.
python3 scripts/tts-compare.py --azure-preflight
# Billed, about 80 characters: the warm-up phrase and sentence 01.
python3 scripts/tts-compare.py --backend azure --limit 1 --out models/tts-comparison-wsl
```

- Each voice gets its own run, `azure-<voice>`, with `:` replaced by `-`.
- On 401/403 the scripts stop with a hint about key and region, and never
  print the key.
- On throttling (429) or transient 5xx errors the benchmark waits for
  `Retry-After` and retries, timing only the successful attempt.
- A full 50-sentence run (omit `--limit`) sends about 2,300 characters per
  voice.

#### Fish Speech 1.5 (non-commercial evaluation only)

Fish Speech 1.5 has a standalone evaluation service, **not** a Sodalis
speech provider.

- Its weights are CC BY-NC-SA 4.0. Review the
  [model card](https://huggingface.co/fishaudio/fish-speech-1.5) before
  downloading.
- Its source `LICENSE` says Apache-2.0, but its package metadata declares
  CC BY-NC-SA 4.0, so treat redistribution terms as unresolved.
- Do not treat the current Fish S2 repository licence as the 1.5 licence.
- A non-commercial licence does not authorize organizational or commercial
  deployment.
- Fish's in-flight cancellation failed, so do not use it for normal
  desktop use.

The pinned revision downloads into the ignored `models/` folder, not a
distributable image:

```sh
mkdir -p models/fish-speech-1.5
for file in config.json special_tokens.json tokenizer.tiktoken model.pth \
  firefly-gan-vq-fsq-8x1024-21hz-generator.pth; do
  curl -fL "https://huggingface.co/fishaudio/fish-speech-1.5/resolve/275a984d33c33659e39eed41ff5bcd6e67517f4c/$file" \
    -o "models/fish-speech-1.5/$file"
done
```

With your usual `.env` in place, start the isolated CPU container manually:

```sh
docker-compose --env-file .env -f compose.yaml --profile fish-speech-eval up --build -d fish-speech
docker-compose --env-file .env -f compose.yaml --profile fish-speech-eval logs -f fish-speech
# After the trial:
docker-compose --env-file .env -f compose.yaml --profile fish-speech-eval stop fish-speech
```

Use `docker compose` instead of `docker-compose` on Docker Desktop.

- **Isolation.** The container is internal to Compose, capped at 2 CPUs and
  4 GB RAM, not published to the host, and not connected to the Sodalis TTS
  endpoint. `pnpm stack:up` replaces the selected stack and stops it.
- **Source and weights.** It builds from pinned upstream v1.5.0 source and
  mounts the weights read-only.
- **Streaming patch.** [`streaming.patch`](../services/fish-speech-1.5/streaming.patch)
  stops the upstream streaming path from appending the complete audio after
  the segments it already sent.

#### Native Apple Silicon Fish 1.5 trial

A native Python process can use Metal/MPS, unlike a Linux container on
macOS. With the weights above, an ARM Python 3.11, and `uv` installed,
prepare the pinned source in this worktree:

```sh
mkdir -p models/fish-native/source
git -C models/fish-native/source init
git -C models/fish-native/source remote add origin https://github.com/fishaudio/fish-speech.git
git -C models/fish-native/source fetch --depth 1 origin 7902e408c85b37193ce3f3c2361ca3c76be0d533
git -C models/fish-native/source checkout --detach FETCH_HEAD
git -C models/fish-native/source apply ../../../services/fish-speech-1.5/streaming.patch
git -C models/fish-native/source apply ../../../services/fish-speech-1.5/native-mps.patch
uv venv --python 3.11 models/fish-native/.venv
uv pip install --python models/fish-native/.venv/bin/python \
  'torch==2.4.1' 'torchaudio==2.4.1' 'transformers==4.45.2' \
  -e 'models/fish-native/source[stable]'
```

The native-only patch does two things:

- it omits PyAudio, which the optional playback client needs and which
  requires PortAudio headers;
- it matches token tensor dtypes for MPS `torch.isin`.

Start the API in another terminal, bound to loopback:

```sh
cd models/fish-native/source
../.venv/bin/python -m tools.api_server --listen 127.0.0.1:18080 \
  --device mps --half --llama-checkpoint-path ../../fish-speech-1.5 \
  --decoder-checkpoint-path ../../fish-speech-1.5/firefly-gan-vq-fsq-8x1024-21hz-generator.pth \
  --decoder-config-name firefly_gan_vq
```

Wait for `mps is available, running on mps` **and** `Application startup
complete`. Then request a short Dutch phrase and measure the time until
actual PCM, not just the streaming WAV header:

```sh
python3 - <<'PY'
import json, time, urllib.request, wave
from pathlib import Path

request = urllib.request.Request(
    "http://127.0.0.1:18080/v1/tts",
    json.dumps({"text": "Hoe oud bent u?", "format": "wav",
                "streaming": True, "max_new_tokens": 256}).encode(),
    {"Content-Type": "application/json"},
)
start = time.monotonic()
with urllib.request.urlopen(request, timeout=120) as response:
    header = response.read(44)
    first_pcm = response.read(2048)
    print("first_pcm_seconds:", round(time.monotonic() - start, 2))
    pcm = first_pcm + response.read()
    print("total_seconds:", round(time.monotonic() - start, 2))
    print("sample_rate:", int.from_bytes(header[24:28], "little"),
          "pcm_bytes:", len(pcm))
out = Path("models/fish-native/dutch-question-playable.wav")
with wave.open(str(out), "wb") as wav:
    wav.setnchannels(1)
    wav.setsampwidth(2)
    wav.setframerate(44100)
    wav.writeframes(pcm)
print("playback_file:", out)
PY
```

The server may keep generating after a client disconnects, so stop its
specific PID after the trial.

Never upload MLS recordings or private microphone samples to a hosted
provider without separate authorization. MLS's dataset licence, CC BY 4.0,
is **not** a speaker's consent to voice cloning.

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
```

`pnpm stack:up` then selects the deterministic mock without starting a
local LLM engine or connecting to Ollama; other LLM settings are ignored. For a different local GGUF model,
clear `LLM_BASE_URL` and set `LLM_MODEL` to the file in `models/llm/`;
the stack selects its CPU llama.cpp profile. STT and TTS can also be
selected independently: `STT_PROVIDER=mock` skips Whisper, and
`TTS_PROVIDER=mock` skips Piper; leave the other role unchanged.

### Use an Azure OpenAI LLM (opt-in)

The optional `azure` LLM selection calls Azure OpenAI **only when explicitly
selected**. Each turn sends the conversation text (up to 12 recent
messages), the trusted app context (app ID, name, category), and the
available semantic action list to Azure. Use your own Azure OpenAI or
Foundry resource, with your consent; a **Data Zone EU** deployment is
recommended. The browser still talks only to the Sodalis AI API, and the key
stays in the AI container. Set these in your ignored `.env`, or in the same
git-ignored `.env.azure` overlay as
[Azure STT](#optional-azure-ai-speech-stt) and pass `--env .env.azure`:

```dotenv
LLM_PROVIDER=azure
AZURE_LLM_URL=https://<resource>.openai.azure.com/openai/v1
AZURE_LLM_KEY=<your resource key>
AZURE_LLM_DEPLOYMENT=gpt-5
# Optional: minimal (default), low, medium, or high; off for non-reasoning
# deployments such as gpt-4.1-mini, which reject reasoning_effort
AZURE_LLM_REASONING_EFFORT=
```

Keep `minimal` for conversation: in the
[LLM provider evaluation](evaluations/llm-providers.md), gpt-5 chose actions
as accurately at `minimal` as at higher efforts, with a median complete reply
of 1.8 s instead of 4.8–15.6 s, at a fraction of the cost.

**`AZURE_LLM_URL`** must be the HTTPS v1 resource endpoint. Hosts ending in
`.openai.azure.com`, `.services.ai.azure.com`, or
`.cognitiveservices.azure.com` are accepted; a bare host is completed to
`/openai/v1`. Deployment URLs (`/openai/deployments/...`) and Foundry
**project** endpoints (`/api/projects/...`) are rejected.
**`AZURE_LLM_DEPLOYMENT`** is your deployment name, not the model family.
Sodalis sends no temperature or token limit (GPT-5 rejects them) and does
not retry 429 or 5xx responses. A content-filter block ends the turn with a
"content filter" error.

Local `LLM_*` and `AZURE_LLM_*` settings may coexist: to switch, change only
`LLM_PROVIDER` and run `pnpm stack:up` again. The unselected provider's
settings are blanked for the AI container, so the Azure key never reaches a
local selection. There is no automatic fallback between providers.

### Compare LLM providers

Two opt-in scripts measure LLM providers for the
[LLM provider evaluation](evaluations/llm-providers.md); neither runs in
`pnpm test`. Azure configurations are billed.

`scripts/llm-compare.ts` calls the providers in-process through the same
factory as the AI service, with the fixed Dutch prompt set and action list in
`scripts/llm-prompts.json` (10 chat and 10 action prompts). It reads `.env`
when present and overlays an optional `--env <overlay>` such as `.env.azure`
(the same overlay semantics as `pnpm stack:up --env`). It runs one excluded
warm-up per configuration, and then
`--repetitions` passes (default 3). Configurations: `local` (`LLM_BASE_URL`
and `LLM_MODEL`, with `host.docker.internal` rewritten to `127.0.0.1`, or
`--local-url` and `--local-model`), `azure-minimal`, `azure-low`,
`azure-medium`, `azure-high` (the `AZURE_LLM_*` settings with that reasoning
effort), `azure-off` (the configured Azure deployment without a
`reasoning_effort` request field, for non-reasoning models such as
gpt-4.1-mini), and `mock`. Pass the deployment's prices per million tokens to
estimate cost; reasoning tokens are billed as output.

```sh
# Local baseline only (host Ollama):
pnpm exec tsx scripts/llm-compare.ts --configs local --label local-llama3.2-3b
# Azure at all four reasoning efforts (billed); prices per 1M tokens:
pnpm exec tsx scripts/llm-compare.ts \
  --configs azure-minimal,azure-low,azure-medium,azure-high \
  --input-price <input> --output-price <output> --currency USD --label azure-gpt-5
# gpt-4.1-mini (billed): put its endpoint, key, and deployment in the ignored
# .env.gpt-4.1-mini overlay; azure-off omits reasoning_effort.
pnpm exec tsx scripts/llm-compare.ts \
  --env .env.gpt-4.1-mini --configs azure-off --label azure-gpt-4.1-mini-off
```

The overlay needs `AZURE_LLM_URL`, `AZURE_LLM_KEY`, and
`AZURE_LLM_DEPLOYMENT` set for the intended Azure resource and deployment.
`azure-off` sets `AZURE_LLM_REASONING_EFFORT=off` for this run regardless of
the overlay's value. The comparison makes one excluded warm-up request and
then 20 prompts per repetition (60 requests with the default three
repetitions). Do not run it without consent to send those prompts to Azure.

Each run writes `results.json` (every raw response), `summary.md`, and
`review.md` to `models/llm-eval/<label>/`. Rate each configuration in
`review.md`. After changing the scoring rules or expectations, re-score a
stored run without new (billed) requests:
`pnpm exec tsx scripts/llm-compare.ts --rescore models/llm-eval/<label>`.

`scripts/llm-live-check.ts <origin> <label>` checks the running stack's
selected provider through the gateway: streamed round trips, utterance
validity, and five turns cancelled after their first chunk (one more than the
AI service's capacity of four), followed by a recovery turn. It writes
`models/llm-live/<label>.json`.

```sh
pnpm stack:up
pnpm exec tsx scripts/llm-live-check.ts http://127.0.0.1:4176 azure-gpt-5-minimal
```

### Enable long-term memory (opt-in)

Memory runs in the AI service ([settings](../apps/server/README.md#long-term-memory))
and is off by default. With host Ollama, pull an embedding model besides the
gate and extraction models, enable it in `.env`, and record consent:

```sh
ollama pull qwen3-embedding:0.6b
ollama pull gemma4:e4b-mlx   # gate; any small instruction model works
ollama pull qwen3:14b        # extraction, reconciliation, consolidation
# In .env: MEMORY_ENABLED=true (the other MEMORY_* values are in .env.example)
pnpm stack:up
curl -fsS -X PUT http://127.0.0.1:4176/api/memory/consent \
  -H 'content-type: application/json' -d '{"kind":"memory","granted":true}'
curl -fsS http://127.0.0.1:4176/api/memory/status
```

Health facts (diagnoses, medication, allergies) also need the `health`
consent. Grant it the same way with `{"kind":"health","granted":true}`, or
for development set `MEMORY_HEALTH_CONSENT=true` in `.env`; that records it
once at startup and never overrides a later withdrawal.

The database lives in the `memory_data` volume. `DELETE /api/memory/items/<id>`
forgets one item; removing the volume forgets everything.

### Evaluate long-term memory

`packages/memory/eval` holds the harness for the
[memory evaluation](evaluations/memory.md); it does not run in `pnpm test`
(its unit tests do). Every role is configured with `EVAL_<ROLE>_*` variables,
where the role is `GATE`, `EXTRACT`, `RECONCILE`, `ANSWER`, `JUDGE`,
`RENDER`, `INDUCE`, or `TRANSLATE`, and the suffix is `BASE_URL`, `MODEL`,
`API_KEY`, `API_KEY_HEADER`, `EXTRA_BODY`, `RESPONSE_FORMAT`,
`SEND_TEMPERATURE`, or `TIMEOUT_MS`. `RECONCILE`, `ANSWER`, and `INDUCE`
default to the `EXTRACT` model, and `TRANSLATE` to `ANSWER`; without a gate
model the gate passes every turn, and without a judge answers are graded by
keywords. Embeddings use `EVAL_EMBED_PROVIDER` (`mock` or
`openai-compatible`), `EVAL_EMBED_BASE_URL`, `EVAL_EMBED_MODEL`, and
`EVAL_EMBED_DIMS` (512). The CLI refuses non-local URLs unless
`--allow-cloud` is passed; ask the data owner's consent for each such run.
`EVAL_GATE_PROVIDER=systemone` sends the gate questions in one request to a
System One server (`POST <EVAL_GATE_BASE_URL>/v1/systemone`), such as vLLM
Semantic Router serving a decision model:
`vllm-sr serve -e vllm-sr/d3-edge --platform cpu --container-runtime podman --dtype float32`,
then `EVAL_GATE_BASE_URL=http://localhost:8899 EVAL_GATE_MODEL=vllm-sr/d3-edge`.

```sh
cd packages/memory
export EVAL_EMBED_PROVIDER=openai-compatible \
  EVAL_EMBED_BASE_URL=http://localhost:11434/v1 EVAL_EMBED_MODEL=qwen3-embedding:0.6b \
  EVAL_GATE_BASE_URL=http://localhost:11434/v1 EVAL_GATE_MODEL=gemma4:e4b-mlx \
  EVAL_EXTRACT_BASE_URL=http://localhost:11434/v1 EVAL_EXTRACT_MODEL=qwen3:14b \
  EVAL_JUDGE_BASE_URL=http://localhost:11434/v1 EVAL_JUDGE_MODEL=gemma4:12b-mlx \
  EVAL_GATE_EXTRA_BODY='{"reasoning_effort":"none"}' \
  EVAL_EXTRACT_EXTRA_BODY='{"reasoning_effort":"none"}' \
  EVAL_JUDGE_EXTRA_BODY='{"reasoning_effort":"none"}'
# Synthetic Dutch scenarios: two built-in personas, or sample elderly Flemish
# personas (CC BY 4.0, attribution kept in each case's source field).
pnpm eval generate --fixtures --sessions 4          # or: pnpm eval personas --count 10 && pnpm eval generate
pnpm eval generate --renderer llm [--concurrency 1] # natural turns; needs EVAL_RENDER_* (not the EXTRACT model) and EVAL_JUDGE_*; resumable
pnpm eval run --set synthetic --label local-qwen3-14b [--system2 | --system2-compare] [--min-cluster 2] \
  [--threshold 0.1] [--no-recall] [--no-memory] [--concurrency 2]
# Public benchmarks (downloaded on first use):
pnpm eval run --set longmemeval --per-type 10 --distractors 4   # or --limit 20 --types knowledge-update,temporal-reasoning
pnpm eval run --set personamem --personas 4 --system2-compare
pnpm eval translate --per-type 20 --distractors 2 && pnpm eval run --set longmemeval-nl   # resumable
pnpm eval run --set locomo --limit 2                # CC BY-NC 4.0: local use only, never commit
# Re-grade stored results with the current judge and grading rules:
pnpm eval rejudge --file eval/.data/results/a.json,eval/.data/results/b.json
# Vector index latency (task 0051):
pnpm eval bench-index --items 10000
```

Thinking models (gemma4, qwen3) think by default; pass
`EVAL_<ROLE>_EXTRA_BODY='{"reasoning_effort":"none"}'` for the gate, judge, and
renderer, or a run takes hours. Multiple-choice and "I do not know" answers are
graded without the judge. `--no-memory` answers without ingesting anything, as
a baseline. Ollama's MLX runner can stall under concurrent requests; keep
`--concurrency` at 1 or 2 and do not share the GPU with other runs when
latency matters.

Data and results stay in the ignored `packages/memory/eval/.data/`
(`results/<label>-<time>.json` holds every trace, answer, and the memory
block each answer saw). LongMemEval-S has about 50 sessions per question;
`--distractors N` keeps the evidence sessions plus N others, so runs stay
affordable on local models.

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
