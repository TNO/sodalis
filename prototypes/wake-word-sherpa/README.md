# sherpa-onnx wake-word prototype: “Hey Sodalis”

**Throwaway, standalone browser prototype.** It does not modify or mount inside the Sodalis app. The question is whether sherpa-onnx open-vocabulary keyword spotting can make a Dutch “Hey Sodalis” activation attempt on a laptop. The page shows an always-visible mic state, one-touch mute, a large listening state and local chime after a match. It does not run speech recognition after activation.

## Run locally

From the repository root:

```sh
cd prototypes/wake-word-sherpa
./setup.sh
./fetch-assets.sh
./serve.sh
```

Open <http://127.0.0.1:4173> in a current browser. Allow microphone access when prompted. Keep the tab in the foreground during the check.

- `setup.sh` installs only the Python tokenization helper into this prototype’s ignored `.venv/`; no workspace dependencies or root lockfile are changed.
- `fetch-assets.sh` downloads the official KWS model archive, verifies its SHA-256, extracts only model weights and text assets (not the archive’s example WAVs), and builds the KWS WebAssembly target from the official sherpa-onnx `v2.0.1` source with the Emscripten `4.0.23` Docker image. The `v2.0.1` release does not publish a standalone KWS WASM bundle, so the pinned upstream target is built locally; its official JS wrapper and generated runtime stay in the ignored `assets/` directory with the model. Docker and public GitHub access are required. No cloud speech provider is contacted.
- `serve.sh` uses Python’s local static server on `127.0.0.1:4173`; do not open the page as a `file://` URL because microphone access requires localhost or HTTPS.

The runtime chunk is **16 frames / 320 ms** (`chunk_size=16`). Sherpa’s corresponding `chunk_size=8` option is 160 ms, but this prototype deliberately uses 16 and reports that same value in the page and exports. The encoder and joiner are the archive’s int8 variants; the decoder is fp32, matching the upstream model guidance.

## Model and licences

