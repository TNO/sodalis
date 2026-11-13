import initRustpotter, { WakewordRefCreator } from "rustpotter-web";
import { RustpotterService } from "rustpotter-worklet";
import rustpotterWasmUrl from "rustpotter-worklet/dist/rustpotter_wasm_bg.wasm?url";
import rustpotterWorkletUrl from "rustpotter-worklet/dist/rustpotter-worklet.js?url";
import rustpotterWorkerUrl from "rustpotter-worklet/dist/rustpotter-worker.js?url";
import referenceWasmUrl from "rustpotter-web/rustpotter_wasm_bg.wasm?url";
import "./style.css";

type MicMode = "off" | "recording" | "waiting" | "activated";
type Rating = "fine" | "uneasy" | "unacceptable";
type AttemptStatus =
  | "in_progress"
  | "first_try_success"
  | "first_try_missed"
  | "retry_in_progress"
  | "retry_success"
  | "missed";

interface IntendedAttempt {
  number: number;
  startedAt: string;
  firstTryMissedAt?: string;
  retryStartedAt?: string;
  finishedAt?: string;
  status: AttemptStatus;
}

interface DetectionEntry {
  number: number;
  timestamp: string;
  score: number;
  activationLatencyMs: number | null;
  latencyMethod: string;
  falseActivation: boolean;
  attemptOutcome?: "first_try_success" | "retry_success";
}

interface SessionEvent {
  type: string;
  timestamp: string;
  [key: string]: string | number | boolean | null | undefined;
}

interface PlaybackPeriod {
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
}

interface RecordingSession {
  stream: MediaStream;
  source: MediaStreamAudioSourceNode;
  processor: ScriptProcessorNode;
  silentGain: GainNode;
  chunks: Float32Array[];
  timer: ReturnType<typeof setTimeout>;
}

