from http.server import ThreadingHTTPServer

import numpy
import sherpa_onnx
from speech_http import create_handler


class ParakeetTdt:
    def __init__(self):
        self.recognizer = sherpa_onnx.OfflineRecognizer.from_transducer(
            "/models/encoder.int8.onnx",
            "/models/decoder.int8.onnx",
            "/models/joiner.int8.onnx",
            "/models/tokens.txt",
            num_threads=2,
            provider="cpu",
            decoding_method="greedy_search",
            model_type="nemo_transducer",
        )

    def transcribe(self, samples, language):
        stream = self.recognizer.create_stream()
        stream.accept_waveform(16000, numpy.frombuffer(samples, dtype=numpy.float32))
        self.recognizer.decode_stream(stream)
        return {"text": stream.result.text}


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8080), create_handler(ParakeetTdt())).serve_forever()
