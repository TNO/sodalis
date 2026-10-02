# Validation report — Aster Desktop 1.0.0

## Executed checks

**43/43 integration checks passed.** A separate complete standalone-HTML load also passed: 18 registered apps, no external scripts or styles, and no uncaught JavaScript errors.

The automated integration run used `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/144.0.0.0 Safari/537.36` with a 1440×960 desktop viewport and Europe/Warsaw timezone. It additionally checked a 390×844 narrow viewport and captured 1600×1000 desktop previews. Raw details are in `tests/results.json` and `tests/standalone-results.json`.

**Environment boundary:** the installed managed Chromium blocks ordinary URL/file navigation. Tests injected the local source into an isolated `about:blank` document using Playwright. That document has an opaque origin, so IndexedDB was unavailable and the app correctly chose its in-memory adapter. WebGPU was not exposed, so the app used Canvas 2D/CSS fallback rendering. Browser policy was not modified. Native browser permission dialogs were not bypassed.

Passing file, task, event, and backup tests therefore validates the real application logic against the memory adapter, **not durable IndexedDB persistence**. The WebGPU renderer and service worker are implemented but were not runtime-validated in this environment. No physical GPU, refresh-rate benchmark, system-wide process access, or native OS application runtime was tested or implied.

## Results

| Check | Result |
| --- | --- |
| Boot and 18 registered built-in apps | PASS |
| Virtual file CRUD, subtree copy, move, recycle, restore | PASS |
| Protected folders and invalid destinations reject safely | PASS |
| Calculator parser arithmetic, scientific functions and errors | PASS |
| App mount: files | PASS |
| App mount: notepad | PASS |
| App mount: browser | PASS |
| App mount: terminal | PASS |
| App mount: paint | PASS |
| App mount: photos | PASS |
| App mount: media | PASS |
| App mount: code | PASS |
| App mount: snips | PASS |
| App mount: calculator | PASS |
| App mount: calendar | PASS |
| App mount: clock | PASS |
| App mount: tasks | PASS |
| App mount: mines | PASS |
| App mount: settings | PASS |
| App mount: taskmanager | PASS |
| App mount: store | PASS |
| App mount: welcome | PASS |
| Notepad actual typing and Ctrl+S save | PASS |
| Unsaved document close can be cancelled | PASS |
| Terminal commands manipulate real virtual files | PASS |
| Window manager pointer drag, resize and state transitions | PASS |
| Virtual desktop switching and window transfer | PASS |
| Start menu app search and keyboard launch | PASS |
| File Explorer searches actual saved file | PASS |
| Paint pointer drawing and real PNG save | PASS |
| Photos decodes the newly created PNG | PASS |
| Code Studio executes sandbox app and saves project | PASS |
| Orbit Browser runs local HTML application | PASS |
| Media Player actual audio decode and playback | PASS |
| Tasks and Calendar store editable records | PASS |
| Mines game logic and completion | PASS |
| Settings views, themes and 12-hour preference | PASS |
| Backup JSON text and binary round-trip | PASS |
| HTML app installation and sandbox registration | PASS |
| Timer expiry notification | PASS |
| Visual lock resumes without losing windows | PASS |
| Narrow-screen layout | PASS |
| No uncaught JavaScript exceptions | PASS |

The suite uses real pointer/keyboard actions for window movement/resizing, Start search, document typing/saving, PNG drawing, app preview clicks, and lock/resume. Some lower-level checks invoke the same application methods used by the UI. Backup export and HTML installation use supplied in-memory `File` objects and an intercepted download sink; this tests encoding, validation, restoration, and launcher registration rather than a native OS file picker.

## Reproduce

Tests require Python 3 and Playwright, separate from the app's zero-dependency runtime:

```sh
python3 -m pip install playwright
python3 -m playwright install chromium
python3 tests/smoke.py
```

The default runner starts a temporary loopback server on port 8766 and uses an isolated browser context. Test files are created in that disposable context, not your regular workspace. To use an existing browser executable:

```sh
python3 tests/smoke.py --browser /path/to/chromium
```

To reproduce the restricted build-container run:

```sh
python3 tests/smoke.py --inject --browser /usr/bin/chromium
```

The `--webgpu` option adds software-GPU-oriented Chromium testing flags. It does not turn a fallback run into a verified hardware run. Inspect the reported renderer and adapter and check browser logs; flags alone do not prove WebGPU was exercised. Standard production use does not require test flags.

JavaScript syntax was also checked with `node --check` for all eight source scripts and the service worker. The complete embedded HTML was then executed in Chromium; it booted without external script/style requests or page exceptions.

## Manual acceptance checks still required

### Supported-browser WebGPU path

Serve over localhost or HTTPS with an available WebGPU adapter. Confirm that Settings → About reports WebGPU. Inspect the browser console for shader/pipeline validation errors. Open overlapping windows, drag/resize them, switch themes, snap/maximize them, minimize/restore, change graphics quality, and move across desktops. Check rounded edges, shadow transparency, correct stacking, and high-DPI scaling. Simulate device loss from a developer test and confirm fallback without losing open documents. Record adapter/browser details separately; do not interpret CPU submission time as GPU execution time.

### Durable storage and sessions

Save a text file and PNG, add a task and event, close the tab, and reopen the exact same origin/profile. Confirm those records persist. Confirm saved window positions and supported editor drafts restore. Test explicit storage-denial fallback, quota failure, and profile/site-data clearing. Keep backups before destructive tests.

### Native directory permissions

Connect an empty disposable folder using Local folders. Create/edit/rename/copy files and nested folders there, then inspect them with the host file manager. Confirm the selected directory is the only accessible root. Confirm a local delete/move requires the explicit native-operation confirmation. Deny/revoke permissions and verify errors are shown without silently touching other folders. Reopen Aster and confirm that the mount must be reconnected.

### Service worker and offline operation

Open the multi-file version successfully, wait for its service worker to activate and populate its cache, then disconnect networking and reload. Check first-ever offline access separately; uncached resources cannot be supplied. Check a code update after a cache already exists. The standalone version has no service-worker dependency.

### Screen capture and host interactions

Launch Snips, deny the chooser, then allow a disposable tab/window capture. Check the PNG, Save, Download, and Paint handoff, and verify that capture tracks stop after the still frame is taken. Test fullscreen, native save/download behavior, supported video/audio codecs, touch input, keyboard/IME entry, and accessibility with your actual browser and OS.

### Cross-browser and resource limits

Test supported desktop browsers on your target OS. Check denied browser APIs, reduced motion, high contrast, different device-pixel ratios, and narrow windows. Large directory listings, maximum-resolution images, many simultaneous app windows, 100 MiB backup boundaries, and untrusted-app CPU/memory exhaustion have not been benchmarked or production-hardened.
