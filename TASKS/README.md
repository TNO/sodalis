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
- [ ] 0054 Evaluating a MetaHuman avatar export *(needs 0014)*
- [x] 0055 Adding a male thuiszorg-style avatar option
  *(needs 0010, 0012, 0013, 0016; precedes 0014/0015)*

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

Evaluation tasks record progress in their Agent Notes; their final,
consolidated analysis belongs in [`docs/evaluations/`](../docs/evaluations/README.md).

- [x] 0035 Evaluating alternate STT providers *(needs 0030, 0034)*
- [x] 0036 Evaluating alternate TTS providers *(needs 0030, 0034)*
- [x] 0037 Evaluating alternate LLM providers *(needs 0031, 0034)*
- [ ] 0043 Measuring vLLM and constrained utterance output *(needs 0037)*
- [ ] 0044 Letting the model propose confirmed actions *(needs 0037)*
- [ ] 0038 Connecting to a real Home Assistant instance *(needs 0032, 0033, 0034)*

## Companion investigation harness

[ADR 0007](../docs/adr/0007-companion-harness.md) records the Pi integration
decision. The [architecture](../docs/architecture/companion-harness.md) maps
current behavior and approved planned target; the
[evaluation](../docs/evaluations/companion-harness.md) records graph-only
findings and the first manual end-to-end check. The opt-in read-only
implementation is present; the audit and evidence-based retrieval diagnosis
are complete. The sensor journey has deterministic contract coverage but is
blocked on provenance-backed source fixtures; live verification is separately
pending consent.

- [ ] [0067 Building and evaluating the companion harness](0067-companion-harness.md)
  *(needs 0031; umbrella for the current implementation and remaining acceptance)*
- [x] [0068 Inspect a conversation through a persistent developer text audit](0068-persistent-developer-audit.md)
- [x] [0069 Diagnose and repair harness data retrieval](0069-diagnose-harness-data-retrieval.md) *(needs 0068)*
- [ ] [0070 Complete a sensor journey end to end](0070-complete-sensor-journey.md) *(needs 0069; local contract cases verified, actual-source acceptance blocked)*
- [x] [0071 Decide authorized read-only email access](0071-decide-read-only-email-access.md)
- [ ] [0072 Complete a read-only email journey](0072-complete-read-only-email-journey.md) *(needs 0071; refined, ready for implementation)*
- [x] [0073 Decide authorized read-only calendar access](0073-decide-read-only-calendar-access.md)
- [ ] [0074 Complete a read-only calendar journey](0074-complete-read-only-calendar-journey.md) *(needs 0073; contract refined for Microsoft Graph and Google Calendar)*
- [ ] [0075 Decide harness memory, recall, and context ownership](0075-decide-harness-memory-and-context.md)
- [ ] [0076 Preserve consent-governed memory and recall in the harness](0076-preserve-memory-in-harness.md) *(needs 0075; refine after decision)*
- [ ] [0077 Preserve confirmed desktop actions through the harness](0077-preserve-confirmed-actions-in-harness.md)
- [ ] [0078 Verify and complete harness steering/interruption behavior](0078-verify-harness-steering.md) *(needs 0070; low priority)*
- [ ] [0079 Retire turn mode and support one harness execution path](0079-converge-on-harness-execution-path.md) *(needs 0070, 0076, 0077, 0078; not 0067)*
- [ ] [0080 Decide and wire deterministic graph integration CI coverage](0080-deterministic-graph-ci-coverage.md)
- [ ] [0081 Decide longer-lived sessions, durable runs, and recurring-work scope](0081-decide-longer-lived-work.md) *(low-priority decision)*
- [ ] [0082 Decide resident-visible progress and evidence](0082-decide-resident-progress-and-evidence.md) *(low-priority decision)*
- [ ] [0083 Evaluate harness latency and execution budgets](0083-evaluate-harness-latency.md) *(needs 0070; low priority)*

## Long-term memory and future scale

Memory is a separate local-first AI-service milestone. It distinguishes
transcripts, derived memories, observations, and inferences, and requires
dedicated consent and user controls for health memory. Multi-house connectivity
is intentionally later than the single-instance Home Assistant adapter.

The design is recorded in
[ADR 0005](../docs/adr/0005-long-term-memory.md). Task 0039 is the umbrella;
tasks 0045–0048 deliver version 1 and tasks 0049–0053 are follow-ups.

- [ ] 0039 Building Sodalis long-term memory *(needs 0031, 0034)*
- [x] 0045 Building the memory store and index *(needs 0031, 0034)*
- [x] 0046 Building the memory write path *(needs 0045)*
- [x] 0047 Injecting memory into conversations and adding user controls *(needs 0045, 0046)*
- [ ] 0048 Evaluating long-term memory *(needs 0045, 0046, 0047)*
- [x] 0049 Adding the recall_memory tool *(needs 0047)*
- [x] 0050 Adding System 2 memory consolidation (L5–L7) *(needs 0048)*
- [ ] 0051 Adding a Zvec memory index adapter *(needs 0048)*
- [ ] 0052 Ingesting observations into memory *(needs 0047, 0038)*
- [ ] 0053 Forgetting memories on request in conversation *(needs 0047)*
- [ ] 0040 Designing multi-house Home Assistant connectivity *(needs 0038)*

## Speech accuracy and live captions

- [x] 0041 Fixing STT transcription accuracy and silence hallucination *(needs 0023, 0024)*
- [ ] 0042 Improving live STT captions *(needs 0035)*

## Continuous integration and delivery

CI, image publishing, and the test-tier policy are recorded in
[ADR 0006](../docs/adr/0006-ci-cd.md); the analysis is in
[evaluations/ci-quality-and-tests.md](../docs/evaluations/ci-quality-and-tests.md).

- [ ] 0065 Adding CI and published images *(needs 0034)*
- [ ] 0066 Adding a formatter and dead-code checks *(needs 0065)*

## TTS processing and Pocket TTS

Tasks 0056–0058 prepare text and audio delivery for long responses. Pocket
TTS stays an explicitly selected host-local provider; its runtime and model
weights are external and must never be bundled. Word timing and transcript
repair build on the local STT seam before playback captions consume the
result.

- [x] 0056 Cleaning Markdown before speech
- [x] 0057 Normalizing Dutch and English speech text *(needs 0056)*
- [x] 0058 Chunking speech by sentence *(needs 0056)*
- [x] 0059 Adding the local Pocket TTS provider *(needs 0057, 0058)*
- [x] 0060 Preprocessing reference voices *(needs 0059)*
- [x] 0061 Aligning transcript words to audio *(needs 0024)*
- [x] 0062 Repairing transcript tails and onset timing *(needs 0061)*
- [x] 0063 Adding speech captions and playback fallback *(needs 0058, 0061, 0062)*
- [x] 0064 Companion dots and accessibility controls
