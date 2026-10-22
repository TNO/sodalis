# Licensed avatars

Some avatars, such as MetaHumans wearing Fab clothing, may ship **inside**
Sodalis builds but may not be published on their own. TNO/sodalis is a public
repository, so their GLBs live in a **private asset store** instead. A build
lists such an avatar only if its GLB was copied in. Without it, forks and
public builds simply fall back to the open avatars. The licensing background
is in [the MetaHuman and Fab assessment](../evaluations/metahuman-fab-licensing.md).

## Private asset store

The store is the private repository
[TNO/sodalis-licensed-avatars](https://github.com/TNO/sodalis-licensed-avatars).
Its top level holds:

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

## Access

Fab content may be shared on its own only with collaborators working on the
project, for example through a private repository (Fab EULA §5(a)). So:

- A maintainer adds each Sodalis collaborator to the store directly, with
  **read** access (enough to clone); grant write only to people who add
  avatars. Remove access when someone leaves the project.
- Each collaborator clones with their own GitHub login. The build has no
  download step and no token; never put a store token in CI, a fork, a
  public workflow or a shared script.
- External users and forks have no access. Their builds list only the open
  avatars. They get licensed avatars only inside a Sodalis release built by
  a collaborator.

## Using the avatars

```sh
git clone https://github.com/TNO/sodalis-licensed-avatars ../sodalis-licensed-avatars
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