- **Model:** `sherpa-onnx-kws-zipformer-zh-en-3M-2025-12-20`, official [sherpa-onnx KWS model page](https://k2-fsa.github.io/sherpa/onnx/kws/pretrained_models/index.html) and [release archive](https://github.com/k2-fsa/sherpa-onnx/releases/download/kws-models/sherpa-onnx-kws-zipformer-zh-en-3M-2025-12-20.tar.bz2). It is English/Chinese, not Dutch; Dutch performance is unknown.
- **Runtime/source:** sherpa-onnx is [Apache-2.0](https://github.com/k2-fsa/sherpa-onnx/blob/v2.0.1/LICENSE). The page uses the upstream KWS C API/WASM wrapper and does not use Porcupine, Vosk, Whisper, Web Speech API, or openWakeWord weights.
- **Model-weight licence:** **Apache License 2.0**, declared for the original `pkufool/icefall-kws-zipformer-zh-en-3M-2025-12-20` model on [ModelScope](https://modelscope.cn/models/pkufool/icefall-kws-zipformer-zh-en-3M-2025-12-20); the [Hugging Face model card](https://huggingface.co/moeru-ai/sherpa-onnx-kws-zipformer-zh-en-3M-2025-12-20) independently identifies the upstream weights as that same model and declares Apache-2.0. The official sherpa-onnx release archive itself has no separate licence file. The model weights are fetched locally and are not committed or redistributed.

The upstream KWS CMake guard still checks for an epoch-12 decoder filename. The fetch script places the selected epoch-13 decoder under that guard name as an alias in the ignored build tree; the page actually loads the epoch-13 model paths. No upstream source in the Sodalis checkout is changed.

## Keyword token sequence

The model’s `tokens.txt` and `en.phone` lexicon use sherpa-onnx `text2token` with `--tokens-type phone+ppinyin`: English is represented as CMU-style phonemes; Chinese uses partial pinyin. The stock lexicon contains `HEY → HH EY1`, but does not contain `SODALIS`. For a Dutch-style `/soːˈdaːlɪs/` approximation, I added this local lexicon entry:

```text
SODALIS S OW0 D AA1 L IH0 S
```

Encoding the raw input `HEY SODALIS @HEY_SODALIS` with the model’s tokens and `phone+ppinyin` type produced the page’s initial line:

```text
HH EY1 S OW0 D AA1 L IH0 S @HEY_SODALIS
```

This is a best-effort phone approximation, **not** a Dutch pronunciation dictionary or a claim that the English/Chinese model recognizes Dutch. “Sodalis” is not in the supplied English lexicon, so its pronunciation was chosen explicitly. Use the editable keywords box to try alternatives or multiple lines, e.g.:

```text
HH EY1 S OW0 D AA1 L IH0 S @DUTCH_APPROX
HH EY1 S AH0 D AA1 L IH0 S @ALT_VOWEL
```

The score and threshold controls apply when you press **Apply keyword settings**. This reproduces the initial sequence from the local model files (run from this directory after setup and asset fetch):

```sh
python3 - <<'PY'
from pathlib import Path
source = Path("assets/model/en.phone")
lines = [line.strip() for line in source.read_text(encoding="utf-8").splitlines() if line.strip()]
lines.append("SODALIS S OW0 D AA1 L IH0 S")
Path("assets/en.phone.custom").write_text("\n".join(lines) + "\n", encoding="utf-8")
PY
printf 'HEY SODALIS @HEY_SODALIS\n' > assets/keywords-raw.txt
.venv/bin/sherpa-onnx-cli text2token \
  --tokens assets/model/tokens.txt \
  --tokens-type phone+ppinyin \
  --lexicon assets/en.phone.custom \
  assets/keywords-raw.txt assets/keywords.txt
cat assets/keywords.txt
```

To try another pronunciation, edit/add the `SODALIS ...` phone entry in the local lexicon, regenerate the token line, then paste it into the page. Blank lines must be removed from the lexicon first; the upstream utility expects every line to contain a word and at least one phone.

## Privacy and measurements

The browser requests one mono microphone stream with browser echo/noise processing disabled. AudioWorklet downsamples into **transient 320 ms chunks** for the local WASM model. The transferred chunk and the WASM input staging buffer are zeroed after use; no audio is written to a file, retained in a recording buffer, sent in a request, or included in exports. The streaming detector necessarily keeps model feature/decoder state in memory. The page does not load remote scripts or send audio to a server. Detection, false-activation and attempt logs contain timestamps, token names, latency and counts only.

On detection, the page briefly displays **“Sodalis is listening”** and plays a locally generated chime. The mic remains active for wake-word detection until muted; follow-up speech is not recorded or transcribed. The **Mute microphone** button stops the media tracks immediately and frees the active detector stream. The large status card always indicates whether the microphone is off, active, or in the just-detected listening state.

The page reports activation latency from the last sherpa token timestamp to the visible state (or a one-chunk estimate if the model returns no token timestamps). This is laptop-browser evidence only; do not treat it as a verified latency threshold, soak result, or tablet result.

## Human hands-on check (about 10 minutes; do not substitute a soak)

The human evaluator should run this check in the laptop browser; this prototype author has **not** run it. Follow the same settings for the playback and attempts so eagerness and missed activations are comparable.

1. Start with the default keyword line, boost **1.0**, and threshold **0.25**. Note the date, browser, laptop, playback source/volume, distance, exact token line and settings. Click **Start wake listening**, allow mic access, and verify the on-page active indicator is visible. Test **Mute microphone** once and confirm that the page says “Muted” and the browser mic indicator goes away; re-enable only when ready.
2. With the detector active, play **about 10 minutes total of mixed TV, radio and ordinary conversation** at the normal listening volume. Do not speak the wake phrase intentionally during this portion. Each time an unintended listening-state activation occurs, click **False activation +1**. Export logs afterward; add a note outside the app if a false event’s source or setting matters.
3. Make **about 20 intended Dutch “Hey Sodalis” attempts**, using a natural voice and a couple of distances/noise levels. For each attempt, immediately click **Intended: first try worked** or **Intended: first try missed**. A miss remains a first-try miss even if a retry works. Keep these attempts at the same detector settings; use the editable tokens/score/threshold only in a separate exploratory pass and label it separately.
4. Choose exactly one felt-intrusiveness rating: **Fine**, **Uneasy**, or **Unacceptable**. Export both JSON and text session logs. The log does not contain audio.
5. For a rough CPU observation, compare this tab in the browser Task Manager before and after a few minutes (Chrome/Edge: **Shift+Esc**, or menu → More tools → Task Manager). Record the observed tab CPU separately; browser APIs do not expose a reliable CPU percentage. Temperature, battery/hour, one-hour behavior and tablet power remain unmeasured.

**Red flags from the rubric:** 2 or more false activations in the 10-minute playback, or 5 or more first-try misses in the 20 intended attempts. These are red flags, not a statistically verified threshold. A clean short check means only “no red flag observed,” not that the waking-hour false-activation gate or 80% first-try gate is proven. Stop or mute immediately if the listening state feels unacceptable or the privacy behavior is unclear.

## Known gaps

- No Dutch-trained model, Dutch accuracy claim, or reported Dutch false-accept/false-reject rate.
- No real microphone run or hands-on check was performed by the author; browser microphone access and audible chime therefore remain human-verified. No offline TTS tool was available for a synthetic phrase-detection run.
- No production STT, turn capture, assistant reply, or bounded follow-up speech window is connected.
- CPU, battery, thermals, long-soak eagerness, tablet behavior, background/sleep behavior, and microphone permission persistence are not measured.
