# Web Files verification

`node --test tests/web-io/models.cjs` validates policy, scope, Unicode names,
private/root boundaries, stream limits, filters, revision stamps and project
hidden files. All JavaScript and Python sources must also compile.

`python tests/web-io/browser.py` runs actual Aster over HTTP with IndexedDB.
`--standalone` repeats on the generated file edition and checks offline reload.
`--engine firefox` repeats using an independent browser engine. The fixture is
explicitly an original API conformance app, not a mocked catalog application.
It uses standard browser file APIs, real FileList, real writable streams, actual
keyboard/pointer controls and PNG-independent binary data. The opaque sandbox
must not be able to read parent.Aster. Storage, old-version history, policies and
session-grant expiration are checked across a complete page reload.

The native chooser and download tests use Playwright's actual browser file chooser
and download events, not substituted native function stubs. Drag tests use real
mouse gestures and the production pointer relay. Depending on event routing, an isolated source requires the visible host confirmation. A separate direct broker security test verifies that a remote release cannot import before confirmation and that Cancel does not write anything. Same-origin HTTP tests also exercise actual private-root file creation and revocation. Native directory import planning
is separately tested with actual Blobs; it is not a claim of a human OS-directory
drag. Final artifacts identify mode and contain screenshots/results.

`python tests/web-io/live.py` routes **only Aster host resources** from the exact
checkout under its Pages origin. All NotepadXP HTML/module/style resources come
from its actual deployed site and remain unmodified. Its real Browse dialog opens
an Aster file; its actual editor and Save pipeline encode/write the updated file.
Application module response hashes, screenshots, and readback are retained. Its
public read-only document API verifies text but is not a replacement I/O path.
TwinForge then connects the Aster folder through its original button and creates
a child through its original New folder command; its application code is unchanged.

`--inject --browser /usr/bin/chromium` is a local fallback when managed browsers
block navigation. It is explicitly memory-only, omits HTTP-only/real persistent
reload assertions, and is not substituted for the hosted workflow. Browser-native
private storage may be absent in opaque origins; that capability absence is
reported rather than spoofing the navigator object.

Inherited theme, desktop, Win32 and 74-app workflows remain enabled. The live test
proves NotepadXP's unchanged deployed round-trip and TwinForge's directory workflow, not all features in all 74
apps. Native OS drag-out, physical permission dialogs and arbitrary cross-origin
sites are not universally automatable or claimed supported. See docs/web-files.md.

## Consolidation regressions

`review_checks.py`, invoked by the normal browser suite, covers all eight review
findings: navigation-only root, late folder-kind replacement, grant reuse at
2,048 entries, private-root exclusion and storage-file collisions, distinct
duplicate drop roots, expired user activation, and an explicitly connected
different-origin Orbit SDK site. It also verifies pending saves/abort, exclusive
writers, live handle descriptions, the independent write policy, final-transaction
transfer authority, and that a prepared-link drag cannot navigate the app away.
The cooperative website test uses a second actual HTTP origin with no sandbox
relaxation and verifies parent access remains denied.

Native file drops are independently injected by the Chromium DevTools browser
input API into a real disk-backed drag; curated duplicate directory trees test
the host's atomic planner, not a claim of physical OS folder-drag automation.
See `docs/file-integration-reconciliation.md` for the local/PR source audit.
