import "./style.css";

type TriggerSource = "stand-in" | "mock-ha";
type Intrusiveness = "fine" | "uneasy" | "unacceptable";

interface DemoButtonEvent {
  readonly id: string;
  readonly type: "demo_button_pressed";
  readonly entityDomain: "event";
  readonly entityClass: "button";
  readonly source: TriggerSource;
  readonly attemptId?: string;
  readonly firedAt: string;
}

interface PendingAttempt {
  readonly timeout: ReturnType<typeof setTimeout>;
  readonly startedAt: number;
}

interface PrototypeLogEntry {
  readonly at: string;
  readonly kind: string;
  readonly details: Readonly<Record<string, string | number | boolean | null>>;
}

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Prototype element #${id} is missing.`);
  return element as T;
}

const connection = requiredElement<HTMLParagraphElement>("connection");
const listeningState = requiredElement<HTMLElement>("listening-state");
const listeningTitle = requiredElement<HTMLHeadingElement>("listening-title");
const listeningDescription = requiredElement<HTMLParagraphElement>("listening-description");
const standIn = requiredElement<HTMLButtonElement>("stand-in");
const enableChime = requiredElement<HTMLButtonElement>("enable-chime");
const muteDismiss = requiredElement<HTMLButtonElement>("mute-dismiss");
const flagFalse = requiredElement<HTMLButtonElement>("flag-false");
const exportLog = requiredElement<HTMLButtonElement>("export-log");
const attemptCount = requiredElement<HTMLElement>("attempt-count");
const successCount = requiredElement<HTMLElement>("success-count");
const missCount = requiredElement<HTMLElement>("miss-count");
const falseCount = requiredElement<HTMLElement>("false-count");
const latestLatency = requiredElement<HTMLElement>("latest-latency");
const intrusiveness = requiredElement<HTMLSelectElement>("intrusiveness");
const logList = requiredElement<HTMLOListElement>("log-list");

const logs: PrototypeLogEntry[] = [];
const pendingAttempts = new Map<string, PendingAttempt>();
const falseActivationIds = new Set<string>();
const latencyMeasurements: number[] = [];
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let watchdogTimer: ReturnType<typeof setInterval> | undefined;
let lastPushMessageAt = 0;
let reconnectAttempts = 0;
let hasConnected = false;
let chimeContext: AudioContext | undefined;
let serverClockOffsetMs = 0;
let clockUncertaintyMs = 0;
let active = false;
let muted = false;
let intendedAttempts = 0;
let firstTrySuccesses = 0;
let misses = 0;
let falseActivations = 0;
let latestEvent: DemoButtonEvent | undefined;
let feltIntrusiveness: Intrusiveness | undefined;

function log(kind: string, details: PrototypeLogEntry["details"] = {}): void {
  const entry: PrototypeLogEntry = { at: new Date().toISOString(), kind, details };
  logs.push(entry);
  console.log(`[external-trigger] ${JSON.stringify(entry)}`);
  const item = document.createElement("li");
  item.textContent = `${entry.at} · ${kind}${Object.keys(details).length ? ` · ${JSON.stringify(details)}` : ""}`;
  logList.prepend(item);
}

function median(values: readonly number[]): number | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function render(): void {
  listeningState.classList.toggle("is-listening", active);
  listeningState.setAttribute("aria-label", active ? "Listening state active" : "Waiting for a trigger");
  listeningTitle.textContent = active ? "I’m listening" : "Waiting for a trigger";
  listeningDescription.textContent = active
    ? "The trigger arrived. The microphone stays off in this prototype."
    : "Press the stand-in button, or send the local mock event.";
  attemptCount.textContent = String(intendedAttempts);
  successCount.textContent = String(firstTrySuccesses);
  missCount.textContent = String(misses);
  falseCount.textContent = String(falseActivations);
  muteDismiss.textContent = muted ? "Unmute chime" : active ? "Mute & dismiss" : "Mute chime";
  muteDismiss.setAttribute("aria-pressed", String(muted));
  enableChime.textContent = chimeContext ? "Chime enabled" : "Enable chime";
  enableChime.disabled = Boolean(chimeContext);
  flagFalse.disabled = !latestEvent || falseActivationIds.has(latestEvent.id);
  if (latencyMeasurements.length) {
    const latest = latencyMeasurements[latencyMeasurements.length - 1]!;
    const typical = median(latencyMeasurements)!;
    latestLatency.textContent = `${latest} ms (median ${typical} ms; ${latencyMeasurements.length} event${latencyMeasurements.length === 1 ? "" : "s"})`;
  }
}

