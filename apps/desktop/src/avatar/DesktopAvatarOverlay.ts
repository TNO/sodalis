import m from "mithril";
import type { Vnode } from "mithril";
import {
  ConversationOrchestrator,
  ServerLlmProvider,
} from "@sodalis/assistant";
import type {
  AssistantAppContext,
  AssistantUtterance,
  ConversationSnapshot,
  ConversationState,
} from "@sodalis/assistant";
import type { AttentionTargetRegistry } from "@sodalis/avatar";
import type { AvatarSceneHandle } from "@sodalis/avatar/internal/scene";
import {
  createEnergyVoiceActivityDetector,
  createSpeechInputController,
  ServerSpeechToTextProvider,
  ServerTextToSpeechProvider,
} from "@sodalis/speech";
import type {
  SpeechAudioChunk,
  SpeechInputController,
  SpeechInputState,
  SpeechRequest,
  SpeechSessionId,
  SpeechToTextSession,
} from "@sodalis/speech";
import { AvatarConversationCard } from "./AvatarConversationCard.js";
import { AvatarNotificationPanel } from "./AvatarNotificationPanel.js";
import type { AvatarNotification } from "./AvatarNotificationPanel.js";
import { AvatarViewport } from "./AvatarViewport.js";
import type { AvatarPresentationController } from "./AvatarPresentationController.js";
import {
  createSpeechPlaybackController,
  type SpeechPlaybackController,
} from "./SpeechPlaybackController.js";

interface DesktopAvatarOverlayAttrs {
  targetRegistry?: AttentionTargetRegistry;
  onGeometryChange?: () => void;
  onScene?: (scene: AvatarSceneHandle | undefined) => void;
  gazeOverlay?: string;
  showGazeTarget?: boolean;
  frame?: HTMLIFrameElement;
  presentation?: AvatarPresentationController;
  onSpeechInput?: (controller: SpeechInputController | undefined) => void;
  onOpenApplication?: (appId: string) => Promise<void>;
  getAppContext?: () =>
    | AssistantAppContext
    | undefined
    | Promise<AssistantAppContext | undefined>;
}

const TASKBAR_FLOOR_OVERLAP = 3;
const TASKBAR_AVATAR_OCCLUSION_RATIO = 0.5;
const MOCK_NOTIFICATIONS: AvatarNotification[] = [
  {
    id: "calendar-reminder",
    source: "calendar",
    sourceLabel: "Calendar",
    type: "event-reminder",
    title: "Appointment reminder",
    summary: "Your calendar appointment starts in 15 minutes.",
    appId: "calendar",
    appTitle: "Calendar",
    actions: ["read", "open", "dismiss"],
    read: false,
  },
  {
    id: "files-download",
    source: "files",
    sourceLabel: "Files",
    type: "download-complete",
    title: "Download complete",
    summary: "The sample report is ready in Downloads.",
    appId: "files",
    appTitle: "File Explorer",
    actions: ["read", "open", "dismiss"],
    read: false,
  },
];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

let speechRequestSequence = 0;

