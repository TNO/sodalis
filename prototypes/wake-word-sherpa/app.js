const SAMPLE_RATE = 16000;
const MODEL_CHUNK_SAMPLES = 5120;
const MODEL_CHUNK_MS = (MODEL_CHUNK_SAMPLES / SAMPLE_RATE) * 1000;
const LISTENING_STATE_MS = 5000;
const runtimeDirectory = new URL("assets/runtime/", document.baseURI).href;

const elements = {
  micToggle: document.querySelector("#micToggle"),
  micToggleIcon: document.querySelector("#micToggleIcon"),
  micToggleText: document.querySelector("#micToggleText"),
  statePanel: document.querySelector("#statePanel"),
  stateEyebrow: document.querySelector("#stateEyebrow"),
  stateTitle: document.querySelector("#stateTitle"),
  stateDetail: document.querySelector("#stateDetail"),
  pageError: document.querySelector("#pageError"),
  keywords: document.querySelector("#keywords"),
  score: document.querySelector("#score"),
  scoreValue: document.querySelector("#scoreValue"),
  threshold: document.querySelector("#threshold"),
  thresholdValue: document.querySelector("#thresholdValue"),
  applySettings: document.querySelector("#applySettings"),
  settingsState: document.querySelector("#settingsState"),
  detectionCount: document.querySelector("#detectionCount"),
  falseCount: document.querySelector("#falseCount"),
  firstTryRate: document.querySelector("#firstTryRate"),
  attemptCount: document.querySelector("#attemptCount"),
  medianLatency: document.querySelector("#medianLatency"),
  falseButton: document.querySelector("#falseButton"),
  successButton: document.querySelector("#successButton"),
  missButton: document.querySelector("#missButton"),
  ratingButtons: document.querySelector("#ratingButtons"),
  eventList: document.querySelector("#eventList"),
  exportJson: document.querySelector("#exportJson"),
  exportText: document.querySelector("#exportText"),
};

let runtimeReady = false;
let microphoneStarting = false;
let microphoneLive = false;
let startGeneration = 0;
let audioContext;
let mediaStream;
let sourceNode;
let captureNode;
let silentGain;
let listeningStateTimer;
let audioStartPerformanceMs;
let keywordSpotter;
let keywordStream;
let currentRating;

const session = {
  startedAt: new Date().toISOString(),
  model: "sherpa-onnx-kws-zipformer-zh-en-3M-2025-12-20",
  modelChunkFrames: 16,
  modelChunkMs: MODEL_CHUNK_MS,
  detections: [],
  falseActivations: [],
  intendedAttempts: [],
  ratings: [],
  settingsChanges: [],
};

function showError(message) {
  elements.pageError.textContent = message;
  elements.pageError.hidden = false;
  setState("error", "Microphone or detector error", message);
}

function clearError() {
  elements.pageError.textContent = "";
  elements.pageError.hidden = true;
}

function setState(mode, title, detail) {
  elements.statePanel.classList.remove(
    "is-off",
    "is-listening",
    "is-detected",
    "is-error",
  );
  elements.statePanel.classList.add(
    mode === "listening"
      ? "is-listening"
      : mode === "detected"
        ? "is-detected"
        : mode === "error"
          ? "is-error"
          : "is-off",
  );
  elements.stateEyebrow.textContent =
    mode === "listening"
      ? "MICROPHONE ON · LOCAL DETECTOR"
      : mode === "detected"
        ? "ACTIVATION DETECTED"
        : mode === "error"
          ? "CHECK REQUIRED"
          : "MICROPHONE OFF";
  elements.stateTitle.textContent = title;
  elements.stateDetail.textContent = detail;
  elements.micToggle.setAttribute("aria-pressed", String(microphoneLive));
  elements.micToggleText.textContent = microphoneLive
    ? "Mute microphone"
    : microphoneStarting
      ? "Cancel microphone start"
      : "Start wake listening";
  elements.micToggleIcon.textContent = microphoneLive ? "●" : "○";
  elements.falseButton.disabled = !microphoneLive;
  elements.successButton.disabled = !microphoneLive;
  elements.missButton.disabled = !microphoneLive;
}

