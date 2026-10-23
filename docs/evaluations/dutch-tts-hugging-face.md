# Dutch TTS models on Hugging Face for a Mac host

Status: desk research and a **local four-prompt Mac speed trial** complete,
2026-10-23. Listening and intelligibility scores are still outstanding. A
model's Dutch tag, downloads, likes, or recent upload is not evidence of
Dutch voice quality or practical speed.

## Summary and recommendation

**User decision (2026-10-23): settle on Pocket TTS for now, using the
female Dutch voice in `~/tts-trials/samples/pocket-female-nl-long-normalized.wav`.**
This is an evaluation choice only; **do not integrate it into Sodalis yet**.
The selected engine is pockettts.cpp Q8 GGUF/Metal. Its exact runtime,
weight and voice-reference revisions and regeneration recipe are recorded
in [the current selection](#current-selection-user-directed-2026-10-23).
With this HF account's upstream gate approved, Pocket generated the fixed
Dutch short/long prompts in 0.17/0.46 s on an M4 Max, compared with
0.06/0.23 s for Piper Ronnie. The Pocket weights are CC BY 4.0, gated
upstream, and carry prohibited-use terms; its MIT runtime does not make the
weights or bundled voices MIT. We used **no bundled voice pack**: both Pocket
and Audio8 were conditioned on a locally generated Piper reference. In one
informal listen, the user preferred Pocket slightly over Piper. However,
Pocket and Audio8 garbled the raw digits "24", which Whisper confirmed.
Writing the number out fixed it, so **Dutch number, date and time
normalisation is required before synthesis** (see
[the number normalisation finding](#number-normalisation-is-required-before-non-espeak-tts-measured)).
A [female-voice rerun](#female-voice-rerun-measured-same-session) using
the only permissive nl_NL female Piper source (MLS, CC BY 4.0) gave a
less accurate Piper voice, while its Pocket clone stayed accurate.
In a [KittenTTS 2 trial](#kittentts-2-measured-licence-accepted-by-the-user-for-researchsodalis),
Kitten produced the most accurate Dutch, but it is not interactive (RTF of
about 1.3–1.8 with no streaming). The user accepts its non-permissive
licence for research and Sodalis; commercial use would need a separate
licence.
A [research-only VibeVoice-Realtime-0.5B trial](#vibevoice-realtime-05b-research-only-trial-not-eligible-for-sodalis),
run with the user's consent, read the raw "24" correctly. However, it ran at
RTF 2.4–4.3 on MPS, about 36× slower than the selected Pocket voice, and it
is **not eligible for Sodalis**. No audible AI disclaimer appeared in its
output.

### Current selection (user-directed, 2026-10-23)

| Component | Selection |
| --- | --- |
| Engine | `pockettts.cpp` Q8 GGUF with Metal (`MTL0`), runtime revision `fab79722efc72f79d062de7a3a4472fc430a385d` |
| GGUF packs | Dutch and English conversion repository revision `b5a0115aee9658c110d747debb03edd548c4b9c7`; upstream Pocket TTS weights revision `db04f0e653473e5c7333c69686ac92b7460b0c1d` |
| Dutch voice | Pocket cloning the local `piper-female-nl-reference.wav`, made with `nl_NL-mls-medium`, speaker id 10 (MLS speaker 12500); MLS/OpenSLR 94, CC BY 4.0 |
| English voice | Pocket cloning the local `piper-female-en-reference.wav`, made with `en_US-ljspeech-medium`; LJ Speech is public domain |
| Selected sample | `~/tts-trials/samples/pocket-female-nl-long-normalized.wav` |

The English pair was also trialed with the corresponding Pocket English Q8
pack and Piper reference. Both reference WAVs remain outside git. Regenerate
them with Piper 1.8.0 and the saved models at `~/tts-trials/models/piper/`:

| Reference file | Piper voice and settings | Exact text | Seed |
| --- | --- | --- | --- |
| `piper-female-nl-reference.wav` | `nl_NL-mls-medium`, `SynthesisConfig(speaker_id=10)` (MLS speaker 12500) | `Hallo, ik spreek vandaag een paar zinnen in het Nederlands voor deze stemtest.` | None was set; the Piper call has no seed parameter |
| `piper-female-en-reference.wav` | `en_US-ljspeech-medium`, default synthesis config | `Hello, I am reading a few English sentences today for this voice test.` | None was set; the Piper call has no seed parameter |

The Dutch source requires CC BY 4.0 attribution to "Multilingual
LibriSpeech", Pratap et al. 2020, and the LibriVox reader. The English
LJ Speech source is public domain. The captured reference WAVs are the
canonical references; Piper synthesis was not seeded, so the recipe does
not promise byte-identical regeneration.

The selected Pocket sample is reproduced with the Dutch Q8 pack, reference
name `piper-female-nl-reference`, seed `42`, and this exact normalized text:

> Goedemorgen, ik heb uw afspraak voor donderdag om half tien bevestigd. Het
> adres is Stationsstraat vierentwintig in Utrecht. Laat het gerust weten als
> u liever een ander tijdstip kiest; dan bekijken we samen de mogelijkheden.

Run a Dutch text-normalisation pass **before Pocket synthesis**, expanding
numbers (including house numbers), dates and times to spoken Dutch. Do not
pass raw numeric/date/time forms to Pocket by default.

Before any Sodalis integration, complete all of these:

- Blind listening against Piper and the other shortlisted candidates,
  including the chosen reference voice and normalized Dutch sample.
- Parakeet round-trip WER on the fixed prompts and the 50-sentence Dutch
  corpus, including number/date/time cases.
- Verify that cancellation stops in-flight Pocket generation through the
  public Sodalis TTS route.
- Review the gated upstream Pocket weight terms and the exact
  redistribution requirements for a public Docker image. Do not bundle or
  redistribute the weights until both are cleared.

**Audio8 TTS Preview 0.6B ONNX INT4 was also trialed.** The [base checkpoint](https://huggingface.co/Edge0/Audio8-TTS-Preview-0.6b)
and [conversion](https://huggingface.co/Edge0/Audio8-TTS-Preview-0.6B-ONNX-INT4)
explicitly support Dutch and English, claim Apache-2.0 code and weights, and
document a macOS arm64 **CPU** runtime with an HTTP service, streaming PCM,
and a cancellation endpoint. Here its Dutch short/long responses took **7.54/72.65 s**
to complete, despite first PCM arriving in ~0.6 s; English was slower. It
does **not** meet conversational completion speed on these prompts. The
publisher's ~1.1–1.2 GiB M2 peak and English quality scores are claims for
different conditions, not substitutes for these M4 Max timings or a Dutch
listening score.

**Retain Piper Ronnie as Sodalis's measured local control**, not a proven
quality winner; it scored 5/10 in the existing single-listener Dutch review
and was fast on CPU. Its engine is GPL-3.0-or-later, so distributing it
requires a separate licensing decision. **Chatterbox Multilingual V3** is a
permissively licensed quality candidate if Mac MPS inference can beat its
previously measured ~39 s/reply on laptop CPU. MOSS-TTS Local Transformer
v1.5 is Apache-2.0 and supports Dutch, but its documented CUDA-centric
stack/large audio tokenizer makes it a lower-priority Mac experiment.

The most popular models in this search are **not** necessarily eligible:
Higgs TTS 3 requires a commercial license for product use; Voxtral TTS
and its GGUF conversion are CC BY-NC; KittenTTS 2 and the Audio8 **0.1B**
base checkpoint have revenue-limited custom licenses. A conversion's
permissive tag cannot override the upstream weights' restrictions.

## Scope

This is a follow-up to [the existing Dutch TTS evaluation](tts-providers.md)
and [Mac speech options](macos-speech-options.md). The question is whether
newer models in the [Hugging Face search for `tts` tagged `nl`, sorted by
trending](https://huggingface.co/models?language=nl&sort=trending&search=tts)
could give Sodalis better **Dutch and English** speech at usable
short-reply latency on a Mac, while permitting unrestricted open-source
project use. A Mac-native process can serve audio to the Compose speech
backend; a model need not run in a Linux container. No voice cloning is
required for the product, though these two trial engines used the licensed
synthetic references described below. Redistribution of a reference voice or model is a distinct
decision from user-initiated download.

## Method and hardware

Inspected the trending listing and queried the public Hugging Face model
metadata on **2026-10-23** for downloads, likes, last modified date, and
license, then checked publisher cards, source/runtime documentation, and
license text. Counts change and are **popularity indicators, not an
objective score or speed benchmark**. "Updated" is the repository's last
modification, not necessarily new training or improved weights. Trending
is a separate ranking, **not** equivalent to sorting by downloads or likes.
The HF `nl`/`tts` search includes models that explicitly omit Dutch in
their cards; those are marked ineligible below. Where a repository redirects to a
new owner, the current canonical owner is used.

The original desk-research phase downloaded no models or audio and ran no
inference. The subsequent local trial is recorded below; **no cloud
inference** was run. The earlier measurements in the [Sodalis baseline](tts-providers.md)
were on
M4 Max/128 GiB for a different MLX Voxtral TTS model and Piper, and an
i7-1355U laptop CPU for Piper, Chatterbox, and Parler. Those timings are
not measurements of these new models.

### Local Mac trial, 2026-10-23 (measured, not publisher claims)

Hardware: Apple M4 Max (`Mac16,5`), 128 GiB unified memory. Three local
engines ran **one at a time**, with one warm-up per voice; table rows are
single subsequent runs (not medians or a controlled quality study).
The *same four texts* were submitted to each engine:

| Prompt | Exact text |
| --- | --- |
| Dutch short | Goedemorgen, uw afspraak is morgen om half tien. |
| Dutch long | Goedemorgen, ik heb uw afspraak voor donderdag om half tien bevestigd. Het adres is Stationsstraat 24 in Utrecht. Laat het gerust weten als u liever een ander tijdstip kiest; dan bekijken we samen de mogelijkheden. |
| English short | Good morning, your appointment is tomorrow at nine thirty. |
| English long | Good morning, I have confirmed your appointment for Thursday at nine thirty. The address is 24 Station Street in Utrecht. Please let me know if another time would suit you better, and we can look at the available options together. |

For Audio8, a local Piper Ronnie/Kristin output of a **separate** matching
reference sentence and its exact transcript registered one synthetic voice
per language. Pocket cloned the same synthetic references directly rather
than fetching its predefined voice GGUFs, whose individual source rights
vary. Piper used `nl_NL-ronnie-medium` and `en_US-kristin-medium` (the
Ronnie card identifies CC0 training data; Kristin identifies public-domain
LibriVox recordings). This controls reference provenance, **not** perceived
voice quality: conditioning on Piper may influence the two newer models.
No real person's voice was cloned and no reference was sent to a remote
inference service.

First PCM measures request-to-first nonempty audio bytes (not the HTTP
headers); Piper's native iterator returns a sentence chunk, Audio8 uses its
NDJSON PCM stream, and Pocket its raw PCM HTTP stream. Total includes local
request overhead (Piper runs in-process); RTF = total synthesis seconds /
output audio seconds, lower is faster. Peak is sampled **process RSS** on
macOS, not a measurement of Metal GPU allocations or total unified memory.
Pocket's low RSS must not be interpreted as its total GPU-memory demand.

| Engine / prompt | First PCM | Total | Output | RTF | Peak process RSS |
| --- | ---: | ---: | ---: | ---: | ---: |
| Piper Ronnie / Dutch short | 51 ms | 0.06 s | 4.10 s | 0.014 | 0.31 GiB |
| Piper Ronnie / Dutch long | 66 ms | 0.23 s | 17.02 s | 0.014 | 0.37 GiB |
| Piper Kristin / English short | 54 ms | 0.06 s | 3.75 s | 0.016 | 0.26 GiB |
| Piper Kristin / English long | 63 ms | 0.19 s | 12.90 s | 0.015 | 0.27 GiB |
| Audio8 0.6B INT4 CPU / Dutch short | 582 ms | 7.54 s | 3.67 s | 2.054 | 2.32 GiB |
| Audio8 0.6B INT4 CPU / Dutch long | 640 ms | 72.65 s | 16.25 s | 4.470 | 3.58 GiB |
| Audio8 0.6B INT4 CPU / English short | 601 ms | 8.80 s | 3.53 s | 2.493 | 2.99 GiB |
| Audio8 0.6B INT4 CPU / English long | 830 ms | 108.72 s | 15.84 s | 6.865 | 3.06 GiB |
| Pocket Dutch Q8/Metal / Dutch short | 61 ms | 0.17 s | 4.00 s | 0.042 | 0.26 GiB |
| Pocket Dutch Q8/Metal / Dutch long | 13 ms | 0.46 s | 16.72 s | 0.027 | 0.27 GiB |
| Pocket English Q8/Metal / English short | 20 ms | 0.14 s | 3.36 s | 0.043 | 0.24 GiB |
| Pocket English Q8/Metal / English long | 14 ms | 0.35 s | 13.28 s | 0.026 | 0.26 GiB |

The full combined rows, including excluded warm-ups, are in local JSON
`~/tts-trials/{piper-nl,piper-en,audio8,pocket-nl,pocket-en}-results.json`.
These files and all weights/audio are **outside git**. The twelve scored WAVs
for listening are:

| Engine | Dutch short / long | English short / long |
| --- | --- | --- |
| Piper | `~/tts-trials/samples/piper-nl-short.wav`, `~/tts-trials/samples/piper-nl-long.wav` | `~/tts-trials/samples/piper-en-short.wav`, `~/tts-trials/samples/piper-en-long.wav` |
| Audio8 | `~/tts-trials/samples/audio8-nl-short.wav`, `~/tts-trials/samples/audio8-nl-long.wav` | `~/tts-trials/samples/audio8-en-short.wav`, `~/tts-trials/samples/audio8-en-long.wav` |
| Pocket | `~/tts-trials/samples/pocket-nl-short.wav`, `~/tts-trials/samples/pocket-nl-long.wav` | `~/tts-trials/samples/pocket-en-short.wav`, `~/tts-trials/samples/pocket-en-long.wav` |

All twelve WAVs have valid mono sample rates/durations (Piper 22,050 Hz,
Audio8 44,100 Hz, Pocket 24,000 Hz); signal level was checked for the
Dutch samples. These checks do **not** establish spoken-text correctness,
naturalness, or absence of hallucinations.

**Model size and setup.** The pinned Audio8 conversion
`818569c6b832118ad68d61bbd873abe250fcd68a` occupies ~968 MB
including its optional registration encoder; its runtime checkout was
`07e40f5`, Apache-2.0. The Piper voice ONNX files are 62.95 MB (Ronnie)
and 63.53 MB (Kristin), from the MIT-tagged voice repository at `v1.0.0`;
the installed `piper-tts==1.8.0` runtime declares GPL-3.0-or-later (keep it a separate
process if distribution is considered). Pocket's conversion
`b5a0115aee9658c110d747debb03edd548c4b9c7` is 138.50 MB for
each language's Q8 pack; C++ runtime `fab7972` is MIT with an MIT ggml
submodule. Its upstream weights at
`db04f0e653473e5c7333c69686ac92b7460b0c1d` are CC BY 4.0,
plus the upstream gated prohibited-use notice; model attribution applies.
No bundled Pocket voices were downloaded or redistributed.

Reproduction setup: clone the pinned Audio8 runtime outside git, install
`onnx_runtime/requirements.txt` plus `tokenizers==0.22.2` in Python 3.11,
download the pinned ONNX repository including `.onnx`, `.data`, manifests,
tokenizer and registration encoder, run `arktts_runtime.service:app` with
`ARKTTS_MODEL_DIR`/`ARKTTS_VOICES_DIR` and `ARKTTS_THREADS=5` on localhost,
register the local reference WAV and exact transcript at
`/api/voices/register`, then request `/api/tts/stream`. Install Piper
1.8.0 in a separate Python 3.11 venv and use `PiperVoice.synthesize`.
For Pocket, after HF approval of `kyutai/pocket-tts` on the **user's**
account, build the pinned C++ runtime with `-DGGML_METAL=ON`, download
the pinned Dutch and `english_2026-09` Q8 packs, start `tts-server` with
`--device MTL0` on localhost **separately per language**, register the
local WAV at `/v1/audio/voices`, and stream PCM from `/v1/audio/speech`.
The service log verified `Backend: MTL0` / `Apple M4 Max`; Audio8 health
reported `CPUExecutionProvider` for all three ONNX sessions. The exact
temporary harness and reference WAVs remain under `~/tts-trials/`.

Setup issues: the authenticated Pocket account initially returned
`requires approval` for upstream files; the user requested/accepted
access, then the Dutch tokenizer became downloadable. No terms were
accepted by the agent. `hf download --include` with explicit filenames
omitted Audio8's small `.onnx` graph files despite downloading their
`.data` blobs; the graph files were fetched explicitly before startup.
Pocket's CMake reported missing OpenMP but built and ran with Metal.

### Number normalisation is required before non-espeak TTS (measured)

In a single-listener check, the user preferred `pocket-nl` slightly over
Piper but heard "24" mispronounced in `pocket-nl-long`. Each sample was
transcribed locally with `whisper-cli -m ggml-large-v3-turbo-q8_0.bin -l
nl` (Whisper large-v3-turbo Q8). Piper uses espeak-ng phonemisation, which
expands digits into Dutch words. Pocket's
C++ frontend (`src/text-prep.h` at `fab7972`, a port of upstream
`text_chunking.py`) only replaces characters per pack, fixes punctuation,
case, and padding, and splits chunks. It treats digits only to avoid
splitting decimals and has **no number, date, or time expansion**. Audio8
received the same raw text. Rerunning with "24" written as `vierentwintig`
("half tien" unchanged), with the same seed 42 and the same Ronnie
reference, fixed both:

| Sample | Whisper transcript of the address phrase |
| --- | --- |
| `piper-nl-long.wav` (raw digits) | "stationsstraat 24" |
| `pocket-nl-long.wav` (raw digits) | "stationsstraat **wauwer**" |
| `audio8-nl-long.wav` (raw digits) | "Stassenstraat **64**" |
| `pocket-nl-long-normalized.wav` | "stationsstraat 24" |
| `audio8-nl-long-normalized.wav` | "Stassenstraat 24" |

Whisper writes the spoken "vierentwintig" back as "24", so this confirms
that the number is said correctly, but not how natural it sounds. The
English Pocket model read "24 Station Street" correctly from digits in
both trials, so this failure is specific to the Dutch pack. **Any Sodalis
path to Pocket, Audio8, or another non-espeak engine must normalise Dutch
numbers, dates, times, and amounts into words before synthesis.** The
same applies to abbreviations. Keep Piper's espeak path as a
reference, and add test prompts with house numbers, times, dates, and
amounts to the next listening round. Both normalised samples are under
`~/tts-trials/samples/`. Their timings come from a later session (see
below), so they are not compared with the table above.

### Female-voice rerun (measured, same session)

The user asked for a warmer female voice. Candidate Piper voice licences
were checked on each model card and dataset:

| Voice | Locale | Training data licence | Lineage / restriction | Used |
| --- | --- | --- | --- | --- |
| `nl_NL-mls-medium`, speaker id 10 (MLS speaker 12500) | nl_NL | MLS / OpenSLR 94, **CC BY 4.0** (attribution required: "Multilingual LibriSpeech", Pratap et al. 2020, and the LibriVox reader) | Trained from scratch | **Yes (Dutch)** |
| `en_US-ljspeech-medium` | en_US | LJ Speech, **public domain** | Trained from scratch | **Yes (English)** |
| `nl_BE-nathalie-medium` | nl_BE (Flemish) | CC0 | Fine-tuned from `lessac`, whose Blizzard 2013 data is under a **research licence** | No: Flemish, inherits restriction |
| `nl_NL-mls_5809-low`, `nl_NL-mls_7432-low` | nl_NL | CC BY 4.0 | Fine-tuned from `ryan` (RyanSpeech, **CC BY-NC-SA 4.0**) | No: NC lineage |
| `en_US-hfc_female-medium` | en_US | Hi-Fi-CAPTAIN, **CC BY-NC-SA 4.0** | n/a | No |
| `en_US-kristin-medium` (existing English baseline) | en_US | Public domain (LibriVox) | Trained from scratch | Already female |

MLS gender metadata (`metainfo.txt`) is shipped only inside the 23–86 GB
`mls_dutch` archives and was not downloaded. Instead, all 52 speakers
spoke the Dutch short prompt
(`~/tts-trials/samples/mls-candidates/mls-<id>-<mls speaker>.wav`) and
were screened by median F0 (35 were ≥ 165 Hz, a female range) and spectral
centroid as a rough warmth proxy, then by Whisper accuracy.
**The agent could not listen**, so "warmest" is a proxy-based provisional
choice; the user should audition the candidate folder.

Finding: `nl_NL-mls-medium` appends babble after the final word of the
short prompt in **every** female speaker tested. "half tien." became, for
example, "half ik ze zit" or "half twee", including with zero noise
scales. Mid-sentence "half tien" and "24" were correct in the long prompt.
Speaker 10 had the cleanest long transcript, but its words
("Adresse stationstraat", "tijdstuk") remain less accurate than Ronnie.

Timings were taken on the same M4 Max, but Pocket ran about 4–5× slower
than in the first session. Rerunning the original Ronnie reference in the
**same session** gave Dutch-long RTF 0.125 (vs 0.027 earlier) and
English-long 0.119. The difference is therefore machine state, not the
voice. Compare only within this table:

| Engine / prompt | First PCM | Total | Output | RTF | Peak RSS |
| --- | ---: | ---: | ---: | ---: | ---: |
| Piper MLS spk 10 / Dutch short | 48 ms | 0.05 s | 3.44 s | 0.016 | 0.26 GiB |
| Piper MLS spk 10 / Dutch long | 67 ms | 0.21 s | 13.82 s | 0.015 | 0.28 GiB |
| Piper MLS spk 10 / Dutch long, normalised | 72 ms | 0.29 s | 13.62 s | 0.021 | 0.29 GiB |
| Piper LJSpeech / English short | 66 ms | 0.07 s | 3.52 s | 0.021 | 0.25 GiB |
| Piper LJSpeech / English long | 88 ms | 0.27 s | 13.34 s | 0.020 | 0.27 GiB |
| Pocket Dutch Q8/Metal, female ref / Dutch short | 60 ms | 0.47 s | 2.96 s | 0.160 | 0.27 GiB |
| Pocket Dutch Q8/Metal, female ref / Dutch long | 59 ms | 1.84 s | 13.92 s | 0.132 | 0.27 GiB |
| Pocket Dutch Q8/Metal, female ref / Dutch long, normalised | 41 ms | 1.58 s | 13.28 s | 0.119 | 0.27 GiB |
| Pocket English Q8/Metal, female ref / English short | 40 ms | 0.46 s | 3.44 s | 0.134 | 0.24 GiB |
| Pocket English Q8/Metal, female ref / English long | 64 ms | 1.89 s | 14.40 s | 0.131 | 0.25 GiB |

The Dutch Pocket rows are from a second pass on the same server (the
first pass was within 0.01 RTF); English is one pass after a warm-up.
Piper output is not deterministic between runs. Pocket's female reference is a Piper output (`piper-female-{nl,en}-reference.wav`)
from the same chosen voices, so its rights follow those voices.
Whisper transcripts:

| Sample | Transcript (abridged where identical to the prompt) |
| --- | --- |
| `piper-female-nl-short.wav` | "Goedemorgen uw afspraak is morgen om half **ik ze zit**." |
| `piper-female-nl-long.wav` | "… **Adresse stationstraat** 24 … **geheust** … **tijdstuk** …" |
| `piper-female-nl-long-normalized.wav` | "… Zijn adres is **Thijsjonstraat** 24 … **tijdstik** …" |
| `pocket-female-nl-short.wav` | "Goedemorgen, uw afspraak is morgen om half tien." |
| `pocket-female-nl-long.wav` | "… Het adres is stationsstraat **Haal** in Utrecht …" |
| `pocket-female-nl-long-normalized.wav` | "… stationsstraat 24 … **Altijd** gerust weten …" |
| `piper-female-en-short.wav` / `pocket-female-en-short.wav` | Correct ("9.30" / "9:30") |
| `piper-female-en-long.wav` / `pocket-female-en-long.wav` | Correct, including "24 Station Street" |

Conclusion: the female MLS Piper voice is less intelligible than Ronnie.
Using it only as a short reference, Pocket kept the female timbre and
produced better Dutch text accuracy than Piper. Raw digits failed again
and were fixed by normalisation. One word in the normalised Pocket sample
("Laat het" heard as "Altijd") shows that single seeds still vary.
Results JSON is `~/tts-trials/{piper,pocket}-female-{nl,en}-results.json`.
There is no permissive, from-scratch **nl_NL** Piper voice with a confirmed
female speaker that is cleaner than this. A licensed female Dutch reference
recording would be the next step for Pocket.

### KittenTTS 2 (measured; licence accepted by the user for research/Sodalis)

[KittenTTS 2](https://huggingface.co/KittenML/kitten-tts-2) is a 1.7B
speech LM that emits S3 codec tokens. Those tokens are decoded at 24 kHz by
the MIT [Chatterbox-turbo](https://huggingface.co/ResembleAI/chatterbox-turbo)
`s3gen_meanflow` decoder. The model card lists 115 voices in 16 languages,
including Dutch, and says to pass `normalize=False` for non-English text
because the normaliser is tuned for English.

**Licence decision.** The user has decided that the
[Stellon Labs Community License](https://huggingface.co/KittenML/kitten-tts-2/blob/main/LICENSE.md)
("Last Updated: July 5, 2024") is acceptable for Sodalis and research. The
terms that matter, quoted from the licence:

- Purpose (preamble): free access is preserved "for people or organizations
  generating annual revenue of less than US $1,000,000 … and having received
  less than US $1,000,000 in total funding".
- §II, Research and non-commercial use: a "non-exclusive, worldwide,
  non-transferable, non-sublicensable, **revocable** and royalty-free
  limited license" to "use, reproduce, distribute, and create Derivative
  Works". This section has no revenue cap.
- §III, Commercial use: "You must register with Stellon Labs". If "You or
  Your Affiliate(s) … generate more than USD $1,000,000 in annual revenue …
  regardless of whether that revenue is generated directly or indirectly
  from the Stellon Labs Materials … or have received more than USD
  $1,000,000 in total cumulative funding (including equity, debt,
  convertible instruments, and grants …), any licenses granted to You under
  this Agreement shall terminate". A new licence is then at Stellon Labs'
  "sole discretion". Recipients of "an integrated end user product" are
  exempt from §III.
- §IV(a), Distribution and attribution: anyone who distributes the
  materials, a derivative, "or a product or service that uses any portion of
  them" must:
  1. provide a copy of the Agreement;
  2. keep a "Notice" text file containing "This Stellon Labs Model is
     licensed under the Stellon Labs Community License, Copyright © Stellon
     Labs Inc. All Rights Reserved"; and
  3. display "Powered by KittenML" on a related website, UI, blog post,
     about page or product documentation.
- §IV(b), Use restrictions:
  - Use must follow the documentation and an AUP that is "available by
    contacting us", so it is not public.
  - No model output may be used "to create or improve any foundational
    generative AI model".
  - No output may be used "to train, distill, or otherwise transfer the
    capabilities" to another model, except fine-tunes or LoRAs.

**Implications for Sodalis.**

- Sodalis's research use fits §II.
- TNO, with its affiliates and grants, almost certainly exceeds both $1M
  thresholds. Any commercial deployment would therefore need a separate,
  discretionary Stellon licence.
- A public Sodalis release or Docker image that bundles or auto-downloads
  the weights must ship the licence, a NOTICE file and "Powered by KittenML".
- Downstream users inherit the revocable, non-OSI terms. KittenTTS 2 is
  **not permissive** and cannot be described as such in the repository.
- The code is permissive: the `kittenml` package is Apache-2.0, the
  pyannote speaker model is MIT, and the decoder is MIT.
- The provenance and rights of the named reference voices are not
  documented.
- Grep found no Perth watermark call in `kittenml/kittentts2`, so the output
  appears to be unwatermarked.

**Setup.**

| Item | Value |
| --- | --- |
| Runtime | `kittenml[mlx]==0.9.6` (Python 3.11) |
| LM | MLX on the GPU, packed ternary weights |
| Decoder and speaker model | torch MPS |
| Weights | Pinned at `1f00fee`, ~1.0 GB (910 MB LM, 56 MB voices) |
| Decoder file | `s3gen_meanflow.safetensors`, 1.06 GB, pinned at `749d1c1` |
| Total download | ~2.1 GB |
| Sampling | Seed 42 |
| Dutch normaliser | `normalize=False` |
| English normaliser | `normalize=True` |

Setup failures and quirks:

- `hf download --include` skipped `config.json`, so it had to be fetched
  explicitly.
- The decoder downloads from the `main` branch of a third-party repository
  unless a pre-populated `cache_dir` is passed.

**Voices.** The publisher does not state gender or accent. Gender below is
estimated from median F0. The scripts look Netherlands Dutch, but nl_NL
versus nl_BE was **not verified by listening**.

| Voice | Median F0 | Likely gender |
| --- | ---: | --- |
| `DutchWeatherPresenter` (chosen) | 214 Hz | Female |
| `DutchBaker` | 203 Hz | Female |
| `DutchGrandpaStory` | 133 Hz | Male |
| `Maeve` (English, "warm storyteller", chosen) | 233 Hz | Female |

**Timings.** One pass, recorded under the same machine load as the female
rerun (Defender, Ollama and oMLX resident; load average ~11). The model
loaded in 10 s from a warm cache, or 65 s on first load. Chunking happens
at about 380 characters, so every prompt was a single chunk and **first
audio equals total time**. There is no intra-chunk streaming.

| Engine / voice / prompt | First audio = total | Audio | RTF | Peak RSS |
| --- | ---: | ---: | ---: | ---: |
| Weather presenter / nl-short | 5.52 s | 3.88 s | 1.42 | 2.49 GiB |
| Weather presenter / nl-long | 19.50 s | 15.64 s | 1.25 | 2.54 GiB |
| Weather presenter / nl-long-normalized | 21.89 s | 16.28 s | 1.34 | 2.59 GiB |
| Maeve / en-short | 6.83 s | 3.96 s | 1.73 | 2.68 GiB |
| Maeve / en-long | 28.40 s | 15.64 s | 1.82 | 2.70 GiB |
| Baker / nl-short | 11.46 s | 4.28 s | 2.68 | 2.49 GiB |
| Baker / nl-long | 24.07 s | 17.24 s | 1.40 | 2.54 GiB |
| Baker / nl-long-normalized | 35.62 s | 18.24 s | 1.95 | 2.59 GiB |

- Peak RSS excludes Metal/MPS allocations.
- Profiling the short prompt showed the autoregressive LM takes 3.6–4.5 s
  (~25 tokens/s, 94–104 tokens), while the decoder takes 0.6–1.4 s.
- Even on an idle machine, the LM rate keeps it near real time, and the
  whole reply must be generated before playback. That is one to two orders
  of magnitude slower than Piper or Pocket here.
- The card says the C++ `kitten-tts-2-cpp` GGUF path is faster on CPU; it
  was not tried.

**Whisper transcripts** (large-v3-turbo):

| Sample | Transcript |
| --- | --- |
| `kitten-nl-short.wav` | Exact match to the prompt |
| `kitten-nl-long.wav` | Exact, including "Stationsstraat **24**" from raw digits |
| `kitten-nl-long-normalized.wav` | Exact ("Stationsstraat 24") |
| `kitten-baker-nl-short.wav` | Exact match to the prompt |
| `kitten-baker-nl-long.wav` | "… **Stationstraat 44** …" from raw "24"; otherwise correct |
| `kitten-baker-nl-long-normalized.wav` | Exact match to the prompt |
| `kitten-en-short.wav` | Correct ("9:30") |
| `kitten-en-long.wav` | Correct, including "24 Station Street" |

Conclusions:

- KittenTTS 2 gave the **most accurate Dutch transcripts of any engine
  tested**. The weather presenter even read the raw "24" correctly, but
  Baker read it as "44", so text normalisation is still required.
- It is **not interactive**: 5–28 s per reply with no streaming, against
  sub-second times for Pocket.
- Its licence is non-permissive and revocable, and commercial use above $1M
  revenue or funding is excluded.

Use it as a quality reference or an offline/pre-rendered option, not as
Sodalis's live voice, unless the C++ path or an idle machine is shown to
reach RTF < 0.3. The results JSON files are
`~/tts-trials/kitten-results.json` and `~/tts-trials/kitten-baker-results.json`.
The audio is in `~/tts-trials/samples/kitten-*.wav`.

### VibeVoice-Realtime-0.5B (research-only trial; not eligible for Sodalis)

[VibeVoice-Realtime-0.5B](https://huggingface.co/microsoft/VibeVoice-Realtime-0.5B)
was checked at revision `6bce5f06044837fe6d2c5d7a71a84f0416bd57e4`, with
code at [microsoft/VibeVoice](https://github.com/microsoft/VibeVoice)
`16fb2cb1217c9934a886e1948ffb06120caa2df5`. The card's research-only
terms were reported first. **The user then explicitly accepted them for a
local listening trial only.** The results below are research-only. They do
not make VibeVoice eligible for Sodalis.

**Licence and terms**

- The weights' metadata and the code are MIT. However, under "Direct
  intended uses" the card says: "The VibeVoice-Realtime model is limited to
  research purposes". Under "Recommendations" it says: "We do not recommend
  using VibeVoice in commercial or real-world applications without further
  testing and development. This model is intended for research and
  development purposes only."
- The out-of-scope list says the release is "not intended or licensed" for:
  - voice impersonation without recorded consent;
  - disinformation;
  - real-time or low-latency voice conversion;
  - circumventing its "watermarking and other transparency mechanisms";
  - "any act of reverse engineering, modification …";
  - unsupported (non-English) languages. The card says non-English outputs
    are "unsupported and may be unintelligible or inappropriate".
- **Disclaimer and watermark (card claim):** an audible disclaimer (for
  example "This segment was generated by AI") is embedded "automatically
  into every synthesized audio file", along with an imperceptible
  watermark. See the measured finding below.

**Voices**

- The voices are pre-computed embeddings (`.pt`). The acoustic tokenizer was
  removed, so the model cannot clone a voice from a reference recording.
  Loading it logs the missing acoustic-tokenizer *encoder* weights as
  "newly initialized"; that is expected, because the presets bypass it.
- At `16fb2cb` the repository tracks `nl-Spk0_man.pt`, `nl-Spk1_woman.pt`
  and `en-Emma_woman.pt` in `demo/voices/streaming_model/` (gender from the
  filename only). The non-English presets are labelled "experimental".
- No speaker source, consent, accent or licence is documented for any
  preset beyond the repository's MIT licence. Whether `nl-Spk1_woman`
  sounds nl_NL or nl_BE is **not judged here**; the user must listen.

**Local trial, 2026-10-23 (measured, research-only)**

Setup, all outside git:

- Code at `~/tts-trials/runtime/vibevoice`, Python 3.11 venv with
  `pip install -e '.[streamingtts]'` (pins transformers 4.51.3).
- Weights at `~/tts-trials/models/vibevoice`: `model.safetensors`
  2,035,332,888 bytes (fp32), plus `config.json` and
  `preprocessor_config.json`. The processor also loads the
  `Qwen/Qwen2.5-0.5B` tokenizer (Apache-2.0) from the HF cache.
- **Setup failure:** with the unpinned torch 2.14.1, the upstream preset
  loader (`torch.load(..., weights_only=True)` with the documented safe
  globals) fails with `UnpicklingError`. Pinning `torch==2.7.1` and
  `torchaudio==2.7.1` fixed it without using `weights_only=False`.
- Harness `~/tts-trials/vibevoice_trial.py`: the upstream demo's
  defaults (MPS, float32, SDPA, 5 DDPM steps, `cfg_scale` 1.5, greedy
  decoding, `refresh_negative=True`), streamed through the upstream
  `AudioStreamer`. The output was written unchanged as 24 kHz PCM16; no
  disclaimer, watermark or other post-processing was added or removed.
- One warm-up per voice was discarded. The machine was loaded (Ollama,
  oMLX and Defender resident; load average about 7), so the timings are
  pessimistic. Peak RSS was sampled every 50 ms in-process and **excludes
  MPS GPU memory**. `/usr/bin/time -l` reported a whole-run peak memory
  footprint of 11.2 GB, including the model load.

| Voice | Prompt | First audio | Total | Audio | RTF | Peak RSS | Whisper large-v3-turbo transcript |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| `nl-Spk1_woman` | nl-short | 0.23 s | 7.68 s | 3.20 s | 2.40 | 3.30 GB | "Goedemorgen, uw afspraak is morgen om half tien." |
| `nl-Spk1_woman` | nl-long (raw "24") | 0.22 s | 66.59 s | 15.87 s | 4.20 | 3.40 GB | "… Het adres is stationstraat 24 in Utrecht. Laat het gerust weten als u liever een ander tijdstip kiest, dan bekijken we samen de mogelijkheden." |
| `nl-Spk1_woman` | nl-long-normalized | 0.32 s | 58.97 s | 13.73 s | 4.29 | 3.44 GB | "… Het adres is **Tassonstraat** 24 in Utrecht. …" (rest correct) |
| `en-Emma_woman` | en-short | 0.90 s | 17.29 s | 4.00 s | 4.32 | 3.64 GB | "Good morning. Your appointment is tomorrow at 9.30." |
| `en-Emma_woman` | en-long | 0.44 s | 62.41 s | 15.47 s | 4.04 | 3.65 GB | Exact apart from digit formatting ("9.30", "24 Station Street"). |

Findings:

- **Accuracy:** VibeVoice read the raw "24" correctly in Dutch, unlike
  Pocket and Audio8. This is presumably because its Qwen2.5 language model
  handles digits. In the normalised run, Whisper heard "Tassonstraat"
  instead of "Stationsstraat"; greedy decoding is deterministic per
  prompt, so this is a text-dependent error, not noise. Small Whisper
  differences ("stationstraat", "9.30") are formatting only.
- **Speed:** first audio arrives quickly (0.22–0.9 s), but generation ran
  at **RTF 2.4–4.3**. That is far slower than real time and far from the
  publisher's real-time claim on an M4 Pro. The stream would stall after
  the first chunk. This was MPS fp32 under load; an idle rerun might be
  faster, but not by the 4× needed.
- **Disclaimer:** **no audible AI disclaimer appears** in any output.
  The transcripts contain only the prompt text, and the durations
  (3.2–15.9 s) match the prompts with no appended segment. A grep of the
  open-source `vibevoice` package found no disclaimer or watermark code,
  so the card's "automatically embedded" disclaimer and watermark appear
  to come from a pipeline that is not in this repository. Nothing was
  removed or bypassed. Watermark presence was not checked (no detector
  is published).
- **Comparison with the Pocket selection:** the selected Pocket sample
  (`pocket-female-nl-long-normalized.wav`) took 1.58 s for 13.28 s of audio
  (RTF 0.119, first PCM 41 ms) under the same load. VibeVoice took 58.97 s
  for the same normalised text, about 36× slower, and still made a
  word error. Its raw-digit handling is the only measured advantage. It
  does not clearly beat Pocket, and its terms exclude it anyway. **Pocket
  remains the selection.**

Samples, outside git, for listening:

- `~/tts-trials/samples/vibevoice-nl-short.wav`
- `~/tts-trials/samples/vibevoice-nl-long.wav`
- `~/tts-trials/samples/vibevoice-nl-long-normalized.wav`
- `~/tts-trials/samples/vibevoice-en-short.wav`
- `~/tts-trials/samples/vibevoice-en-long.wav`

The raw results are in `~/tts-trials/vibevoice-results.json`.

**Status**

- **Excluded for Sodalis.** Microsoft states research-only use, Dutch is
  out of scope, and the preset voices have no documented provenance.
- Research listening only. Pocket TTS remains the selection.

## Results

### Popularity and eligibility snapshot

The rows sample high-trending models, recently updated Mac-relevant
candidates, and misleading Dutch tags rather than reproducing every search
result or claiming a stable trending order. Downloads,
likes, and modification dates below are from the model's public API at the
research date (not an independently reproducible fixed-time snapshot).

| Model | Downloads / likes | Last updated (UTC) | Dutch / English, license of weights | Mac or speed evidence | Verdict |
| --- | ---: | --- | --- | --- | --- |
| [Higgs TTS 3 4B](https://huggingface.co/bosonai/higgs-tts-3-4b) | 122,455 / 815 | 2026-09-04 | Both; **Boson research/non-commercial** license; creator grant for content does not license embedding in Sodalis | Card claims expressive speech, but no comparable Mac timing | **Exclude** for product use |
| [Voxtral 4B TTS](https://huggingface.co/mistralai/Voxtral-4B-TTS-2603) | 1,569 / 942 | 2026-03-31 | Both; **CC BY-NC 4.0** due to reference voices | Publisher's 70 ms figure is on an NVIDIA H200, not a Mac | **Exclude**, including [GGUF conversion](https://huggingface.co/cstr/voxtral-4b-tts-GGUF) (1,431 / 5; 2026-08-02) |
| [Parler-TTS Mini Multilingual v1.1](https://huggingface.co/parler-tts/parler-tts-mini-multilingual-v1.1) | 5,651 / 60 | 2024-12-04 | Both; **Apache-2.0** model; Dutch `Mark` voice | Sodalis measured **152 s median** over five short replies on laptop CPU; Mac GPU/MPS unmeasured | Eligible, not interactive on measured CPU |
| [MOSS-TTS Local Transformer v1.5](https://huggingface.co/OpenMOSS-Team/MOSS-TTS-Local-Transformer-v1.5) | 114,703 / 74 | 2026-06-18 | Both explicitly listed; **Apache-2.0** card and separately [Apache-2.0 audio tokenizer](https://huggingface.co/OpenMOSS-Team/MOSS-Audio-Tokenizer-v2) | 48 kHz stereo, large tokenizer; setup pins CUDA PyTorch and uses remote code; no verified MLX/Metal runtime or Mac speed | Conditional, lower priority |
| [Audio8 TTS Preview 0.6B](https://huggingface.co/Edge0/Audio8-TTS-Preview-0.6b) | 4,586 / 417 | 2026-08-19 | Both among 11 recommended; **Apache-2.0** code and weights with NOTICE | [Publisher ONNX INT4](https://huggingface.co/Edge0/Audio8-TTS-Preview-0.6B-ONNX-INT4) (760 / 55; 2026-08-02) tested on macOS arm64 CPU, ~1.1–1.2 GiB synthesis RSS claimed on M2; see measured M4 figures above | Trialed; too slow to complete these replies |
| [Pocket TTS GGUF](https://huggingface.co/Serveurperso/pocket-tts-GGUF) | 2,309 / 2 | 2026-09-27 | Separate Dutch and English packs; original **CC BY 4.0**, runtime **MIT**; gated terms accepted for this account, voice rights vary | Community [`pockettts.cpp`](https://github.com/ServeurpersoCom/pockettts.cpp) with Metal, Q8 Dutch pack 138 MB, HTTP PCM streaming; see measured M4 figures above | Trialed; first quality-listening candidate |
| [KittenTTS 2](https://huggingface.co/KittenML/kitten-tts-2) | 46,417 / 168 | 2026-10-22 | Both; weights under **Stellon Labs Community License**, which ends free commercial use at the specified revenue/funding limits; loader Apache-2.0 | Publisher reports CPU/Apple Silicon speed but no unrestricted weight grant; measured locally: best Dutch accuracy, RTF 1.3–1.8 | **Research only** (user-accepted); not permissive, commercial use needs a Stellon licence |
| [VibeVoice-Realtime-0.5B](https://huggingface.co/microsoft/VibeVoice-Realtime-0.5B) | 298,953 / 1,306 | 2025-12-12 | English; Dutch "experimental" and out of scope per card; MIT metadata, but card limits use to **research**; card claims an audible AI disclaimer and watermark (no audible disclaimer in local output) | Measured on M4 Max MPS under load: first audio 0.22–0.9 s, RTF 2.4–4.3 (publisher claims real-time on M4 Pro) | **Exclude** for Sodalis; research-only listening trial done with user consent |
| [Audio8 0.1B ONNX INT8](https://huggingface.co/Edge0/audio8-TTS-0.1B-ONNX-INT8) | 810 / 76 | 2026-08-28 | Conversion claims both and **Apache-2.0**, but [source 0.1B weights](https://huggingface.co/Edge0/Audio8-TTS-Preview-0.1b) are **Audio8 Community License**, with a $2m revenue cap; original card does **not** list Dutch | Conversion says macOS arm64 tested, ~0.6 GB loaded; no Dutch quality evidence | **Exclude** pending explicit upstream relicense and Dutch validation |
| [Qwen3-TTS CustomVoice](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice) | 1,938,636 / 2,163 | 2026-01-29 | Apache-2.0, but card's 10 supported languages **omit Dutch** | Claimed 97 ms latency cannot establish Dutch support | **Exclude** despite HF filter match |
| [MOSS-TTS Nano 100M](https://huggingface.co/OpenMOSS-Team/MOSS-TTS-Nano-100M) | 114,273 / 244 | 2026-04-13 | Card's 20-language list **omits Dutch** despite search metadata | CPU/streaming claims not relevant without Dutch support | **Exclude** |

Other large MOSS v1.5 releases (including
[8B MOSS-TTS-v1.5](https://huggingface.co/OpenMOSS-Team/MOSS-TTS-v1.5),
105,227 downloads / 214 likes, updated 2026-05-26; and
[LAION's 8B voice-acting fine-tune](https://huggingface.co/laion/moss-tts-v1.5-8b-voice-acting),
183 / 3, updated 2026-07-14) claim Dutch via the v1.5 family and
Apache-2.0 licensing, but do not offer verified Mac speed or a better
hardware fit than the smaller Local Transformer. Their audio tokenizer,
reference recordings, and finetune files need separate checks before
redistribution. Popularity does not imply the model runs on Metal.

### Quality and speed evidence that actually applies

- **Audio8 0.6B:** Publisher's unquantized model card reports English
  Seed-TTS WER 1.506% and English CV3 WER 3.128%; neither table gives Dutch
  WER. A recognizer's WER measures intelligibility, not pleasantness or
  latency. ONNX INT4 can change generation; there is no quantitative
  0.6B INT4 Dutch listening comparison. Locally measured first-audio and
  completion timings appear above; the ONNX
  runtime documents `/api/tts` (WAV), `/api/tts/stream` (newline-delimited
  JSON with base64 44.1 kHz PCM chunks), and `/api/tts/cancel`.
- **Pocket TTS:** Kyutai reports roughly 200 ms first chunk and 6x faster
  than real time on M4 MacBook Air using two CPU cores, but the original
  model card's main takeaways do not name Dutch (a third-party GGUF project
  supplies the Dutch pack). Our measured GGUF/Metal results above are not
  measurements of Kyutai's Python runtime. It lists separate voice origins with CC0,
  CC BY 4.0, and CC BY-NC 4.0; **do not indiscriminately redistribute
  predefined voices**. The GGUF server's `response_format: "pcm"` is raw
  s16le as generated; its `"wav"` returns a complete file.
- **MOSS v1.5:** Language tags are recommended to prevent multilingual
  regressions. The Local Transformer card documents SGLang-Omni streaming
  raw 48 kHz PCM, but the documented installation is CUDA-focused. An
  "OpenAI-compatible" `/v1/audio/speech` endpoint does not supply a
  Sodalis adapter, Mac acceleration, or known barge-in semantics.
- **Baseline:** Piper Ronnie made 5.6% Parakeet round-trip WER and 0.48 s
  median synthesis on the laptop CPU (50 Dutch sentences). The existing
  listener rated it 5/10. Native M4 Max Piper timing in the baseline
  used **Nathalie**, not Ronnie; no Ronnie M4 median can be inferred.
  Chatterbox V3 was liked on five sentences but took 38.69 s median on
  laptop CPU. These are not matched comparisons to Audio8/Pocket.

## Analysis

**Next-stage priority, informed by the local speed trial (subject to license
and listening):**

1. Pocket TTS **Dutch** GGUF Q8/Metal: fastest new candidate on this Mac,
   with a user-approved HF gate, CC BY weights plus prohibited-use terms,
   and ungraded Dutch/English output. Do not bundle its mixed-rights
   predefined voices; preserve attribution and assess quality first.
2. Piper Ronnie: measured faster still, with the known 5/10 listener
   baseline; its GPL runtime is a separate product-distribution decision.
3. Audio8 **0.6B** ONNX INT4: Apache code and weights, documented arm64
   service/PCM/cancellation, but slow completion and high RSS in this trial.
   The first chunk arrives quickly enough to audition, not to recommend
   interactive synthesis on this CPU setup.
4. Chatterbox Multilingual V3: MIT code/weights and encouraging prior
   Dutch listening, but no usable CPU latency and MPS performance unknown.
5. MOSS Local Transformer v1.5: eligible Apache model and tokenizer with
   Dutch and English, but much larger and a CUDA-centric documented path.
6. Parler-TTS: eligible and Dutch-intelligible in the prior test, but the
   measured laptop CPU latency is unacceptable for conversation.

This is a **speed-informed listening priority**, not a ranking by perceived
voice quality. Neither Audio8 nor Pocket has been listened to or scored by
the Sodalis owner. Keep Piper in the deployment until a candidate wins a matched
Dutch/English corpus review and meets the latency/cancellation bar.

An adapter should accept Sodalis's server-side text and voice selection,
decode Audio8's NDJSON/base64 or Pocket's raw PCM incrementally, resample
44.1/24 kHz mono to Sodalis's required PCM format, and propagate a cancelled
request to actual inference. The published endpoints **are not drop-in
replacements** for Sodalis's `/api/speech/tts`, even when labeled
OpenAI-compatible. For Audio8, an independent cancel endpoint plus
serialized inference needs a test showing that disconnect/cancel actually
releases capacity; for Pocket, test server cancellation and concurrency.
No browser-to-host access, cloud fallback, or bundled model weights is
proposed. If Compose reaches a host service, bind/expose only the intended
interface and authenticate it; do not expose an unauthenticated host-wide
TTS endpoint.

## Limitations

- Four fixed bilingual prompts per engine, one measured run each; no
  blind listening, local STT/word-error scoring, repeated-run distribution,
  cancellation/concurrency checks, or licensing opinion from counsel.
  Reported synthesis speed is not a Dutch intelligibility or quality score.
- HF counters and cards are mutable. A `language:nl` tag can disagree with
  the model card (Qwen3-TTS, MOSS Nano, Audio8 0.1B original), and a later
  conversion can advertise a different license from its source weights.
- Published English/Chinese WER, GPU results, and prior-model timings do
  not establish Dutch naturalness; use this trial's first-PCM figures
  only for this hardware, runtime revision, and reference.
- Voice cloning requires permission from the recorded speaker and
  verification of the particular reference recording's license; a
  permissive model weight license alone does not grant voice rights.
- Pocket's upstream gate was accepted by the user for this account, not
  by the agent. The gated prohibited-use terms need review before
  **distribution**; another user may require separate approval. CC BY 4.0
  requires attribution and is not an OSI software license.
- Audio8 0.6B ONNX is a publisher conversion, but its license statement
  should still be checked at a pinned revision with the exact codec,
  tokenizer and bundled reference assets before any redistribution.

## Open items

1. Have the owner listen to the twelve saved samples *blindly* and rate
   Dutch/English naturalness, pronunciation, voice stability and
   missing/extra words. Then repeat on the 50-sentence Dutch corpus,
   including names/numbers, with repeated warm/cold measurements and a
   permissively sourced reference that does not anchor the contenders to
   Piper's timbre. Consider Pocket's 24-layer variant only if Q8 quality
   falls short; its speed/rights still need checking.
2. Score the *actual* quantized output with Parakeet round-trip WER (the
   existing automatic gates: median synthesis <=1.5 s and Dutch WER <=10%)
   and a blind, same-sentence human listening review. Compare Mac hardware
   and both 18–74-character and long responses through the public Sodalis
   TTS API before replacing Ronnie.
3. Check stop/cancel after synthesis begins, stream chunk cadence, memory
   under concurrent requests, hot restart, and serialization. Confirm
   error signaling rather than success-shaped empty audio.
4. Pin and review the selected model, conversion, decoder/codec, voice
   source, NOTICE, and any third-party runtime licenses. For Pocket, ensure
   each downloader has upstream approval, preserve the CC BY attribution,
   and select a voice reference without NC restrictions; otherwise leave
   it evaluation-only.
5. Add a Dutch text normaliser (numbers, house numbers, times, dates,
   amounts, abbreviations) in front of non-espeak engines and re-test
   Pocket with it. Source a consented, permissively licensed female nl_NL
   reference recording if the MLS-derived reference is not warm enough.
6. Rerun the timings for all engines with Ollama, oMLX and Defender idle.
   For KittenTTS 2:
   - try the C++ GGUF path and the `student_w4` decoder;
   - have the user confirm the voices' gender and accent (nl_NL or nl_BE)
     by listening; and
   - obtain the AUP and the voice provenance before any public release.

## Primary sources

- [HF Dutch TTS search](https://huggingface.co/models?language=nl&sort=trending&search=tts)
  and each linked publisher model card in the table.
- [Audio8 0.6B source model](https://huggingface.co/Edge0/Audio8-TTS-Preview-0.6b),
  [publisher's ONNX INT4 release](https://huggingface.co/Edge0/Audio8-TTS-Preview-0.6B-ONNX-INT4),
  [actual service protocol](https://github.com/Edge0-AI/Audio8_TTS/tree/master/onnx_runtime),
  [runtime LICENSE](https://github.com/Edge0-AI/Audio8_TTS/blob/master/LICENSE)
  and [NOTICE](https://github.com/Edge0-AI/Audio8_TTS/blob/master/NOTICE).
- [Audio8 0.1B source custom license](https://huggingface.co/Edge0/Audio8-TTS-Preview-0.1b/blob/main/LICENSE)
  versus [0.1B INT8 conversion card](https://huggingface.co/Edge0/audio8-TTS-0.1B-ONNX-INT8).
- [Pocket GGUF model/pack terms](https://huggingface.co/Serveurperso/pocket-tts-GGUF),
  [Pocket C++ runtime and HTTP protocol](https://github.com/ServeurpersoCom/pockettts.cpp),
  [Kyutai model card](https://huggingface.co/kyutai/pocket-tts),
  and [individual reference-voice licenses](https://huggingface.co/kyutai/tts-voices).
- [MOSS Local v1.5 model](https://huggingface.co/OpenMOSS-Team/MOSS-TTS-Local-Transformer-v1.5),
  [audio tokenizer](https://huggingface.co/OpenMOSS-Team/MOSS-Audio-Tokenizer-v2),
  and [source license](https://github.com/OpenMOSS/MOSS-TTS/blob/main/LICENSE).
- [Higgs TTS 3 license](https://huggingface.co/bosonai/higgs-tts-3-4b/blob/main/LICENSE),
  [Voxtral TTS license](https://huggingface.co/mistralai/Voxtral-4B-TTS-2603),
  and [KittenTTS 2 weight license](https://huggingface.co/KittenML/kitten-tts-2/blob/main/LICENSE.md).
- [KittenTTS 2 model card](https://huggingface.co/KittenML/kitten-tts-2),
  [kittenml package (Apache-2.0)](https://pypi.org/project/kittenml/),
  and [Chatterbox-turbo decoder card (MIT)](https://huggingface.co/ResembleAI/chatterbox-turbo).
