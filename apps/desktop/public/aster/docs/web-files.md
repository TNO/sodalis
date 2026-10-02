# Web app files — Aster 2.0

## Use

Open **Settings → Apps → Web app files** (searchable from Start). Global defaults
apply to all catalog and installed apps. Each app has independent **inherit / Aster
/ browser** choices for master integration, open, save pickers, write-through handles, directory pickers,
HTML file inputs, generated downloads, incoming drops, outgoing transfers, and
main-thread private storage. The global master switch wins even over an app-level enabled override; an app master switch also wins over its subordinate switches.
Native device drops into Aster have a separate switch.

Pickers and transfer routes default to Aster. Private storage mapping defaults off.
Changes persist in local IndexedDB. They revoke the affected sessions' old handles
and staged streams immediately, without reloading application documents. Explicit
**Revoke access** is also available in Settings and the app's window menu. Files
already read by an application cannot be recalled. Permission grants are session
capabilities, never retained across a page reload.

The Aster picker shows folders, names, types, sizes, search, common locations,
multiple selection, file filters, new-folder creation and overwrite confirmation.
Use Ctrl/Command-click for multiple files. The app receives only your confirmed
file(s) or the selected folder and its descendants. Save selection creates a pending
handle, not an empty filesystem entry. New content and replacement commit only when
the writable stream closes. Aborting a new write therefore leaves no empty file.
This deferred-creation choice deliberately differs from native save-picker creation semantics.

## Connection modes — an important boundary

1. **Owned same-origin catalog apps:** Aster attaches the standard API adapter to
   their live browsing document. Source files are not rewritten or mirrored. The
   existing trusted Pages sandbox is unchanged. Standard APIs looked up after
   attachment use the adapter. APIs cached before attachment may need the SDK to
   load before app startup. Catalog apps share a browser origin and are already
   mutually trusted; this is not a new isolation boundary between Pages projects.
2. **Installed HTML and local HTML in Orbit:** the client bootstrap is included
   before app scripts. Their original opaque sandbox remains opaque: no
   `allow-same-origin` is added. The client has only a MessagePort to the broker,
   never the parent Aster object. The HTML doctype is preserved.
3. **Different origins:** the website must load the cooperative SDK below. Aster
   does not defeat same-origin policy or a site's Content Security Policy.
   Settings reports **SDK required**, not a false connected status. A standalone
   file-hosted Aster and HTTPS catalog pages are different origins. Arbitrary
   websites opened in Orbit are not automatically authorized as catalog apps.
   Choose **Connect Aster files** in Orbit to explicitly register that origin for
   cooperative SDK requests. The original opaque sandbox is retained; merely loading
   a website does not grant it access. The site then appears in per-app Settings.

These distinctions apply even when the global integration switch is on. The
collection still launches all 74 projects; that does not prove every I/O pathway
in each project uses a standard interceptable browser API. An app's own IndexedDB,
custom internal document dialog, network filesystem, and worker OPFS remain its own.
For example Notepad XP retains its own XP document dialog; **Browse** opens Aster's
picker, and ordinary Save writes through the granted Aster handle.

## Supported file API facade

- `showOpenFilePicker`, `showSaveFilePicker`, `showDirectoryPicker` with supported
  type filters, multiple selection, suggested name and common/handle start folders.
- File handles: `kind`, `name`, `getFile`, `queryPermission`, `requestPermission`,
  `isSameEntry`, and `createWritable`.
- Directory handles: async `entries`, `keys`, `values`, async iteration,
  `getFileHandle`, `getDirectoryHandle`, `removeEntry` (including recursive),
  `resolve`, permission queries and identity comparisons.
- A real browser `WritableStream`, including writer/pipeTo use and convenience
  `write`, `seek`, `truncate`, `close`, `abort`; exclusive or siloed writer mode; strings, ArrayBuffers, typed views,
  Blobs, positional writes, sparse zero fill and keepExistingData.
- File inputs, labels, programmatic `.click()` and `.showPicker()`, multiple files,
  `webkitdirectory`, actual FileList and input/change/cancel events.
- Generated Blob and data-URL anchor downloads are redirected. Network downloads
  remain native rather than fetching arbitrary URLs with host authority.
- Optional main-thread `navigator.storage.getDirectory` maps to a confirmed
  `/Documents/App storage/<app-id>` folder. It does not migrate browser OPFS data.
  It is available only where the browser actually exposes navigator.storage.

These are capability-backed **facades**, not native browser FileSystemHandle
instances: structured-cloning handles into IndexedDB/Workers, transferable native
handles, sync access handles, observers, native move, and worker filesystem
monkey-patching are not provided. Unsupported operations fail explicitly. Disabling
integration delegates to the original native API; an unavailable native API still
remains unavailable. Standard browser permission/activation requirements apply.

## Drag and drop

- **Device/browser → Explorer or Desktop:** capture the real browser File/entry
  references synchronously in the drop event. Files and recursive folder trees,
  including empty directories from native directory entries, import atomically.
  Conflicting root names get separate names instead of destructive merging.
- **Explorer → connected app:** drag actual selected files/folders. A scoped token
  is resolved by the broker; the app receives real File objects, relative paths,
  ordinary drop/change events and an `aster-files-drop` event with scoped handles.
- **App → Explorer/app:** native drags with File data and supported Blob download
  anchors are relayed; apps may explicitly use `AsterFiles.makeDraggable` for
  prepared exports. The receiver gets the original bytes, not filenames or URLs.
