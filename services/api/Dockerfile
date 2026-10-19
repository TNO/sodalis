# Minimal LGPL FFmpeg that decodes browser speech uploads to PCM (about 2 MB
# instead of Debian's ~470 MB ffmpeg package). Bump the version and checksum
# together for security fixes.
FROM debian:bookworm-slim AS ffmpeg
ARG FFMPEG_VERSION=7.1.1
ARG FFMPEG_SHA256=733984395e0dbbe5c046abda2dc49a5544e7e0e1e2366bba849222ae9e3a03b1
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential ca-certificates curl pkg-config xz-utils \
    && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL "https://ffmpeg.org/releases/ffmpeg-${FFMPEG_VERSION}.tar.xz" -o /tmp/ffmpeg.tar.xz \
    && echo "${FFMPEG_SHA256}  /tmp/ffmpeg.tar.xz" | sha256sum -c - \
    && mkdir /src && tar -xJf /tmp/ffmpeg.tar.xz -C /src --strip-components=1
WORKDIR /src
RUN ./configure --disable-everything --disable-autodetect --disable-doc \
      --disable-debug --disable-network --disable-ffplay --disable-ffprobe \
      --disable-x86asm --enable-small --disable-shared --enable-static \
      --enable-protocol=pipe \
      --enable-demuxer=matroska,ogg,wav,mov,mp3 \
      --enable-decoder=opus,vorbis,pcm_s16le,aac,mp3 \
      --enable-parser=opus,vorbis,aac,mpegaudio \
      --enable-muxer=pcm_s16le --enable-encoder=pcm_s16le --enable-swresample \
      --enable-filter=aresample,aformat,anull,abuffer,abuffersink \
    && make -j"$(nproc)" ffmpeg && strip ffmpeg

FROM node:24-bookworm-slim
COPY --from=ffmpeg /src/ffmpeg /usr/local/bin/ffmpeg
WORKDIR /app
RUN npm install -g pnpm@12.4.1
# Fetching from the lockfile alone keeps the dependency layer cached across
# source changes.
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY . .
RUN pnpm install --frozen-lockfile --offline
ENV HOST=0.0.0.0
