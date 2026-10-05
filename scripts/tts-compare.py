#!/usr/bin/env python3
"""Generate local Dutch TTS listening samples; no cloud services or voice cloning."""

import argparse
import html
import json
import resource
import statistics
import subprocess
import sys
import threading
import time
import urllib.request
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SENTENCES = json.loads((ROOT / "scripts/tts-sentences.json").read_text())
BACKENDS = ("piper", "fish", "voxtral", "kugelaudio")
VOICES = {"piper": "nl_BE-nathalie-medium", "fish": "unconditioned",
          "voxtral": "nl_female", "kugelaudio": "warm"}


def synthesizer(args):
    if args.backend == "piper":
        from piper.voice import PiperVoice

        voice = PiperVoice.load(str(ROOT / "models/piper/nl_BE-nathalie-medium.onnx"))

        def synthesize(text, path):
            with wave.open(str(path), "wb") as audio:
                voice.synthesize_wav(text, audio)

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
        action()
        return round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024**3, 3)

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
    directory = args.out / args.backend
    directory.mkdir(parents=True, exist_ok=True)
    manifest = directory / "metrics.json"
    data = json.loads(manifest.read_text()) if manifest.exists() else {
        "backend": args.backend, "voice": VOICES[args.backend],
        "device": {"piper": "CPU", "fish": "MPS (verify server log)",
                   "voxtral": "Metal/MLX", "kugelaudio": "Metal/MLX"}[args.backend],
        "results": {},
    }
    if data["backend"] != args.backend or data["voice"] != VOICES[args.backend]:
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
        manifest.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
        print(f"{args.backend} {key}/50: {seconds:.2f}s, {duration:.2f}s audio, RTF {seconds/duration:.2f}", flush=True)


def report(out):
    manifests = {}
    for backend in BACKENDS:
        path = out / backend / "metrics.json"
        if path.exists():
            manifests[backend] = json.loads(path.read_text())
    rows = []
    for index, text in enumerate(SENTENCES, 1):
        key = f"{index:02d}"
        cells = []
        for backend in BACKENDS:
            result = manifests.get(backend, {}).get("results", {}).get(key)
            if result:
                cells.append(
                    f'<td><audio controls preload="none" src="{backend}/{key}.wav"></audio>'
                    f'<small>{result["seconds"]:.2f}s compute / {result["audio_seconds"]:.2f}s audio'
                    f' · RTF {result["rtf"]:.2f} · {result["rss_gib"]:.2f} GiB RSS peak'
                    + (f' · {result["metal_peak_gib"]:.2f} GiB Metal peak' if result["metal_peak_gib"] is not None else "")
                    + '</small></td>'
                )
            else:
                cells.append("<td>Not generated</td>")
        rows.append(f"<tr><th>{key}. {html.escape(text)}</th>{''.join(cells)}</tr>")
    summaries = []
    for backend, data in manifests.items():
        results = list(data["results"].values())
        if not results:
            continue
        warmup_scope = data.get(
            "warmup_scope",
            "request only; server startup excluded" if backend == "fish" else "model load and request",
        )
        summaries.append(
            f"<li><b>{backend}</b> ({html.escape(data['voice'])}, {html.escape(data['device'])}): "
            f"{len(results)}/50; warmup {data['warmup_seconds']:.2f}s ({html.escape(warmup_scope)}; excluded); "
            f"median {statistics.median(r['seconds'] for r in results):.2f}s; "
            f"total {sum(r['seconds'] for r in results):.1f}s; "
            f"sample rate {results[0]['sample_rate']} Hz; "
            f"peak RSS {max(r['rss_gib'] for r in results):.2f} GiB"
            + (f"; peak Metal {max(r['metal_peak_gib'] for r in results):.2f} GiB" if backend in ("voxtral", "kugelaudio") else "")
            + (f"; CPU time {sum(r['cpu_seconds'] for r in results):.1f}s" if backend != "fish" else "")
            + "</li>"
        )
    page = f"""<!doctype html><html lang="nl"><meta charset="utf-8"><title>Dutch avatar TTS comparison</title>
<style>body{{font:16px system-ui;margin:2rem;color:#222}}table{{border-collapse:collapse;width:100%}}
td,th{{border:1px solid #ccc;padding:.7rem;vertical-align:top;text-align:left;min-width:16rem}}
tr:nth-child(even){{background:#f5f5f5}}audio{{display:block;max-width:17rem;width:100%}}
small{{display:block;line-height:1.5}}.scroll{{overflow:auto}}</style>
<h1>Dutch avatar TTS comparison</h1><p>50 identical sentences in matching numbered files.
Each process run generates an unscored warm-up; sample 01 for Piper, Voxtral, and KugelAudio
was kept from an earlier warmed pilot process, while samples 02–50 came from the resumed full run.
Warm-up includes model initialization and engine-internal warm-up except for Fish, whose server starts separately.
Seconds measure synthesis through file creation (not time to first audible sample). RTF = compute seconds / audio seconds
(lower is faster). RSS is process high-water, not GPU memory; Metal is MLX allocator peak, not total GPU usage.
Fish RSS is sampled from its separate server PID when supplied. Listen before judging quality; these are not automatic quality scores.</p>
<ul>{''.join(summaries)}</ul><div class="scroll"><table><thead><tr><th>Utterance</th>
{''.join(f'<th>{name}</th>' for name in BACKENDS)}</tr></thead><tbody>{''.join(rows)}</tbody></table></div></html>"""
    out.mkdir(parents=True, exist_ok=True)
    (out / "index.html").write_text(page)
    print(f"Open {out / 'index.html'}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backend", choices=BACKENDS)
    parser.add_argument("--tts-mlx-root", type=Path)
    parser.add_argument("--fish-url", default="http://127.0.0.1:18080")
    parser.add_argument("--fish-pid", type=int)
    parser.add_argument("--timeout", type=float, default=120)
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--out", type=Path, default=ROOT / "models/tts-comparison")
    args = parser.parse_args()
    if args.backend:
        if not 1 <= args.limit <= 50:
            parser.error("--limit must be between 1 and 50")
        if args.backend == "fish" and not args.fish_pid:
            parser.error("--fish-pid must identify the Fish server process")
        run(args)
    report(args.out)


if __name__ == "__main__":
    main()
