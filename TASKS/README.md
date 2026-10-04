# Sodalis task index

The individual task files are the source of truth. Phase 1 is intentionally
sequential: each implementation task depends on the previous acceptance gate.
Do not add production speech, an LLM, memory/RAG, Home Assistant, or real Mail
in this phase.

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
