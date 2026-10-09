# Sodalis task index

The individual task files are the source of truth. Phase 1 records the desktop
and avatar foundation; later work is sequenced by explicit dependencies.

## Phase 0 — Desktop foundation

- [x] 0001 Establishing the Aster desktop foundation
- [x] 0002 Removing the unavailable Win32 Pad demo

## Phase 1 — Avatar runtime and asset pipeline

- [x] 0003 Breaking Phase 1 into implementation tasks
- [x] 0004 Auditing avatar integration seams
- [x] 0005 Defining avatar contracts and tests
- [x] 0006 Building the TalkingHead adapter
- [x] 0007 Integrating the Sodalis-owned Three.js scene
- [x] 0008 Implementing avatar behaviors
- [x] 0009 Building the Avatar Lab and gaze targets
- [x] 0010 Defining the avatar profile and GLB validator
- [x] 0011 Adding avatar quality and lifecycle safeguards
- [x] 0012 Completing Phase 1 integration and documentation

## Avatar assets and selection

- [x] 0013 Adding the TalkingHead brunette avatar
- [ ] 0014 Building the native Sodalis avatar asset pipeline
  *(needs 0010, 0012)*
- [ ] 0015 Building in-app avatar selection *(needs 0014)*

## Desktop avatar presentation

Task 0016 uses the current avatar asset and can proceed independently of the
asset pipeline and selector tasks. Task 0018 depends directly on 0016; tasks
0017 and 0019–0021 build on the desktop presentation.

- [x] 0016 Adding the persistent desktop avatar overlay
- [x] 0017 Adding avatar presentation modes *(needs 0016)*
- [x] 0018 Improving the avatar's ambient idle pose *(needs 0016)*
- [x] 0019 Adding semantic UI attention and avoidance *(needs 0017)*
- [x] 0020 Adding the avatar conversation card *(needs 0017)*
- [x] 0021 Adding avatar notification presentation *(needs 0017)*

## Speech and voice runtime

Task 0022 defines provider-neutral contracts and deterministic mocks only;
production providers follow in 0024–0025 after microphone/VAD support in
0023. Tasks 0024 and 0025 can proceed independently once 0023 is done.

- [x] 0022 Defining provider-neutral STT and TTS contracts
- [x] 0023 Adding microphone VAD and barge-in *(needs 0022)*
- [x] 0024 Adding a server STT provider *(needs 0022, 0023)*
- [x] 0025 Adding server TTS and lip sync *(needs 0022, 0023)*
- [x] 0041 Fixing STT transcription accuracy and silence hallucination *(needs 0023, 0024)*

## Conversation and app actions

Task 0026 depends on both server speech paths; structured affect and trusted
app actions follow the orchestrator.

- [x] 0026 Building the conversation orchestrator *(needs 0024, 0025)*
- [x] 0027 Adding structured assistant affect *(needs 0026)*
- [x] 0028 Connecting assistant app actions *(needs 0026, 0027)*

## Flexible services and app integrations

Tasks 0029–0034 establish independent Sodalis APIs, provider selection, the
Home Assistant simulator, the first-party semantic app SDK, and a
cross-platform development Compose stack. The stack uses Docker Compose v2
with Docker or Podman, exposes only a localhost same-origin gateway, and does
not silently fall back to cloud providers.

- [x] 0029 Splitting speech and AI into Sodalis services *(needs 0028)*
- [x] 0030 Selecting STT and TTS providers independently *(needs 0029)*
- [x] 0031 Adding the Sodalis AI provider facade *(needs 0029)*
- [x] 0032 Building the Home Assistant simulator service *(needs 0029)*
- [x] 0033 Creating the semantic app integration SDK *(needs 0028, 0029)*
- [x] 0034 Building the cross-platform development Compose stack *(needs 0029, 0030, 0031, 0032, 0033)*

## Provider and Home Assistant follow-ups

These tasks add provider implementations only after the relevant Sodalis
service contract and Compose profile exist. Home Assistant Core is simulated
first; linking to a real instance and designing access to many houses are
separate, later steps.

- [ ] 0035 Evaluating alternate STT providers *(needs 0030, 0034)*
- [ ] 0036 Evaluating alternate TTS providers *(needs 0030, 0034)*
- [ ] 0037 Evaluating alternate LLM providers *(needs 0031, 0034)*
- [ ] 0038 Connecting to a real Home Assistant instance *(needs 0032, 0033, 0034)*

## Long-term memory and future scale

Memory is a separate local-first AI-service milestone. It distinguishes
transcripts, derived memories, observations, and inferences, and requires
dedicated consent and user controls for health memory. Multi-house connectivity
is intentionally later than the single-instance Home Assistant adapter.

- [ ] 0039 Building Sodalis long-term memory *(needs 0031, 0034)*
- [ ] 0040 Designing multi-house Home Assistant connectivity *(needs 0038)*
