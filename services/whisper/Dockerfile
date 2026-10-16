FROM debian:bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates cmake curl g++ make && rm -rf /var/lib/apt/lists/*
ARG WHISPER_VERSION=v1.9.4
ARG GGML_NATIVE=OFF
WORKDIR /src
RUN curl -fLsS "https://github.com/ggml-org/whisper.cpp/archive/refs/tags/${WHISPER_VERSION}.tar.gz" \
    | tar xz --strip-components=1
RUN cmake -S . -B build -DCMAKE_BUILD_TYPE=Release \
    -DBUILD_SHARED_LIBS=OFF -DGGML_NATIVE=${GGML_NATIVE} \
    && cmake --build build --config Release --target whisper-server -j 2

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates ffmpeg libgomp1 && rm -rf /var/lib/apt/lists/*
COPY --from=build /src/build/bin/whisper-server /usr/local/bin/whisper-server
ENTRYPOINT ["whisper-server"]
