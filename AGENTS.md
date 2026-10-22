# Repository guidance

- Use pnpm workspaces and TypeScript strict mode for Sodalis code.
- Keep third-party desktop integration behind `packages/desktop-host`.
- Preserve Aster's MIT license and its existing iframe sandbox boundary.
- Do not expose Aster's DOM, imported app content, or arbitrary globals to the
  assistant. Only explicit host capabilities belong in the adapter.
- Keep Aster source unchanged unless an intentional, documented patch is
  required; update its pinned commit record when refreshing the vendor snapshot.
- Add behavior tests at public interfaces and run `pnpm test`,
  `pnpm typecheck`, and `pnpm build` for changes to workspace code.
- The initial slice intentionally has no LLM, speech, memory, or external
  account integration.
- Put the final, consolidated analysis of each evaluation (for example
  provider comparisons) in `docs/evaluations/`, following its README, and
  link it from the task. Keep only progress notes in `TASKS/`.
- Licensed avatar GLBs (MetaHumans, Fab content) and their `NOTICE.md` live
  only in the private `TNO/sodalis-licensed-avatars` repository and reach a
  checkout through `pnpm avatars:licensed <clone>` into the git-ignored
  `apps/desktop/public/avatars/licensed/`. Keep every such GLB out of this
  public repository, its CI and public artefacts. Before adding, rebuilding
  or registering one, follow `docs/avatar/licensed-avatars.md`.
- Get the user's explicit consent for each run before a command can send
  data to a cloud provider (Azure STT, TTS, or LLM): `pnpm stack:smoke`, live
  checks, comparison scripts, and live tests. First check which providers
  `.env` and any `--env` overlay select; without consent for that run, ask,
  or verify with a local or mock selection instead.
