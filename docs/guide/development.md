# Develop Sodalis

The repository is a pnpm TypeScript workspace. The
[setup guide](./setup.md) covers the local simulated stack on macOS and Linux.
Use Node.js 24 and the pinned pnpm version. Start with `pnpm install`.

## Operating modes

| Goal | Entry point | Notes |
| --- | --- | --- |
| Full local stack | `pnpm stack:config`, then `pnpm stack:up` | See [setup](./setup.md); provider choices and replay prerequisites come from `.env`. |
| Frontend only | `pnpm dev` | Vite starts the desktop; without services, backend-dependent features are unavailable. |
| Frontend with stack APIs | `SODALIS_API_GATEWAY_URL=http://127.0.0.1:4176 pnpm dev` | Start the stack first; Vite prints its own URL. |
| Individual services | `pnpm dev:speech`, `pnpm dev:ai`, `pnpm dev:home` | Each requires its own provider configuration; see [service development](https://github.com/TNO/sodalis/blob/main/docs/development-stack.md#develop-one-service-at-a-time). |
| Companion workflow | Set `COMPANION_HARNESS=pi` on the AI service | The Pi harness is embedded in AI, not a separate service. It has different capabilities from turn mode. |

For example, `STT_PROVIDER=mock TTS_PROVIDER=mock pnpm dev:speech` runs the
speech API with deterministic mock providers. For API routes, environment
variables and independent service instructions, see the
[server reference](https://github.com/TNO/sodalis/blob/main/apps/server/README.md).

## Checks

For workspace code changes, run:

```sh
pnpm test
pnpm typecheck
pnpm build
```

For Python changes also run `pnpm test:python`. Test tiers and CI are
described in [ADR 0006](https://github.com/TNO/sodalis/blob/main/docs/adr/0006-ci-cd.md).
Live cloud checks require explicit consent for each run; inspect `.env` and
any selected overlay before running them. Live tests must self-skip without
credentials and never run in CI.

## Documentation

See [documentation maintenance](./documentation.md) for the documentation
layout, local site commands, and publication workflow.
