FROM python:3.12-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl ffmpeg && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir sherpa-onnx==1.13.8 "numpy>=1.24,<3"
ARG MODEL_REVISION=2bda32ec70b097a55adaa07d9a7173915b43cc78
RUN mkdir -p /models && for file in encoder.int8.onnx decoder.int8.onnx \
    joiner.int8.onnx tokens.txt; do \
      curl -fLsS --retry 3 \
        "https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/resolve/${MODEL_REVISION}/${file}" \
        -o "/models/${file}" || exit 1; \
    done
WORKDIR /app
COPY services/speech-http/server.py /app/speech_http.py
COPY services/parakeet-tdt/main.py /app/main.py
EXPOSE 8080
CMD ["python", "/app/main.py"]