function playChime(): void {
  if (!chimeContext || muted || chimeContext.state !== "running") return;
  const oscillator = chimeContext.createOscillator();
  const gain = chimeContext.createGain();
  const now = chimeContext.currentTime;
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(660, now);
  oscillator.frequency.setValueAtTime(880, now + 0.12);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.16, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);
  oscillator.connect(gain);
  gain.connect(chimeContext.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.38);
  log("chime-played", { frequencyHz: "660→880", durationMs: 380 });
}

function finishAttempt(attemptId: string): number | undefined {
  const pending = pendingAttempts.get(attemptId);
  if (!pending) return undefined;
  clearTimeout(pending.timeout);
  pendingAttempts.delete(attemptId);
  firstTrySuccesses += 1;
  log("intended-attempt-first-try-success", { attemptId, timeoutWindowMs: 5000 });
  render();
  return pending.startedAt;
}

function markMiss(attemptId: string, reason: string): void {
  const pending = pendingAttempts.get(attemptId);
  if (!pending) return;
  clearTimeout(pending.timeout);
  pendingAttempts.delete(attemptId);
  misses += 1;
  log("intended-attempt-missed", { attemptId, reason, timeoutWindowMs: 5000 });
  render();
}

function onDemoButtonEvent(event: DemoButtonEvent): void {
  const attemptStartedAt = event.attemptId ? finishAttempt(event.attemptId) : undefined;
  latestEvent = event;
  active = true;
  const receivedAt = new Date(Date.now() + serverClockOffsetMs);
  const firedAtMs = Date.parse(event.firedAt);
  render();
  const domUpdatedAt = performance.now();
  const triggerToDomMs = attemptStartedAt === undefined
    ? undefined
    : Math.round(domUpdatedAt - attemptStartedAt);
  const serverClockLatencyMs = receivedAt.getTime() - firedAtMs;
  const eventToIndicatorMs = triggerToDomMs ??
    (serverClockLatencyMs >= clockUncertaintyMs ? serverClockLatencyMs : undefined);
  if (eventToIndicatorMs !== undefined && Number.isFinite(eventToIndicatorMs)) {
    latencyMeasurements.push(eventToIndicatorMs);
    latestLatency.textContent = triggerToDomMs === undefined
      ? `${eventToIndicatorMs} ms server estimate ±${clockUncertaintyMs} ms`
      : `${eventToIndicatorMs} ms to DOM update (median ${median(latencyMeasurements)} ms)`;
  } else if (triggerToDomMs === undefined) {
    latestLatency.textContent = `Clock delta ${serverClockLatencyMs} ms is within ±${clockUncertaintyMs} ms uncertainty; retime`;
  }
  playChime();
  log("trigger-received", {
    source: event.source,
    eventId: event.id,
    firedAt: event.firedAt,
    receivedAt: receivedAt.toISOString(),
  });
  log("indicator-dom-updated", {
    eventId: event.id,
    firedAt: event.firedAt,
    domUpdatedAt: new Date(Date.now() + serverClockOffsetMs).toISOString(),
    eventToIndicatorMs: eventToIndicatorMs ?? null,
    triggerToDomMs: triggerToDomMs ?? null,
    serverClockLatencyMs,
    clockUncertaintyMs,
    visibility: document.visibilityState,
  });
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const indicatorAt = new Date(Date.now() + serverClockOffsetMs);
      const frameEstimateMs = indicatorAt.getTime() - firedAtMs;
      const frameLatencyMs = attemptStartedAt === undefined
        ? frameEstimateMs >= clockUncertaintyMs ? frameEstimateMs : undefined
        : Math.round(performance.now() - attemptStartedAt);
      log("indicator-presented", {
        eventId: event.id,
        firedAt: event.firedAt,
        indicatorAt: indicatorAt.toISOString(),
        frameLatencyMs: frameLatencyMs ?? null,
        frameEstimateMs,
        clockUncertaintyMs,
        visibility: document.visibilityState,
      });
    });
  });
}

