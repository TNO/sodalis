import importlib.util
import json
import tempfile
import unittest
import wave
from pathlib import Path

spec = importlib.util.spec_from_file_location("tts_compare", Path(__file__).with_name("tts-compare.py"))
tts = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tts)


def write_run(out, name, seconds, errors, scored=True, backend="piper", voice=None):
    directory = out / name
    directory.mkdir(parents=True)
    results = {f"{i:02d}": {"text": text, "seconds": seconds, "audio_seconds": 2.0, "rtf": seconds / 2,
                            "rss_gib": 0.3, "cpu_seconds": seconds, "metal_peak_gib": None,
                            "sample_rate": 22050}
               for i, text in enumerate(tts.SENTENCES, 1)}
    (directory / "metrics.json").write_text(json.dumps({
        "backend": backend, "voice": voice or tts.VOICES[backend], "device": "CPU",
        "warmup_seconds": 1.0, "results": results}), encoding="utf-8")
    if scored:
        (directory / "intelligibility.json").write_text(json.dumps({"results": {
            key: {"reference": value["text"], "transcript": value["text"],
                  "errors": errors.get(key, 0), "words": 10}
            for key, value in results.items()}}), encoding="utf-8")


class TtsCompareTest(unittest.TestCase):
    def test_run_names_keep_default_directories_and_separate_other_voices(self):
        self.assertEqual(tts.run_name("piper", tts.PIPER_VOICES[0]), "piper")
        self.assertEqual(tts.run_name("piper", "nl_NL-pim-medium"), "piper-nl_NL-pim-medium")
        self.assertEqual(tts.run_name("mms", tts.VOICES["mms"]), "mms")
        self.assertEqual(tts.run_name("azure", "nl-NL-FennaNeural"), "azure")

    def test_piper_voice_urls_follow_release_layout(self):
        self.assertEqual(tts.piper_voice_urls("nl_NL-mls_5809-low"), {
            "nl_NL-mls_5809-low.onnx": f"{tts.PIPER_RELEASE}/nl_NL/mls_5809/low/nl_NL-mls_5809-low.onnx",
            "nl_NL-mls_5809-low.onnx.json": f"{tts.PIPER_RELEASE}/nl_NL/mls_5809/low/nl_NL-mls_5809-low.onnx.json",
        })

    def test_azure_is_skipped_without_key_and_validated_with_one(self):
        self.assertIsNone(tts.azure_config({}))
        url = "https://westeurope.tts.speech.microsoft.com/cognitiveservices/v1"
        self.assertEqual(tts.azure_config({"AZURE_TTS_KEY": "k", "AZURE_TTS_URL": url,
                                           "AZURE_TTS_VOICE": "nl-NL-FennaNeural"}),
                         {"url": url, "key": "k", "voice": "nl-NL-FennaNeural"})
        with self.assertRaises(ValueError):
            tts.azure_config({"AZURE_TTS_KEY": "k", "AZURE_TTS_URL": url.replace("https", "http"),
                              "AZURE_TTS_VOICE": "nl-NL-FennaNeural"})
        with self.assertRaises(ValueError):
            tts.azure_config({"AZURE_TTS_KEY": "k", "AZURE_TTS_URL": url, "AZURE_TTS_VOICE": "en-US-AriaNeural"})
        self.assertIn("&lt;b&gt;", tts.azure_ssml("<b>", "nl-NL-FennaNeural"))

    def test_write_wav_rejects_empty_audio(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "a.wav"
            with self.assertRaises(ValueError):
                tts.write_wav(path, b"", 16000)
            tts.write_wav(path, b"\0\0" * 160, 16000)
            with wave.open(str(path)) as audio:
                self.assertEqual((audio.getframerate(), audio.getnframes()), (16000, 160))

    def test_gates_review_selection_and_ranking(self):
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp)
            write_run(out, "piper", 0.4, {"02": 5, "03": 4, "04": 3, "05": 2, "06": 1, "07": 1, "01": 9})
            write_run(out, "piper-nl_NL-pim-medium", 0.5, {}, voice="nl_NL-pim-medium")
            write_run(out, "mms", 3.0, {}, backend="mms")
            write_run(out, "parler", 0.5, {}, scored=False, backend="parler")
            runs = {run["name"]: run for run in tts.load_runs(out)}
            self.assertTrue(runs["piper"]["candidate"])
            self.assertEqual(tts.gate_text(runs["mms"]), "fails speed")
            self.assertEqual(tts.gate_text(runs["parler"]), "WER not scored yet")

            keys = tts.review_keys(list(runs.values()))
            self.assertEqual(keys, sorted(tts.FIXED_REVIEW_KEYS + ("02", "03", "04", "05", "06")))
            tts.review(out)
            plan = json.loads((out / "review.json").read_text(encoding="utf-8"))
            self.assertEqual(plan["runs"], ["piper", "piper-nl_NL-pim-medium"])
            self.assertIn("Export JSON", (out / "review.html").read_text(encoding="utf-8"))

            entries = [{"run": run, "key": key, "pronunciation": rating, "naturalness": rating,
                        "flags": ["artifacts"] if run == "piper" else [], "notes": ""}
                       for run, rating in (("piper", 3), ("piper-nl_NL-pim-medium", 4)) for key in keys]
            exported = out / "review-scores.json"
            exported.write_text(json.dumps({"scores": entries}), encoding="utf-8")
            rows = {row["run"]: row for row in tts.score(out, exported)}
            self.assertEqual((rows["piper-nl_NL-pim-medium"]["rank"], rows["piper"]["rank"]), (1, 2))
            self.assertEqual(rows["piper"]["flags"]["artifacts"], len(keys))
            self.assertNotIn("rank", rows["mms"])
            self.assertIn("| 1 | piper-nl_NL-pim-medium |", (out / "scores.md").read_text(encoding="utf-8"))

            entries[0]["pronunciation"] = 6
            exported.write_text(json.dumps({"scores": entries}), encoding="utf-8")
            with self.assertRaises(ValueError):
                tts.score(out, exported)


if __name__ == "__main__":
    unittest.main()
