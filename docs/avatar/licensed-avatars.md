# Licensed avatars

Some avatars, such as MetaHumans wearing Fab clothing, may ship **inside**
Sodalis builds but may not be published on their own. TNO/sodalis is a public
repository, so their GLBs live in a **private asset store** instead. A build
lists such an avatar only if its GLB was copied in. Without it, forks and
public builds simply fall back to the open avatars. The licensing background
is in [the MetaHuman and Fab assessment](../evaluations/metahuman-fab-licensing.md).

## Private asset store

The store is a private git repository (suggested name
`TNO/sodalis-licensed-avatars`) or another access-controlled share. Grant
access only to Sodalis collaborators (Fab EULA §5(a)). Its top level holds:

```text
NOTICE.md     # terms for every GLB below; copied into the build
anna.glb      # one GLB per licensed avatar
sources/      # optional: provenance, receipts, configs; never copied
```

`NOTICE.md` must name, for each GLB, the components and their licences (for
example the Unreal Engine EULA for the MetaHuman, and Fab Standard Licence for
each garment with its listing URL), and state:

> This avatar is licensed for use only within Sodalis. You may not extract,
> reuse or redistribute it, or any part of it, separately from Sodalis.
> Sodalis's MIT licence covers its source code, not this avatar.

## Using the avatars

```sh
git clone <private-store-url> ../sodalis-licensed-avatars
pnpm avatars:licensed ../sodalis-licensed-avatars
pnpm dev            # restart a running dev server to pick up new files
```

The script copies only the top-level `*.glb` files and `NOTICE.md` into the
git-ignored `apps/desktop/public/avatars/licensed/`, replacing what was
there. `SODALIS_LICENSED_AVATARS_DIR` can replace the argument.

## Adding a licensed avatar

1. Commit the GLB and its `NOTICE.md` entry to the private store, never to
   this repository.
2. Add a catalogue entry in `apps/desktop/src/avatar/avatarCatalogue.ts`:

   ```ts
   const ANNA: AvatarCatalogueEntry = {
     asset: {
       id: "metahuman-anna",
       name: "Anna",
       modelUrl: `${LICENSED_AVATAR_PATH}anna.glb`,
       profile: AVATAR_PROFILE_ID,
       framing: { preferred: "upper-body" },
     },
     attribution: {
       title: "Anna (Epic MetaHuman with Fab clothing)",
       sourceUrl: `${LICENSED_AVATAR_PATH}NOTICE.md`,
       license: "Use within Sodalis only",
       licenseUrl: `${LICENSED_AVATAR_PATH}NOTICE.md`,
     },
     licensedFile: "anna.glb",
   };
   ```

   and include it in the list passed to `availableAvatars`. Tests ignore
   local licensed files, so the entry never needs a GLB in CI.

## Release builds

`pnpm build` bundles whatever is in the licensed folder into `dist/desktop`.
Build a release that should include licensed avatars from a checkout that
ran `pnpm avatars:licensed`. Distribute that build only as the Sodalis app,
with its `avatars/licensed/NOTICE.md`; do not publish its GLBs separately or
in a public repository.
