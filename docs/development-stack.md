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
| STT | `whisper-cpp`, `whistle`, `parakeet-tdt` (blank matching URL), or `mock` | Matching provider with `WHISPER_CPP_URL`, `WHISTLE_URL`, or `PARAKEET_TDT_URL` |
| TTS | `piper` (blank `PIPER_HTTP_URL`) or `mock` | `piper`/`piper-http` with `PIPER_HTTP_URL`; `azure` with `AZURE_TTS_URL`, `AZURE_TTS_KEY`, and `AZURE_TTS_VOICE` |
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
External Piper TTS must speak Piper HTTP (`POST /synthesize` with a WAV
response); Azure TTS uses its own HTTPS SSML endpoint and streams raw
22,050 Hz PCM through the speech API. The LLM endpoint
must stream OpenAI-compatible Chat Completions; and the Home endpoint must
implement Sodalis's `/api/home/*` contract. Azure TTS has an explicit
server-side SSML adapter; other hosted services are usable **only when their
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
curl -fL https://huggingface.co/rhasspy/piper-voices/resolve/main/nl/nl_BE/nathalie/medium/nl_BE-nathalie-medium.onnx \
  -o models/piper/nl_BE-nathalie-medium.onnx
curl -fL https://huggingface.co/rhasspy/piper-voices/resolve/main/nl/nl_BE/nathalie/medium/nl_BE-nathalie-medium.onnx.json \
  -o models/piper/nl_BE-nathalie-medium.onnx.json
```

For the optional Whisper.cpp profile:

```sh
mkdir -p models/whisper
curl -fL https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin \
  -o models/whisper/ggml-base.bin
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

The optional Whisper `ggml-base.bin` keeps CPU inference lightweight, but it
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