function makeKeywordSpotter() {
  if (!runtimeReady || typeof window.createKws !== "function") {
    throw new Error("The local sherpa-onnx WASM runtime is not ready.");
  }
  const keywords = elements.keywords.value.trim();
  if (!keywords || !keywords.includes("@")) {
    throw new Error("Add at least one tokenized keyword line ending in @NAME.");
  }
  const config = {
    featConfig: { samplingRate: SAMPLE_RATE, featureDim: 80 },
    modelConfig: {
      transducer: {
        encoder: "./encoder-epoch-13-avg-2-chunk-16-left-64.int8.onnx",
        decoder: "./decoder-epoch-13-avg-2-chunk-16-left-64.onnx",
        joiner: "./joiner-epoch-13-avg-2-chunk-16-left-64.int8.onnx",
      },
      tokens: "./tokens.txt",
      provider: "cpu",
      modelType: "",
      numThreads: 1,
      debug: 0,
      modelingUnit: "cjkchar",
      bpeVocab: "",
    },
    maxActivePaths: 4,
    numTrailingBlanks: 1,
    keywordsScore: Number(elements.score.value),
    keywordsThreshold: Number(elements.threshold.value),
    keywords,
  };
  return window.createKws(window.Module, config);
}

function replaceKeywordSpotter() {
  const keywords = elements.keywords.value.trim();
  const nextSpotter = makeKeywordSpotter();
  const nextStream = nextSpotter.createStream();
  keywordStream?.free();
  keywordSpotter?.free();
  keywordSpotter = nextSpotter;
  keywordStream = nextStream;
  audioStartPerformanceMs = undefined;
  session.settingsChanges.push({
    at: new Date().toISOString(),
    keywords,
    keywordsScore: Number(elements.score.value),
    keywordsThreshold: Number(elements.threshold.value),
  });
  elements.settingsState.textContent = "Applied to the local detector.";
}

function updateCounters() {
  elements.detectionCount.textContent = String(session.detections.length);
  elements.falseCount.textContent = String(session.falseActivations.length);
  const attempts = session.intendedAttempts;
  const successes = attempts.filter((attempt) => attempt.result === "first-try-success").length;
  const misses = attempts.filter((attempt) => attempt.result === "first-try-miss").length;
  const total = successes + misses;
  elements.firstTryRate.textContent = total ? `${Math.round((successes / total) * 100)}%` : "—";
  elements.attemptCount.textContent = `${total} intended attempts · ${successes} success · ${misses} miss`;
  const latencies = session.detections
    .map((detection) => detection.activationLatencyMs)
    .filter((latency) => Number.isFinite(latency))
    .sort((a, b) => a - b);
  if (!latencies.length) {
    elements.medianLatency.textContent = "—";
  } else {
    const middle = Math.floor(latencies.length / 2);
    const median = latencies.length % 2
      ? latencies[middle]
      : (latencies[middle - 1] + latencies[middle]) / 2;
    elements.medianLatency.textContent = `${Math.round(median)} ms`;
  }
}

