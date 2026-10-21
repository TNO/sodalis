# CI test tiers and code quality tooling

- **Status:** Complete
- **Date:** 2026-10-19
- **Task:** [0054](../../TASKS/0054-ci-cd-pipeline.md); follow-up
  [0055](../../TASKS/0055-formatter-and-dead-code.md)

## Summary and recommendation

- **Run every deterministic test in CI and block merges on all of them.**
  The suite takes about 30 s, so skipping tests saves no meaningful time.
  Classify tests by what they protect instead. That classification decides
  which changes *need* new tests:
  - security, privacy, and API code needs them;
  - benchmark scripts do not.
- **Adopt only low-noise quality checks.** AI agents fix a failing check
  reliably, but they work around noisy rules (suppression comments, churn).
  - **Phase 1 (adopted):**
    - stricter `tsc` flags;
    - CodeQL;
    - dependency review;
    - actionlint;
    - Dependabot.
  - **Phase 2 (task 0055):**
    - Biome as a formatter, with a minimal lint set;
    - knip for dead code;
    - both in a separate change, to isolate the reformat.
  - **Not adopted:**
    - ESLint + Prettier;
    - ruff;
    - coverage thresholds.

## Scope

- All vitest suites in the workspace and in `scripts/`.
- The two Python `unittest` suites.
- Candidate static analysis for TypeScript, Python, and workflows.

The vendored Aster browser suite is out of scope; it stays unchanged upstream
code.

## Method and hardware

On a Linux x86-64 workstation (Node 25, pnpm 12.4.1), every vitest project
ran with the JSON reporter and with all cloud-provider variables unset.

Static analysis ran read-only:

| Check | Configuration |
| --- | --- |
| Biome 2 lint | Recommended rules |
| Biome 2 format | Default formatter |
| knip 5 | Default configuration |
| `tsc` | `noUnusedLocals` and `noUnusedParameters` enabled |

Biome and `tsc` ran over the first-party sources. knip ran from the repository
root, so its file report also lists the vendored Aster sources. The
measurements below come from that pass.

The Python suites ran:

- on the host, without FFmpeg;
- in `python:3.12-slim` with FFmpeg.

The server suite also ran inside the built API image, which includes FFmpeg.

## Results

### Tests

| Measure | Result |
| --- | --- |
| vitest | 392 tests in 59 files; ~26 s wall time; all pass |
| Slowest file | `DesktopAvatarOverlay.test.ts`, 2.3 s |
| Root `scripts/` tests | 33 tests, < 0.1 s |
| Python | 23 tests, ~1 s |

Gaps found and fixed in task 0054:

| Gap | Effect | Fix |
| --- | --- | --- |
| Root `pnpm test` listed script tests by hand | `scripts/stt-benchmark.test.ts` never ran | Root `vitest.config.ts` discovers `scripts/**/*.test.ts` |
| `pnpm typecheck` used `pnpm -r`, which excludes the workspace root | `scripts/` was never type-checked | `tsc -p scripts` added |
| Python tests were in no script | No gate | `pnpm test:python` |
| No FFmpeg on the host | 2 vitest tests skipped silently; 3 of 4 `speech-http` tests **failed** | Python tests skip without FFmpeg; CI installs it, so all run |

In the API image with FFmpeg, the server suite ran 95 tests and skipped one:
the live Azure test, which has no credentials.

### Test tiers

| Tier | Tests | Policy |
| --- | --- | --- |
| 1 Critical | `apps/server` (speech, assistant, home, memory routes, provider engines, FFmpeg); `packages/desktop-host` (untrusted apps and context); `packages/assistant` (confirmed actions, utterance parsing); `packages/app-sdk`; `packages/speech`; `packages/memory/src` (consent, hard delete, provenance); desktop assistant actions and Aster startup; `scripts/stack-config.test.ts` (no silent cloud selection, path traversal); `services/speech-http` (413/422 limits in a published image) | Blocking; changes need behaviour tests |
| 2 Product UX | `packages/avatar`, `apps/desktop/src/avatar` | Blocking; changes need behaviour tests |
| 3 Evaluation tooling | `scripts/{llm-compare,stt-benchmark,tts-intelligibility,tts-live-check,stt-live-captions}`, `scripts/test_tts_compare.py`, `packages/memory/eval` | Kept while cheap (< 0.3 s); new benchmark code needs no tests |
| 4 Live cloud | `*.live.test.ts`, live checks, comparison runs | Self-skip without credentials; never in CI |

### Static analysis

| Check | Findings | Assessment |
| --- | --- | --- |
| Biome lint (recommended) | About 300 findings. Most (277) are `noNonNullAssertion`, about half of them in tests. The rest: 5 `useTemplate`, 4 `noAssignInExpressions`, 4 `useIterableCallbackReturn`, 2 unused imports, 1 duplicate CSS property, 1 `eval` in a test, and a few single findings | Few real defects; strict `tsc` already covers most of them |
| Biome format | 144 of 160 files would change | No consistent style; needs a one-time reformat |
| `tsc --noUnusedLocals/Parameters` | 4 sites (2 unused imports, 1 write-only field, 1 unused parameter) | Adopted; fixed in 0054 |
| knip | 11 unused exports, 30 unused exported types, 1 false-positive entry file (`scripts/llm-live-check.ts`) | Typical leftovers of iterative edits; worth gating once configured |

## Analysis

- **Value with AI-written code.** Checks matter more when every change comes
  from an agent:
  - Agents follow a red CI check more consistently than prose in `AGENTS.md`.
  - Several models and sessions edit the same code, so formatting drifts and
    diffs bloat. A formatter removes that drift.
  - Iterative edits leave unused exports behind.
  
  Noisy rules have the opposite effect. Agents add suppressions or churn code
  to satisfy them, and reviewers learn to ignore warnings. Every adopted rule
  should therefore catch real defects:
  - `noNonNullAssertion` would mostly produce churn in tests.
  - Unused code, assignments in expressions, and duplicate CSS properties are
    real defects.
- **Not adopted:**
  - **ESLint + Prettier.** Two tools and slower. The extra ESLint value is
    type-aware rules such as `no-floating-promises`; revisit only if those
    bugs appear.
  - **ruff.** There are five Python files.
  - **Coverage thresholds.** Agents easily satisfy them with low-value tests.
    The tier policy states which behaviour must be tested instead.
- **CodeQL and dependency review** cost no maintenance on a public repository:
  - CodeQL covers the server's upload parsing and provider proxies.
  - Dependency review also flags licence problems, which matter because the
    repository bundles the MIT-licensed Aster and a CC BY-NC avatar.

## Limitations

- Timings come from one workstation; hosted runners are slower.
- The Biome and knip results come from default configurations, without
  repository-specific entries or ignores.
- CodeQL was not run locally, so its findings are not yet known.
- The Aster browser suite (54 checks at the pinned commit) still runs
  manually only.

## Open items

- Task 0055: Biome formatter and minimal lint set, knip, and
  `.git-blame-ignore-revs`.
- Optionally run the Aster smoke suite in a path-filtered workflow when the
  vendored snapshot changes.
- Review the first CodeQL results and triage any alerts.