const MAX_SAMPLES = 10;
const MIN_SAMPLES = 3;
const RECORDING_MS = 3_000;
const ATTEMPT_WINDOW_MS = 8_000;
const DETECTION_COOLDOWN_MS = 3_000;
const PLAYBACK_TARGET_MS = 10 * 60 * 1_000;
const KEYWORD_KEY = "hey_sodalis";
const SPEECH_RMS_THRESHOLD = 0.012;
const SPEECH_END_QUIET_MS = 180;

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing page element: ${id}`);
  return element as T;
};

const topbar = document.querySelector<HTMLElement>(".topbar")!;
const micStateText = byId("mic-state-text");
const muteButton = byId<HTMLButtonElement>("mute-button");
const activationCard = byId<HTMLElement>("activation-card");
const activationEyebrow = byId("activation-eyebrow");
const activationTitle = byId("activation-title");
const activationDetail = byId("activation-detail");
const statusOrb = byId<HTMLElement>("status-orb");
const recordButton = byId<HTMLButtonElement>("record-button");
const buildButton = byId<HTMLButtonElement>("build-button");
const clearButton = byId<HTMLButtonElement>("clear-button");
const listenButton = byId<HTMLButtonElement>("listen-button");
const playbackButton = byId<HTMLButtonElement>("playback-button");
const attemptButton = byId<HTMLButtonElement>("attempt-button");
const retryButton = byId<HTMLButtonElement>("retry-button");
const missButton = byId<HTMLButtonElement>("miss-button");
const falseButton = byId<HTMLButtonElement>("false-button");
const message = byId("message");
const sampleList = byId<HTMLOListElement>("sample-list");
const detectionList = byId<HTMLOListElement>("detection-list");
const appState = byId("app-state");
const attemptStatus = byId("attempt-status");

const sessionStartedAt = new Date().toISOString();
const events: SessionEvent[] = [];
const samples: Float32Array[] = [];
const detections: DetectionEntry[] = [];
const attempts: IntendedAttempt[] = [];
const playbackPeriods: PlaybackPeriod[] = [];
const timerDelaysMs: number[] = [];
let mode: MicMode = "off";
let audioContext: AudioContext | undefined;
let recording: RecordingSession | undefined;
let registeredModel: Uint8Array | undefined;
let registeredSampleCount = 0;
let buildingKeyword = false;
let detectionService: RustpotterService | undefined;
let microphoneStream: MediaStream | undefined;
let microphoneSource: MediaStreamAudioSourceNode | undefined;
let analyser: AnalyserNode | undefined;
let levelTimer: ReturnType<typeof setInterval> | undefined;
let monitorTimer: ReturnType<typeof setInterval> | undefined;
let activationTimer: ReturnType<typeof setTimeout> | undefined;
let attemptTimer: ReturnType<typeof setTimeout> | undefined;
let playbackTimer: ReturnType<typeof setInterval> | undefined;
let playbackStartedAt: number | undefined;
let lastDetectionAt = 0;
let lastSpeechAboveThresholdAt: number | undefined;
let estimatedSpeechEndAt: number | undefined;
let speechEnergyActive = false;
let latencyLabel = "—";
let messageText = "";
let intrusiveness: Rating | null = null;
let lastDetectionForFalseMark: DetectionEntry | undefined;
let referenceInit: Promise<unknown> | undefined;

function logEvent(type: string, values: Record<string, string | number | boolean | null> = {}): void {
  events.push({ type, timestamp: new Date().toISOString(), ...values });
}

function setMessage(text: string): void {
  messageText = text;
  message.textContent = text;
}

function setMode(next: MicMode): void {
  mode = next;
  topbar.dataset.mode = mode;
  activationCard.dataset.mode = mode;
  statusOrb.dataset.mode = mode;

  const labels: Record<MicMode, { short: string; eyebrow: string; title: string; detail: string }> = {
    off: {
      short: "Microfoon uit — niet aan het luisteren",
      eyebrow: registeredModel ? "KLAAR VOOR DE TEST" : "MICROFOON UIT",
      title: registeredModel ? "Klaar om te testen" : "Nog niet actief",
      detail: registeredModel
        ? "Start luisteren wanneer je wilt. Je kunt op elk moment dempen."
        : "Neem eerst minimaal drie voorbeelden op.",
    },
    recording: {
      short: "Microfoon aan — voorbeeld opnemen",
      eyebrow: "VOORBEELD OPNEMEN",
      title: "Zeg “Hey Sodalis”",
      detail: "De opname stopt vanzelf. Je kunt direct dempen om te stoppen.",
    },
    waiting: {
      short: "Microfoon aan — lokaal wachten op Hey Sodalis",
      eyebrow: "MICROFOON AAN · LOKAAL",
      title: "Ik wacht op “Hey Sodalis”",
      detail: "De audio wordt alleen op dit apparaat verwerkt en niet bewaard.",
    },
    activated: {
      short: "Wakeword herkend — microfoon blijft luisteren",
      eyebrow: "ACTIVATIE HERKEND",
      title: "Ik luister naar u",
      detail: "Dit prototype start geen spraakherkenning of gesprek.",
    },
  };
  const labelsForMode = labels[mode];
  micStateText.textContent = labelsForMode.short;
  activationEyebrow.textContent = labelsForMode.eyebrow;
  activationTitle.textContent = labelsForMode.title;
  activationDetail.textContent = labelsForMode.detail;
  muteButton.disabled = mode === "off";
  muteButton.textContent = mode === "off" ? "Microfoon uit" : "Dempen · microfoon uit";
  muteButton.setAttribute("aria-label", mode === "off" ? "Microfoon staat uit" : "Dempen en microfoon uitzetten");
  recordButton.disabled = mode !== "off" || buildingKeyword || Boolean(registeredModel) || samples.length >= MAX_SAMPLES;
  buildButton.disabled = mode !== "off" || buildingKeyword || Boolean(registeredModel) || samples.length < MIN_SAMPLES;
  clearButton.disabled = mode === "recording" || buildingKeyword || (samples.length === 0 && !registeredModel && registeredSampleCount === 0);
  listenButton.disabled = mode === "recording" || buildingKeyword || (!registeredModel && mode === "off");
  listenButton.textContent = mode === "waiting" || mode === "activated" ? "Stop luisteren" : "Start luisteren";
  playbackButton.disabled = mode !== "waiting" && mode !== "activated";
  attemptButton.disabled = (mode !== "waiting" && mode !== "activated") || Boolean(activeAttemptUnresolved());
  falseButton.disabled = mode !== "waiting" && mode !== "activated";
  updateCounts();
}

function currentAttempt(): IntendedAttempt | undefined {
  const last = attempts.at(-1);
  return last && !last.finishedAt ? last : undefined;
}

function activeAttemptUnresolved(): IntendedAttempt | undefined {
  const active = currentAttempt();
  return active && (active.status === "in_progress" || active.status === "first_try_missed" || active.status === "retry_in_progress")
    ? active
    : undefined;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60).toString();
  const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function activePlaybackSeconds(now = Date.now()): number {
  const current = playbackStartedAt === undefined ? 0 : (now - playbackStartedAt) / 1_000;
  return playbackPeriods.reduce((sum, period) => sum + period.durationSeconds, 0) + current;
}

function falseActivationCount(): number {
  return events.filter((event) => event.type === "false_activation").length;
}

function firstTrySuccessCount(): number {
  return attempts.filter((attempt) => attempt.status === "first_try_success").length;
}

function firstTryMissCount(): number {
  return attempts.filter((attempt) => Boolean(attempt.firstTryMissedAt)).length;
}

function retrySuccessCount(): number {
  return attempts.filter((attempt) => attempt.status === "retry_success").length;
}

function finalMissCount(): number {
  return attempts.filter((attempt) => attempt.status === "missed").length;
}

function updateCounts(): void {
  const sampleCount = registeredModel ? registeredSampleCount : samples.length;
  byId("sample-count").textContent = `${sampleCount} / ${MAX_SAMPLES}`;
  byId("detection-count").textContent = String(detections.length);
  byId("false-count").textContent = String(falseActivationCount());
  byId("attempt-count").textContent = String(attempts.length);
  byId("first-success-count").textContent = String(firstTrySuccessCount());
  byId("first-miss-count").textContent = String(firstTryMissCount());
  byId("retry-success-count").textContent = String(retrySuccessCount());
  byId("final-miss-count").textContent = String(finalMissCount());
  byId("playback-time").textContent = formatDuration(activePlaybackSeconds());
  byId("latest-latency").textContent = latencyLabel;
  const delayAverage = timerDelaysMs.length
    ? timerDelaysMs.reduce((sum, value) => sum + value, 0) / timerDelaysMs.length
    : undefined;
  byId("cpu-delay").textContent = delayAverage === undefined ? "—" : `${delayAverage.toFixed(1)} ms`;
  const playbackSeconds = activePlaybackSeconds();
  byId("false-rate").textContent = playbackSeconds > 0
    ? `${(falseActivationCount() / (playbackSeconds / 3_600)).toFixed(2)} / uur`
    : "—";
  appState.textContent = `${mode === "off" ? "Microfoon uit" : "Microfoon aan"} · ${sampleCount} voorbeelden · ${detections.length} detecties`;
  recordButton.textContent = mode === "recording"
    ? "Opname loopt…"
    : registeredModel
      ? "Voorbeelden geregistreerd"
      : samples.length >= MAX_SAMPLES
        ? `Maximaal ${MAX_SAMPLES} voorbeelden`
        : `Neem voorbeeld op (${samples.length + 1})`;
  attemptButton.disabled = (mode !== "waiting" && mode !== "activated") || Boolean(activeAttemptUnresolved());
  renderAttempts();
}

function renderSamples(): void {
  sampleList.replaceChildren();
  if (registeredModel) {
    for (let index = 0; index < registeredSampleCount; index += 1) {
      const item = document.createElement("li");
      item.textContent = `Voorbeeld ${index + 1} — gebruikt; opname gewist`;
      sampleList.append(item);
    }
  } else {
    samples.forEach((_, index) => {
      const item = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = `Voorbeeld ${index + 1} — alleen in geheugen`;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Verwijderen";
      remove.setAttribute("aria-label", `Voorbeeld ${index + 1} verwijderen`);
      remove.addEventListener("click", () => {
        samples[index]?.fill(0);
        samples.splice(index, 1);
        logEvent("sample_discarded", { sampleNumber: index + 1 });
        renderSamples();
        updateCounts();
        setMode("off");
      });
      item.append(label, remove);
      sampleList.append(item);
    });
  }
  if (samples.length === 0 && !registeredModel) {
    sampleList.innerHTML = "";
  }
  updateCounts();
}

function renderAttempts(): void {
  const active = activeAttemptUnresolved();
  retryButton.hidden = !active || active.status !== "first_try_missed";
  missButton.hidden = !active || active.status === "in_progress";
  if (!active) {
    const latest = attempts.at(-1);
    if (!latest) {
      attemptStatus.textContent = "Voor een bedoelde poging: tik op de knop en zeg “Hey Sodalis”.";
    } else if (latest.status === "first_try_success") {
      attemptStatus.textContent = `Poging ${latest.number}: eerste poging gelukt. Je kunt de volgende starten.`;
    } else if (latest.status === "retry_success") {
      attemptStatus.textContent = `Poging ${latest.number}: eerste poging gemist, na één herhaling gelukt.`;
    } else if (latest.status === "missed") {
      attemptStatus.textContent = `Poging ${latest.number}: gemist, ook na een eventuele herhaling.`;
    } else {
      attemptStatus.textContent = "Voor een bedoelde poging: tik op de knop en zeg “Hey Sodalis”.";
    }
    return;
  }
  if (active.status === "in_progress") {
    attemptStatus.textContent = `Poging ${active.number}: zeg nu “Hey Sodalis”. Eerste poging loopt.`;
  } else if (active.status === "first_try_missed") {
    attemptStatus.textContent = `Poging ${active.number}: eerste poging gemist. Probeer één keer opnieuw of markeer als gemist.`;
  } else {
    attemptStatus.textContent = `Poging ${active.number}: herhaling loopt.`;
  }
}

function renderDetections(): void {
  detectionList.replaceChildren();
  const visible = detections.slice(-10).reverse();
  if (!visible.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "Nog geen detecties.";
    detectionList.append(empty);
    return;
  }
  for (const detection of visible) {
    const item = document.createElement("li");
    const details = document.createElement("span");
    details.className = "detection-meta";
    const time = document.createElement("strong");
    time.textContent = `${new Date(detection.timestamp).toLocaleTimeString()} · score ${detection.score.toFixed(2)}`;
    const latency = document.createElement("small");
    latency.textContent = detection.activationLatencyMs === null
      ? "Vertraging niet gemeten"
      : `Geschatte activatievertraging ${detection.activationLatencyMs} ms`;
    details.append(time, latency);
    const badge = document.createElement("span");
    badge.className = detection.falseActivation ? "detection-badge false" : "detection-badge";
    badge.textContent = detection.falseActivation ? "Vals" : detection.attemptOutcome === "first_try_success"
      ? "Eerste poging"
      : detection.attemptOutcome === "retry_success"
        ? "Na herhaling"
        : "Detectie";
    item.append(details, badge);
    detectionList.append(item);
  }
}

function makeFloatWav(samplesAtContextRate: Float32Array): Uint8Array {
  const dataLength = samplesAtContextRate.length * 4;
  const output = new Uint8Array(44 + dataLength);
  const view = new DataView(output.buffer);
  const writeText = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };
  writeText(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 3, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, audioContext?.sampleRate ?? 16_000, true);
  view.setUint32(28, (audioContext?.sampleRate ?? 16_000) * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 32, true);
  writeText(36, "data");
  view.setUint32(40, dataLength, true);
  for (let index = 0; index < samplesAtContextRate.length; index += 1) {
    view.setFloat32(44 + index * 4, samplesAtContextRate[index] ?? 0, true);
  }
  return output;
}

async function getAudioContext(): Promise<AudioContext> {
  if (!audioContext || audioContext.state === "closed") {
    try {
      audioContext = new AudioContext({ sampleRate: 16_000 });
    } catch {
      audioContext = new AudioContext();
    }
  }
  await audioContext.resume();
  return audioContext;
}

function cleanupRecording(keepSample: boolean): void {
  const active = recording;
  if (!active) return;
  clearTimeout(active.timer);
  active.processor.onaudioprocess = null;
  active.source.disconnect();
  active.processor.disconnect();
  active.silentGain.disconnect();
  active.stream.getTracks().forEach((track) => track.stop());
  recording = undefined;
  if (keepSample) {
    const length = active.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const collected = new Float32Array(length);
    let offset = 0;
    for (const chunk of active.chunks) {
      collected.set(chunk, offset);
      offset += chunk.length;
      chunk.fill(0);
    }
    if (collected.length > 4_000) {
      samples.push(collected);
      logEvent("sample_recorded_in_memory", { sampleNumber: samples.length, durationSeconds: Number((collected.length / (audioContext?.sampleRate ?? 16_000)).toFixed(2)) });
      setMessage(`Voorbeeld ${samples.length} is tijdelijk in het geheugen opgenomen.`);
    } else {
      collected.fill(0);
      setMessage("Er is te weinig geluid opgenomen. Probeer het nog een keer.");
    }
  } else {
    active.chunks.forEach((chunk) => chunk.fill(0));
    setMessage("Opname gestopt en gewist.");
  }
  setMode("off");
  renderSamples();
}

async function recordSample(): Promise<void> {
  if (mode !== "off" || registeredModel || samples.length >= MAX_SAMPLES) return;
  let acquiredStream: MediaStream | undefined;
  try {
    const context = await getAudioContext();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    acquiredStream = stream;
    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(4_096, 1, 1);
    const silentGain = context.createGain();
    silentGain.gain.value = 0;
    const chunks: Float32Array[] = [];
    processor.onaudioprocess = (event: AudioProcessingEvent) => {
      const input = event.inputBuffer.getChannelData(0);
      if (input.length) chunks.push(new Float32Array(input));
    };
    source.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(context.destination);
    const timer = setTimeout(() => cleanupRecording(true), RECORDING_MS);
    recording = { stream, source, processor, silentGain, chunks, timer };
    acquiredStream = undefined;
    logEvent("sample_recording_started", { sampleNumber: samples.length + 1 });
    setMessage(`Voorbeeld ${samples.length + 1}: spreek “Hey Sodalis” nu uit.`);
    setMode("recording");
  } catch (error) {
    acquiredStream?.getTracks().forEach((track) => track.stop());
    const detail = error instanceof Error ? error.message : String(error);
    setMessage(`Microfoon niet beschikbaar: ${detail}`);
    setMode("off");
  }
}

async function buildKeyword(): Promise<void> {
  if (samples.length < MIN_SAMPLES || registeredModel || mode !== "off") return;
  buildingKeyword = true;
  setMode("off");
  setMessage("Wakeword wordt lokaal gemaakt…");
  let creator: WakewordRefCreator | undefined;
  const count = samples.length;
  try {
    referenceInit ??= initRustpotter(referenceWasmUrl);
    await referenceInit;
    creator = WakewordRefCreator.new(KEYWORD_KEY);
    samples.forEach((sample, index) => {
      const wav = makeFloatWav(sample);
      try {
        creator?.addFile(`hey-sodalis-${index + 1}.wav`, wav);
      } finally {
        wav.fill(0);
      }
    });
    const generated = creator.saveToBytes();
    registeredModel = new Uint8Array(generated);
    registeredSampleCount = count;
    creator.free();
    creator = undefined;
    logEvent("keyword_registered", { keyword: "Hey Sodalis", sampleCount: count, engine: "rustpotter" });
    setMessage(`Wakeword gemaakt met ${count} voorbeelden. De ruwe opnames zijn gewist.`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    setMessage(`Maken van het wakeword is mislukt: ${detail}. Neem de voorbeelden opnieuw op; de opnames zijn gewist.`);
  } finally {
    buildingKeyword = false;
    creator?.free();
    for (const sample of samples) sample.fill(0);
    samples.splice(0, samples.length);
    renderSamples();
    setMode("off");
  }
}

function playChime(): void {
  if (!audioContext || audioContext.state !== "running") return;
  const now = audioContext.currentTime;
  const gain = audioContext.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
  gain.connect(audioContext.destination);
  for (const [frequency, offset] of [[880, 0], [1_320, 0.09]] as const) {
    const oscillator = audioContext.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    oscillator.connect(gain);
    oscillator.start(now + offset);
    oscillator.stop(now + 0.44);
  }
  setTimeout(() => gain.disconnect(), 500);
}

function updateAttemptForDetection(detection: DetectionEntry): void {
  const active = activeAttemptUnresolved();
  if (!active || (active.status !== "in_progress" && active.status !== "retry_in_progress")) return;
  if (attemptTimer) clearTimeout(attemptTimer);
  attemptTimer = undefined;
  if (active.status === "in_progress") {
    active.status = "first_try_success";
    active.finishedAt = detection.timestamp;
    detection.attemptOutcome = "first_try_success";
    logEvent("intended_attempt_first_try_success", { attemptNumber: active.number, detectionNumber: detection.number });
  } else {
    active.status = "retry_success";
    active.finishedAt = detection.timestamp;
    detection.attemptOutcome = "retry_success";
    logEvent("intended_attempt_retry_success", { attemptNumber: active.number, detectionNumber: detection.number });
  }
}

function handleDetection(score: number): void {
  const now = performance.now();
  if (mode !== "waiting" && mode !== "activated") return;
  if (now - lastDetectionAt < DETECTION_COOLDOWN_MS) return;
  lastDetectionAt = now;
  const latency = estimatedSpeechEndAt !== undefined && now >= estimatedSpeechEndAt && now - estimatedSpeechEndAt <= 8_000
    ? Math.round(now - estimatedSpeechEndAt)
    : null;
  estimatedSpeechEndAt = undefined;
  const detection: DetectionEntry = {
    number: detections.length + 1,
    timestamp: new Date().toISOString(),
    score,
    activationLatencyMs: latency,
    latencyMethod: latency === null ? "not_measurable" : "estimated_from_last_voice_energy_end",
    falseActivation: false,
  };
  detections.push(detection);
  lastDetectionForFalseMark = detection;
  updateAttemptForDetection(detection);
  logEvent("wakeword_detected", {
    detectionNumber: detection.number,
    score: Number(score.toFixed(4)),
    activationLatencyMs: latency,
    latencyMethod: detection.latencyMethod,
    attemptOutcome: detection.attemptOutcome ?? null,
  });
  latencyLabel = latency === null ? "Niet gemeten" : `circa ${latency} ms`;
  setMode("activated");
  playChime();
  renderDetections();
  updateCounts();
  if (activationTimer) clearTimeout(activationTimer);
  activationTimer = setTimeout(() => {
    if (mode === "activated") setMode("waiting");
  }, 4_000);
}

function startPerformanceHints(): void {
  let expectedAt = performance.now() + 200;
  monitorTimer = setInterval(() => {
    const now = performance.now();
    timerDelaysMs.push(Math.max(0, now - expectedAt));
    if (timerDelaysMs.length > 100) timerDelaysMs.shift();
    expectedAt = now + 200;
    updateCounts();
  }, 200);
  if (analyser) {
    const data = new Float32Array(analyser.fftSize);
    levelTimer = setInterval(() => {
      if (!analyser) return;
      analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (const value of data) sum += value * value;
      const rms = Math.sqrt(sum / data.length);
      data.fill(0);
      const now = performance.now();
      if (rms >= SPEECH_RMS_THRESHOLD) {
        lastSpeechAboveThresholdAt = now;
        speechEnergyActive = true;
      } else if (
        speechEnergyActive &&
        lastSpeechAboveThresholdAt !== undefined &&
        now - lastSpeechAboveThresholdAt >= SPEECH_END_QUIET_MS
      ) {
        estimatedSpeechEndAt = lastSpeechAboveThresholdAt;
        speechEnergyActive = false;
      }
    }, 30);
  }
}

function stopPerformanceHints(): void {
  if (levelTimer) clearInterval(levelTimer);
  if (monitorTimer) clearInterval(monitorTimer);
  levelTimer = undefined;
  monitorTimer = undefined;
  analyser = undefined;
  speechEnergyActive = false;
  lastSpeechAboveThresholdAt = undefined;
  estimatedSpeechEndAt = undefined;
}

async function startListening(): Promise<void> {
  if (!registeredModel || (mode !== "off" && mode !== "activated" && mode !== "waiting")) return;
  try {
    const context = await getAudioContext();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    microphoneStream = stream;
    const service = await RustpotterService.new(context.sampleRate, {
      wasmPath: rustpotterWasmUrl,
      workletPath: rustpotterWorkletUrl,
      workerPath: rustpotterWorkerUrl,
    });
    detectionService = service;
    const modelCopy = new Uint8Array(registeredModel).buffer as ArrayBuffer;
    const added = await service.addWakeword(KEYWORD_KEY, modelCopy);
    if (!added) throw new Error("Rustpotter heeft het wakeword niet geaccepteerd.");
    service.onDetection((detected) => handleDetection(detected.score));
    const processor = await service.getProcessorNode(context);
    const source = context.createMediaStreamSource(stream);
    const nextAnalyser = context.createAnalyser();
    nextAnalyser.fftSize = 1_024;
    source.connect(processor);
    source.connect(nextAnalyser);
    microphoneSource = source;
    analyser = nextAnalyser;
    lastDetectionAt = 0;
    logEvent("microphone_listening_started", { engine: "rustpotter", sampleRate: context.sampleRate });
    setMessage("De microfoon luistert lokaal. Tik op Dempen om direct te stoppen.");
    setMode("waiting");
    startPerformanceHints();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    setMessage(`Luisteren is niet gestart: ${detail}`);
    await stopListening(false);
  }
}

async function stopListening(log = true): Promise<void> {
  if (mode === "recording") {
    cleanupRecording(false);
    return;
  }
  const hadMicrophone = Boolean(microphoneStream || detectionService);
  if (activationTimer) clearTimeout(activationTimer);
  activationTimer = undefined;
  stopPerformanceHints();
  if (microphoneSource) {
    try { microphoneSource.disconnect(); } catch { /* already disconnected */ }
  }
  microphoneSource = undefined;
  microphoneStream?.getTracks().forEach((track) => track.stop());
  microphoneStream = undefined;
  const service = detectionService;
  detectionService = undefined;
  if (service) {
    try { await service.disposeProcessorNode(); } catch { /* processor can already be disposed */ }
    try { await service.close(); } catch { /* worker may already be stopped */ }
  }
  if (hadMicrophone && log) logEvent("microphone_muted", {});
  if (playbackStartedAt !== undefined) finishPlaybackCheck();
  if (hadMicrophone) setMessage("Microfoon uit. Er wordt niets meer opgenomen of verwerkt.");
  setMode("off");
}

function beginAttempt(): void {
  if ((mode !== "waiting" && mode !== "activated") || activeAttemptUnresolved()) return;
  const attempt: IntendedAttempt = {
    number: attempts.length + 1,
    startedAt: new Date().toISOString(),
    status: "in_progress",
  };
  attempts.push(attempt);
  logEvent("intended_attempt_started", { attemptNumber: attempt.number });
  attemptTimer = setTimeout(() => {
    if (attempt.status === "in_progress") {
      attempt.status = "first_try_missed";
      attempt.firstTryMissedAt = new Date().toISOString();
      logEvent("intended_attempt_first_try_missed", { attemptNumber: attempt.number });
    } else if (attempt.status === "retry_in_progress") {
      attempt.status = "missed";
      attempt.finishedAt = new Date().toISOString();
      logEvent("intended_attempt_final_miss", { attemptNumber: attempt.number });
    }
    attemptTimer = undefined;
    updateCounts();
  }, ATTEMPT_WINDOW_MS);
  updateCounts();
}

function retryAttempt(): void {
  const active = activeAttemptUnresolved();
  if (!active || active.status !== "first_try_missed") return;
  active.status = "retry_in_progress";
  active.retryStartedAt = new Date().toISOString();
  logEvent("intended_attempt_retry_started", { attemptNumber: active.number });
  attemptTimer = setTimeout(() => {
    if (active.status === "retry_in_progress") {
      active.status = "missed";
      active.finishedAt = new Date().toISOString();
      logEvent("intended_attempt_final_miss", { attemptNumber: active.number });
    }
    attemptTimer = undefined;
    updateCounts();
  }, ATTEMPT_WINDOW_MS);
  updateCounts();
}

function markAttemptMissed(): void {
  const active = activeAttemptUnresolved();
  if (!active || active.status === "in_progress") return;
  if (attemptTimer) clearTimeout(attemptTimer);
  attemptTimer = undefined;
  active.status = "missed";
  active.finishedAt = new Date().toISOString();
  logEvent("intended_attempt_marked_missed", { attemptNumber: active.number });
  updateCounts();
}

function startPlaybackCheck(): void {
  if (playbackStartedAt !== undefined || (mode !== "waiting" && mode !== "activated")) return;
  playbackStartedAt = Date.now();
  logEvent("background_playback_check_started", { targetMinutes: 10 });
  playbackButton.textContent = "Beëindig achtergrondtest";
  playbackTimer = setInterval(() => {
    updateCounts();
    if (playbackStartedAt !== undefined && Date.now() - playbackStartedAt >= PLAYBACK_TARGET_MS) {
      finishPlaybackCheck();
      setMessage("De achtergrondtest van 10 minuten is afgerond.");
    }
  }, 1_000);
}

function finishPlaybackCheck(): void {
  if (playbackStartedAt === undefined) return;
  if (playbackTimer) clearInterval(playbackTimer);
  playbackTimer = undefined;
  const endedAt = Date.now();
  const period: PlaybackPeriod = {
    startedAt: new Date(playbackStartedAt).toISOString(),
    endedAt: new Date(endedAt).toISOString(),
    durationSeconds: Number(((endedAt - playbackStartedAt) / 1_000).toFixed(1)),
  };
  playbackPeriods.push(period);
  playbackStartedAt = undefined;
  logEvent("background_playback_check_finished", { durationSeconds: period.durationSeconds });
  playbackButton.textContent = "Start 10-minutentest";
  updateCounts();
}

function markFalseActivation(): void {
  const related = lastDetectionForFalseMark && !lastDetectionForFalseMark.falseActivation
    ? lastDetectionForFalseMark
    : undefined;
  if (related) related.falseActivation = true;
  logEvent("false_activation", { detectionNumber: related?.number ?? null });
  renderDetections();
  updateCounts();
  setMessage("Valse activatie genoteerd.");
}

function selectedRating(): void {
  const selected = document.querySelector<HTMLInputElement>('input[name="intrusiveness"]:checked');
  intrusiveness = (selected?.value as Rating | undefined) ?? null;
  if (intrusiveness) logEvent("felt_intrusiveness_rated", { rating: intrusiveness });
}

function makeSessionData(): Record<string, unknown> {
  const playbackSeconds = activePlaybackSeconds();
  return {
    prototype: "Sodalis sample-based wake word",
    engine: "rustpotter",
    keyword: "Hey Sodalis",
    sessionStartedAt,
    exportedAt: new Date().toISOString(),
    privacy: {
      audioStaysOnDevice: true,
      recordingsWrittenToDisk: false,
      audioSentOverNetwork: false,
      falseActivationAudioDiscardedImmediately: true,
      notes: "Raw sample buffers are held in browser memory only until registration; no pre-activation audio is stored by this page.",
    },
    summary: {
      detections: detections.length,
      falseActivations: falseActivationCount(),
      backgroundPlaybackSeconds: Number(playbackSeconds.toFixed(1)),
      falseActivationsPerPlaybackHour: playbackSeconds > 0
        ? Number((falseActivationCount() / (playbackSeconds / 3_600)).toFixed(3))
        : null,
      intendedAttempts: attempts.length,
      firstTrySuccesses: firstTrySuccessCount(),
      firstTryMisses: firstTryMissCount(),
      retrySuccesses: retrySuccessCount(),
      finalMisses: finalMissCount(),
      feltIntrusiveness: intrusiveness,
      registeredSampleCount,
      audioContextSampleRate: audioContext?.sampleRate ?? null,
      detectionCooldownMs: DETECTION_COOLDOWN_MS,
      mainThreadTimerDelayAverageMs: timerDelaysMs.length
        ? Number((timerDelaysMs.reduce((sum, value) => sum + value, 0) / timerDelaysMs.length).toFixed(2))
        : null,
      cpuPercent: null,
    },
    detections,
    attempts,
    playbackPeriods: playbackStartedAt === undefined
      ? playbackPeriods
      : [...playbackPeriods, {
          startedAt: new Date(playbackStartedAt).toISOString(),
          endedAt: null,
          durationSeconds: Number(((Date.now() - playbackStartedAt) / 1_000).toFixed(1)),
        }],
    events,
  };
}

function download(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function exportJson(): void {
  const stamp = new Date().toISOString().replaceAll(":", "-");
  download(`wake-word-session-${stamp}.json`, JSON.stringify(makeSessionData(), null, 2), "application/json");
  setMessage("JSON-sessielog gedownload. Dit bestand bevat geen audio.");
}

function exportText(): void {
  const playbackSeconds = activePlaybackSeconds();
  const lines = [
    "Sodalis wake-word prototype — session log",
    `Started: ${sessionStartedAt}`,
    `Exported: ${new Date().toISOString()}`,
    "Engine: rustpotter; keyword: Hey Sodalis",
    "Audio sent over network: no; audio written to disk by app: no",
    "",
    `Detections: ${detections.length}`,
    `False activations: ${falseActivationCount()}`,
    `Background playback: ${playbackSeconds.toFixed(1)} seconds`,
    `False activations per playback hour: ${playbackSeconds > 0 ? (falseActivationCount() / (playbackSeconds / 3_600)).toFixed(3) : "not measured"}`,
    `Intended attempts: ${attempts.length}`,
    `First-try successes: ${firstTrySuccessCount()}`,
    `First-try misses: ${firstTryMissCount()}`,
    `Success after one retry: ${retrySuccessCount()}`,
    `Final misses: ${finalMissCount()}`,
    `Felt intrusiveness: ${intrusiveness ?? "not rated"}`,
    `Registered samples: ${registeredSampleCount}`,
    `Main-thread timer delay average: ${timerDelaysMs.length ? (timerDelaysMs.reduce((sum, value) => sum + value, 0) / timerDelaysMs.length).toFixed(2) + " ms (not CPU %)" : "not measured"}`,
    "",
    "Detections (activation latency is an estimate from the last voice-energy end; it is not exact keyword timing):",
    ...detections.map((detection) => `#${detection.number} ${detection.timestamp} score=${detection.score.toFixed(3)} latency=${detection.activationLatencyMs === null ? "not measured" : `${detection.activationLatencyMs} ms`} false=${detection.falseActivation} attempt=${detection.attemptOutcome ?? "none"}`),
    "",
    "Intended attempts:",
    ...attempts.map((attempt) => `#${attempt.number} ${attempt.startedAt} firstTryMiss=${attempt.firstTryMissedAt ?? "no"} status=${attempt.status}`),
  ];
  const stamp = new Date().toISOString().replaceAll(":", "-");
  download(`wake-word-session-${stamp}.txt`, lines.join("\n"), "text/plain;charset=utf-8");
  setMessage("Tekst-sessielog gedownload. Dit bestand bevat geen audio.");
}

