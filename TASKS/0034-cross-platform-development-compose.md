# 0034 Building the cross-platform development Compose stack

Status: done
Priority: high
Subsystem: devops
Depends on: 0029, 0030, 0031, 0032, 0033

## Context

Developers need one local development stack for Windows, Linux, and macOS,
using Docker or Podman. The stack must let one `.env` file choose local
providers or explicit external endpoints while preserving stable Sodalis APIs.
This task is for development only; production deployment and remote access are
out of scope.

## Acceptance Criteria

- Add a Compose v2 development stack that runs the browser desktop and
  independently runnable Sodalis speech, AI, and Home API services.
- Serve the browser desktop and reverse-proxy its `/api` routes through one
  same-origin gateway; keep backend containers private on the Compose network.
- Bind published development ports to localhost by default.
- Use one local `.env` selection source for independently choosing STT, TTS,
  LLM, and Home providers; the normal launch command must activate only the
  selected local service profiles and wire their internal endpoints.
- Support an explicitly configured external endpoint per provider role,
  including Azure or a native/remote host service; do not start the matching
  local engine in that mode.
- Require explicit LLM and Home provider selections. Do not silently choose a
  provider or fall back to a remote/cloud service.
- Default STT/TTS selections to the current local Whisper.cpp and Piper
  implementations. Document model setup and avoid requiring GPU hardware.
- Keep credentials out of source control and browser bundles; provide an
  ignored local `.env` workflow and a safe example file.
- Work with Docker Compose v2 on Windows, Linux, and macOS. For Podman, document
  and test the Docker Compose v2 provider path rather than relying on
  `podman-compose` feature parity.
- Provide a CPU-capable baseline and document optional provider/GPU
  limitations by platform.
- Include an end-to-end smoke test and platform-specific setup/troubleshooting
  instructions.
- Do not add production hardening, TLS, authentication, remote/LAN binding, or
  production images in this task.

## Implementation Notes

- Use Compose profiles for selectable local services, but make the one `.env`
  file the configuration source of truth and keep the launch command the same.
- Only the desktop/gateway port should be published; provider containers and
  Sodalis APIs communicate over the internal network.
- Alternative engine profiles are added in tasks `0035`–`0037`.
- The real Home Assistant adapter is a later task; the initial Compose stack
  uses the simulator.

## Agent Notes

- The supported Podman path is Docker Compose v2 using Podman as the container
  engine. `podman-compose` itself is not a required compatibility target.
- This is a local development stack, not a production deployment.
- 2026-10-04 Copilot: Added a localhost-only same-origin Compose v2 gateway,
  private speech/AI/Home APIs, selected CPU engine profiles, external endpoint
  wiring, model setup, onboarding, cross-platform instructions, and an HTTP
  smoke test. Tested the mock/external Home route, local Whisper.cpp STT and
  Piper HTTP TTS, Core onboarding UI, and switching profiles under Podman with
  Docker Compose v2 on macOS ARM64. Live authenticated Core controls still
  require creating a dedicated non-admin token during onboarding. Azure-native
  protocols and GPU-specific images are not part of this slice.
