FROM python:3.11-slim-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    git patch build-essential cmake libsox-dev libasound-dev portaudio19-dev \
    ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/fish-speech
RUN git init . && git remote add origin https://github.com/fishaudio/fish-speech.git \
    && git fetch --depth 1 origin 7902e408c85b37193ce3f3c2361ca3c76be0d533 \
    && git checkout --detach FETCH_HEAD \
    && test "$(git rev-parse HEAD)" = 7902e408c85b37193ce3f3c2361ca3c76be0d533

COPY services/fish-speech-1.5/streaming.patch /tmp/streaming.patch
RUN patch -p1 < /tmp/streaming.patch && pip install --no-cache-dir \
    'torch==2.4.1' 'torchaudio==2.4.1' 'transformers==4.45.2' -e '.[stable]'

EXPOSE 8080
CMD ["python", "-m", "tools.api_server", "--listen", "0.0.0.0:8080", \
     "--device", "cpu", "--llama-checkpoint-path", "/models", \
     "--decoder-checkpoint-path", "/models/firefly-gan-vq-fsq-8x1024-21hz-generator.pth", \
     "--decoder-config-name", "firefly_gan_vq"]
