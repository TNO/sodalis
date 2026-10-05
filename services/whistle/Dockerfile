FROM python:3.12-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir cactus-needle==3.1.0 \
    && python -c "from needle.agent.whistle import Whistle; Whistle()"
ENV HF_HUB_OFFLINE=1
WORKDIR /app
COPY services/speech-http/server.py /app/speech_http.py
COPY services/whistle/main.py /app/main.py
EXPOSE 8080
CMD ["python", "/app/main.py"]
