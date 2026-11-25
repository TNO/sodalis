# Documentation maintenance

The repository Markdown is the source of truth. The documentation site
publishes a curated set of current pages rather than a copy of the entire
repository.

## Where to write

| Material | Location |
| --- | --- |
| Product overview and current guides | `docs/guide/` |
| Current system design | `docs/architecture/` |
| Architectural decisions | [`docs/adr/`](https://github.com/TNO/sodalis/tree/main/docs/adr) |
| Final evaluation analyses | [`docs/evaluations/`](https://github.com/TNO/sodalis/tree/main/docs/evaluations) |
| Historical tasks and progress | [`TASKS/`](https://github.com/TNO/sodalis/tree/main/TASKS) |
| Detailed stack and service reference | [`docs/development-stack.md`](https://github.com/TNO/sodalis/blob/main/docs/development-stack.md), [server README](https://github.com/TNO/sodalis/blob/main/apps/server/README.md) |

When behavior changes, update the relevant current guide and design, including
limitations and platform differences. Keep instructions in one authoritative
place and link to detailed references rather than copying them. Preserve
historical decisions, task notes, evaluations, and the vendored Aster snapshot;
mark superseded claims in context rather than treating history as current
behavior. Do not claim untested functionality is verified.

Keep the [decision summary](../architecture/decisions.md) linked to its
authoritative ADRs and evaluations; preserve source dates and limits instead
of presenting historical recommendations as current defaults. Update the
[future-work index](./future-work.md) when a direction is completed, superseded,
or re-scoped. For volatile architecture, label the checkout snapshot and
refresh it when parallel work is integrated.

## Build and preview

```sh
pnpm docs:dev
pnpm docs:build
pnpm docs:preview
```

The build checks internal links. Mermaid diagrams are maintained in Markdown
and rendered by GitHub and the site; include a text explanation for readers
who cannot use a diagram. The Pages workflow builds on pull requests and
deploys the default branch through GitHub Actions. Repository Pages settings
must use GitHub Actions as the publishing source.

The site configuration explicitly pre-bundles Mermaid for development because
its transitive CommonJS dependencies otherwise prevent the browser from loading
the site. After dependency or site-configuration changes, verify both the dev
homepage and an architecture diagram; a production build alone does not check
development-time module loading.