function renderEventList() {
  elements.eventList.replaceChildren();
  const entries = [
    ...session.detections.map((event) => ({
      type: "Detection",
      at: event.visibleAt,
      detail: event.keyword,
      latency: `${Math.round(event.activationLatencyMs)} ms`,
    })),
    ...session.falseActivations.map((event) => ({
      type: "False activation",
      at: event.at,
      detail: "Counted by tester",
      latency: "—",
    })),
    ...session.intendedAttempts.map((event) => ({
      type: event.result === "first-try-success" ? "First-try success" : "First-try miss",
      at: event.at,
      detail: "Intended Dutch attempt",
      latency: "—",
    })),
    ...session.ratings.map((event) => ({
      type: "Intrusiveness",
      at: event.at,
      detail: event.rating,
      latency: "—",
    })),
  ].sort((a, b) => a.at.localeCompare(b.at)).reverse();

  if (!entries.length) {
    const empty = document.createElement("li");
    empty.className = "empty-log";
    empty.textContent = "No detections or observations recorded yet.";
    elements.eventList.append(empty);
    return;
  }
  for (const entry of entries) {
    const item = document.createElement("li");
    const detail = document.createElement("span");
    const timestamp = document.createElement("span");
    const latency = document.createElement("strong");
    detail.textContent = `${entry.type} · ${entry.detail}`;
    timestamp.textContent = new Date(entry.at).toLocaleString();
    latency.textContent = entry.latency;
    item.append(detail, timestamp, latency);
    elements.eventList.append(item);
  }
}

function recordEvent() {
  updateCounters();
  renderEventList();
}

function playChime() {
  if (!audioContext || audioContext.state !== "running") return;
  const now = audioContext.currentTime;
  const gain = audioContext.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.16, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);
  gain.connect(audioContext.destination);
  for (const [frequency, offset] of [[880, 0], [1320, 0.12]]) {
    const oscillator = audioContext.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    oscillator.connect(gain);
    oscillator.start(now + offset);
    oscillator.stop(now + offset + 0.24);
  }
  window.setTimeout(() => gain.disconnect(), 500);
}

function handleDetection(result) {
  const detectedAtPerf = performance.now();
  const detection = {
    detectedAt: new Date().toISOString(),
    keyword: result.keyword,
    tokens: Array.isArray(result.tokens) ? [...result.tokens] : [],
    modelChunkMs: MODEL_CHUNK_MS,
    modelChunkFrames: 16,
  };
  const timestamps = Array.isArray(result.timestamps) ? result.timestamps : [];
  const triggerEndOffsetSeconds = timestamps.length
    ? Number(timestamps[timestamps.length - 1])
    : undefined;
  let triggerEndPerformanceMs;
  if (
    Number.isFinite(triggerEndOffsetSeconds) &&
    Number.isFinite(audioStartPerformanceMs)
  ) {
    triggerEndPerformanceMs = audioStartPerformanceMs + triggerEndOffsetSeconds * 1000;
    detection.latencyBasis = "sherpa token timestamp";
  } else {
    triggerEndPerformanceMs = detectedAtPerf - MODEL_CHUNK_MS;
    detection.latencyBasis = "one 320 ms chunk estimate";
  }
  detection.triggerEndAt = new Date(
    Date.now() - (performance.now() - triggerEndPerformanceMs),
  ).toISOString();

  setState(
    "detected",
    "Sodalis is listening",
    `Wake phrase “${result.keyword}” matched. This prototype does not transcribe the follow-up.`,
  );
  window.requestAnimationFrame(() => {
    const visibleAtPerf = performance.now();
    detection.visibleAt = new Date().toISOString();
    detection.activationLatencyMs = Math.max(0, visibleAtPerf - triggerEndPerformanceMs);
    session.detections.push(detection);
    playChime();
    recordEvent();
  });
  window.clearTimeout(listeningStateTimer);
  listeningStateTimer = window.setTimeout(() => {
    if (microphoneLive) {
      setState(
        "listening",
        "Wake word active",
        "Listening for the configured phrase. No post-activation speech is recorded.",
      );
    }
  }, LISTENING_STATE_MS);
}