function parseEvent(raw: string): DemoButtonEvent | undefined {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return undefined;
    const record = value as Record<string, unknown>;
    if (typeof record.id !== "string" || record.type !== "demo_button_pressed" ||
        record.entityDomain !== "event" || record.entityClass !== "button" ||
        (record.source !== "stand-in" && record.source !== "mock-ha") ||
        typeof record.firedAt !== "string" ||
        (record.attemptId !== undefined && typeof record.attemptId !== "string")) {
      return undefined;
    }
    return {
      id: record.id,
      type: record.type,
      entityDomain: record.entityDomain,
      entityClass: record.entityClass,
      source: record.source,
      firedAt: record.firedAt,
      ...(typeof record.attemptId === "string" ? { attemptId: record.attemptId } : {}),
    };
  } catch {
    return undefined;
  }
}

async function calibrateServerClock(): Promise<void> {
  const requestStartedAt = Date.now();
  try {
    const response = await fetch("/api/prototype/external-trigger/clock", { cache: "no-store" });
    const responseReceivedAt = Date.now();
    if (!response.ok) throw new Error(`clock endpoint returned HTTP ${response.status}`);
    const payload: unknown = await response.json();
    if (typeof payload !== "object" || payload === null ||
        typeof (payload as Record<string, unknown>).serverTime !== "number") {
      throw new Error("clock endpoint returned invalid data");
    }
    const serverTime = (payload as { serverTime: number }).serverTime;
    serverClockOffsetMs = serverTime - (requestStartedAt + responseReceivedAt) / 2;
    clockUncertaintyMs = Math.ceil((responseReceivedAt - requestStartedAt) / 2);
    log("server-clock-calibrated", { offsetMs: Math.round(serverClockOffsetMs), uncertaintyMs: clockUncertaintyMs });
  } catch (error) {
    log("server-clock-calibration-failed", { reason: error instanceof Error ? error.message : String(error) });
  }
}

function scheduleEventStreamReconnect(): void {
  if (reconnectTimer) return;
  const delayMs = Math.min(1000 * (2 ** reconnectAttempts), 10_000);
  reconnectAttempts += 1;
  connection.textContent = `Connection dropped · retrying in ${delayMs / 1000}s…`;
  connection.dataset.state = "reconnecting";
  log("push-reconnect-scheduled", { delayMs, attempt: reconnectAttempts });
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined;
    startEventStream();
  }, delayMs);
}

function startEventStream(): void {
  const eventSource = new EventSource("/api/prototype/external-trigger/events");
  eventSource.addEventListener("open", () => {
    hasConnected = true;
    reconnectAttempts = 0;
    lastPushMessageAt = performance.now();
    if (watchdogTimer) clearInterval(watchdogTimer);
    watchdogTimer = setInterval(() => {
      const silenceMs = performance.now() - lastPushMessageAt;
      if (silenceMs <= 15_000) return;
      eventSource.close();
      if (watchdogTimer) clearInterval(watchdogTimer);
      watchdogTimer = undefined;
      log("push-heartbeat-timeout", { silenceMs: Math.round(silenceMs) });
      scheduleEventStreamReconnect();
    }, 2_000);
    connection.textContent = "Connected · waiting for a trigger";
    connection.dataset.state = "connected";
    log("push-connected", { visibility: document.visibilityState });
    void calibrateServerClock();
  });
  eventSource.addEventListener("error", () => {
    const reconnecting = eventSource.readyState === EventSource.CONNECTING;
    connection.textContent = reconnecting
      ? "Connection dropped · reconnecting automatically…"
      : "Connection unavailable · reconnecting automatically…";
    connection.dataset.state = "reconnecting";
    log(reconnecting ? "push-reconnecting" : "push-connection-closed", {
      hadConnected: hasConnected,
      visibility: document.visibilityState,
      readyState: eventSource.readyState,
    });
    if (!reconnecting) {
      eventSource.close();
      if (watchdogTimer) clearInterval(watchdogTimer);
      watchdogTimer = undefined;
      scheduleEventStreamReconnect();
    }
  });
  eventSource.addEventListener("heartbeat", () => {
    lastPushMessageAt = performance.now();
  });
  eventSource.addEventListener("demo_button_pressed", (message) => {
    lastPushMessageAt = performance.now();
    if (!(message instanceof MessageEvent)) return;
    const event = parseEvent(message.data);
    if (!event) {
      log("invalid-push-payload", {});
      return;
    }
    onDemoButtonEvent(event);
  });
}