- **Aster/app → browser/device:** Explorer's **Prepare browser export** and the
  SDK export method put files on the Transfer shelf. Each file has a Download
  link and a **Drag into Aster** control. Browser drag-out uses a native File,
  URL and Chromium DownloadURL hint when supported. The native host/window
  drop destination can reject those; Download is the portable fallback.

Opaque frames restrict native cross-frame dragging in some engines. The adapter
therefore supports a real pointer relay and a drag overlay inside Aster. When the
parent receives the trusted pointer-up, it routes the selected transfer directly.
Some browser processes keep all pointer events in the source iframe; the SDK then
forwards the gesture over its port. A port message cannot prove a physical action,
so an isolated app's remote release displays **Complete file transfer?** before
writing into Aster or sharing with another app. Cancel leaves all files unchanged.
Already-trusted same-origin pages can complete directly. Escape, revocation and
timeout clean up the relay; no trusted native event is forged. The receiver's synthetic file
drop event has `isTrusted=false`, as required by the browser. Apps which insist on
trusted drop events need their cooperative `aster-files-drop` handler. Pointer
relay does not pretend to drag outside the browser window. Touch drag UI and native
OS drag-out remain platform-dependent; native downloads remain available.

## SDK for cooperating sites

Load this before your application captures native file API functions:

```html
<script>
window.ASTER_FILE_HOST_ORIGINS = ['https://wieslawsoltes.github.io'];
</script>
<script src="https://wieslawsoltes.github.io/Aster/sdk/aster-files.js"></script>
```

The SDK only connects to its actual parent window with an exact allowed origin
and a transferred MessagePort. Merely including the script outside Aster does not
replace APIs. A locally hosted different-origin application needs its Aster parent
origin explicitly configured. Do not blindly allow arbitrary parents.

```js
// Ordinary APIs use either the selected Aster route or their original browser API.
const [file] = await showOpenFilePicker({multiple: false});
const text = await (await file.getFile()).text();

// Extra APIs explicitly request Aster (disabled routes reject rather than escape).
const handle = await AsterFiles.save({suggestedName: 'result.bin'});
const writer = await handle.createWritable();
await writer.write(new Uint8Array([0, 255, 128]));
await writer.close();

const exportFile = new File([text], 'copy.txt', {type: 'text/plain'});
const disposeDrag = await AsterFiles.makeDraggable(exportButton, [exportFile]);
await AsterFiles.exportFiles([exportFile]); // opens Aster's transfer shelf
window.addEventListener('aster-files-drop', event => {
  // event.detail.files and event.detail.handles are session-scoped.
});
window.addEventListener('aster-file-error', event => console.error(event.detail));
```

## Transactions, revocation, safety and limits

Every broker operation revalidates effective policy and session capability. Tokens
use 192 bits from Web Crypto. A handle cannot escape its selected scope using names
or traversal. Mounted host folders and root-private Aster directories are excluded;
ordinary project dotfiles such as `repo/.git/config` remain supported.

Writes stage immutable Blobs and commit only at close. Revision comparisons,
permissions, parent presence, replacement and prior-file history updates run inside
the same IndexedDB files/history/meta transaction. Concurrent newer edits, revoked
access, cancelled pickers or closed apps never silently commit staged content.
Recursive deletion also checks for newly added descendants to avoid orphaning
concurrent work. Browser-memory fallback uses the same plan/validation rules.

Limits: 64 MiB/file, 128 MiB staged data and transfer pool, 2,048 directory entries
and 4,096 reusable handles, 24 path levels, 12 pending requests and 8 streams per connection;
256 per-app preference records. Pickers are serialized and filter dictionaries are
bounded. Offers expire after five minutes, Explorer drag tokens after 30 seconds;
a timer releases expired Blob references. Closing the frame restores hooked
methods, revokes grants and streams, and closes the port. Preferences and source
files are local; no external execution backend or analytics is introduced.

Picker requests require actual transient browser activation on both the adapter
and broker sides; a startup/timer cannot silently open a file dialog. Repeated
folder enumeration reuses scoped child handles, preflighting remaining capacity
rather than accumulating grants. The filesystem root and another app's private
storage are never public picker scopes. Directory kind and file revision are
revalidated after dialogs and before committing.

`AsterFileClient.connect({parentOrigins: [...]})` is the explicit SDK connection
entry point. It returns the same `AsterFiles` instance if already connected.
`describeHandle(handle)` / `restoreHandle(description)` allow a live session to
retain handle identity. Descriptions are revoked by policy changes/reload; they
are not native structured-cloneable handles. The SDK is generated from the same
client implementation as automatic adapters and checked for byte equality.

The separate write switch restricts mutation through file/directory handles;
exports/downloads and native imports have independent route switches and user
confirmation. Browser fallback affects future native picker calls, never grants
an old revoked Aster handle direct host-drive access.

The library of app policies is not yet included in the generic Aster backup;
export important files normally. Clearing browser storage removes virtual data.
Same-origin Pages apps already share origin privileges; only opaque/cooperative
cross-origin frames are constrained by the MessagePort capability boundary.

## Primary interface specifications

- HTML Drag and Drop: https://html.spec.whatwg.org/multipage/dnd.html
- File System Access API: https://wicg.github.io/file-system-access/
- File System standard: https://fs.spec.whatwg.org/
- HTML channel messaging: https://html.spec.whatwg.org/multipage/web-messaging.html

Tests and evidence boundaries: `tests/web-io/README.md`.