function consumeAudioChunk(buffer) {
  if (!microphoneLive || !keywordSpotter || !keywordStream) return;
  const samples = new Float32Array(buffer);
  try {
    if (audioStartPerformanceMs === undefined) {
      audioStartPerformanceMs = performance.now() - (samples.length / SAMPLE_RATE) * 1000;
    }
    keywordStream.acceptWaveform(SAMPLE_RATE, samples);
    const stagingOffset = keywordStream.pointer / Float32Array.BYTES_PER_ELEMENT;
    window.Module.HEAPF32.fill(0, stagingOffset, stagingOffset + samples.length);
    let decodes = 0;
    while (keywordSpotter.isReady(keywordStream) && decodes < 32) {
      keywordSpotter.decode(keywordStream);
      decodes += 1;
      const result = keywordSpotter.getResult(keywordStream);
      if (result.keyword) {
        handleDetection(result);
        keywordSpotter.reset(keywordStream);
      }
    }
  } catch (error) {
    const message = `WASM keyword processing failed: ${error instanceof Error ? error.message : String(error)}`;
    void stopMicrophone({ keepError: true }).then(() => showError(message));
  } finally {
    samples.fill(0);
  }
}

const processorSource = `
class SherpaKwsCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.phase = 0;
    this.sum = 0;
    this.count = 0;
    this.index = 0;
    this.chunk = new Float32Array(${MODEL_CHUNK_SAMPLES});
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;
    for (let i = 0; i < channel.length; i += 1) {
      this.sum += channel[i];
      this.count += 1;
      this.phase += ${SAMPLE_RATE};
      if (this.phase >= sampleRate) {
        this.chunk[this.index] = this.sum / this.count;
        this.index += 1;
        this.phase -= sampleRate;
        this.sum = 0;
        this.count = 0;
        if (this.index === this.chunk.length) {
          const completed = this.chunk;
          this.chunk = new Float32Array(${MODEL_CHUNK_SAMPLES});
          this.index = 0;
          this.port.postMessage(completed.buffer, [completed.buffer]);
        }
      }
    }
    return true;
  }
}
registerProcessor("sherpa-kws-capture", SherpaKwsCaptureProcessor);
`;

async function startMicrophone() {
  const run = ++startGeneration;
  microphoneStarting = true;
  clearError();
  setState("off", "Requesting microphone", "Approve the browser microphone prompt to start local detection.");
  elements.micToggle.disabled = false;
  try {
    if (!runtimeReady) throw new Error("The local WASM detector has not finished loading.");
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("This browser does not support microphone access on this page. Use localhost or HTTPS in a current browser.");
    }
    if (!keywordSpotter || !keywordStream) replaceKeywordSpotter();
    const context = new AudioContext();
    audioContext = context;
    await context.resume();
    const inputStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    });
    if (run !== startGeneration) {
      inputStream.getTracks().forEach((track) => track.stop());
      await context.close();
      if (audioContext === context) audioContext = undefined;
      microphoneStarting = false;
      return;
    }
    mediaStream = inputStream;
    const source = context.createMediaStreamSource(inputStream);
    sourceNode = source;
    const workletUrl = URL.createObjectURL(
      new Blob([processorSource], { type: "text/javascript" }),
    );
    try {
      await context.audioWorklet.addModule(workletUrl);
    } finally {
      URL.revokeObjectURL(workletUrl);
    }
    if (run !== startGeneration) {
      inputStream.getTracks().forEach((track) => track.stop());
      await context.close();
      if (audioContext === context) audioContext = undefined;
      microphoneStarting = false;
      return;
    }
    const capture = new AudioWorkletNode(context, "sherpa-kws-capture", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    capture.port.onmessage = (event) => consumeAudioChunk(event.data);
    captureNode = capture;
    const silent = context.createGain();
    silent.gain.value = 0;
    silentGain = silent;
    source.connect(capture);
    capture.connect(silent);
    silent.connect(context.destination);
    inputStream.getAudioTracks().forEach((track) => {
      track.addEventListener("ended", () => {
        if (microphoneLive) {
          void stopMicrophone({ keepError: true }).then(() =>
            showError("The microphone was disconnected. It is now muted."),
          );
        }
      }, { once: true });
    });
    microphoneLive = true;
    microphoneStarting = false;
    audioStartPerformanceMs = undefined;
    setState(
      "listening",
      "Wake word active",
      "Listening for the configured phrase. Audio stays on this device and is not recorded.",
    );
  } catch (error) {
    microphoneStarting = false;
    const message = error instanceof Error ? error.message : String(error);
    await stopMicrophone({ keepError: true });
    showError(message.includes("Permission") || message.includes("denied")
      ? "Microphone permission was denied. Allow it in the browser’s site controls, then try again."
      : message);
  }
}

