# Key decisions and evidence

This is a reading guide to the project's major choices, not a replacement for
the ADRs or a new set of decisions. Follow the source links for the full
rationale, alternatives, dates, and verification limits. A historical
evaluation recommendation is not necessarily the current configured default.

## Desktop and trusted capabilities

- **Reuse Aster as a pinned snapshot** rather than rebuild its shell, windows,
  storage, and apps. This enabled an independently testable desktop early,
  while making upstream refreshes explicit. The cost is maintaining reviewed,
  minimal compatibility patches and third-party notices.
  [ADR 0001](https://github.com/TNO/sodalis/blob/main/docs/adr/0001-aster-integration.md)
- **Keep the Sodalis host typed and separate** using pnpm, strict TypeScript,
  Vite, and Mithril; leave Aster's static JavaScript unconverted. This avoids
  forcing a rewrite or premature service boundaries.
  [ADR 0002](https://github.com/TNO/sodalis/blob/main/docs/adr/0002-monorepo-tooling.md)
- **Use explicit host and trusted-app capabilities**, not DOM inspection or
  arbitrary Aster globals. Aster retains its imported/web-app sandbox. This
  limits what the assistant can see and do, at the cost of deliberate semantic
  integration work for cooperating applications.
  [ADR 0003](https://github.com/TNO/sodalis/blob/main/docs/adr/0003-trusted-desktop-boundary.md)

## Companion orchestration and simulator access

- **Embed Pi behind Sodalis-owned controls.** Successive household lookups
  need an adaptive model/tool loop rather than a fixed investigation sequence.
  Pi provides that loop; Sodalis owns tools, limits, cancellation, and answer
  delivery. A general coding-agent setup, ambient tool discovery, or a generic
  plugin/workflow framework would widen the boundary unnecessarily. SDK
  embedding is not OS-level isolation. Convergence on one assistant path is
  conditional on action, memory, and interruption parity.
  [ADR 0007](https://github.com/TNO/sodalis/blob/main/docs/adr/0007-companion-harness.md)
- **Reach the separately owned Home Simulator through a host bridge.** Its
  stdio reader needs its own Python environment; the AI service runs in a
  container. The bridge avoids bundling that project in the AI image, mounting
  it as a new Compose service, or exposing the Docker socket. The assistant
  gets only read-only avatar tools; session creation and advancement remain
  operator-controlled. The private, unauthenticated bridge is a development
  compromise, not a production transport.
  [ADR 0009](https://github.com/TNO/sodalis/blob/main/docs/adr/0009-home-simulator-host-bridge.md)
- **Measure the whole journey before optimizing retrieval.** Early graph
  measurements and offline source-backed tests do not establish live-model
  quality or end-to-end latency. Batching, caching, and alternative retrieval
  shapes remain options to justify with representative evidence, not proven
  improvements. Those graph findings are not a benchmark of the later replay
  path. See the
  [harness evaluation](https://github.com/TNO/sodalis/blob/main/docs/evaluations/companion-harness.md)
  and the [provisional architecture](./system.md#companion-harness-provisional).

## Local-first memory and personal-account access

- **Own the memory domain in TypeScript, with SQLite as the source of truth.**
  Hy-Memory's layered ideas informed the design without adopting its Python
  stack. The evaluated frameworks did not fit the combined embedded-store,
  implicit capture, revision/provenance, consent, and retention requirements
  without substantial integration. Derived indexes can be rebuilt; memory
  consent is separate from action authority.
  [ADR 0005](https://github.com/TNO/sodalis/blob/main/docs/adr/0005-long-term-memory.md)
- **Improve correctness before swapping stores.** The local memory evaluation
  favored the existing gate, extraction, and embedding choices and found no
  demonstrated need for Zvec at the measured scale. Synthetic and benchmark
  results do not prove real-user benefit; background consolidation was not
  shown to improve question-answering on that set. Alternatives such as Letta,
  Mem0, and other frameworks remain comparators, not automatic replacements.
  [Memory evaluation](https://github.com/TNO/sodalis/blob/main/docs/evaluations/memory.md)
  and [memory/embodiment research](https://github.com/TNO/sodalis/blob/main/docs/evaluations/personal-assistant-memory-and-embodiment.md)
- **Keep real account access deferred.** The recorded future design uses a
  shared host-owned authorization coordinator but separate grants, client
  registrations, and token policies per capability. A universal token store
  or shared email/calendar grant would couple consent and disconnects.
  Persistent email authority is deferred; cloud model processing would need
  explicit disclosure. Broad third-party Pi/MCP account tools are not approved
  substitutes for those boundaries. None of this delivers or authorizes a
  real account connection.
  [ADR 0008](https://github.com/TNO/sodalis/blob/main/docs/adr/0008-delegated-personal-account-access.md)
  and [package research](https://github.com/TNO/sodalis/blob/main/docs/evaluations/pi-packages-for-account-readers.md)

## Speech and model choices

| Topic | Recorded recommendation and rationale | Alternatives and limits |
| --- | --- | --- |
| Speech recognition | Local Parakeet TDT v3 balanced Dutch accuracy and CPU speed in the measured corpora. | Whisper remains useful for other languages or accelerated hardware; Whistle was faster but less accurate. Azure offered faster final captions on private clips but sends audio off-device. These results are corpus/hardware-specific. |
| Speech synthesis | Piper Ronnie was the preferred local voice in the October evaluation; Azure voices received higher subjective ratings. | Other evaluated local engines had latency, language, cancellation, or licensing issues. The later Pocket TTS host-local path is available separately; the older comparison did not evaluate it. Azure remains opt-in, not fallback. |
| Language model | The October turn/action evaluation favored Azure gpt-5 minimal over slower reasoning efforts; gpt-4.1-mini was a promising cheaper/faster alternative. | The local llama3.2:3b baseline performed poorly on semantic actions. Today's example configuration remains local Ollama; the historical cloud quality recommendation neither changes that default nor proves performance on the evolving companion workflow. |

Sources: [STT evaluation](https://github.com/TNO/sodalis/blob/main/docs/evaluations/stt-providers.md),
[TTS evaluation](https://github.com/TNO/sodalis/blob/main/docs/evaluations/tts-providers.md),
[LLM evaluation](https://github.com/TNO/sodalis/blob/main/docs/evaluations/llm-providers.md),
and [Pocket TTS setup](https://github.com/TNO/sodalis/blob/main/docs/development-stack.md#use-pocket-tts-on-the-mac-host).
Cloud checks need separate consent for each run; this summary authorizes none.

## Presentation, activation, and quality gates

- **Separate avatar behavior, rendering, and asset approval.** TalkingHead is
  behind an adapter; Sodalis owns its Three.js lifecycle and GLB profile.
  Compatibility validation is not licensing or visual-quality approval.
  Licensed assets remain subject to separate distribution rules. Research
  supports investigating interchangeable presentations, not claiming one
  avatar is universally best for older adults.
  [ADR 0004](https://github.com/TNO/sodalis/blob/main/docs/adr/0004-avatar-runtime-and-asset-profile.md),
  [licensing evaluation](https://github.com/TNO/sodalis/blob/main/docs/evaluations/metahuman-fab-licensing.md),
  and [embodiment research](https://github.com/TNO/sodalis/blob/main/docs/evaluations/personal-assistant-memory-and-embodiment.md)
- **Preserve deliberate activation; defer hands-free rollout.** Local wake-word
  detection does not prove intent or settle false-activation and privacy
  concerns. The future direction is a physical button, with hardware,
  transport, and microphone placement undecided. Wake-word research is
  superseded, not a ready-to-ship alternative.
  [ADR 0010](https://github.com/TNO/sodalis/blob/main/docs/adr/0010-button-activation-without-wake-word.md)
  and [interaction evaluation](https://github.com/TNO/sodalis/blob/main/docs/evaluations/interaction-modes.md)
- **Use deterministic CI gates and explicit live-test boundaries.** Tests,
  typechecks, builds, and tiered behavior coverage are preferred to
  coverage-percentage targets or a broad tooling rollout. Published images
  reduce repeated model/build work while excluding private avatar assets.
  [ADR 0006](https://github.com/TNO/sodalis/blob/main/docs/adr/0006-ci-cd.md)
  and [CI evaluation](https://github.com/TNO/sodalis/blob/main/docs/evaluations/ci-quality-and-tests.md)

For the complete reports, see the
[evaluation index](https://github.com/TNO/sodalis/blob/main/docs/evaluations/README.md).
For opportunities rather than settled choices, see [future work](../guide/future-work.md).
