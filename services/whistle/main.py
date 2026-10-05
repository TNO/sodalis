from http.server import ThreadingHTTPServer

from needle.agent.whistle import Whistle
from speech_http import create_handler


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8080), create_handler(Whistle())).serve_forever()
