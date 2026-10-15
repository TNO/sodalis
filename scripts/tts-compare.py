#!/usr/bin/env python3
"""Generate, review, and score Dutch TTS listening samples; no voice cloning.

Only the explicitly selected `azure` backend calls a cloud service, and only
when AZURE_TTS_KEY is set.
"""

import argparse
import html
import json
import os
import re
import statistics
import subprocess
import sys
import threading
import time
import urllib.parse
import urllib.request
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SENTENCES = json.loads((ROOT / "scripts/tts-sentences.json").read_text(encoding="utf-8"))
BACKENDS = ("piper", "fish", "voxtral", "kugelaudio", "chatterbox", "mms", "parler", "azure")
PIPER_VOICES = (
    "nl_BE-nathalie-medium", "nl_BE-nathalie-x_low", "nl_BE-rdh-medium", "nl_BE-rdh-x_low",
    "nl_NL-mls-medium", "nl_NL-mls_5809-low", "nl_NL-mls_7432-low", "nl_NL-pim-medium",
    "nl_NL-ronnie-medium",
)
PIPER_RELEASE = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/nl"
MMS_MODEL = "facebook/mms-tts-nld"
PARLER_MODEL = "parler-tts/parler-tts-mini-multilingual-v1.1"
# Mark is the Dutch speaker with by far the most training data in the model card.
PARLER_DESCRIPTION = ("Mark's voice is clear and calm, with a moderate speed and pitch, in a very "
                      "close recording that has almost no background noise.")
VOICES = {"piper": PIPER_VOICES[0], "fish": "unconditioned",
          "voxtral": "nl_female", "kugelaudio": "warm",
          "chatterbox": "multilingual-v3 built-in voice, nl",
          "mms": MMS_MODEL, "parler": f"{PARLER_MODEL}, Mark", "azure": None}
DEVICES = {"piper": "CPU", "fish": "MPS (verify server log)", "voxtral": "Metal/MLX",
           "kugelaudio": "Metal/MLX", "chatterbox": "CPU", "mms": "CPU", "parler": "CPU",
           "azure": "Azure AI Speech (cloud)"}
MAX_MEDIAN_SECONDS = 1.5
MAX_WER = 0.10
# Greeting, apology, choice question, time/number, and long sentence; five more come from WER.
FIXED_REVIEW_KEYS = ("01", "10", "24", "30", "42")
REVIEW_SIZE = 10
FLAGS = ("missing/extra words", "mispronunciation", "truncation", "artifacts", "wrong language/accent")


def run_name(backend, voice):
    return backend if voice == VOICES[backend] or backend == "azure" else f"{backend}-{voice}"


def piper_voice_urls(voice):
    locale, name, quality = voice.split("-")
    base = f"{PIPER_RELEASE}/{locale}/{name}/{quality}/{voice}.onnx"
    return {f"{voice}.onnx": base, f"{voice}.onnx.json": f"{base}.json"}


def ensure_piper_voice(voice, directory=ROOT / "models/piper"):
    directory.mkdir(parents=True, exist_ok=True)
    for name, url in piper_voice_urls(voice).items():
        target = directory / name
        if target.exists() and target.stat().st_size:
            continue
        print(f"Downloading {name}", flush=True)
        partial = target.with_name(target.name + ".part")
        with urllib.request.urlopen(url, timeout=300) as response, partial.open("wb") as output:
            while chunk := response.read(1 << 20):
                output.write(chunk)
        partial.replace(target)
    return directory / f"{voice}.onnx"


def azure_config(environ):
    """Return Azure settings, or None when no key is configured (the run is then skipped)."""
    key = environ.get("AZURE_TTS_KEY", "").strip()
    if not key:
        return None
    url = environ.get("AZURE_TTS_URL", "").strip()
    voice = environ.get("AZURE_TTS_VOICE", "").strip()
    parts = urllib.parse.urlsplit(url)
    if (parts.scheme != "https" or parts.username or parts.password or parts.fragment
            or not parts.path.endswith("/cognitiveservices/v1")):
        raise ValueError("AZURE_TTS_URL must be an HTTPS Azure TTS /cognitiveservices/v1 endpoint.")
    if not re.fullmatch(r"nl-(?:NL|BE)-[A-Za-z0-9]+Neural", voice):
        raise ValueError("AZURE_TTS_VOICE must name a Dutch Azure neural voice.")
    return {"url": url, "key": key, "voice": voice}