async function stopMicrophone(options = {}) {
  startGeneration += 1;
  microphoneLive = false;
  microphoneStarting = false;
  window.clearTimeout(listeningStateTimer);
  if (captureNode) {
    captureNode.port.onmessage = null;
    try { captureNode.disconnect(); } catch { /* already disconnected */ }
    captureNode = undefined;
  }
  if (sourceNode) {
    try { sourceNode.disconnect(); } catch { /* already disconnected */ }
    sourceNode = undefined;
  }
  if (silentGain) {
    try { silentGain.disconnect(); } catch { /* already disconnected */ }
    silentGain = undefined;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = undefined;
  }
  const context = audioContext;
  audioContext = undefined;
  if (context && context.state !== "closed") {
    try { await context.close(); } catch { /* browser already closed it */ }
  }
  keywordStream?.free();
  keywordStream = undefined;
  keywordSpotter?.free();
  keywordSpotter = undefined;
  audioStartPerformanceMs = undefined;
  if (!options.keepError) {
    setState("off", "Muted", "The detector is not listening. Turn it on when you are ready.");
  }
}

function currentSessionData() {
  return {
    prototype: "sherpa-onnx browser keyword spotting",
    startedAt: session.startedAt,
    exportedAt: new Date().toISOString(),
    model: session.model,
    modelLicense: "Apache-2.0 (original pkufool model card on ModelScope)",
    modelLicenseSource: "https://modelscope.cn/models/pkufool/icefall-kws-zipformer-zh-en-3M-2025-12-20",
    runtimeLicense: "Apache-2.0",
    chunkFrames: session.modelChunkFrames,
    chunkLatencyMs: session.modelChunkMs,
    audioPolicy: "No audio is saved or sent over the network. The detector processes transient microphone chunks locally. The log contains event metadata only.",
    currentSettings: {
      keywords: elements.keywords.value.trim(),
      keywordsScore: Number(elements.score.value),
      keywordsThreshold: Number(elements.threshold.value),
    },
    detections: session.detections,
    falseActivationCount: session.falseActivations.length,
    falseActivations: session.falseActivations,
    intendedAttempts: session.intendedAttempts,
    firstTrySuccessRate: session.intendedAttempts.length
      ? session.intendedAttempts.filter((attempt) => attempt.result === "first-try-success").length /
        session.intendedAttempts.length
      : null,
    intrusiveness: currentRating,
    ratings: session.ratings,
    settingsChanges: session.settingsChanges,
  };
}

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function textSessionLog(data) {
  const attempts = data.intendedAttempts;
  const successes = attempts.filter((attempt) => attempt.result === "first-try-success").length;
  const misses = attempts.filter((attempt) => attempt.result === "first-try-miss").length;
  const lines = [
    "Hey Sodalis — sherpa-onnx KWS prototype session",
    `Started: ${data.startedAt}`,
    `Exported: ${data.exportedAt}`,
    `Model: ${data.model}`,
    `Chunk: ${data.chunkFrames} frames / ${data.chunkLatencyMs} ms`,
    `Current keyword line(s): ${data.currentSettings.keywords.replaceAll("\n", " | ")}`,
    `Boost: ${data.currentSettings.keywordsScore}; threshold: ${data.currentSettings.keywordsThreshold}`,
    `Detections: ${data.detections.length}`,
    `False activations: ${data.falseActivationCount}`,
    `First-try successes: ${successes}; misses: ${misses}; success rate: ${data.firstTrySuccessRate === null ? "not measured" : `${Math.round(data.firstTrySuccessRate * 100)}%`}`,
    `Median activation latency: ${elements.medianLatency.textContent}`,
    `Felt intrusiveness: ${data.intrusiveness?.rating ?? "not rated"}`,
    "",
    "Detection events:",
    ...(data.detections.length
      ? data.detections.map((detection) =>
          `- ${detection.visibleAt} | ${detection.keyword} | ${Math.round(detection.activationLatencyMs)} ms | ${detection.latencyBasis} | chunk ${detection.modelChunkMs} ms`,
        )
      : ["- None"]),
    "",
    "False-activation event times:",
    ...(data.falseActivations.length
      ? data.falseActivations.map((event) => `- ${event.at}`)
      : ["- None recorded"]),
    "",
    "Intended attempts:",
    ...(attempts.length
      ? attempts.map((attempt) => `- ${attempt.at} | ${attempt.result}`)
      : ["- None recorded"]),
    "",
    "Audio was not stored or included in this export.",
  ];
  return lines.join("\n");
}

