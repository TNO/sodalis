"""Records Azure TTS clips with viseme and word timings, for lip-sync evaluation.

Billed: sends each sentence to Azure Speech. Get consent for each run.
Needs AZURE_TTS_KEY and AZURE_TTS_REGION (for example westeurope) in the
environment. The Speech SDK is required because the REST endpoint returns no
viseme events:

    set -a; . ./.env.azure-eval; set +a
    uv run --with azure-cognitiveservices-speech python scripts/azure-visemes.py \
        --voice nl-NL-ColetteNeural --limit 1

Output (default apps/desktop/public/avatars/eval/speech-nl, git-ignored):
NN.mp3, NN.json with {text, voice, durationMs, visemes: [{id, offsetMs}],
words: [{text, offsetMs, durationMs}]}, and index.json listing the clips.
"""
import argparse
import json
import os
import sys
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parent.parent
TICKS_PER_MS = 10_000


def ssml(text, voice, language):
    return (
        f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" '
        f'xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="{language}">'
        f'<voice name="{escape(voice)}"><mstts:viseme type="redlips_front"/>'
        f"{escape(text)}</voice></speak>"
    )


def synthesize(speechsdk, config, text, voice, language):
    synthesizer = speechsdk.SpeechSynthesizer(speech_config=config, audio_config=None)
    visemes, words = [], []
    synthesizer.viseme_received.connect(
        lambda e: visemes.append({"id": e.viseme_id, "offsetMs": round(e.audio_offset / TICKS_PER_MS)})
    )
    synthesizer.synthesis_word_boundary.connect(
        lambda e: words.append({
            "text": e.text,
            "offsetMs": round(e.audio_offset / TICKS_PER_MS),
            "durationMs": round(e.duration.total_seconds() * 1000),
        })
    )
    result = synthesizer.speak_ssml_async(ssml(text, voice, language)).get()
    if result.reason != speechsdk.ResultReason.SynthesizingAudioCompleted:
        details = result.cancellation_details
        raise RuntimeError(f"Azure synthesis failed: {details.reason} {details.error_details}")
    duration_ms = round(result.audio_duration.total_seconds() * 1000)
    return result.audio_data, {"text": text, "voice": voice, "durationMs": duration_ms,
                               "visemes": visemes, "words": words}


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--voice", default="nl-NL-ColetteNeural")
    parser.add_argument("--language", default="nl-NL")
    parser.add_argument("--sentences", type=Path, default=ROOT / "scripts/tts-sentences.json")
    parser.add_argument("--out", type=Path, default=ROOT / "apps/desktop/public/avatars/eval/speech-nl")
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()

    key, region = os.environ.get("AZURE_TTS_KEY"), os.environ.get("AZURE_TTS_REGION")
    if not key or not region:
        sys.exit("Set AZURE_TTS_KEY and AZURE_TTS_REGION (for example westeurope).")
    import azure.cognitiveservices.speech as speechsdk

    config = speechsdk.SpeechConfig(subscription=key, region=region)
    config.set_speech_synthesis_output_format(
        speechsdk.SpeechSynthesisOutputFormat.Audio24Khz96KBitRateMonoMp3)
    sentences = json.loads(args.sentences.read_text(encoding="utf-8"))[: args.limit]
    args.out.mkdir(parents=True, exist_ok=True)
    clips = []
    for number, text in enumerate(sentences, start=1):
        audio, timing = synthesize(speechsdk, config, text, args.voice, args.language)
        stem = f"{number:02d}"
        (args.out / f"{stem}.mp3").write_bytes(audio)
        (args.out / f"{stem}.json").write_text(json.dumps(timing, ensure_ascii=False, indent=1), encoding="utf-8")
        clips.append({"id": stem, "text": text, "durationMs": timing["durationMs"]})
        print(f"{stem} {timing['durationMs']} ms, {len(timing['visemes'])} visemes: {text}")
    (args.out / "index.json").write_text(
        json.dumps({"voice": args.voice, "language": args.language, "clips": clips}, ensure_ascii=False, indent=1),
        encoding="utf-8")


if __name__ == "__main__":
    main()
