# Unified Aster File Portal

The File Portal work from PR #16 and the saved implementation archive is consolidated
into the Web Files broker from PR #15. There is **one** active adapter and policy store,
not two competing monkey patches. See [the complete guide](web-files.md).

The portable SDK is `sdk/aster-files.js`, byte-identical to the host client module.
It exports `AsterFileClient.connect({parentOrigins: ["https://host.example"]})`.
Set the exact parent origin before connection; opaque standalone hosts require
explicit `"null"` and still authenticate the registered parent WindowProxy.
AsterFiles exposes `open`, `save`, `directory`, `saveBlob`/`exportFile`,
`makeDraggable`, `setDragFiles`, `describeHandle`/`restoreHandle`, and `exportFiles`.
Handles described this way can only be restored within the current live session.
No structured cloning of native handles or synchronization across Workers is claimed.

The local Portal's useful independent write control, exclusive writer exclusion,
non-destructive pending save handles, handle reuse, capability restoration, hierarchy
preservation and SDK publication are included in the unified implementation.
The duplicate host, installer and incomplete base64 transfer are deliberately not
loaded or shipped. The source audit records their disposition.