| Candidate | Dutch / accuracy | Interim / cancellation | Deployment / license | Decision |
| --- | --- | --- | --- | --- |
| Whisper.cpp `base`, `small`, `medium` | Measured above; short questions still imperfect | Sodalis snapshot interim API; session cancellation | macOS native or cross-platform CPU Compose; model-specific memory | Available; `medium` preferred on a sufficiently provisioned native Mac |
| Cactus Whistle/Needle | Six-speaker MLS test: 65/215 word errors (30.2% WER); fast CPU inference; short synthetic question still wrong | Sodalis snapshot interim; request cancellation, but in-flight inference continues | Apache-2.0 model and runtime; cross-platform CPU image | Opt-in Compose profile `whistle` |
| NVIDIA Parakeet TDT v3 / sherpa-onnx | Six-speaker MLS test: 37/215 word errors (17.2% WER), 394–700 ms per clip; WAV short question correct, WebM question "Who oud bent u?"; 3 s silence empty | Sodalis snapshot interim; in-flight inference continues | Original weights CC BY 4.0, Apache-2.0 runtime; 2 GB VM OOM, 8 GB VM runs | Opt-in Compose profile `parakeet-tdt`; not Redux |
| Cactus engine (other models) | Not benchmarked | Chunked `confirmed` / `pending` API; cancellation not verified | [Different license](https://github.com/cactus-compute/cactus/blob/main/LICENSE) restricts organizations above funding/revenue thresholds | Not bundled |
| Moondream Parakeet Redux / Photon | Dutch claimed; MLS accuracy not measured | Photon documents live PCM snapshots; cancellation and Sodalis WebM conversion not verified | Local CPU/Apple silicon/CUDA; weights CC BY 4.0, `kestrel-kernels` requires a written agreement | No adapter/profile until runtime terms and live path are verified |
| Azure AI Speech | Dutch supported by service; local sample not uploaded | Continuous recognition provides interim events; Sodalis cancellation not integrated | Hosted; credentials, billing, network and data transfer required | No adapter or cloud fallback without authorization and a local-only evaluation plan |

### Evaluate alternative speech synthesis

Piper remains the default. The optional `azure` TTS selection calls Azure
Speech **only when explicitly selected**, sending assistant reply text (not
microphone audio) to your configured Speech resource. Set these values in
your ignored `.env`, supply credentials from your own resource, and run
`pnpm stack:config` then `pnpm stack:up`:

```dotenv
TTS_PROVIDER=azure
AZURE_TTS_URL=https://westeurope.tts.speech.microsoft.com/cognitiveservices/v1
AZURE_TTS_KEY=<your Speech resource key>
AZURE_TTS_VOICE=nl-NL-ColetteNeural
```

Keep `PIPER_HTTP_URL` blank. The adapter requests
`raw-22050hz-16bit-mono-pcm` and relays PCM chunks through the existing
Sodalis TTS endpoint; cancellation aborts the upstream HTTP response.
Azure endpoint, voice, and key are required at startup, and a missing or
failing service never falls back to Piper. The browser receives none of
these settings. Contract tests cover the adapter with an isolated HTTP
response, **not a live Azure resource**: Dutch voice quality, real
time-to-first-audio, quota handling, and billing are still unmeasured.
Never put a real key in `.env.example` or commit your `.env`.

#### Compare fifty Dutch avatar utterances locally

`scripts/tts-sentences.json` is a fixed set of 50 synthetic avatar replies:
greetings, confirmations, clarification, silence, dates, numbers, email and
calendar summaries, and errors. `scripts/tts-compare.py` writes one WAV per
sentence per engine, per-sentence synthesis time, CPU time where measurable,
audio duration, real-time factor (compute time / audio duration), process
high-water RSS, and MLX Metal allocator peak. It first synthesizes a separate
warm-up phrase for **each** engine; neither the warm-up nor model startup
enters the scored timings. `warmup_seconds` includes model loading and any
engine-internal warm-up, so it is not a pure one-utterance latency. For Fish
it measures only the excluded warm-up request; the separate server startup
and its own internal warm-up are not included. Compare
matching numbered clips in
`models/tts-comparison/index.html` (open it locally in a browser), or inspect
each `metrics.json`. Generated audio, weights, and metrics stay under the
ignored `models/` folder and are not committed. Use headphones to judge Dutch
pronunciation, prosody, omissions, and hallucinations; timing alone is not a
quality score. Do **not** run engines concurrently when comparing throughput
on shared hardware.

```sh
# Native CPU baseline using the already downloaded models/piper voice.
uv venv --python 3.11 models/piper-native/.venv
uv pip install --python models/piper-native/.venv/bin/python 'piper-tts==1.8.0'
models/piper-native/.venv/bin/python scripts/tts-compare.py --backend piper

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

Voxtral uses the cached 6-bit MLX model and `nl_female` preset; KugelAudio
uses its `warm` preset and `nl` language hint. Neither needs an unlicensed
reference recording. `tts-mlx` also exposes other model families, but they
are **not** interchangeable Dutch candidates: VibeVoice 1.5B's model card
lists English/Chinese, while cloning backends need approved reference audio.
To add Fish, start the native MPS server described below in a separate
terminal, note its Python PID, and then run:

```sh
models/fish-native/.venv/bin/python scripts/tts-compare.py \
  --backend fish --fish-pid <server-python-PID>
```

Fish is unconditioned (no voice clone); the benchmark rewraps its streaming
44.1 kHz PCM because the streamed WAV header advertises zero frames.
The server must be loopback-only and its startup log must confirm MPS.
`--limit 1` pilots the first sentence; a later full invocation skips already
generated numbered clips and performs a fresh, excluded warm-up. In the
recorded run, sample 01 for Piper, Voxtral, and KugelAudio came from
separate warmed pilot processes; samples 02–50 came from their respective
full runs. The Fish
server may continue computing after a client disconnect: stop only its own
PID at the end of the trial. `rss_gib` for Fish samples that server PID, while
its `cpu_seconds` and Metal allocator peak are not available through this
external HTTP call. RSS on Apple Silicon is **not** GPU memory; MLX allocator
peak is only model-managed GPU allocation, not total device memory. These
engines use different runtimes, voices, sample rates, and processing pipelines,
so timings should be read as end-to-end local synthesis measurements, not
isolated model-token benchmarks. No Azure traffic or voice cloning is involved.

On the M4 Max with 128 GB unified memory, the 2026-10-05 local run generated
and verified **all 200 nonempty mono PCM16 WAV clips** (50 per engine).
All times below exclude the separate warm-up utterance; model startup is
included in the measured warm-up for in-process backends, but **not** Fish's
separate server startup. Lower RTF is faster. Audio quality is deliberately
**unrated** until a person listens to matching numbered clips in the report.

| Engine / voice | Acceleration | Warm-up (excluded) | Median / total synthesis, 50 clips | Median RTF | Peak process RSS | Peak MLX Metal allocation |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Piper / `nl_BE-nathalie-medium` | Native CPU; no GPU required | 0.46 s | 0.044 s / 2.23 s | 0.017 | 0.28 GiB | n/a |
| Voxtral 4B 6-bit / `nl_female` via `tts-mlx` | Apple Silicon Metal/MLX | 6.37 s | 1.32 s / 68.64 s | 0.427 | 3.84 GiB | 4.28 GiB |
| Fish Speech 1.5 / unconditioned | PyTorch MPS; CPU container previously too slow | 9.08 s (request only) | 11.72 s / 684.86 s | 2.786 | 6.64 GiB (server) | not measured |
| KugelAudio-0-Open / `warm` via `tts-mlx` | Apple Silicon Metal/MLX | 33.97 s | 20.06 s / 1067.56 s | 5.775 | 16.58 GiB | 19.26 GiB |

These RSS and MLX high-water figures are different metrics and **must not
be added** to estimate required RAM: Apple Silicon shares CPU/GPU memory.
Fish's server RSS increased during the 50-request run (sample 01: 1.75 GiB;
sample 50: 6.64 GiB), so the short single-request RSS from the earlier trial
is not a capacity estimate. The KugelAudio run took nearly 18 minutes for
around 200 seconds of audio, far too slow for interactive replies in this
configuration. Some Fish outputs are unusually long for short input
(sample 01: 12.17 s; sample 36: 13.65 s): **listen** before interpreting
this as fluent speech. Voxtral synthesized faster than real time in these
short tests, but its existing HTTP API still buffers a complete file; these
numbers do not establish time to first audio or interruption on disconnect.
Piper remains the proven local default. The benchmark is a listening
comparison, **not** evidence to close task 0036 or select a new provider.

| Candidate | Dutch voice / latency | Streaming / cancellation | License and platforms | Decision |
| --- | --- | --- | --- | --- |
| Piper | Bundled `nl_BE-nathalie-medium`; CPU baseline | HTTP WAV to Sodalis PCM; playback can be cancelled | Open local CPU service, macOS/Windows/Linux through Compose | Default; retained |
| Chatterbox Multilingual V3 | [23-language model](https://github.com/resemble-ai/chatterbox) includes Dutch; no local voice or latency measurement yet | `generate` returns complete audio; Sodalis-compatible incremental streaming and in-flight cancellation unverified | [MIT code](https://github.com/resemble-ai/chatterbox/blob/master/LICENSE) and [MIT model weights](https://huggingface.co/ResembleAI/chatterbox); CPU/MPS/CUDA documented, roughly 3.2 GB of model weights for V3 | No profile until Dutch voice, memory and time-to-first-audio are measured on the target Mac |
| Fish Speech **1.5** | [Model card](https://huggingface.co/fishaudio/fish-speech-1.5) includes Dutch (<10k training hours). CPU VM produced no audio in 160 s; native M4 Max MPS returned 1.30 s of audio in 3.89 s, intelligibility not listener-validated | Sends a WAV header before segments; pinned patch prevents duplicate final audio. Client disconnect did **not** stop native MPS inference promptly | [v1.5 source LICENSE Apache-2.0](https://github.com/fishaudio/fish-speech/blob/v1.5.0/LICENSE), but package metadata declares CC BY-NC-SA; **weights CC BY-NC-SA 4.0**. CPU Compose and native MPS tested on macOS ARM only | Standalone evaluation-only Compose profile; **not** selectable as Sodalis TTS because effective inference cancellation failed |
| F5-TTS | [Official pretrained models](https://github.com/SWivid/F5-TTS/blob/main/src/f5_tts/infer/SHARED.md) are trained on Chinese and English; no verified Dutch checkpoint/quality | CLI chunks long text; socket streaming exists; no Sodalis adapter/cancellation measurement | [MIT code, CC BY-NC weights](https://github.com/SWivid/F5-TTS); PyTorch CPU/MPS/CUDA documented, Docker example targets NVIDIA GPU | No local profile until a Dutch-capable checkpoint, matching terms, and CPU/MPS latency are verified |
| Azure AI Speech | [Dutch neural voices](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts); no local quality/latency measurement | [REST streaming raw PCM](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-text-to-speech), HTTP request cancellation | Hosted on Azure; account, key, network, billing and text transfer required; runs via Sodalis API from all three desktop platforms | Explicit opt-in `azure` adapter, not selected by default |
| Voxtral MLX via local `voxtral-api` | [Voxtral 4B TTS MLX](https://huggingface.co/mlx-community/Voxtral-4B-TTS-2603-mlx-6bit) lists `nl_female` and `nl_male` at 24 kHz; Dutch output/latency unmeasured here | Model yields internal chunks, but the existing `/v1/audio/speech` route synthesizes a complete file before responding; no HTTP first-audio or inference cancellation verified | Converted weights CC BY-NC 4.0; Apple Silicon MLX; check each backend's own model terms | Promising Dutch candidate for a future native-Mac trial, not a Sodalis provider |
| VibeVoice MLX | [Original 1.5B model card](https://huggingface.co/microsoft/VibeVoice-1.5B) lists **English/Chinese**, not Dutch; local project's M4 Max throughput numbers are not Sodalis measurements | Internal VAE decoding streams; local CLI writes WAV and the `voxtral-api` HTTP route returns a file; no short-reply or cancellation measurement | [MIT original weights](https://huggingface.co/microsoft/VibeVoice-1.5B); verify converted checkpoint separately; MLX on Apple Silicon | Do not assume Dutch support from local examples |
| KugelAudio-0-Open | [Model card](https://huggingface.co/kugelaudio/kugelaudio-0-open) lists Dutch, with quality varying by language; German preference tests do not measure Dutch | Local fork supports reusable voice embeddings; streaming HTTP and inference cancellation unverified | MIT source and model card; verify voice-reference rights/consent; native Mac example, other platforms unverified | Candidate for measured Dutch voice and latency trial, not yet an adapter |

The local `language-course-compiler` is a **client**, not a fifth model: its
lesson generator calls a configurable OpenAI-style speech endpoint and
receives completed MP3 audio. `voxtral-api` wraps several distinct model
backends; its shared HTTP route returns a `FileResponse` after `synthesize`
completes, even where a backend internally yields chunks. These local
projects were inspected read-only; no comparative Dutch listening test,
first-audio measurement, or integration was performed. The Sodalis endpoint
expects 22,050 Hz mono PCM16, so their 24 kHz WAV/MP3 outputs require
server-side decoding and resampling. Closing an HTTP response alone must not
be mistaken for interrupting model inference.

Voice-cloning trials require a suitable licensed reference clip and speaker
consent or an appropriate public-domain/CC-licensed recording. Do not treat
the current Fish S2 repository license as the 1.5 license. Nor does a
non-commercial model license authorize organizational/commercial deployment;
this evaluation does not bundle Fish or F5 weights.

For **non-commercial local evaluation only**, Fish Speech 1.5 has a
standalone service, **not** a Sodalis speech provider. Obtain the weights
after reviewing the [model card and its
CC BY-NC-SA 4.0 terms](https://huggingface.co/fishaudio/fish-speech-1.5).
The following pinned revision downloads into the ignored `models/` folder,
not a distributable image:

```sh
mkdir -p models/fish-speech-1.5
for file in config.json special_tokens.json tokenizer.tiktoken model.pth \
  firefly-gan-vq-fsq-8x1024-21hz-generator.pth; do
  curl -fL "https://huggingface.co/fishaudio/fish-speech-1.5/resolve/275a984d33c33659e39eed41ff5bcd6e67517f4c/$file" \
    -o "models/fish-speech-1.5/$file"
done
```

With your usual `.env` in place, start the isolated service manually:

```sh
docker-compose --env-file .env -f compose.yaml --profile fish-speech-eval up --build -d fish-speech
docker-compose --env-file .env -f compose.yaml --profile fish-speech-eval logs -f fish-speech
# After the trial:
docker-compose --env-file .env -f compose.yaml --profile fish-speech-eval stop fish-speech
```

Use `docker compose` instead of `docker-compose` on Docker Desktop. The
container is internal to Compose, capped at 2 CPUs and 4 GB RAM to limit
impact on other services, not published to the host or connected to the
Sodalis TTS endpoint. `pnpm stack:up` replaces the selected stack
and stops the evaluation service. The CPU container builds from pinned
upstream v1.5.0 source and mounts weights read-only. A narrowly scoped
[`streaming.patch`](../services/fish-speech-1.5/streaming.patch) prevents
the upstream streaming path from appending its complete final audio after
already emitting the segments. No adapter is offered for its 44,100 Hz
output, since it cannot currently meet Sodalis's 22,050 Hz streaming,
latency, and cancellation requirements on the tested CPU. On an 8 GB
Podman VM on macOS ARM, warmup took about 68 seconds; generating
`Hoe oud bent u?` produced **no audio after 160 seconds** at roughly
0.4 model tokens/second, ~2 GB resident memory and ~600% container CPU
in a direct, uncapped trial.
Even a health request timed out while inference ran. We aborted the test,
so neither complete-audio latency nor Dutch voice quality was measured.
Disconnecting the HTTP client did **not** stop inference. Do not use this
profile for normal desktop use. The source `LICENSE` is Apache-2.0, while
its `pyproject.toml` metadata
declares CC BY-NC-SA 4.0; treat redistribution terms as unresolved rather
than relying solely on the source license. No reference speaker is configured:
do not assume MLS's recording license alone authorizes cloning an
identifiable speaker.

#### Native Apple Silicon Fish 1.5 trial

Unlike a Linux container on macOS, a native Python process can use Metal/MPS.
This is an isolated **evaluation**, not a Sodalis TTS selection. With the
ignored weights downloaded above, an ARM Python 3.11 and `uv` installed,
prepare the pinned source in this worktree (not another project's checkout):

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

The native-only patch omits PyAudio (used by the optional playback client,
which needs PortAudio headers) and matches token tensor dtypes for MPS
`torch.isin`; the separately applied streaming patch prevents duplicate
complete audio. Neither patch changes the vendored container image. Start
the API in the foreground, bound to loopback, in another terminal:

```sh
cd models/fish-native/source
../.venv/bin/python -m tools.api_server --listen 127.0.0.1:18080 \
  --device mps --half --llama-checkpoint-path ../../fish-speech-1.5 \
  --decoder-checkpoint-path ../../fish-speech-1.5/firefly-gan-vq-fsq-8x1024-21hz-generator.pth \
  --decoder-config-name firefly_gan_vq
```

Wait for `mps is available, running on mps` **and** `Application startup
complete`. From the worktree root, request a short Dutch phrase and measure
the time until actual PCM, not just the streaming WAV header:

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

Fish's streamed WAV header reports zero frames; the example rewraps the raw
44.1 kHz PCM in a playable WAV. Listen to the file before judging Dutch
quality. On the M4 Max trial, MPS warmup finished about 20 seconds after
process startup; the phrase returned its first PCM at **3.89 seconds**, total
**3.89 seconds**, 114,688 PCM bytes (about 1.30 seconds of mono 16-bit
audio), and roughly **1.12 GiB process RSS** after the request (not peak or
Metal allocation). This is much faster than the tested CPU container, but
voice intelligibility was **not** listener-validated. A longer streaming
request disconnected immediately after its header, yet the server remained
busy generating, and a health request timed out two seconds later. The
process did not respond promptly to SIGTERM while generating; it was stopped
by its specific PID. In-flight cancellation therefore remains unsuitable
for an always-open voice session. Do not infer production reliability from
the short-phrase timing; test longer replies and repeated requests before
considering an adapter. The trial never contacted Azure.

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
