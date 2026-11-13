# Open microphone on a tablet browser: practical limits

Research for `WAYFIND/interaction-modes/T02-open-mic-tablet-browser-limits.md`. Facts only;
no recommendations. Fetched 2026-11-13.

Tags: **[D]** documented (spec, MDN, vendor docs, vendor source); **[B]** reported in a bug
tracker or anecdotal; **[I]** inferred by the author; **[U]** not verified. Browser support
comes from MDN [browser-compat-data](https://github.com/mdn/browser-compat-data) (BCD).
Chromium and WebKit source is read at `main` on the fetch date. The Chromium issue tracker
renders only via JavaScript and could not be fetched, so no Chromium bug IDs are cited.

## 0. What `packages/speech` does today (context)

- Capture: `BrowserMicrophoneCapture.ts:87` calls `getUserMedia({ audio: true })` with no
  `echoCancellation`, `noiseSuppression` or `autoGainControl` constraint.
- Analysis: `AudioContext` + `AnalyserNode` (`fftSize` 1024), lines 101-113. No `AudioWorklet`,
  no VAD library. A main-thread `window.setInterval` every 20 ms (`:4`, `:122-136`) reads
  `getFloatTimeDomainData` and calls `onSamples`.
- Recording: `MediaRecorder` per speech segment, 200 ms chunks (`:5`, `:162-191`).
- VAD: `voiceActivity.ts:17-19,54-79` is an RMS energy gate (threshold 0.045, 2 start frames,
  35 end frames), wired in `apps/desktop/src/avatar/DesktopAvatarOverlay.ts:377`.
- Barge-in: `SpeechInputController.ts:150-172` (`interruptOutput`) stops playback, TTS and
  generation. It runs on `speech-start` (`:233`) when an output is registered (`:423-424`).
- Playback: `apps/desktop/src/avatar/SpeechPlaybackController.ts:99-103,420-426,491-496` uses a
  separate `AudioContext`: `AudioBufferSourceNode` → `AnalyserNode` → `destination`.
- Not present (grep of `packages/speech/src`, `apps/desktop/src`): `wakeLock`, `visibilitychange`,
  `audioSession`, `AudioContext` `statechange`, track `mute`/`unmute` handlers. Only the track
  `ended` event is handled (`BrowserMicrophoneCapture.ts:115-120`).

## 1. Persistent microphone permission

**Spec / API**
- Persistence is UA-defined. The spec only says a "stored persistent permission" should be easy
  to list and revoke, and that the UA shows access and "on air" state. [D]
  [mediacapture-streams §16](https://www.w3.org/TR/mediacapture-streams/)
- Permissions API names `"microphone"`/`"camera"`. `granted` means no prompt, not that
  `getUserMedia` will succeed (§13). Permissions Policy `microphone` defaults to `self` (§14). [D]
- BCD: `Permissions.query()` and the `microphone` name work in Chrome, Chrome Android, Safari 16+
  (iOS mirrors). Both are `false` in Android WebView; `microphone` is `false` in iOS WKWebView. [D]
  [Permissions.json](https://github.com/mdn/browser-compat-data/blob/main/api/Permissions.json)

**Chrome / Android**
- Chrome 116+ added "Allow this time" on desktop; the article says mobile prompts were
  "unchanged for now". [D] [one-time permissions](https://developer.chrome.com/blog/one-time-permissions)
- Chrome's Android help now lists "Allow this time" (current visit only) and "Allow while
  visiting the site" (future visits too). [D]
  [Chrome Help](https://support.google.com/chrome/answer/114662?co=GENIE.Platform%3DAndroid)
- One-time grants expire on page close/navigation/discard, after 16 h, on manual or
  enterprise-policy revocation, or after 5 min in the background. The 5-min timer does not
  start while the page keeps using the microphone. [D] (same article, "Expiration")
- Persistent grants are per origin; Chrome removes permissions from sites not recently visited. [D]
  (same article, "Impact")
- `AudioCaptureAllowed` (bool): unset/true = prompts except for `AudioCaptureAllowedUrls`; false =
  no prompts, capture only for those URLs. `supported_on`: `chrome.*:25-`, `chrome_os:23-`,
  `android:157-`. [D] [policy yaml](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/components/policy/resources/templates/policy_definitions/Miscellaneous/AudioCaptureAllowed.yaml)
- `AudioCaptureAllowedUrls`: "grants access … without prompt"; pattern `*` unsupported.
  `supported_on`: `chrome.*:29-`, `chrome_os:29-`. **Android is not listed.** [D]
  [policy yaml](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/components/policy/resources/templates/policy_definitions/Miscellaneous/AudioCaptureAllowedUrls.yaml)
- Chrome (all platforms): an `AudioContext` created before a user gesture starts `suspended`;
  autoplay with sound is allowed if the user interacted, or the site was added to the home screen
  on mobile. [D] [autoplay policy](https://developer.chrome.com/blog/autoplay)
- Whether a WebAPK/TWA or Chrome kiosk install shares Chrome's per-origin mic grant: **[U]**.

**iOS / iPadOS Safari, Home Screen web apps, WKWebView**
- Bug 280394 "Persist permissions for getUserMedia" (NEW, 2024-09): after reload iPhone prompts
  again; no "always allow" on iPhone or in a Home Screen app (Safari on Mac has it). [B]
  [bug](https://bugs.webkit.org/show_bug.cgi?id=280394)
- Bug 327237 (NEW, 2026-10-12): in Home Screen web apps the grant lasts one launch; the prompt
  returns on every relaunch, even seconds after capture ended. Reporter: Safari's per-site
  "Allow" does not apply to Home Screen apps; WKWebView apps can persist via `WKUIDelegate`. [B]
  [bug](https://bugs.webkit.org/show_bug.cgi?id=327237)
- 280394 comment 4 (2026-05, tablet PWA): with a stream open at screen-off, the prompt reappeared
  on screen-on; stopping the stream before suspend avoided it. [B] (single anecdote)
- Bug 215884 (RESOLVED CONFIGURATION CHANGED): standalone re-prompt after hash-only navigation. [B]
  Titles only, not read: 228317 "Permissions for Camera expires after some time", 275527
  "REGRESSION (iOS 17.5.1): Camera freezes in installed PWA", 329593. [B]
- WKWebView: `webView(_:requestMediaCapturePermissionFor:…)` (iOS 15+) lets the host app decide;
  if not implemented, the system returns `.prompt`. [D]
  [Apple docs](https://developer.apple.com/documentation/webkit/wkuidelegate/webview(_:requestmediacapturepermissionfor:initiatedbyframe:type:decisionhandler:))
- Safari's own per-visit vs per-site rules on iPadOS: only in bugs, no Apple primary doc found. **[U]**

## 2. Screen sleep and background behaviour

**Screen Wake Lock**
- `navigator.wakeLock.request("screen")` can be rejected (power save, low battery, document not
  visible/active) and released by the system. [D]
  [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API)
- Spec: released automatically when the document is not fully active or becomes `hidden`
  (§11.2-11.3); must be re-requested. UAs may ignore requests in power-saving modes (§12). No
  explicit permission is required (§3 note). [D] [W3C](https://www.w3.org/TR/screen-wake-lock/)
- BCD: Chrome/Chrome Android 84, Firefox 126, Safari 16.4. On iOS, 16.4-18.3 did **not** work in
  Home Screen web apps; fixed in 18.4. [D]
  [WakeLock.json](https://github.com/mdn/browser-compat-data/blob/main/api/WakeLock.json),
  [WebKit 254545](https://bugs.webkit.org/show_bug.cgi?id=254545) (RESOLVED FIXED)
- Guided Access (iPadOS single-app mode) has its own "Display Auto-Lock" setting. [D]
  [Apple](https://support.apple.com/en-us/111795) Interaction with the web Wake Lock: **[U]**.

**Does capture continue when backgrounded or locked?**
- Spec: UAs may mute a mic track for implementation-defined reasons (OS mute, another app with
  higher audio priority such as an incoming call); apps see `muted`/`mute`/`unmute`. [D]
  [mediacapture-streams §4.3.1.1](https://www.w3.org/TR/mediacapture-streams/)
- Chrome (desktop doc): camera and microphone may run in a background tab, with a tab-strip
  indicator. [D] [one-time permissions](https://developer.chrome.com/blog/one-time-permissions)
- Android 9+: an app in the background "cannot access the microphone or camera". [D]
  [Android 9 changes](https://developer.android.com/about/versions/pie/android-9.0-changes-all)
  Chrome's manifest declares `MediaCaptureNotificationService` with
  `foregroundServiceType="camera|microphone"`, which "creates/destroys the WebRTC notification
  when media capture starts/stops". [D]
  [manifest](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/android/java/AndroidManifest.xml),
  [service](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/android/java/src/org/chromium/chrome/browser/media/MediaCaptureNotificationServiceImpl.java)
  Whether this keeps Chrome Android capture alive with screen off or tab hidden: **[U]**.
- iOS Safari bug 204681 (NEW, 2019, iOS 13): audio track went `ended` or OS-muted after >30 s in
  the background. A WebKit engineer: while capturing, the page is not suspended; after a phone
  call capture is muted and the page becomes suspendible. Reported workaround: call
  `getUserMedia` again on `visibilitychange`. Last triage comment (2022) asks if it still
  reproduces on iOS 15+. [B] [bug](https://bugs.webkit.org/show_bug.cgi?id=204681)
  Current iPadOS behaviour: **[U]**.

**Audio Session API / AudioContext**
- `navigator.audioSession` (W3C WD 2024-11-13): `type` ∈ `auto`, `playback`, `transient`,
  `transient-solo`, `ambient`, `play-and-record`; `state` ∈ `active`, `interrupted`, `inactive`.
  A mic track defaults to `play-and-record`; per the draft algorithm the track is **ended** if the
  session type is neither `play-and-record` nor `auto`, and is muted/unmuted on suspend/resume. [D]
  [W3C audio-session §3, §6.3](https://www.w3.org/TR/audio-session/)
- Support: Safari 16.4 (iOS mirrors); Chrome `false`; Firefox "preview"; experimental. [D]
  [MDN](https://developer.mozilla.org/en-US/docs/Web/API/AudioSession),
  [BCD](https://github.com/mdn/browser-compat-data/blob/main/api/AudioSession.json)
- `AudioContext.state`: `suspended`, `running`, `closed`, `interrupted` ("cannot process audio
  until the interruption ends"). [D] [Web Audio](https://www.w3.org/TR/webaudio/)
- Timer throttling (Chrome 88 doc): hidden pages' timers run at most once per second, unless the
  page made sound in the last 30 s ("minimal throttling"). Intensive throttling (once per minute)
  needs hidden >5 min, silent ≥30 s and no WebRTC use; the doc defines WebRTC use as an
  `RTCPeerConnection` with an open data channel or a live `MediaStreamTrack`. Whether a plain
  `getUserMedia` track counts: **[U]**. [D]
  [Chrome](https://developer.chrome.com/blog/timer-throttling-in-chrome-88)
  (`packages/speech` polls with `setInterval(20 ms)`.)
- Page Lifecycle `frozen`/`discarded` pages run no JavaScript; discarded pages must be reloaded. [D]
  [Chrome](https://developer.chrome.com/docs/web-platform/page-lifecycle-api)

## 3. Echo cancellation, noise suppression, AGC with own TTS

**Spec / MDN**
- `echoCancellation`, `noiseSuppression`, `autoGainControl` are constrainable properties, each
  "often desirable" and switchable. `echoCancellation` takes `true`, `false`, `"all"`,
  `"remote-only"`. `"all"`: MUST attempt to remove all sound played by the system.
  `"remote-only"`: only audio from WebRTC `RTCPeerConnection` tracks. `true`: UA decides; MUST
  attempt at least `"remote-only"`, SHOULD attempt `"all"`. [D]
  [W3C](https://www.w3.org/TR/mediacapture-streams/),
  [MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints/echoCancellation)
  So the spec does not require `true` to cancel local Web Audio or `<audio>` output. [I]
- The modes came from a WebRTC WG resolution (April 2025, issue #1035). [D]
  [issue](https://github.com/w3c/mediacapture-main/issues/1035) Browser support: **[U]**.
- No spec default is stated for these three properties; issue #777 (closed). Per-browser defaults
  for `{ audio: true }`: **[U]** (readable via `track.getSettings()`).

**Chrome (Chromium source)**
- Desktop (Win/Mac/Linux): `kChromeWideEchoCancellation`, on by default: when mic echo
  cancellation is requested, "mix and cancel all audio playback going to a specific output device
  in the audio service". `chrome_wide_echo_cancellation_supported = is_win || is_mac || is_linux`;
  system loopback as reference is Win/Mac only. [D]
  [media_switches.cc](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/media/base/media_switches.cc),
  [media_options.gni](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/media/media_options.gni)
- Android is not in that list. `AudioManagerAndroid` reports an `ECHO_CANCELLER` platform effect
  when Android's `AcousticEchoCanceler` is available, and by default sets `MODE_IN_COMMUNICATION`
  unless the caller disabled all input processing; output then uses `AAUDIO_USAGE_VOICE_COMMUNICATION`.
  AAudio input is disabled on some Unisoc devices (Android ≤11) "due to missing/broken echo
  cancellation". [D]
  [audio_manager_android.cc](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/media/audio/android/audio_manager_android.cc)
  Whether that AEC reference covers same-page Web Audio / `<audio>` output: **[U]**
  (presumably the device output mix [I]).

**Safari / WebKit**
- WebKit Cocoa: `echoCancellation` true → `CoreAudioCaptureUnit` on
  `kAudioUnitSubType_VoiceProcessingIO` (VPIO); false → a non-VPIO unit. [D]
  [CoreAudioCaptureSource.cpp](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/platform/mediastream/cocoa/CoreAudioCaptureSource.cpp)
  (~l.227, ~l.327),
  [CoreAudioCaptureUnit.cpp](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/platform/mediastream/cocoa/CoreAudioCaptureUnit.cpp) (~l.77)
- Apple native AVAudioSession docs: `voiceChat` mode with the VoiceProcessingIO unit gives voice
  features incl. AGC; chat modes without it apply no voice processing "like echo cancellation"
  and yield "a lower playback level"; `playAndRecord` routes to the receiver unless
  `defaultToSpeaker`. [D, native API; mapping to Safari web content is **[I]**]
  [voiceChat](https://developer.apple.com/documentation/avfaudio/avaudiosession/mode-swift.struct/voicechat),
  [defaultToSpeaker](https://developer.apple.com/documentation/avfaudio/avaudiosession/categoryoptions-swift.struct/defaulttospeaker)
- Ducking: `AUVoiceIOOtherAudioDuckingConfiguration` configures ducking of other non-voice audio;
  default is no advanced ducking. [D]
  [Apple](https://developer.apple.com/documentation/audiotoolbox/auvoiceiootheraudioduckingconfiguration)
  Whether WebKit sets it: **[U]**.
- Bug 236219 (NEW, 2022): on iOS, Web Audio (and possibly media elements) volume drops while the
  mic captures. WebKit's reply: `getUserMedia` sets the session to "play-and-record"; use
  `navigator.audioSession.type`. iPad 15/16 users report lower volume once mic access is
  accepted. [B] [bug](https://bugs.webkit.org/show_bug.cgi?id=236219)
- Bug 326286 (NEW, 2026-10, single reporter, iOS 27): Web Audio and `<audio>` crackle while a
  stream with `echoCancellation: true` is open; with it off, output is clean but "moves to the
  receiver (earpiece) at much lower volume" (iPhone). Not reproduced on macOS/Android. [B]
  [bug](https://bugs.webkit.org/show_bug.cgi?id=326286) iPad routing: **[U]**.

**Barge-in facts**
- Repo: raw RMS gate with no AEC-aware logic. Two consecutive 20 ms polls ≥0.045 RMS fire
  `speech-start`, then `interruptOutput` if output is active (§0). [D, repo code]
- Published residual-echo figures after browser AEC on tablets: **[U]**.

## 4. AudioWorklet CPU / battery cost of continuous VAD

- AudioWorklet runs user code on the audio rendering thread, replacing main-thread
  `ScriptProcessorNode`. Chrome cites a 3 ms budget at 44.1 kHz and warns JS garbage causes
  glitches. [D] [intro](https://developer.chrome.com/blog/audio-worklet),
  [design patterns](https://developer.chrome.com/blog/audio-worklet-design-pattern);
  default quantum 128 frames: [Web Audio](https://www.w3.org/TR/webaudio/)
- BCD: `AudioWorkletNode` Chrome 66, Safari 14.1 (iOS mirrors). [D]
  [AudioWorkletNode.json](https://github.com/mdn/browser-compat-data/blob/main/api/AudioWorkletNode.json)
- `@ricky0123/vad-web` 0.0.31 (not used by this repo): Silero VAD on ONNX Runtime Web. An
  `AudioWorklet` resamples and posts frames to the main thread (`port.onmessage`), where
  `processFrame` runs inference. Default stream: `channelCount: 1` with `echoCancellation`,
  `autoGainControl`, `noiseSuppression` all `true`; falls back to `ScriptProcessorNode`. [D]
  [real-time-vad.ts](https://github.com/ricky0123/vad/blob/master/packages/web/src/real-time-vad.ts),
  [worklet.ts](https://github.com/ricky0123/vad/blob/master/packages/web/src/worklet.ts)
  Defaults: positive threshold 0.3, negative 0.25, `redemptionMs` 1400, `preSpeechPadMs` 800,
  `minSpeechMs` 400. [D] [algorithm](https://docs.vad.ricky0123.com/user-guide/algorithm/)
- ONNX Runtime Web: `env.wasm.numThreads` defaults to min(½ `hardwareConcurrency`, 4);
  multithreading needs cross-origin isolation, otherwise single thread. [D]
  [ORT docs](https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html)
- Silero benchmark (desktop, not mobile): Threadripper 3960X, 1 thread, 16 kHz, 31.25 ms chunk:
  V5 ONNX 325 µs (≈96× real time). README: <1 ms per 30+ ms chunk on one CPU thread; JIT model
  ≈2 MB. [D, vendor claim] [wiki](https://github.com/snakers4/silero-vad/wiki/Performance-Metrics),
  [README](https://github.com/snakers4/silero-vad)
- Battery/CPU measurements on Android/iPadOS tablets for an always-on AudioWorklet or
  Silero-WASM VAD: **[U]**, none found in primary sources.
- The Wake Lock spec says a UI indicator helps users spot "negative energy impact"; no numbers. [D]
  [§13](https://www.w3.org/TR/screen-wake-lock/)

## 5. Mandatory OS microphone indicators

- Spec: UAs MUST indicate when mic access (`anyAccessible`) or live capture (`anyLive`) changes;
  a false→true transition must stay observable (SHOULD ≥3 s). Ongoing indication is only
  "encouraged". [D] [mediacapture-streams §15](https://www.w3.org/TR/mediacapture-streams/)
- Android 12+: status-bar icon whenever an app has ongoing user-sensitive mic/camera/location
  access, becoming a dot while active (active = running or <5 s old). Tapping names the app.
  Quick Settings has mic and camera toggles; a Privacy Dashboard shows a timeline. [D]
  [AOSP](https://source.android.com/docs/core/permissions/privacy-indicators),
  [behavior changes](https://developer.android.com/about/versions/12/behavior-changes-all),
  [features](https://developer.android.com/about/versions/12/features)
  Hiding it via OEM or managed-kiosk (lock-task) config: **[U]** (not addressed on the AOSP page).
- iOS/iPadOS: orange indicator whenever an app uses the microphone without the camera (green
  with camera); Control Center shows recent use. [D] (iPhone guide; iPad guide not fetched)
  [Apple](https://support.apple.com/guide/iphone/iph168c4bbd5/ios)
  Suppression under Guided Access, Single App Mode or MDM: **[U]**.
- Chrome: tab-strip indicator while a background tab uses mic/camera (desktop UI); Chrome
  Android posts a capture notification (§2 source). Kiosk or installed-PWA windows hiding it: **[U]**.
- The Android 9 background rule and the Android 12 mic toggle are OS-level, so they apply to any
  browser or kiosk wrapper. [D] (sources above)

## 6. Gaps

1. Chromium tracker content: Android Chrome mic capture with screen off or tab hidden; AEC
   reference for Web Audio on Android.
2. Current iPadOS Safari/PWA capture on lock/background (only 2019 bug 204681 and a 2026 comment).
3. Per-browser AEC/NS/AGC defaults for `{ audio: true }`; support for `"all"`/`"remote-only"`.
4. Whether Android platform AEC cancels same-page Web Audio/`<audio>`; iPad speaker routing under VPIO.
5. Android PWA (WebAPK/TWA) and Chrome kiosk permission persistence; whether
   `AudioCaptureAllowedUrls` works on Android (listed for desktop/ChromeOS only).
6. Published battery/CPU numbers for continuous VAD on tablets.
7. Whether kiosk/MDM can hide OS indicators on Android or iPadOS.
8. WebKit bugs 228317, 275527, 329593 read by title only.
