# 0055 Adding a formatter and dead-code checks

Status: open
Priority: low
Subsystem: devops
Depends on: 0054

## Context

Phase 2 of the quality tooling in
[ADR 0006](../docs/adr/0006-ci-cd.md). Biome's formatter would change 144 of
160 first-party files. knip reports 11 unused exports and 30 unused exported
types. See
[evaluations/ci-quality-and-tests.md](../docs/evaluations/ci-quality-and-tests.md).

## Acceptance Criteria

- Add Biome as a pinned dev dependency, with a `biome.json`:
  - The formatter covers first-party TypeScript, JSON, and CSS. It excludes
    `apps/desktop/public/**` (vendored Aster and assets), `dist`, and
    `models`.
  - A minimal linter, not `recommended`: `noUnusedImports`,
    `noAssignInExpressions`, `noDuplicateProperties`, and `noGlobalEval`
    (allow the Aster startup test explicitly).
- Reformat in a single formatting-only commit, and add that commit to
  `.git-blame-ignore-revs`.
- Add knip with entries for `scripts/*.ts`, `packages/memory/eval/cli.ts`, and
  the service mains, and ignore `apps/desktop/public/**`. Remove or justify
  each unused export.
- Add `pnpm lint` (Biome check and knip) to the CI node job, and document it
  in the README checks.

## Implementation Notes

- Keep the reformat separate from behaviour changes so reviews and
  `git blame` stay useful.
- Don't enable `noNonNullAssertion`; on the current code it would produce
  churn rather than catch defects.
