# ADR 0002: pnpm workspace and Mithril desktop

- **Status:** Accepted
- **Date:** 2026-10-02

## Context

The first implementation needs a small monorepo foundation while keeping the
desktop shell separate from its host adapter. The user prefers TypeScript,
pnpm, Mithril, and mithril-materialized; none should force premature service
boundaries.

## Decision

Use pnpm workspaces, strict TypeScript, Vite, Mithril, and
mithril-materialized for the browser host. Keep Aster's upstream vanilla
JavaScript static and unbundled. Add workspace packages only as the first
vertical slice needs them; defer the backend and provider packages.

## Consequences

- The outer Sodalis host and desktop adapter are type-checked and build
  independently of Aster.
- Aster stays close to upstream and does not need a conversion to TypeScript.
- Future packages may add Hono or Rust where their capabilities justify it.
- Runtime schemas and backend protocol choices are deferred until a
  cross-boundary protocol is introduced.
