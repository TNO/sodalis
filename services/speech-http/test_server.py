import io
import json
import threading
import unittest
import urllib.error
import urllib.request
import wave
from http.server import ThreadingHTTPServer

from server import create_handler


def silence(seconds):
    output = io.BytesIO()
    with wave.open(output, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(16000)
        audio.writeframes(b"\0\0" * (seconds * 16000))
    return output.getvalue()


class FakeModel:
    def transcribe(self, samples, language):
        return {"text": "" if not any(samples) else language}


class SpeechHttpTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), create_handler(FakeModel()))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def transcribe(self, data, mime_type="audio/wav", language="nl"):
        request = urllib.request.Request(
            f"http://127.0.0.1:{self.server.server_port}/transcribe",
            data=data,
            headers={"Content-Type": mime_type, "x-sodalis-language": language},
        )
        try:
            response = urllib.request.urlopen(request, timeout=10)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return response.status, json.load(response)

    def test_silence_has_empty_transcript(self):
        self.assertEqual(self.transcribe(silence(3)), (200, {"text": ""}))

    def test_invalid_audio_is_rejected(self):
        status, payload = self.transcribe(b"not audio")
        self.assertEqual(status, 422)
        self.assertIn("error", payload)

    def test_long_audio_is_rejected_before_inference(self):
        status, payload = self.transcribe(silence(31))
        self.assertEqual(status, 413)
        self.assertIn("30-second", payload["error"])

    def test_unsupported_language_is_rejected(self):
        status, payload = self.transcribe(silence(1), language="fr")
        self.assertEqual(status, 415)
        self.assertIn("error", payload)


if __name__ == "__main__":
    unittest.main()