standIn.addEventListener("click", () => {
  const attemptId = crypto.randomUUID();
  intendedAttempts += 1;
  const timeout = setTimeout(() => markMiss(attemptId, "no push event received within five seconds"), 5000);
  pendingAttempts.set(attemptId, { timeout, startedAt: performance.now() });
  log("intended-attempt", { attemptId });
  render();
  void fetch("/api/prototype/external-trigger/mock-event", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source: "stand-in", attemptId }),
  }).then((response) => {
    if (!response.ok) markMiss(attemptId, `mock source returned HTTP ${response.status}`);
  }).catch((error: unknown) => {
    markMiss(attemptId, error instanceof Error ? error.message : String(error));
  });
});

enableChime.addEventListener("click", () => {
  try {
    chimeContext = new AudioContext();
    void chimeContext.resume().then(() => {
      muted = false;
      log("chime-enabled-by-user-gesture", { state: chimeContext?.state ?? "unavailable" });
      render();
    }).catch((error: unknown) => {
      log("chime-enable-failed", { reason: error instanceof Error ? error.message : String(error) });
    });
  } catch (error) {
    log("chime-unavailable", { reason: error instanceof Error ? error.message : String(error) });
  }
});

muteDismiss.addEventListener("click", () => {
  if (!muted) {
    muted = true;
    active = false;
    log("muted-and-dismissed", { latestEventId: latestEvent?.id ?? null });
  } else {
    muted = false;
    log("chime-unmuted", {});
  }
  render();
});

flagFalse.addEventListener("click", () => {
  if (!latestEvent || falseActivationIds.has(latestEvent.id)) return;
  falseActivationIds.add(latestEvent.id);
  falseActivations += 1;
  log("false-activation-flagged", { eventId: latestEvent.id, source: latestEvent.source });
  render();
});

intrusiveness.addEventListener("change", () => {
  const value = intrusiveness.value;
  feltIntrusiveness = value === "fine" || value === "uneasy" || value === "unacceptable"
    ? value : undefined;
  log("felt-intrusiveness-rated", { rating: feltIntrusiveness ?? "not-rated" });
});

exportLog.addEventListener("click", () => {
  const report = {
    prototype: "external-trigger",
    exportedAt: new Date().toISOString(),
    counters: {
      intendedAttempts,
      firstTrySuccesses,
      misses,
      falseActivations,
      feltIntrusiveness: feltIntrusiveness ?? null,
      activationTimeoutWindowMs: 5000,
    },
    latency: {
      measurementsMs: latencyMeasurements,
      medianMs: median(latencyMeasurements) ?? null,
      basis: "stand-in click to second requestAnimationFrame when correlated; otherwise calibrated server event firedAt",
      clockUncertaintyMs,
    },
    log: logs,
  };
  const objectUrl = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = `external-trigger-${new Date().toISOString().replaceAll(":", "-")}.json`;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
  log("json-log-exported", { entries: logs.length });
});

document.addEventListener("visibilitychange", () => {
  log("visibility-changed", { state: document.visibilityState });
});
window.addEventListener("online", () => log("browser-online", {}));
window.addEventListener("offline", () => log("browser-offline", {}));
window.addEventListener("pagehide", () => log("page-hidden", { visibility: document.visibilityState }));
window.addEventListener("pageshow", () => log("page-shown", { visibility: document.visibilityState }));

void calibrateServerClock().finally(() => {
  startEventStream();
  render();
});
