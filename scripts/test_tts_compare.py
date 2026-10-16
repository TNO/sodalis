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


AZURE = {"url": "https://westeurope.tts.speech.microsoft.com/cognitiveservices/v1",
         "key": "secret-key-123", "voice": "nl-NL-ColetteNeural"}


class FakeClock:
    """Time advances only when the fake network does something."""

    def __init__(self):
        self.now = 100.0
        self.slept = []

    def __call__(self):
        return self.now

    def sleep(self, seconds):
        self.slept.append(seconds)
        self.now += seconds


class FakeResponse:
    def __init__(self, clock, chunks, delay=0.25):
        self.clock, self.chunks, self.delay = clock, list(chunks), delay

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def read1(self, _size=-1):
        if not self.chunks:
            return b""
        self.clock.now += self.delay
        return self.chunks.pop(0)


def http_error(status, retry_after=None):
    import email.message
    import urllib.error

    headers = email.message.Message()
    if retry_after is not None:
        headers["Retry-After"] = str(retry_after)
    return urllib.error.HTTPError(AZURE["url"], status, "error", headers, None)


class FakeOpener:
    """Replays a scripted sequence of responses or HTTP errors and records requests."""

    def __init__(self, clock, outcomes, connect=0.1):
        self.clock, self.outcomes, self.connect, self.requests = clock, list(outcomes), connect, []

    def __call__(self, request, timeout=None):
        self.requests.append(request)
        self.clock.now += self.connect
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return FakeResponse(self.clock, outcome)


class AzureSynthesisTest(unittest.TestCase):
    def synthesize(self, outcomes, **options):
        clock = FakeClock()
        opener = FakeOpener(clock, outcomes)
        synthesize = tts.azure_synthesizer(AZURE, timeout=30, opener=opener, clock=clock,
                                           sleep=clock.sleep, **options)
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        path = Path(temp.name) / "01.wav"
        return synthesize, path, opener, clock

    def test_streams_pcm_to_wav_and_times_first_audio_separately_from_total(self):
        synthesize, path, opener, _clock = self.synthesize([[b"\1\0\2\0", b"\3\0"]])
        timing = synthesize("Hallo & welkom", path)
        self.assertAlmostEqual(timing["first_audio_seconds"], 0.35)
        self.assertAlmostEqual(timing["seconds"], 0.6)
        self.assertEqual(timing["retries"], 0)
        with wave.open(str(path)) as audio:
            self.assertEqual((audio.getframerate(), audio.getnframes()), (22050, 3))
        request = opener.requests[0]
        self.assertEqual(request.get_header("X-microsoft-outputformat"), "raw-22050hz-16bit-mono-pcm")
        self.assertIn(b"Hallo &amp; welkom", request.data)

    def test_waits_for_retry_after_on_throttling_and_times_only_the_successful_attempt(self):
        synthesize, path, opener, clock = self.synthesize(
            [http_error(429, retry_after=7), http_error(503), [b"\1\0"]])
        timing = synthesize("Hallo", path)
        self.assertEqual(timing["retries"], 2)
        self.assertEqual(clock.slept[0], 7)
        self.assertEqual(len(clock.slept), 2)
        self.assertAlmostEqual(timing["seconds"], 0.35)
        self.assertEqual(len(opener.requests), 3)

    def test_gives_up_after_bounded_retries(self):
        synthesize, path, _opener, _clock = self.synthesize(
            [http_error(429, retry_after=1)] * 3, max_retries=2)
        with self.assertRaisesRegex(RuntimeError, "HTTP 429"):
            synthesize("Hallo", path)

    def test_rejected_credentials_fail_fast_with_guidance_and_without_the_key(self):
        synthesize, path, opener, clock = self.synthesize([http_error(401)])
        with self.assertRaises(RuntimeError) as raised:
            synthesize("Hallo", path)
        message = str(raised.exception)
        self.assertIn("AZURE_TTS_KEY", message)
        self.assertIn("region", message)
        self.assertNotIn(AZURE["key"], message)
        self.assertEqual((len(opener.requests), clock.slept), (1, []))
        self.assertFalse(path.exists())