def azure_ssml(text, voice):
    return (f'<speak version="1.0" xml:lang="{voice[:5]}"><voice name="{voice}">'
            f"{html.escape(text, quote=True)}</voice></speak>")


def write_wav(path, pcm, rate):
    if not pcm or len(pcm) % 2:
        raise ValueError(f"Empty or incomplete PCM for {path}")
    with wave.open(str(path), "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(int(rate))
        audio.writeframes(pcm)


def torch_pcm(samples):
    import torch

    return (samples.reshape(-1).float().clamp(-1, 1) * 32767).round().to(torch.int16).cpu().numpy().tobytes()


def synthesizer(args):
    if args.backend == "piper":
        from piper.voice import PiperVoice

        voice = PiperVoice.load(str(ensure_piper_voice(args.voice)))

        def synthesize(text, path):
            with wave.open(str(path), "wb") as audio:
                voice.synthesize_wav(text, audio)

        return synthesize

    if args.backend in ("chatterbox", "mms", "parler"):
        import torch

        if args.backend == "chatterbox":
            from chatterbox.mtl_tts import ChatterboxMultilingualTTS

            model = ChatterboxMultilingualTTS.from_pretrained(device="cpu", t3_model="v3")

            def generate(text):
                return model.generate(text, language_id="nl")[0], model.sr
        elif args.backend == "mms":
            from transformers import AutoTokenizer, VitsModel

            model = VitsModel.from_pretrained(MMS_MODEL).eval()
            tokenizer = AutoTokenizer.from_pretrained(MMS_MODEL)

            def generate(text):
                return model(**tokenizer(text, return_tensors="pt")).waveform[0], model.config.sampling_rate
        else:
            from parler_tts import ParlerTTSForConditionalGeneration
            from transformers import AutoTokenizer

            model = ParlerTTSForConditionalGeneration.from_pretrained(PARLER_MODEL).eval()
            tokenizer = AutoTokenizer.from_pretrained(PARLER_MODEL)
            description = AutoTokenizer.from_pretrained(model.config.text_encoder._name_or_path)(
                PARLER_DESCRIPTION, return_tensors="pt")

            def generate(text):
                prompt = tokenizer(text, return_tensors="pt")
                return (model.generate(input_ids=description.input_ids,
                                       attention_mask=description.attention_mask,
                                       prompt_input_ids=prompt.input_ids,
                                       prompt_attention_mask=prompt.attention_mask)[0],
                        model.config.sampling_rate)

        def synthesize(text, path):
            torch.manual_seed(0)
            with torch.inference_mode():
                samples, rate = generate(text)
            write_wav(path, torch_pcm(samples), rate)

        return synthesize

    if args.backend == "azure":
        config = azure_config(os.environ)

        def synthesize(text, path):
            request = urllib.request.Request(config["url"], azure_ssml(text, config["voice"]).encode(), {
                "Ocp-Apim-Subscription-Key": config["key"],
                "Content-Type": "application/ssml+xml",
                "X-Microsoft-OutputFormat": "raw-22050hz-16bit-mono-pcm",
                "User-Agent": "Sodalis",
            })
            with urllib.request.urlopen(request, timeout=args.timeout) as response:
                write_wav(path, response.read(), 22050)

        return synthesize

    if args.backend == "fish":
        def synthesize(text, path):
            request = urllib.request.Request(
                args.fish_url.rstrip("/") + "/v1/tts",
                json.dumps({"text": text, "format": "wav", "streaming": True,
                            "max_new_tokens": 512}).encode(),
                {"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(request, timeout=args.timeout) as response:
                header = response.read(44)
                if header[:4] != b"RIFF" or header[8:12] != b"WAVE":
                    raise ValueError("Fish returned an invalid WAV header")
                pcm = response.read()
            if not pcm:
                raise ValueError("Fish returned no PCM")
            with wave.open(str(path), "wb") as audio:
                audio.setnchannels(1)
                audio.setsampwidth(2)
                audio.setframerate(int.from_bytes(header[24:28], "little"))
                audio.writeframes(pcm)

        return synthesize

    if not args.tts_mlx_root:
        raise ValueError("--tts-mlx-root is required for MLX backends")
    sys.path.insert(0, str(Path(args.tts_mlx_root).resolve() / "src"))
    if args.backend == "voxtral":
        from server_voxtral import RealVoxtralEngine

        engine = RealVoxtralEngine()
        voice = VOICES[args.backend]

        def synthesize(text, path):
            engine.synthesize(text, voice, str(path))

        return synthesize

    from server_kugelaudio import RealKugelAudioEngine

    engine = RealKugelAudioEngine()

    def synthesize(text, path):
        engine.synthesize(text, VOICES[args.backend], str(path), language="nl")

    return synthesize


def audio_info(path):
    with wave.open(str(path), "rb") as audio:
        frames, rate, channels = audio.getnframes(), audio.getframerate(), audio.getnchannels()
        if not frames or not rate or channels != 1:
            raise ValueError(f"Invalid mono WAV: {path} ({frames} frames, {rate} Hz, {channels} channels)")
        return round(frames / rate, 3), rate


def gpu_memory():
    if sys.platform != "darwin":
        return None
    import mlx.core as mx
    return round(mx.get_peak_memory() / 1024**3, 3)


def process_peak(pid, action):
    if not pid:
        import resource

        action()
        # ru_maxrss is bytes on macOS and KiB on Linux.
        peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        return round(peak / (1024**3 if sys.platform == "darwin" else 1024**2), 3)

    stop = threading.Event()
    values = []

    def sample():
        while not stop.is_set():
            result = subprocess.run(["ps", "-o", "rss=", "-p", str(pid)],
                                    capture_output=True, text=True, check=True)
            values.append(int(result.stdout.strip()))
            stop.wait(0.2)

    thread = threading.Thread(target=sample, daemon=True)
    thread.start()
    try:
        action()
    finally:
        stop.set()
        thread.join()
    if not values:
        raise RuntimeError(f"No RSS measurements for Fish server PID {pid}")
    return round(max(values) / 1024**2, 3)


def run(args):
    if len(SENTENCES) != 50 or len(set(SENTENCES)) != 50:
        raise ValueError("Expected exactly 50 unique benchmark sentences")
    if args.backend == "azure":
        config = azure_config(os.environ)
        if not config:
            print("azure skipped: AZURE_TTS_KEY is not set; Azure is only called when configured.", flush=True)
            return
        args.voice = config["voice"]
    elif args.backend != "piper":
        args.voice = VOICES[args.backend]
    directory = args.out / run_name(args.backend, args.voice)
    directory.mkdir(parents=True, exist_ok=True)
    manifest = directory / "metrics.json"
    data = json.loads(manifest.read_text(encoding="utf-8")) if manifest.exists() else {
        "backend": args.backend, "voice": args.voice,
        "device": DEVICES[args.backend],
        "results": {},
    }
    if data["backend"] != args.backend or data["voice"] != args.voice:
        raise ValueError("Existing manifest does not match selected backend/voice")
    build = synthesizer(args)
    warm = directory / "warmup.wav"
    start = time.perf_counter()
    build("Goedemorgen, dit is een opwarmzin.", warm)
    audio_info(warm)
    data["warmup_seconds"] = round(time.perf_counter() - start, 3)
    data["warmup_included_in_results"] = False
    data["warmup_scope"] = "request only; server startup excluded" if args.backend == "fish" else "model load and request"
    data["rss_source"] = f"server PID {args.fish_pid}" if args.backend == "fish" else "generator process"
    print(f"{args.backend} warmup ({data['warmup_scope']}): {data['warmup_seconds']:.2f}s (excluded)", flush=True)

    for index, text in enumerate(SENTENCES[:args.limit], 1):
        key = f"{index:02d}"
        path = directory / f"{key}.wav"
        if key in data["results"] and path.exists():
            continue
        start = time.perf_counter()
        cpu_start = time.process_time()
        rss_gib = process_peak(args.fish_pid if args.backend == "fish" else None,
                               lambda: build(text, path))
        duration, rate = audio_info(path)
        seconds = round(time.perf_counter() - start, 3)
        data["results"][key] = {
            "text": text, "seconds": seconds,
            "cpu_seconds": None if args.backend == "fish" else round(time.process_time() - cpu_start, 3),
            "audio_seconds": duration, "rtf": round(seconds / duration, 3),
            "sample_rate": rate, "rss_gib": rss_gib,
            "metal_peak_gib": gpu_memory() if args.backend in ("voxtral", "kugelaudio") else None,
        }
        manifest.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"{directory.name} {key}/50: {seconds:.2f}s, {duration:.2f}s audio, RTF {seconds/duration:.2f}", flush=True)


def load_runs(out):
    """Read every generated run, plus its Parakeet round-trip scores when present."""
    order = {name: index for index, name in enumerate(
        ["piper"] + [f"piper-{voice}" for voice in PIPER_VOICES[1:]] + list(BACKENDS[1:]))}
    runs = []
    for manifest in sorted(out.glob("*/metrics.json"),
                           key=lambda path: (order.get(path.parent.name, len(order)), path.parent.name)):
        data = json.loads(manifest.read_text(encoding="utf-8"))
        results = data["results"]
        scores = {}
        scored_path = manifest.parent / "intelligibility.json"
        if scored_path.exists():
            scores = {key: value for key, value in
                      json.loads(scored_path.read_text(encoding="utf-8"))["results"].items()
                      if key in results and value["reference"] == results[key]["text"]}
        words = sum(score["words"] for score in scores.values())
        median = statistics.median(r["seconds"] for r in results.values()) if results else None
        wer = sum(score["errors"] for score in scores.values()) / words if words else None
        complete = len(results) == len(SENTENCES)
        passes_speed = complete and median <= MAX_MEDIAN_SECONDS
        passes_wer = len(scores) == len(SENTENCES) and wer <= MAX_WER
        runs.append({"name": manifest.parent.name, "data": data, "scores": scores,
                     "median_seconds": median, "wer": wer, "passes_speed": passes_speed,
                     "passes_wer": passes_wer, "candidate": passes_speed and passes_wer})
    return runs


def percent(value):
    return "n/a" if value is None else f"{value * 100:.1f}%"


def gate_text(run):
    if run["candidate"]:
        return "passes both gates"
    if len(run["data"]["results"]) < len(SENTENCES):
        return "incomplete"
    failed = [name for name, ok in (("speed", run["passes_speed"]),
                                    ("WER", run["passes_wer"] or len(run["scores"]) < len(SENTENCES)))
              if not ok]
    return "fails " + " and ".join(failed) if failed else "WER not scored yet"


def report(out):
    runs = load_runs(out)
    rows = []
    for index, text in enumerate(SENTENCES, 1):
        key = f"{index:02d}"
        cells = []
        for item in runs:
            result = item["data"]["results"].get(key)
            score = item["scores"].get(key)
            if result:
                cells.append(
                    f'<td><audio controls preload="none" src="{item["name"]}/{key}.wav"></audio>'
                    f'<small>{result["seconds"]:.2f}s compute / {result["audio_seconds"]:.2f}s audio'
                    f' · RTF {result["rtf"]:.2f} · {result["rss_gib"]:.2f} GiB RSS peak'
                    + (f' · {result["metal_peak_gib"]:.2f} GiB Metal peak' if result.get("metal_peak_gib") is not None else "")
                    + (f'<br>Parakeet ({score["errors"]}/{score["words"]} word errors): {html.escape(score["transcript"])}'
                       if score else "")
                    + '</small></td>'
                )
            else:
                cells.append("<td>Not generated</td>")
        rows.append(f"<tr><th>{key}. {html.escape(text)}</th>{''.join(cells)}</tr>")
    summaries = []
    for item in runs:
        data = item["data"]
        backend = data["backend"]
        results = list(data["results"].values())
        if not results:
            continue
        warmup_scope = data.get(
            "warmup_scope",
            "request only; server startup excluded" if backend == "fish" else "model load and request",
        )
        summaries.append(
            f"<li><b>{html.escape(item['name'])}</b> ({html.escape(data['voice'])}, {html.escape(data['device'])}): "
            f"{len(results)}/50; warmup {data['warmup_seconds']:.2f}s ({html.escape(warmup_scope)}; excluded); "
            f"median {item['median_seconds']:.2f}s; "
            f"total {sum(r['seconds'] for r in results):.1f}s; "
            f"sample rate {results[0]['sample_rate']} Hz; "
            f"peak RSS {max(r['rss_gib'] for r in results):.2f} GiB"
            + (f"; peak Metal {max(r['metal_peak_gib'] for r in results):.2f} GiB" if backend in ("voxtral", "kugelaudio") else "")
            + (f"; CPU time {sum(r['cpu_seconds'] for r in results):.1f}s" if backend != "fish" else "")
            + f"; Parakeet WER {percent(item['wer'])} ({len(item['scores'])}/50 scored); {gate_text(item)}"
            + "</li>"
        )
    page = f"""<!doctype html><html lang="nl"><meta charset="utf-8"><title>Dutch avatar TTS comparison</title>
<style>body{{font:16px system-ui;margin:2rem;color:#222}}table{{border-collapse:collapse;width:100%}}
td,th{{border:1px solid #ccc;padding:.7rem;vertical-align:top;text-align:left;min-width:16rem}}
tr:nth-child(even){{background:#f5f5f5}}audio{{display:block;max-width:17rem;width:100%}}
small{{display:block;line-height:1.5}}.scroll{{overflow:auto}}</style>
<h1>Dutch avatar TTS comparison</h1><p>50 identical sentences in matching numbered files.
Each process run generates an unscored warm-up; a resumed run may keep earlier clips from a separate warmed process.
Warm-up includes model initialization and engine-internal warm-up except for Fish, whose server starts separately.
Seconds measure synthesis through file creation (not time to first audible sample). RTF = compute seconds / audio seconds
(lower is faster). RSS is process high-water, not GPU memory; Metal is MLX allocator peak, not total GPU usage.
Fish RSS is sampled from its separate server PID when supplied. Parakeet WER is the word error rate after transcribing
each clip with the local Sodalis STT API; it includes recognizer mistakes and is an intelligibility proxy, not a quality
score. Gates: median synthesis ≤ {MAX_MEDIAN_SECONDS} s and corpus WER ≤ {MAX_WER:.0%}.</p>
<ul>{''.join(summaries)}</ul><div class="scroll"><table><thead><tr><th>Utterance</th>
{''.join(f'<th>{html.escape(item["name"])}</th>' for item in runs)}</tr></thead><tbody>{''.join(rows)}</tbody></table></div></html>"""
    out.mkdir(parents=True, exist_ok=True)
    (out / "index.html").write_text(page, encoding="utf-8")
    print(f"Open {out / 'index.html'}")


def review_keys(runs):
    """Five fixed representative sentences plus the five with the highest mean WER."""
    scored = [item for item in runs if len(item["scores"]) == len(SENTENCES)]
    if not scored:
        raise ValueError("Score at least one complete run with scripts/tts-intelligibility.ts first")
    mean = {key: statistics.fmean(item["scores"][key]["errors"] / item["scores"][key]["words"] for item in scored)
            for key in scored[0]["scores"]}
    hardest = sorted((key for key in mean if key not in FIXED_REVIEW_KEYS), key=lambda key: (-mean[key], key))
    return sorted(FIXED_REVIEW_KEYS + tuple(hardest[:REVIEW_SIZE - len(FIXED_REVIEW_KEYS)]))


def review(out, include_all=False):
    runs = load_runs(out)
    keys = review_keys(runs)
    selected = [item for item in runs if len(item["scores"]) == len(SENTENCES)
                and (include_all or item["candidate"])]
    if not selected:
        raise ValueError("No run passes both gates; use --review-all to listen anyway")
    (out / "review.json").write_text(json.dumps(
        {"keys": keys, "runs": [item["name"] for item in selected]}, indent=2) + "\n", encoding="utf-8")
    choices = "".join(f"<option>{score}</option>" for score in range(1, 6))
    sections = []
    for item in selected:
        rows = []
        for key in keys:
            score = item["scores"][key]
            flags = "".join(f'<label><input type="checkbox" data-flag="{html.escape(flag)}"> {html.escape(flag)}</label>'
                            for flag in FLAGS)
            rows.append(
                f'<tr data-item="{html.escape(item["name"])}|{key}"><th>{key}. {html.escape(SENTENCES[int(key) - 1])}'
                f'<details><summary>Parakeet heard ({score["errors"]}/{score["words"]} word errors)</summary>'
                f'{html.escape(score["transcript"])}</details></th>'
                f'<td><audio controls preload="none" src="{item["name"]}/{key}.wav"></audio></td>'
                f'<td><label>Dutch pronunciation <select data-field="pronunciation"><option value="">–</option>{choices}</select></label> '
                f'<label>Naturalness <select data-field="naturalness"><option value="">–</option>{choices}</select></label>'
                f'<div class="flags">{flags}</div><input type="text" data-field="notes" placeholder="Notes"></td></tr>')
        sections.append(
            f'<section><h2>{html.escape(item["name"])} <small>({html.escape(item["data"]["voice"])}; median '
            f'{item["median_seconds"]:.2f}s; WER {percent(item["wer"])}; {gate_text(item)})</small></h2>'
            f'<table><tbody>{"".join(rows)}</tbody></table></section>')
    page = f"""<!doctype html><html lang="nl"><meta charset="utf-8"><title>Dutch TTS listening review</title>
<style>body{{font:16px system-ui;margin:2rem;color:#222}}table{{border-collapse:collapse;width:100%}}
td,th{{border:1px solid #ccc;padding:.6rem;vertical-align:top;text-align:left}}th{{width:35%}}
.flags label{{display:inline-block;margin:.3rem .8rem 0 0;font-size:.9rem}}input[type=text]{{width:95%;margin-top:.4rem}}
details{{font-weight:normal;font-size:.9rem;color:#555}}.bar{{position:sticky;top:0;background:#fff;padding:.6rem 0}}</style>
<h1>Dutch TTS listening review</h1>
<p>Use headphones. Score each clip from 1 (poor) to 5 (excellent) for Dutch pronunciation and naturalness, tick any
errors you hear, then export. Answers are kept in this browser until you export them.</p>
<div class="bar"><button id="json">Export JSON</button> <button id="csv">Export CSV</button> <span id="progress"></span></div>
{''.join(sections)}
<script>
const storeKey = "sodalis-tts-review:" + location.pathname;
const saved = JSON.parse(localStorage.getItem(storeKey) || "{{}}");
const items = [...document.querySelectorAll("[data-item]")];
const field = (item, name) => item.querySelector(`[data-field="${{name}}"]`);
function read(item) {{
  const [run, key] = item.dataset.item.split("|");
  return {{ run, key, pronunciation: Number(field(item, "pronunciation").value) || null,
    naturalness: Number(field(item, "naturalness").value) || null,
    flags: [...item.querySelectorAll("[data-flag]:checked")].map((box) => box.dataset.flag),
    notes: field(item, "notes").value }};
}}
function update() {{
  const scores = items.map(read);
  scores.forEach((score) => {{ saved[score.run + "|" + score.key] = score; }});
  localStorage.setItem(storeKey, JSON.stringify(saved));
  const done = scores.filter((score) => score.pronunciation && score.naturalness).length;
  document.getElementById("progress").textContent = `${{done}}/${{scores.length}} clips scored`;
  return scores;
}}
items.forEach((item) => {{
  const score = saved[item.dataset.item];
  if (score) {{
    field(item, "pronunciation").value = score.pronunciation ?? "";
    field(item, "naturalness").value = score.naturalness ?? "";
    field(item, "notes").value = score.notes ?? "";
    item.querySelectorAll("[data-flag]").forEach((box) => {{ box.checked = score.flags.includes(box.dataset.flag); }});
  }}
  item.addEventListener("input", update);
}});
function download(name, type, text) {{
  const link = Object.assign(document.createElement("a"),
    {{ href: URL.createObjectURL(new Blob([text], {{ type }})), download: name }});
  link.click();
  URL.revokeObjectURL(link.href);
}}
const cell = (value) => '"' + String(value ?? "").replaceAll('"', '""') + '"';
document.getElementById("json").onclick = () =>
  download("review-scores.json", "application/json", JSON.stringify({{ scores: update() }}, null, 2));
document.getElementById("csv").onclick = () => download("review-scores.csv", "text/csv",
  ["run,key,pronunciation,naturalness,flags,notes", ...update().map((score) => [score.run, score.key,
    score.pronunciation, score.naturalness, score.flags.join("; "), score.notes].map(cell).join(","))].join("\\n"));
update();
</script></html>"""
    (out / "review.html").write_text(page, encoding="utf-8")
    print(f"Open {out / 'review.html'} ({len(selected)} runs x {len(keys)} sentences)")


def score(out, scores_path):
    """Rank runs that pass both gates by mean listener score; write scores.md and scores.json."""
    plan = json.loads((out / "review.json").read_text(encoding="utf-8"))
    expected = {(name, key) for name in plan["runs"] for key in plan["keys"]}
    human = {}
    for entry in json.loads(Path(scores_path).read_text(encoding="utf-8"))["scores"]:
        item = (entry.get("run"), entry.get("key"))
        if item not in expected:
            raise ValueError(f"Unexpected review item {item}")
        if entry.get("pronunciation") is None and entry.get("naturalness") is None:
            continue
        for name in ("pronunciation", "naturalness"):
            if entry.get(name) not in (1, 2, 3, 4, 5):
                raise ValueError(f"{name} for {item} must be an integer from 1 to 5")
        if not set(entry.get("flags", [])) <= set(FLAGS):
            raise ValueError(f"Unknown error flag for {item}")
        human[item] = entry
    rows = []
    for item in load_runs(out):
        reviewed = [human[(item["name"], key)] for key in plan["keys"] if (item["name"], key) in human]
        pronunciation = statistics.fmean(e["pronunciation"] for e in reviewed) if reviewed else None
        naturalness = statistics.fmean(e["naturalness"] for e in reviewed) if reviewed else None
        rows.append({
            "run": item["name"], "voice": item["data"]["voice"], "median_seconds": item["median_seconds"],
            "wer": item["wer"], "gates": gate_text(item), "reviewed": len(reviewed),
            "pronunciation": pronunciation, "naturalness": naturalness,
            "listener_mean": (pronunciation + naturalness) / 2 if reviewed else None,
            "flags": {flag: sum(flag in e.get("flags", []) for e in reviewed) for flag in FLAGS},
            "ranked": item["candidate"] and len(reviewed) == len(plan["keys"]),
        })
    ranked = sorted((row for row in rows if row["ranked"]),
                    key=lambda row: (-row["listener_mean"], row["wer"], row["median_seconds"], row["run"]))
    for position, row in enumerate(ranked, 1):
        row["rank"] = position
    number = lambda value, suffix="": "n/a" if value is None else f"{value:.2f}{suffix}"
    lines = ["| Rank | Run | Median synthesis | Parakeet WER | Pronunciation | Naturalness | Error flags | Gates |",
             "| ---: | --- | ---: | ---: | ---: | ---: | --- | --- |"]
    for row in ranked + [row for row in rows if not row["ranked"]]:
        flags = ", ".join(f"{flag} ×{count}" for flag, count in row["flags"].items() if count) or "none"
        lines.append(f"| {row.get('rank', '–')} | {row['run']} | {number(row['median_seconds'], ' s')} | "
                     f"{percent(row['wer'])} | {number(row['pronunciation'])} | {number(row['naturalness'])} | "
                     f"{flags} | {row['gates']} |")
    (out / "scores.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (out / "scores.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backend", choices=BACKENDS)
    parser.add_argument("--voice", choices=PIPER_VOICES, default=PIPER_VOICES[0],
                        help="Piper voice; downloaded into models/piper when missing")
    parser.add_argument("--tts-mlx-root", type=Path)
    parser.add_argument("--fish-url", default="http://127.0.0.1:18080")
    parser.add_argument("--fish-pid", type=int)
    parser.add_argument("--timeout", type=float, default=120)
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--out", type=Path, default=ROOT / "models/tts-comparison")
    parser.add_argument("--review", action="store_true", help="write review.html for runs passing both gates")
    parser.add_argument("--review-all", action="store_true", help="also include runs that fail a gate")
    parser.add_argument("--score", type=Path, help="exported review-scores.json; writes scores.md")
    args = parser.parse_args()
    if args.backend:
        if not 1 <= args.limit <= 50:
            parser.error("--limit must be between 1 and 50")
        if args.backend == "fish" and not args.fish_pid:
            parser.error("--fish-pid must identify the Fish server process")
        run(args)
    report(args.out)
    if args.review or args.review_all:
        review(args.out, args.review_all)
    if args.score:
        score(args.out, args.score)


if __name__ == "__main__":
    main()
