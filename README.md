# Sodalis

[![CI](https://github.com/TNO/sodalis/actions/workflows/publish-images.yml/badge.svg?branch=main)](https://github.com/TNO/sodalis/actions/workflows/publish-images.yml)

Sodalis is a research prototype for a local-first personal desktop with an
embodied conversational assistant. It explores making everyday digital tools
more accessible, particularly for older adults, through a desktop interface
and conversation.

The current prototype combines the Aster desktop, an assistant, speech
services, and a simulated home. The Home Simulator replay provides generated,
read-only household data; it is not a connection to a real home. The prototype
is not a production deployment.

## Start here

- [Use Sodalis](docs/guide/using-sodalis.md): desktop, conversation, and the
  simulated-home experience.
- [Set up the simulated stack](docs/guide/setup.md): local installation on
  macOS and Linux.
- [Develop Sodalis](docs/guide/development.md): frontend, services, workflow
  mode, checks, and documentation.
- [Architecture](docs/architecture/system.md): components, data flows, and
  trust boundaries.
- [Key decisions and evidence](docs/architecture/decisions.md): rationale,
  alternatives, and evaluation limits.
- [Future work](docs/guide/future-work.md): open engineering and research
  directions for resuming the prototype.
- [Documentation website](https://tno.github.io/sodalis/): product overview
  and searchable guides.

For detailed provider configuration, troubleshooting, and experimental
setups, see the [development stack reference](docs/development-stack.md).
The [task index](TASKS/README.md), [decisions](docs/adr/), and
[evaluations](docs/evaluations/README.md) preserve project history and
remaining work.

## License and dependencies

Sodalis is distributed under the [repository license](LICENSE). Its vendored
Aster desktop retains its MIT license and sandbox boundary. Avatar assets
have separate licensing; see the [avatar profile](docs/avatar/SODALIS_AVATAR_PROFILE.md)
and [licensed-avatar guide](docs/avatar/licensed-avatars.md).