class AzurePreflightTest(unittest.TestCase):
    def opener(self, body):
        class Response(FakeResponse):
            def read(self):
                return body

        clock = FakeClock()
        requests = []

        def opener(request, timeout=None):
            requests.append(request)
            if isinstance(body, Exception):
                raise body
            return Response(clock, [])

        return opener, requests

    def test_lists_dutch_voices_and_counts_billed_characters_without_synthesizing(self):
        voices = [{"ShortName": "nl-NL-ColetteNeural", "Locale": "nl-NL"},
                  {"ShortName": "nl-BE-DenaNeural", "Locale": "nl-BE"},
                  {"ShortName": "en-US-AriaNeural", "Locale": "en-US"}]
        opener, requests = self.opener(json.dumps(voices).encode())
        report = tts.azure_preflight(AZURE, opener=opener)
        self.assertEqual(requests[0].full_url,
                         "https://westeurope.tts.speech.microsoft.com/cognitiveservices/voices/list")
        self.assertIsNone(requests[0].data)
        self.assertEqual(requests[0].get_header("Ocp-apim-subscription-key"), AZURE["key"])
        self.assertTrue(report["voice_found"])
        self.assertEqual(report["dutch_voices"], ["nl-BE-DenaNeural", "nl-NL-ColetteNeural"])
        # The corpus is 50 sentences of known total length, plus the warm-up phrase.
        corpus = sum(len(sentence) for sentence in tts.SENTENCES)
        self.assertGreater(report["benchmark_characters"], corpus)
        self.assertLess(report["benchmark_characters"], corpus + 100)

    def test_reports_whether_a_multilingual_voice_from_another_locale_speaks_dutch(self):
        voices = [{"ShortName": "en-US-Adam:DragonHDLatestNeural", "Locale": "en-US",
                   "SecondaryLocaleList": ["de-DE", "nl-NL"]},
                  {"ShortName": "en-US-GuyNeural", "Locale": "en-US"}]
        opener, _requests = self.opener(json.dumps(voices).encode())
        adam = dict(AZURE, voice="en-US-Adam:DragonHDLatestNeural")
        self.assertTrue(tts.azure_preflight(adam, opener=opener)["voice_speaks_dutch"])
        opener, _requests = self.opener(json.dumps(voices).encode())
        self.assertFalse(tts.azure_preflight(dict(AZURE, voice="en-US-GuyNeural"),
                                             opener=opener)["voice_speaks_dutch"])

    def test_reports_a_configured_voice_that_the_region_does_not_offer(self):
        opener, _requests = self.opener(json.dumps([{"ShortName": "nl-NL-FennaNeural", "Locale": "nl-NL"}]).encode())
        self.assertFalse(tts.azure_preflight(AZURE, opener=opener)["voice_found"])

    def test_rejected_key_gives_guidance_without_the_key(self):
        opener, _requests = self.opener(http_error(401))
        with self.assertRaisesRegex(RuntimeError, "AZURE_TTS_KEY") as raised:
            tts.azure_preflight(AZURE, opener=opener)
        self.assertNotIn(AZURE["key"], str(raised.exception))


