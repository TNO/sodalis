# Hey Sodalis: sample-based wake-word prototype

**Throwaway evaluation prototype; not production code and not part of the Sodalis app.** It tests local, sample-based detection of the Dutch phrase “Hey Sodalis” in a laptop browser. It does not transcribe speech or start a conversation after detection.

## Engine choice

This prototype uses **Rustpotter** (`rustpotter-web` 3.0.2 and `rustpotter-worklet` 3.0.3). The Rustpotter code, WASM and browser worklet are Apache-2.0. Rustpotter describes 3–8 WAV samples as sufficient for a reference; this UI allows 3–10 as requested and makes the reference locally from the user’s own samples. Using more samples may increase matching work; there are no published browser CPU results. Detection runs in a browser AudioWorklet/Worker. This fit is lower effort than EfficientWord-Net’s beta ONNX/WebAudio frontend, and avoids EfficientWord-Net’s model-weight licence not being stated in the available research. No pretrained model weights are used here.

There is no published Dutch false-accept/false-reject result, browser CPU result, or phrase-end latency result for this engine. Its language-agnostic MFCC matching is not a claim of Dutch accuracy. Treat this as a short exploratory check, not validation.

## Run locally

From this directory:

```sh
npm install
npm run dev
```

Open <http://127.0.0.1:5173/> in Chrome or Edge and allow microphone access when asked. Use `Ctrl+C` to stop Vite. The page needs a secure browser context for microphone access; localhost is treated as secure by browsers.

The install fetches pinned packages from npm. During the browser session, the page loads its JS/WASM/worklet assets from the local Vite origin only. It makes no cloud/provider calls and sends no audio over the network. The code only asks for microphone access after an explicit record or listen action. It creates no audio files, does not use local storage, and never exports audio. Recorded example buffers exist in browser memory only until reference generation; those buffers are zeroed after use or removal. Continuous listening is processed locally by Rustpotter; no listening audio is saved. The detector necessarily processes live audio frames and keeps short-lived in-memory features for matching. Use the fixed, always-visible microphone banner and its one-touch **Dempen · microfoon uit** control.

## Hands-on check (human to run; about 10 minutes)

Do **not** treat the counters as results until you run the check yourself:

1. On the laptop, record **3–10** natural Dutch examples of “Hey Sodalis” and select **Maak wakeword**. The app keeps those samples in memory only while creating the reference, then clears them. There is no upload/import control.
2. Select **Start luisteren**. Confirm that the sticky top banner always says the microphone is on and waiting locally. Try **Dempen · microfoon uit** once, then start listening again to confirm one-touch muting works.
3. For about **10 minutes total**, play a varied mix of TV, radio and ordinary conversation without intentionally saying the wakeword. Select **Start 10-minutentest** during playback. Tap **Valse activatie +1** for each unintended activation. The detector has a fixed 3-second duplicate-detection cooldown; the export records it.
4. Make about **20 intended Dutch attempts** at a natural volume and a couple of ordinary speaking distances. Before each, select **Start bedoelde poging**, then say “Hey Sodalis” once. The window is 8 seconds. A detected first attempt is counted automatically; after a miss, select **Probeer nog één keer** for the one retry or **Markeer als gemist** to finish that attempt. Do not count retries as new intended attempts.
5. Choose the felt-intrusiveness rating: **Prima**, **Ongemakkelijk**, or **Onacceptabel**. Download both JSON and text session logs.

### Rubric and red flags

The provisional rubric’s hard gates are no pre-activation audio written to disk, false-activation audio discarded immediately, no covert listening, an always-visible listening state with one-touch mute, no more than 0.25 false activations per waking hour, and at least 80% first-try success (target: 95% within one retry). The 10-minute / 20-attempt check is only a short hands-on screen, not enough time or sample size to verify hourly/threshold rates. Red flags are **2 or more false activations during the 10 minutes** or **5 or more first-attempt misses out of 20**. A clean run means only “no red flag observed.”

Record any privacy red flag too: microphone active without an obvious status, mute failing to stop the stream, or any audio leaving the device or being saved. Stop and report it rather than continuing. Do not enter real private conversations into the test playback.

## What the log means / limitations

- Every detection has a timestamp, Rustpotter score, and latency when estimable. The end-of-trigger timestamp is approximated from the last audio frame above a fixed RMS threshold followed by 180 ms of quiet. Background sound can skew it; “not measured” is preferable to treating this as exact phrase-end timing. The 3-second duplicate cooldown can also suppress a closely repeated phrase.
- Intended-attempt results are based on the 8-second timer and the detection time. First-try misses, retry successes and final misses are separately counted.
- The displayed timer delay is **not CPU usage**. It is main-thread scheduling delay only. For a rough real CPU observation, open Chrome’s browser Task Manager with **Shift+Esc**, locate the tab, and inspect its CPU column while listening. CPU/thermals/battery are not automatically measured or logged.
- A laptop browser result says nothing about tablet power, thermals, sleep/background behavior, or microphone permission persistence. No STT, LLM, voice ID, or cloud integration is included.
- No microphone exercise was performed as part of building this prototype. The human running the check must provide the microphone and their own voice samples.

## References

- [Rustpotter](https://github.com/GiviMAD/rustpotter) and [Rustpotter Worklet](https://github.com/GiviMAD/rustpotter-worklet) (Apache-2.0)
- [Rustpotter WASM / reference creator](https://github.com/GiviMAD/rustpotter-wasm) (Apache-2.0)
- Research source: `research/wake-word` branch, report `research/wake-word.md` (engine comparison and limitations).