async function clearKeyword(): Promise<void> {
  if (mode !== "off") await stopListening();
  registeredModel?.fill(0);
  registeredModel = undefined;
  registeredSampleCount = 0;
  for (const sample of samples) sample.fill(0);
  samples.splice(0, samples.length);
  logEvent("keyword_and_samples_cleared", {});
  setMessage("Wakeword en alle voorbeeldopnames gewist.");
  renderSamples();
  setMode("off");
}

recordButton.addEventListener("click", () => void recordSample());
buildButton.addEventListener("click", () => void buildKeyword());
clearButton.addEventListener("click", () => void clearKeyword());
listenButton.addEventListener("click", () => {
  if (mode === "waiting" || mode === "activated") void stopListening();
  else void startListening();
});
muteButton.addEventListener("click", () => void stopListening());
attemptButton.addEventListener("click", beginAttempt);
retryButton.addEventListener("click", retryAttempt);
missButton.addEventListener("click", markAttemptMissed);
falseButton.addEventListener("click", markFalseActivation);
playbackButton.addEventListener("click", () => {
  if (playbackStartedAt === undefined) startPlaybackCheck();
  else finishPlaybackCheck();
});
byId("json-button").addEventListener("click", exportJson);
byId("text-button").addEventListener("click", exportText);
document.querySelectorAll<HTMLInputElement>('input[name="intrusiveness"]').forEach((input) => {
  input.addEventListener("change", selectedRating);
});

window.addEventListener("pagehide", () => {
  if (recording) cleanupRecording(false);
  microphoneStream?.getTracks().forEach((track) => track.stop());
  for (const sample of samples) sample.fill(0);
  registeredModel?.fill(0);
  void detectionService?.close();
  if (audioContext && audioContext.state !== "closed") void audioContext.close();
});

setMode("off");
renderSamples();
renderDetections();
setMessage(messageText);
