---
title: Always-on open mic on a tablet browser, echo, permissions and sleep limits
label: wayfinder:research
status: closed
assignee: tristan-albers_tno
blocked-by: []
---

## Question

What are the practical limits of keeping the microphone open in a tablet
browser or kiosk (Android Chrome, iPadOS Safari, PWA, kiosk mode)? Cover:
persistent microphone permission, behaviour when the screen sleeps or the tab
backgrounds (Wake Lock, audio session rules), `getUserMedia` echo
cancellation and noise suppression when Sodalis speaks through the tablet's
own speaker (does barge-in still work), AudioWorklet CPU and battery cost
for continuous VAD, and any mandatory OS microphone indicator. Surface facts
only; the decision comes later.

## Resolution

Findings: branch `research/open-mic`, file `research/open-mic.md` (never merged). Each claim is tagged documented, anecdotal, inferred, or unverified. The agent's summary was read; the file was not re-checked.

- Today `packages/speech` calls `getUserMedia({audio:true})` with no echo, noise, or gain constraints and polls an `AnalyserNode` from a main-thread `setInterval` (20 ms, RMS gate 0.045). It has no AudioWorklet, VAD library, wake lock, or `visibilitychange` handling.
- Permission persistence: Chrome Android offers "Allow this time" and "while visiting"; the `AudioCaptureAllowed` policy lists Android but `AudioCaptureAllowedUrls` does not; WebKit bugs report Home Screen web apps re-prompt every launch.
- Sleep and background: a wake lock is released when the page is hidden; from iOS 18.4 it only works in Home Screen apps; Android 9+ blocks mic access for background apps. Whether Chrome Android's foreground service keeps capture alive is unverified.
- Echo cancellation: the spec only requires cancelling WebRTC peer-connection audio, not local playback. Chrome's cancel-all-audio feature is desktop only; Android relies on the platform canceller; Safari uses VoiceProcessingIO but has reported volume and routing bugs. Barge-in over the tablet's own speaker is therefore unproven and must be measured on the device.
- VAD cost: AudioWorklet has a 3 ms budget in Chrome; `@ricky0123/vad-web` infers on the main thread; no primary source gives tablet CPU or battery figures.
- OS mic indicators are mandatory (Android 12+ status-bar icon, iOS orange dot); whether kiosk or MDM can hide them is unverified.
- Gaps: Chromium bug tracker unreadable, no current iPadOS background-capture data, PWA/kiosk permission persistence unconfirmed.