window.Module = {
  locateFile(path) {
    return new URL(path, runtimeDirectory).href;
  },
  onRuntimeInitialized() {
    runtimeReady = true;
    elements.micToggle.disabled = false;
    elements.applySettings.disabled = false;
    try {
      replaceKeywordSpotter();
      setState("off", "Muted", "The local detector is ready. Start listening when you are ready.");
    } catch (error) {
      showError(error instanceof Error ? error.message : String(error));
    }
  },
  onAbort(reason) {
    showError(`The local WASM runtime could not start: ${String(reason)}`);
  },
};

window.addEventListener("error", (event) => {
  if (!runtimeReady && event.message) {
    showError(`Could not load the local WASM runtime: ${event.message}`);
  }
});

elements.micToggle.addEventListener("click", () => {
  if (microphoneLive || microphoneStarting) {
    void stopMicrophone();
  } else {
    void startMicrophone();
  }
});
elements.applySettings.addEventListener("click", () => {
  try {
    replaceKeywordSpotter();
    clearError();
    if (microphoneLive) {
      setState("listening", "Wake word active", "Updated keyword settings are now active locally.");
    }
  } catch (error) {
    elements.settingsState.textContent = error instanceof Error ? error.message : String(error);
  }
});
elements.score.addEventListener("input", () => {
  elements.scoreValue.textContent = Number(elements.score.value).toFixed(1);
});
elements.threshold.addEventListener("input", () => {
  elements.thresholdValue.textContent = Number(elements.threshold.value).toFixed(2);
});
elements.falseButton.addEventListener("click", () => {
  const event = { at: new Date().toISOString() };
  session.falseActivations.push(event);
  recordEvent();
});
elements.successButton.addEventListener("click", () => {
  session.intendedAttempts.push({ at: new Date().toISOString(), result: "first-try-success" });
  recordEvent();
});
elements.missButton.addEventListener("click", () => {
  session.intendedAttempts.push({ at: new Date().toISOString(), result: "first-try-miss" });
  recordEvent();
});
elements.ratingButtons.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-rating]");
  if (!button) return;
  currentRating = { rating: button.dataset.rating, at: new Date().toISOString() };
  session.ratings.push(currentRating);
  for (const option of elements.ratingButtons.querySelectorAll("button[data-rating]")) {
    option.setAttribute("aria-pressed", String(option === button));
  }
  recordEvent();
});
elements.exportJson.addEventListener("click", () => {
  const data = currentSessionData();
  downloadFile("hey-sodalis-session.json", JSON.stringify(data, null, 2), "application/json");
});
elements.exportText.addEventListener("click", () => {
  downloadFile("hey-sodalis-session.txt", textSessionLog(currentSessionData()), "text/plain;charset=utf-8");
});

updateCounters();
renderEventList();
setState("off", "Loading local detector", "No microphone is active while the WASM engine loads.");
