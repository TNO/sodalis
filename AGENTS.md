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
