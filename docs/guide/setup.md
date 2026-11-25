# Set up the simulated stack

This guide is for an administrator preparing the local research prototype on
macOS or Linux. The [user guide](./using-sodalis.md) assumes this setup is
already complete. The stack is for development, not public deployment.

## Prerequisites

- Node.js 24 and pnpm 12.16.1, as pinned in the repository.
- Docker with Compose v2, or Podman with a running machine/socket and the
  standalone Docker Compose v2 executable. Do not use `podman-compose`.
- A separate prepared `home_simulator` checkout with its Python `.venv` and
  `applications/tool_service`. Obtain access and follow that project's own
  setup instructions.
- Ollama running locally with `llama3.2:3b`, and enough resources for the
  selected models and containers. The documented Podman macOS setup used an
  8 GB VM; hardware needs vary.

The default STT image and the Piper voice are downloaded separately; model
weights are not included in the repository. See the
[prerequisites and providers reference](https://github.com/TNO/sodalis/blob/main/docs/development-stack.md#prerequisites)
for Docker/Podman and platform-specific networking details.

## Prepare local providers

From the Sodalis checkout, download the default Piper voice and metadata:

```sh
mkdir -p models/piper
curl -fL https://huggingface.co/rhasspy/piper-voices/resolve/main/nl/nl_NL/ronnie/medium/nl_NL-ronnie-medium.onnx -o models/piper/nl_NL-ronnie-medium.onnx
curl -fL https://huggingface.co/rhasspy/piper-voices/resolve/main/nl/nl_NL/ronnie/medium/nl_NL-ronnie-medium.onnx.json -o models/piper/nl_NL-ronnie-medium.onnx.json
ollama pull llama3.2:3b
```

Keep Ollama running. On Linux Docker Engine, the example host address may need
an explicitly reachable host gateway; see
[provider networking](https://github.com/TNO/sodalis/blob/main/docs/development-stack.md#choose-providers).
Keep any host service private.

## Configure and start

```sh
pnpm install
if [ ! -e .env ]; then cp .env.example .env; fi
```

The second command leaves an existing `.env` unchanged. Edit the ignored
`.env` and set `HOME_SIMULATOR_ROOT` to the absolute path of the prepared
checkout. The example selects local Parakeet, Piper and Ollama,
`COMPANION_HARNESS=pi`, and `HOME_PROVIDER=simulator`. Check the actual
provider settings and URLs before starting; an existing `.env` may differ.
Do not commit `.env`, tokens, downloaded models, or generated data.

```sh
pnpm stack:config
pnpm stack:up
```

On the first launch, `http://127.0.0.1:4176` shows Home Assistant Core
onboarding rather than Sodalis. Create an admin account and a separate
non-admin Sodalis user, sign in as that user, and create its long-lived token.
Set `HOME_ASSISTANT_TOKEN` in `.env`, change `HOME_ADMIN_UI` to `0`, then run
`pnpm stack:up` again. See
[first-time onboarding](https://github.com/TNO/sodalis/blob/main/docs/development-stack.md#first-time-home-assistant-simulator-onboarding)
for the full procedure. The current simulator selection starts both Core and
the separate read-only Home Simulator replay; do not point this simulator
provider at a real home.

## Prepare a replay and use Sodalis

Every `stack:up` opens a fresh replay session before its first observation.
Advance it from the checkout:

```sh
pnpm home-simulator:advance
```

The command moves the replay to the next interaction window. Repeat as
needed. Then open `http://127.0.0.1:4176` and follow the
[user guide](./using-sodalis.md). The assistant can read data reached by the
replay clock; it cannot advance the clock itself. See
[replay details](https://github.com/TNO/sodalis/blob/main/docs/development-stack.md#home-simulator-replay-data)
for session state and limitations.

## Stop and troubleshoot

```sh
pnpm stack:down
```

This stops the selected stack and retains the Home Assistant data volume and
the simulator's generated data. `pnpm stack:smoke` exercises the selected
providers and can send data to a cloud provider if one is configured; inspect
the configuration and obtain consent before running it. The
[stack reference](https://github.com/TNO/sodalis/blob/main/docs/development-stack.md)
contains troubleshooting and alternative providers.
