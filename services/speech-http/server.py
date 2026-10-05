import array
import json
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler


MAX_AUDIO_BYTES = 16 * 1024 * 1024
MAX_SAMPLES = 30 * 16000
AUDIO_TYPES = {"audio/wav", "audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg"}


def decode_audio(data):
    result = subprocess.run(
        [
            "ffmpeg", "-nostdin", "-v", "error", "-protocol_whitelist", "pipe",
            "-i", "pipe:0", "-t", "31", "-ac", "1", "-ar", "16000",
            "-f", "s16le", "pipe:1",
        ],
        input=data,
        capture_output=True,
        timeout=60,
        check=False,
    )
    if result.returncode != 0:
        raise ValueError(result.stderr.decode("utf-8", "replace").strip() or "Invalid audio.")
    samples = array.array("h")
    samples.frombytes(result.stdout)
    if sys.byteorder != "little":
        samples.byteswap()
    if len(samples) > MAX_SAMPLES:
        raise OverflowError("Audio exceeds the 30-second recognition limit.")
    return array.array("f", (sample / 32768 for sample in samples))


def create_handler(model):
    lock = threading.Lock()

    class Handler(BaseHTTPRequestHandler):
        def send_json(self, status, payload):
            data = json.dumps(payload).encode("utf-8")
            self.send_response(status)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            if self.path == "/healthz":
                self.send_json(200, {"status": "ok"})
            else:
                self.send_json(404, {"error": "Not found."})

        def do_POST(self):
            if self.path != "/transcribe":
                self.send_json(404, {"error": "Not found."})
                return
            mime_type = self.headers.get("content-type", "").split(";")[0].lower()
            language = self.headers.get("x-sodalis-language")
            if mime_type not in AUDIO_TYPES or language not in ("nl", "en"):
                self.send_json(415, {"error": "Unsupported audio type or language."})
                return
            try:
                length = int(self.headers.get("content-length", ""))
            except ValueError:
                self.send_json(411, {"error": "Content-Length is required."})
                return
            if length < 1 or length > MAX_AUDIO_BYTES:
                self.send_json(413, {"error": "Audio size is outside the allowed range."})
                return
            try:
                samples = decode_audio(self.rfile.read(length))
                with lock:
                    result = model.transcribe(samples, language=language)
                self.send_json(200, {"text": result["text"]})
            except OverflowError as error:
                self.send_json(413, {"error": str(error)})
            except ValueError as error:
                self.send_json(422, {"error": str(error)})
            except (OSError, RuntimeError, subprocess.TimeoutExpired) as error:
                self.send_json(502, {"error": str(error)})

    return Handler