function createSpeechRequestId(prefix: string): string {
  speechRequestSequence += 1;
  const unique = globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${speechRequestSequence.toString(36)}`;
  return `${prefix}:${unique}`;
}

interface ActiveSpeechRecognition {
  readonly microphoneSessionId: SpeechSessionId;
  readonly recognitionSessionId: SpeechSessionId;
  readonly abortController: AbortController;
  ready: Promise<void>;
  writeChain: Promise<void>;
  session?: SpeechToTextSession;
  failed: boolean;
  errorReported: boolean;
}

export const DesktopAvatarOverlay =
  (): m.Component<DesktopAvatarOverlayAttrs> => {
    let layer: HTMLElement | undefined;
    let frame: HTMLIFrameElement | undefined;
    let outerWindow: Window | undefined;
    let contentWindow: Window | undefined;
    let contentDocument: Document | undefined;
    let frameLoadHandler: (() => void) | undefined;
    let outerResizeObserver: ResizeObserver | undefined;
    let contentResizeObserver: ResizeObserver | undefined;
    let contentMutationObserver: MutationObserver | undefined;
    let windowMutationObserver: MutationObserver | undefined;
    let presentation: AvatarPresentationController | undefined;
    let speechInput: SpeechInputController | undefined;
    let speechPlayback: SpeechPlaybackController | undefined;
    let conversation: ConversationOrchestrator | undefined;
    let speechInputListener:
      | ((controller: SpeechInputController | undefined) => void)
      | undefined;
    let avatarScene: AvatarSceneHandle | undefined;
    let onGeometryChange: (() => void) | undefined;
    let conversationOpen = false;
    let notificationOpen = false;
    let notificationOpenError: string | undefined;
    let notifications = MOCK_NOTIFICATIONS.map((notification) => ({
      ...notification,
      actions: [...notification.actions],
    }));
    let restoreAvatarFocus = false;
    let restoreNotificationFocus = false;
    let microphoneWasActive = false;
    let speechOutputActive = false;
    let speechIsPlaying = false;
    let speechActivityMessage: string | undefined;
    let speechError: string | undefined;
    let speechOutputError: string | undefined;
    let conversationError: string | undefined;
    let conversationState: ConversationState = "idle";
    let conversationInterruptible = true;
    let userTranscript: string | undefined;
    let assistantText: string | undefined;
    let activeRecognition: ActiveSpeechRecognition | undefined;
    const speechApiBaseUrl = import.meta.env.VITE_SODALIS_API_URL ?? "/api";
    const speechToTextProvider = new ServerSpeechToTextProvider({
      baseUrl: speechApiBaseUrl,
      onLatency(metric) {
        if (import.meta.env.DEV) {
          console.debug("Speech recognition latency:", metric);
        }
      },
    });
    const textToSpeechProvider = new ServerTextToSpeechProvider({
      baseUrl: speechApiBaseUrl,
      onLatency(metric) {
        if (import.meta.env.DEV) {
          console.debug("Speech synthesis latency:", metric);
        }
      },
    });
    const llmProvider = new ServerLlmProvider({
      baseUrl: speechApiBaseUrl,
      onLatency(metric) {
        if (import.meta.env.DEV) {
          console.debug("Assistant generation latency:", metric);
        }
      },
    });

    const applyAssistantUtterance = (
      utterance: AssistantUtterance,
      signal: AbortSignal,
    ) => {
      const controller = avatarScene?.controller;
      if (!controller) return;
      controller.setAffect({
        expression: utterance.affect.expression,
        valence: utterance.affect.valence,
        arousal: utterance.affect.arousal,
        intensity: utterance.affect.intensity,
      });
      if (utterance.gesture) {
        void controller.playGesture(utterance.gesture, signal).catch(
          (error: unknown) => {
            if (!signal.aborted) {
              console.error("Unable to play assistant gesture:", error);
            }
          },
        );
      }
    };

    const syncActiveSpeechOutput = () => {
      const assistantTurnActive =
        conversationState === "thinking" || conversationState === "speaking";
      const interruptible = !assistantTurnActive || conversationInterruptible;
      const conversationActive = assistantTurnActive && conversationInterruptible;
      speechInput?.setActiveOutput(
        speechPlayback &&
            interruptible &&
            (speechOutputActive || conversationActive)
          ? speechPlayback
          : undefined,
      );
    };

    const updateConversationView = (snapshot: ConversationSnapshot) => {
      conversationState = snapshot.state;
      conversationInterruptible = snapshot.interruptible;
      conversationError = snapshot.error;
      userTranscript = snapshot.userTranscript;
      assistantText = snapshot.assistantText;
      syncActiveSpeechOutput();
      if (layer) m.redraw();
    };

    const reportSpeechError = (error: Error) => {
      speechError = error.message;
      conversation?.reportInputError(error);
      m.redraw();
    };

    const reportSpeechOutputError = (error: Error) => {
      speechOutputError = error.message;
      m.redraw();
    };

    const reportRecognitionError = (
      recognition: ActiveSpeechRecognition,
      error: unknown,
    ) => {
      if (recognition.errorReported) return;
      recognition.errorReported = true;
      recognition.failed = true;
      if (
        activeRecognition === recognition &&
        !recognition.abortController.signal.aborted
      ) {
        speechActivityMessage = "Speech recognition failed.";
        const normalized =
          error instanceof Error ? error : new Error(String(error));
        reportSpeechError(normalized);
        recognition.abortController.abort(normalized);
      }
    };

    const cancelRecognition = () => {
      const recognition = activeRecognition;
      activeRecognition = undefined;
      if (recognition && !recognition.abortController.signal.aborted) {
        recognition.abortController.abort();
      }
    };

    const beginRecognition = (
      microphoneSessionId: SpeechSessionId,
      segmentId: string,
    ) => {
      cancelRecognition();
      speechError = undefined;
      userTranscript = "";
      assistantText = undefined;
      const recognition: ActiveSpeechRecognition = {
        microphoneSessionId,
        recognitionSessionId: segmentId,
        abortController: new AbortController(),
        ready: Promise.resolve(),
        writeChain: Promise.resolve(),
        failed: false,
        errorReported: false,
      };
      activeRecognition = recognition;
      recognition.ready = speechToTextProvider
        .createSession({
          sessionId: recognition.recognitionSessionId,
          language: "nl-NL",
          signal: recognition.abortController.signal,
        })
        .then((session) => {
          if (
            activeRecognition !== recognition ||
            recognition.abortController.signal.aborted
          ) {
            recognition.abortController.abort();
            return;
          }
          recognition.session = session;
          void (async () => {
            try {
              for await (const event of session.events) {
                if (
                  activeRecognition !== recognition ||
                  event.sessionId !== recognition.recognitionSessionId
                ) {
                  continue;
                }
                userTranscript = event.text;
                speechActivityMessage =
                  event.type === "final"
                    ? "Transcript ready."
                    : "Transcribing speech…";
                if (event.type === "final") {
                  void conversation?.submitUserMessage(event.text);
                }
                if (layer) m.redraw();
              }
            } catch (error) {
              reportRecognitionError(recognition, error);
            }
          })();
        })
        .catch((error: unknown) => {
          reportRecognitionError(recognition, error);
        });
    };

    const createSpeechInput = (): SpeechInputController =>
      createSpeechInputController({
        detector: createEnergyVoiceActivityDetector(),
        onStateChange(state: Readonly<SpeechInputState>) {
          const active = state.status === "listening";
          if (state.status === "error") cancelRecognition();
          if (active) {
            microphoneWasActive = true;
            avatarScene?.controller.setState("listening");
          } else if (microphoneWasActive) {
            microphoneWasActive = false;
            avatarScene?.controller.setState("idle");
          }
          if (state.status !== "error") speechError = undefined;
          if (state.status === "listening") conversation?.setListening(true);
          else if (state.status === "idle") conversation?.setListening(false);
          else if (state.status === "error") {
            conversation?.reportInputError(
              new Error(state.error ?? "Microphone input failed."),
            );
          }
          if (layer) m.redraw();
        },
        onAssistantStateChange(state) {
          if (avatarScene) {
            if (state === "interrupted") avatarScene.controller.interrupt();
            avatarScene.controller.setState(state);
          }
          if (state === "interrupted") conversation?.setInterrupted();
          else conversation?.setListening(true);
        },
        onSpeechStart(event) {
          speechActivityMessage =
            "Speech detected. Starting speech recognition…";
          beginRecognition(event.sessionId, event.segmentId);
          conversation?.setTranscribing();
          if (layer) m.redraw();
        },
        onSpeechEnd(event) {
          const recognition = activeRecognition;
          if (
            !recognition ||
            recognition.recognitionSessionId !== event.segmentId
          ) {
            return;
          }
          speechActivityMessage = "Transcribing speech…";
          void recognition.writeChain
            .then(() => recognition.ready)
            .then(async () => {
              if (
                activeRecognition !== recognition ||
                recognition.abortController.signal.aborted ||
                recognition.failed ||
                !recognition.session
              ) {
                return;
              }
              await recognition.session.finish(event.timestampMs);
            })
            .catch((error: unknown) =>
              reportRecognitionError(recognition, error),
            );
          if (layer) m.redraw();
        },
        onAudioChunk(chunk: SpeechAudioChunk, sessionId) {
          const recognition = activeRecognition;
          if (
            !recognition ||
            recognition.microphoneSessionId !== sessionId
          ) {
            return;
          }
          recognition.writeChain = recognition.writeChain
            .then(async () => {
              await recognition.ready;
              if (
                activeRecognition !== recognition ||
                recognition.abortController.signal.aborted ||
                recognition.failed ||
                !recognition.session
              ) {
                return;
              }
              await recognition.session.writeAudio(chunk);
            })
            .catch((error: unknown) =>
              reportRecognitionError(recognition, error),
            );
        },
        onBargeInLatency(metric) {
          if (import.meta.env.DEV) {
            console.debug("Avatar barge-in latency:", metric);
          }
        },
        onError: reportSpeechError,
      });

    const createSpeechPlayback = (): SpeechPlaybackController =>
      createSpeechPlaybackController({
        provider: textToSpeechProvider,
        getAvatarController: () => avatarScene?.controller,
        isListening: () => microphoneWasActive,
        onOutputChange(active) {
          speechOutputActive = active;
          syncActiveSpeechOutput();
          if (layer) m.redraw();
        },
        onStateChange(speaking, request) {
          speechIsPlaying = speaking;
          conversation?.notifyPlaybackState(request.speechId, speaking);
          if (layer) m.redraw();
        },
        onCancelGeneration() {
          conversation?.cancelTurn();
        },
      });

    const speakAssistantText = async (text: string) => {
      if (!speechPlayback) {
        throw new Error("Speech playback is unavailable.");
      }
      speechOutputError = undefined;
      const request: SpeechRequest = {
        sessionId: createSpeechRequestId("desktop"),
        speechId: createSpeechRequestId("speech"),
        text,
        language: "nl-NL",
      };
      await speechPlayback.speak(request);
    };

    const stopAssistantSpeech = () => {
      speechPlayback?.stopPlayback();
      speechPlayback?.cancelTts();
      speechInput?.setActiveOutput(undefined);
    };

    const stopConversationOrSpeech = () => {
      if (
        conversationState === "thinking" ||
        conversationState === "speaking"
      ) {
        conversation?.cancelTurn();
      } else {
        stopAssistantSpeech();
      }
    };

    const setSpeechInputListener = (
      listener:
        | ((controller: SpeechInputController | undefined) => void)
        | undefined,
    ) => {
      if (speechInputListener === listener) return;
      speechInputListener?.(undefined);
      speechInputListener = listener;
      speechInputListener?.(speechInput);
    };

    const closeConversation = () => {
      conversationOpen = false;
      restoreAvatarFocus = true;
      speechOutputError = undefined;
      conversation?.cancelTurn();
      presentation?.setMode("ambient");
      stopAssistantSpeech();
      cancelRecognition();
      void speechInput?.stop().catch((error: unknown) => {
        reportSpeechError(
          error instanceof Error ? error : new Error(String(error)),
        );
      });
      m.redraw();
    };

    const closeNotificationCenter = () => {
      notificationOpen = false;
      notificationOpenError = undefined;
      restoreNotificationFocus = true;
      presentation?.setMode("ambient");
      m.redraw();
    };

    const unreadNotificationCount = () =>
      notifications.filter((notification) => !notification.read).length;

    const updateImportantRegions = () => {
      const document = frame?.contentDocument;
      const innerWindow = frame?.contentWindow;
      if (!presentation || !frame || !document || !innerWindow) {
        onGeometryChange?.();
        return;
      }
      const frameBounds = frame.getBoundingClientRect();
      if (
        !frameBounds.width ||
        !frameBounds.height ||
        !innerWindow.innerWidth ||
        !innerWindow.innerHeight
      ) {
        presentation.setImportantRegions([]);
        onGeometryChange?.();
        return;
      }

      const scaleX = frameBounds.width / innerWindow.innerWidth;
      const scaleY = frameBounds.height / innerWindow.innerHeight;
      const regions: DOMRect[] = [];
      for (const windowElement of document.querySelectorAll<HTMLElement>(
        "#window-layer > .window",
      )) {
        const style = innerWindow.getComputedStyle(windowElement);
        if (
          windowElement.hidden ||
          style.display === "none" ||
          style.visibility === "hidden"
        ) {
          continue;
        }
        const bounds = windowElement.getBoundingClientRect();
        if (!bounds.width || !bounds.height) continue;
        regions.push(
          new DOMRect(
            frameBounds.left + bounds.left * scaleX,
            frameBounds.top + bounds.top * scaleY,
            bounds.width * scaleX,
            bounds.height * scaleY,
          ),
        );
      }
      presentation.setImportantRegions(regions);
      onGeometryChange?.();
    };

    const updateGeometry = () => {
      if (!layer || !frame) return;
      const taskbar = frame.contentDocument?.getElementById("taskbar");
      const innerWindow = frame.contentWindow;
      if (!taskbar || !innerWindow) {
        layer.style.removeProperty("--avatar-taskbar-bottom");
        layer.style.removeProperty("--avatar-taskbar-clip-bottom");
        updateImportantRegions();
        return;
      }

      const taskbarBounds = taskbar.getBoundingClientRect();
      const frameBounds = frame.getBoundingClientRect();
      const layerBounds = layer.getBoundingClientRect();
      const viewportHeight = innerWindow.innerHeight;
      if (!viewportHeight || !frameBounds.height) {
        layer.style.removeProperty("--avatar-taskbar-bottom");
        layer.style.removeProperty("--avatar-taskbar-clip-bottom");
        updateImportantRegions();
        return;
      }

      const taskbarVisible = taskbarBounds.width > 0 && taskbarBounds.height > 0;
      const horizontalTaskbar =
        taskbarVisible && taskbarBounds.width >= taskbarBounds.height;
      const taskbarAtTop = taskbarBounds.top <= viewportHeight / 2;
      const floorOffset = !taskbarVisible
        ? viewportHeight
        : horizontalTaskbar
          ? taskbarAtTop
            ? taskbarBounds.bottom
            : taskbarBounds.top
          : viewportHeight;
      const frameScale = frameBounds.height / viewportHeight;
      const floorY =
        frameBounds.top + floorOffset * frameScale - layerBounds.top;
      const taskbarOccludesAvatar =
        taskbarVisible && horizontalTaskbar && !taskbarAtTop;
      const occlusionDepth = taskbarOccludesAvatar
        ? taskbarBounds.height * frameScale * TASKBAR_AVATAR_OCCLUSION_RATIO
        : 0;
      layer.style.setProperty(
        "--avatar-taskbar-bottom",
        `calc(100% - ${floorY + occlusionDepth + TASKBAR_FLOOR_OVERLAP}px)`,
      );
      if (taskbarOccludesAvatar) {
        layer.style.setProperty(
          "--avatar-taskbar-clip-bottom",
          `${Math.max(0, layerBounds.height - floorY)}px`,
        );
      } else {
        layer.style.removeProperty("--avatar-taskbar-clip-bottom");
      }
      updateImportantRegions();
    };

    const clearContentObservers = () => {
      contentResizeObserver?.disconnect();
      contentResizeObserver = undefined;
      contentMutationObserver?.disconnect();
      contentMutationObserver = undefined;
      windowMutationObserver?.disconnect();
      windowMutationObserver = undefined;
      contentWindow?.removeEventListener("resize", updateGeometry);
      contentWindow?.removeEventListener("scroll", updateGeometry);
      contentDocument?.removeEventListener("scroll", updateGeometry, true);
      contentWindow = undefined;
      contentDocument = undefined;
    };

    const observeImportantWindows = () => {
      windowMutationObserver?.disconnect();
      const document = frame?.contentDocument;
      const windowLayer = document?.getElementById("window-layer");
      if (!windowLayer || typeof MutationObserver === "undefined") {
        updateImportantRegions();
        return;
      }

      windowMutationObserver = new MutationObserver(() => {
        observeImportantWindows();
      });
      windowMutationObserver.observe(windowLayer, { childList: true });
      for (const windowElement of windowLayer.children) {
        windowMutationObserver.observe(windowElement, {
          attributes: true,
          attributeFilter: ["class", "style", "hidden"],
        });
      }
      updateImportantRegions();
    };

    const observeTaskbar = () => {
      clearContentObservers();
      const document = frame?.contentDocument;
      const taskbar = document?.getElementById("taskbar");
      const innerWindow = frame?.contentWindow;
      if (!taskbar || !innerWindow) {
        updateGeometry();
        return;
      }

      contentWindow = innerWindow;
      contentDocument = document ?? undefined;
      innerWindow.addEventListener("resize", updateGeometry);
      innerWindow.addEventListener("scroll", updateGeometry);
      document?.addEventListener("scroll", updateGeometry, true);
      if (typeof ResizeObserver !== "undefined") {
        const observer = new ResizeObserver(updateGeometry);
        observer.observe(taskbar);
        contentResizeObserver = observer;
      }
      if (typeof MutationObserver !== "undefined" && document?.body) {
        const observer = new MutationObserver(updateGeometry);
        observer.observe(document.body, {
          attributes: true,
          attributeFilter: ["class", "style", "data-dock-position"],
        });
        observer.observe(taskbar, {
          attributes: true,
          attributeFilter: ["class", "style"],
        });
        contentMutationObserver = observer;
      }
      observeImportantWindows();
      updateGeometry();
    };

    const setFrame = (nextFrame: HTMLIFrameElement | undefined) => {
      if (frame === nextFrame) {
        updateGeometry();
        return;
      }

      clearContentObservers();
      outerResizeObserver?.disconnect();
      outerResizeObserver = undefined;
      outerWindow?.removeEventListener("resize", updateGeometry);
      outerWindow?.removeEventListener("scroll", updateGeometry);
      outerWindow = undefined;
      if (frame && frameLoadHandler) {
        frame.removeEventListener("load", frameLoadHandler);
      }
      frame = nextFrame;
      frameLoadHandler = undefined;

      if (!frame || !layer) {
        layer?.style.removeProperty("--avatar-taskbar-bottom");
        layer?.style.removeProperty("--avatar-taskbar-clip-bottom");
        return;
      }

      outerWindow = frame.ownerDocument.defaultView ?? undefined;
      outerWindow?.addEventListener("resize", updateGeometry);
      outerWindow?.addEventListener("scroll", updateGeometry);
      if (typeof ResizeObserver !== "undefined") {
        const observer = new ResizeObserver(updateGeometry);
        observer.observe(frame);
        observer.observe(layer);
        outerResizeObserver = observer;
      }
      frameLoadHandler = observeTaskbar;
      frame.addEventListener("load", frameLoadHandler);
      observeTaskbar();
    };

    const setPresentation = (
      nextPresentation: AvatarPresentationController | undefined,
    ) => {
      if (presentation === nextPresentation) return;
      presentation?.detach();
      presentation = nextPresentation;
      if (!presentation || !layer) return;
      const viewport = layer.querySelector<HTMLElement>(".avatar-viewport");
      if (!viewport) {
        throw new Error("The desktop avatar viewport is unavailable.");
      }
      presentation.attach(layer, viewport);
      updateGeometry();
    };

    return {
      oncreate(vnode) {
        layer = vnode.dom as HTMLElement;
        onGeometryChange = vnode.attrs.onGeometryChange;
        speechInput = createSpeechInput();
        speechPlayback = createSpeechPlayback();
        conversation = new ConversationOrchestrator({
          provider: llmProvider,
          audioOutput: speechPlayback,
          getAppContext: () => vnode.attrs.getAppContext?.(),
          onUtterance: applyAssistantUtterance,
          onChange: updateConversationView,
        });
        setSpeechInputListener(vnode.attrs.onSpeechInput);
        setFrame(vnode.attrs.frame);
        setPresentation(vnode.attrs.presentation);
      },

      onupdate(vnode) {
        onGeometryChange = vnode.attrs.onGeometryChange;
        setSpeechInputListener(vnode.attrs.onSpeechInput);
        setFrame(vnode.attrs.frame);
        setPresentation(vnode.attrs.presentation);
        if (restoreNotificationFocus && !notificationOpen) {
          restoreNotificationFocus = false;
          (
            layer?.querySelector<HTMLButtonElement>(
              ".avatar-notification-indicator",
            ) ??
            layer?.querySelector<HTMLButtonElement>(
              ".avatar-interaction-target",
            )
          )?.focus();
        }
        if (restoreAvatarFocus && !conversationOpen) {
          restoreAvatarFocus = false;
          layer
            ?.querySelector<HTMLButtonElement>(".avatar-interaction-target")
            ?.focus();
        }
      },

      onremove(vnode) {
        if (conversationOpen || notificationOpen) {
          presentation?.setMode("ambient");
        }
        conversation?.cancelTurn();
        conversation = undefined;
        conversationOpen = false;
        notificationOpen = false;
        stopAssistantSpeech();
        speechPlayback?.dispose();
        speechPlayback = undefined;
        cancelRecognition();
        setSpeechInputListener(undefined);
        void speechInput?.dispose().catch((error: unknown) => {
          console.error("Unable to dispose speech input:", error);
        });
        speechInput = undefined;
        setPresentation(undefined);
        setFrame(undefined);
        layer = undefined;
        onGeometryChange = undefined;
      },

      view(vnode: Vnode<DesktopAvatarOverlayAttrs>) {
        const viewportAttrs = {
          targetRegistry: vnode.attrs.targetRegistry,
          onScene(scene: AvatarSceneHandle | undefined) {
            avatarScene = scene;
            if (scene && microphoneWasActive) {
              scene.controller.setState("listening");
            }
            vnode.attrs.onScene?.(scene);
          },
          gazeOverlay: vnode.attrs.gazeOverlay,
          showGazeTarget: vnode.attrs.showGazeTarget,
          interactive: true,
          conversationOpen,
          notificationCount: conversationOpen
            ? 0
            : unreadNotificationCount(),
          notificationOpen,
          onActivate() {
            notificationOpen = false;
            notificationOpenError = undefined;
            conversationOpen = true;
            presentation?.setMode("conversation");
            m.redraw();
          },
          onNotificationsActivate() {
            if (conversationOpen) return;
            if (notificationOpen) {
              closeNotificationCenter();
              return;
            }
            notificationOpen = true;
            notificationOpenError = undefined;
            presentation?.setMode("notification");
            m.redraw();
          },
        };
        const openNotificationApp = async (
          notification: AvatarNotification,
        ) => {
          const openApplication = vnode.attrs.onOpenApplication;
          if (!openApplication) {
            notificationOpenError =
              "Opening the related application is unavailable.";
            m.redraw();
            return;
          }
          try {
            await openApplication(notification.appId);
            notifications = notifications.map((current) =>
              current.id === notification.id
                ? { ...current, read: true }
                : current,
            );
            closeNotificationCenter();
          } catch (error) {
            notificationOpenError = errorMessage(error);
            m.redraw();
          }
        };
        return m(
          ".desktop-avatar-layer",
          {
            role: "group",
            "aria-label": "Desktop companion",
          },
          [
            m(AvatarViewport, viewportAttrs),
            notificationOpen && !conversationOpen
              ? m(AvatarNotificationPanel, {
                  notifications,
                  openError: notificationOpenError,
                  onClose: closeNotificationCenter,
                  onRead(notification) {
                    notifications = notifications.map((current) =>
                      current.id === notification.id
                        ? { ...current, read: true }
                        : current,
                    );
                    closeNotificationCenter();
                  },
                  onOpen: (notification) =>
                    void openNotificationApp(notification),
                  onDismiss(notification) {
                    notifications = notifications.filter(
                      (current) => current.id !== notification.id,
                    );
                    closeNotificationCenter();
                  },
                })
              : null,
            conversationOpen
              ? m(AvatarConversationCard, {
                  speechInput,
                  speechActivityMessage,
                  speechError,
                  speechOutputError,
                  conversationError,
                  conversationState,
                  userTranscript,
                  assistantText,
                  speechOutputActive,
                  speechPlaying: speechIsPlaying,
                  onSpeechError: reportSpeechError,
                  onSpeechOutputError: reportSpeechOutputError,
                  onSpeak: speakAssistantText,
                  onStopSpeaking: stopConversationOrSpeech,
                  onCancelTurn: () => conversation?.cancelTurn(),
                  onSend: (text) =>
                    conversation?.submitUserMessage(text) ?? Promise.resolve(),
                  onConversationError: (error) => conversation?.reportError(error),
                  onClose: closeConversation,
                })
              : null,
          ],
        );
      },
    };
  };