class TtsCompareTest(unittest.TestCase):
    def test_run_names_keep_default_directories_and_separate_other_voices(self):
        self.assertEqual(tts.run_name("piper", tts.PIPER_VOICES[0]), "piper")
        self.assertEqual(tts.run_name("piper", "nl_NL-pim-medium"), "piper-nl_NL-pim-medium")
        self.assertEqual(tts.run_name("mms", tts.VOICES["mms"]), "mms")
        self.assertEqual(tts.run_name("azure", "nl-NL-FennaNeural"), "azure-nl-NL-FennaNeural")
        self.assertEqual(tts.run_name("azure", "en-US-Adam:DragonHDLatestNeural"),
                         "azure-en-US-Adam-DragonHDLatestNeural")

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
            tts.azure_config({"AZURE_TTS_KEY": "k", "AZURE_TTS_URL": url, "AZURE_TTS_VOICE": "Aria"})
        self.assertIn("&lt;b&gt;", tts.azure_ssml("<b>", "nl-NL-FennaNeural"))

    def test_azure_accepts_a_foundry_resource_and_a_multilingual_voice_but_not_a_project_endpoint(self):
        config = tts.azure_config({"AZURE_TTS_KEY": "k",
                                   "AZURE_TTS_URL": "https://soladis-foundry.cognitiveservices.azure.com/",
                                   "AZURE_TTS_VOICE": "en-US-Adam:DragonHDLatestNeural"})
        self.assertEqual(config["url"], "https://soladis-foundry.cognitiveservices.azure.com/tts/cognitiveservices/v1")
        self.assertEqual(config["voice"], "en-US-Adam:DragonHDLatestNeural")
        with self.assertRaisesRegex(ValueError, "project endpoint"):
            tts.azure_config({"AZURE_TTS_KEY": "k",
                              "AZURE_TTS_URL": "https://soladis-foundry.services.ai.azure.com/api/projects/sodalis",
                              "AZURE_TTS_VOICE": "nl-NL-FennaNeural"})

    def test_azure_ssml_marks_the_reply_as_dutch_only_for_non_dutch_voices(self):
        adam = tts.azure_ssml("Hallo", "en-US-Adam:DragonHDLatestNeural")
        self.assertIn('xml:lang="nl-NL"><voice name="en-US-Adam:DragonHDLatestNeural">'
                      '<lang xml:lang="nl-NL">Hallo</lang></voice>', adam)
        fenna = tts.azure_ssml("Hallo", "nl-NL-FennaNeural")
        self.assertIn('xml:lang="nl-NL"><voice name="nl-NL-FennaNeural">Hallo</voice>', fenna)
        self.assertNotIn("<lang", fenna)

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

    def test_review_keeps_previously_chosen_sentences_when_new_runs_change_the_hardest(self):
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp)
            write_run(out, "piper", 0.4, {"02": 5, "03": 4, "04": 3, "05": 2, "06": 1})
            tts.review(out)
            first = json.loads((out / "review.json").read_text(encoding="utf-8"))["keys"]
            write_run(out, "piper-nl_NL-pim-medium", 0.5, {"44": 10, "45": 10, "46": 10, "47": 10, "48": 10},
                      voice="nl_NL-pim-medium")
            tts.review(out)
            self.assertEqual(json.loads((out / "review.json").read_text(encoding="utf-8"))["keys"], first)
            tts.review(out, repick=True)
            self.assertIn("44", json.loads((out / "review.json").read_text(encoding="utf-8"))["keys"])

    def test_review_lists_every_azure_clip_even_when_azure_fails_a_gate(self):
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp)
            write_run(out, "piper", 0.4, {})
            write_run(out, "azure", 2.0, {}, backend="azure", voice="nl-NL-ColetteNeural")
            tts.review(out)
            plan = json.loads((out / "review.json").read_text(encoding="utf-8"))
            self.assertEqual(plan["runs"], ["piper", "azure"])
            self.assertEqual(plan["run_keys"]["piper"], plan["keys"])
            self.assertEqual(len(plan["keys"]), tts.REVIEW_SIZE)
            self.assertEqual(plan["run_keys"]["azure"], [f"{i:02d}" for i in range(1, 51)])
            page = (out / "review.html").read_text(encoding="utf-8")
            self.assertEqual(page.count('data-item="azure|'), 50)
            self.assertEqual(page.count('data-item="piper|'), tts.REVIEW_SIZE)

    def test_score_ranks_on_shared_sentences_and_reports_the_mean_over_all_reviewed_clips(self):
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp)
            write_run(out, "piper", 0.4, {})
            write_run(out, "azure", 0.5, {}, backend="azure", voice="nl-NL-ColetteNeural")
            tts.review(out)
            plan = json.loads((out / "review.json").read_text(encoding="utf-8"))
            shared = set(plan["keys"])
            entries = [{"run": "piper", "key": key, "pronunciation": 4, "naturalness": 4, "flags": []}
                       for key in plan["keys"]]
            entries += [{"run": "azure", "key": key, "pronunciation": 5 if key in shared else 1,
                         "naturalness": 5 if key in shared else 1, "flags": []}
                        for key in plan["run_keys"]["azure"]]
            exported = out / "review-scores.json"
            exported.write_text(json.dumps({"scores": entries}), encoding="utf-8")
            rows = {row["run"]: row for row in tts.score(out, exported)}
            self.assertEqual((rows["azure"]["rank"], rows["piper"]["rank"]), (1, 2))
            self.assertEqual(rows["azure"]["listener_mean"], 5)
            self.assertEqual((rows["azure"]["all_reviewed"], rows["azure"]["all_clips_mean"]), (50, 1.8))
            self.assertEqual((rows["piper"]["all_reviewed"], rows["piper"]["all_clips_mean"]), (10, 4))
            self.assertIn("1.80 (50 clips)", (out / "scores.md").read_text(encoding="utf-8"))

    def test_score_accepts_a_review_plan_written_before_per_run_sentences_existed(self):
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp)
            write_run(out, "piper", 0.4, {})
            keys = list(tts.FIXED_REVIEW_KEYS)
            (out / "review.json").write_text(json.dumps({"keys": keys, "runs": ["piper"]}), encoding="utf-8")
            exported = out / "review-scores.json"
            exported.write_text(json.dumps({"scores": [
                {"run": "piper", "key": key, "pronunciation": 3, "naturalness": 4, "flags": []}
                for key in keys]}), encoding="utf-8")
            row = tts.score(out, exported)[0]
            self.assertEqual((row["rank"], row["listener_mean"], row["all_reviewed"]), (1, 3.5, 5))


if __name__ == "__main__":
    unittest.main()
