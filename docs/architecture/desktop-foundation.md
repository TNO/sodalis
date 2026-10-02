# Desktop foundation

## Integration

Sodalis keeps the upstream Aster browser desktop as a static snapshot in
`apps/desktop/public/aster/`. Vite serves it at `/aster/`, while the Sodalis
Mithril application owns the outer page and the assistant/avatar host region.
This keeps the initial shell useful without forking Aster internals.

`packages/desktop-host` is the only Sodalis package that reads the Aster
runtime. It waits for `Aster.ready`, lists visible built-in app descriptors,
and opens an app through `Aster.openApp`. It rejects hidden system features,
custom apps, and catalog web apps. It does not return DOM nodes, application
views, or arbitrary Aster globals.

The Aster frame is same-origin so the adapter can call this narrow runtime
surface. Aster's own sandbox for imported HTML and web applications remains
unchanged; this does not grant those apps assistant access. Future semantic
integration belongs to the trusted-app SDK, not DOM inspection.

## Aster module map

| Capability | Upstream files | Sodalis boundary |
| --- | --- | --- |
| App registry and built-in registration | `src/core.js`, `src/apps-*.js`, `src/app-store.js` | `DesktopHost.listApplications()` filters to visible built-ins |
| Windows and rendering | `src/windows.js`, `src/renderer.js` | Aster owns windows; Sodalis does not manipulate them |
| Shell and launch surfaces | `src/shell.js`, `src/shell-launch.js`, `src/shell-experience.js`, `src/integrated-desktop.js` | `DesktopHost.openApplication()` delegates to Aster |
| Virtual storage and file operations | `src/core.js`, `src/file-operations.js`, `src/archives.js`, `src/desktop-services.js` | Remains private to Aster in this slice |
| Sandboxed web apps | `src/webviews.js`, `src/apps-web.js`, `src/web-io-host.js`, `sdk/aster-webview.js` | No assistant semantic access |
| App SDK | `sdk/aster-webview.js`, `sdk/aster-files.js`, `sdk/aster-clipboard.js` | Existing APIs remain within Aster's sandbox policy |
| Accessibility and settings | `src/apps-accessibility.js`, `src/apps-system.js`, `src/theme-settings.js`, `src/styles.css` | Aster settings remain available through its normal UI |

## Validation

The vendor snapshot is pinned at
[`wieslawsoltes/Aster@c61c1d1`](https://github.com/wieslawsoltes/Aster/commit/c61c1d1db7fc8de4717becc2d0dab108512520a4).
The clean upstream tree's unchanged Chromium smoke suite passed 54 checks:
boot, app mounts, file workflows, window interactions, app launching, and
desktop behavior. The upstream license and its bundled third-party notices
are included with the source. Third-party components still require separate
review before redistribution or product packaging.

The suite ran against the multi-file desktop over localhost. Its published
report has environment-specific limits; see the vendored `TESTING.md` for
storage, WebGPU, service-worker, and manual acceptance caveats.

The host environment removes or denies access to Aster's
`src/win32/examples/pad.exe` fixture after extraction. The baseline suite
passed against the original upstream checkout before this restriction, but the
vendored tree cannot retain the file here. The Win32 sample and service-worker
precache may therefore be incomplete until the fixture can be supplied in an
environment that permits it; no attempt has been made to bypass that
protection.
