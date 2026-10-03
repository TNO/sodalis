# 0002 Removing the unavailable Win32 Pad demo

Status: done
Priority: medium
Subsystem: desktop
Depends on: 0001
Owner: Copilot
Agent: current session

## Context

The host prevents retaining Aster's `src/win32/examples/pad.exe`. On the local
Vite fallback, the absent path returned the app HTML as a successful response;
Win32 Pad then failed PE parsing and could leave an invalid service-worker
cache entry.

## Acceptance Criteria

- No Pad executable is requested or included in service-worker precaching.
- The service-worker revision changes so a stale entry is removed.
- Pad is removed from the standalone UI and distribution, without bypassing
  host file protection.
- Other Win32 samples and arbitrary user-selected executables remain supported.

## Implementation Notes

- Commits: `d915b40` (cache/UI compatibility) and `9e8fc43` (complete demo
  removal).
- The standalone `Aster.html` must be regenerated from the available source;
  do not recover or decode the restricted fixture.

## Agent Notes

- Removed Pad from the Win32 sample selector/asset allowlist and service-worker
  precache; incremented the cache revision.
- Removed `examples/win32/pad.c`, rebuilt the standalone bundle without the
  embedded payload, and removed/adapted tests that depended on Pad.
- Other sample execution and GDI theme updates were verified. The Python
  Playwright suites could not run because that package was unavailable in the
  environment.
