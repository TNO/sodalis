# Repository guidance

- Use pnpm workspaces and TypeScript strict mode for Sodalis code.
- Keep third-party desktop integration behind `packages/desktop-host`.
- Preserve Aster's MIT license and its existing iframe sandbox boundary.
- Do not expose Aster's DOM, imported app content, or arbitrary globals to the
  assistant. Only explicit host capabilities belong in the adapter.
- Keep Aster source unchanged unless an intentional, documented patch is
  required; update its pinned commit record when refreshing the vendor snapshot.
- Add behavior tests at public interfaces and run `pnpm test`,
  `pnpm typecheck`, and `pnpm build` for changes to workspace code (and
  `pnpm test:python` for Python changes). CI runs the same gates; keep the
  `ci-ok` check green.
- Test tiers (ADR 0006):
  - Changes to security, privacy, Home safety, memory consent and deletion,
    stack selection, or public server/package APIs need behavior tests.
  - Avatar and desktop UX changes need tests for their behavior.
  - Evaluation and benchmark scripts need no tests.
  - Live cloud tests must self-skip without credentials and never run in CI.
- Never add cloud-provider secrets to GitHub Actions.
- The initial slice intentionally has no LLM, speech, memory, or external
  account integration.
- Put the final, consolidated analysis of each evaluation (for example
  provider comparisons) in `docs/evaluations/`, following its README, and
  link it from the task. Keep only progress notes in `TASKS/`.
- Get the user's explicit consent for each run before a command can send
  data to a cloud provider (Azure STT, TTS, or LLM): `pnpm stack:smoke`, live
  checks, comparison scripts, and live tests. First check which providers
  `.env` and any `--env` overlay select; without consent for that run, ask,
  or verify with a local or mock selection instead.
