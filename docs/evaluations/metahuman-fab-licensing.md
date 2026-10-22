# Distributing a MetaHuman inside Sodalis (task 0054)

Status: conditional assessment, not legal advice. Checked 2026-10-22.

## Summary and recommendation

**A MetaHuman in an app is not categorically forbidden.** Epic's Unreal
Engine EULA expressly describes character models developed using Engine Code
as royalty-free Non-Engine Products, including when used in products relying
on other engines [1]. Epic's MetaHuman documentation says the UE EULA applies
to characters *upgraded* from the web Creator into UE 5.6, and describes the
in-editor Creator as the creation path for 5.6+ [2]. Anna was authored in
the UE 5.8.3 editor. Applying the same EULA to a newly authored (rather
than upgraded) character is a plausible reading, not an explicit statement
in that documentation.

**The clothing can be distributed *inside* an application if each item was
obtained under terms permitting that use.** The full Fab Standard License
expressly permits distributing a Project with Content as an *included
dependency*, including a software application. It requires limiting users
to use of the Content within the Project and restricting extraction or use
outside it [3, §4(c)]. The Epic Content License similarly permits distributing
content in an application as an inseparable component in object code [4,
§3(a)]. These clauses explain how games and other apps ship licensed assets:
the asset's licence remains separate from the app's code licence. Neither
clause gives recipients a standalone, reusable licence to Anna or her clothes.

**For Sodalis, the conclusion is conditional, not an unconditional release
approval.** A Fab Standard-licensed outfit incorporated into a distributed
Sodalis app appears to fit Fab §4(c); publishing the GLB by itself, including
in a public repository, is different (§5(a)). The *current* Anna evaluation
file is local in the git-ignored `apps/desktop/public/avatars/eval/` directory
on the `mpfb-avatar-pipeline` branch, not part of the published app on main.
If included in a future web build, that `public/` path would serve the
raw GLB at a directly fetchable URL. A desktop bundle also contains
extractable bytes. Technical extractability alone is not defined in §4(c)
as a failure, but the project still needs to **restrict end users from
extracting or using the Content outside the Project**. Confirm an appropriate
distribution method and end-user terms before release; don't assume an
unrestricted static URL or the repository's MIT licence grants those rights.

## Scope

The question is **using Anna as an avatar inside the released Sodalis app**,
not offering `anna.glb` as a stock avatar for others to reuse. Anna's UE 5.8
MetaHuman face/body, hair/brow cards, and three garments (top, jeans,
sneakers) are in one converted GLB. The Unreal project has folders including
`OA_TCrop*`, `Jeans` and `CasualSneakers`. The user identified the matching
Epic Fab listings (see the listing check below), but folder names and
listings do not prove the licence tier the acquiring account selected.
A listing offered under a Creative Commons or other
alternative licence may have different rights [3, §2(c)].

## Method and hardware

Read Epic's MetaHuman documentation [2], the full Fab EULA [3], the UE EULA
[1], and Epic Content License [4]; checked the project asset folders and
Sodalis avatar storage paths. The official EULA pages returned HTTP 403 to
automated direct requests, so [1] and [4] were read from snapshots of their
official URLs. [3] was read through a text-rendering proxy of the official
Fab page; its first-page summary is **not binding**, so the findings rely on
its full agreement below the summary. No Epic account-specific receipts or
listing pages were available. No app release was built or distributed.

## Results

| Question | Finding |
| --- | --- |
| Can an app include Fab-licensed clothing? | Yes, under the Fab Standard License, as included Project dependencies with end-user use restricted to the Project [3, §4(c)]. A separate Content License also allows app distribution on its own stated terms [4, §3(a)]. Confirm which agreement actually applies to each garment. |
| Can we publish the garment GLB as a standalone download? | Not under Fab Standard terms: standalone sharing is limited to collaborators, with private-repository collaboration explicitly illustrated [3, §5(a), §6(b)(ii)]. |
| Is a character developed in Unreal confined to the Unreal renderer? | Not necessarily: UE EULA §4(a)(i) names character models made with Engine Code, even in products using other engines [1]. But a separate agreement can restrict **acquired** assets [1, §4(a)(i) note]. |
| Is Anna subject to the old MetaHuman UE-Only Addendum? | Unresolved for a character created fresh in UE 5.8. The archived Content License still calls acquired MetaHuman Content UE-Only [4, MetaHuman Addendum §1], while Epic's newer documentation specifically says the UE EULA applies to *upgraded* characters and describes in-editor creation [2]. Neither resolves the new-character case expressly. |
| Does an OSS project, GitHub login or university partnership create a special content licence? | No. The specific account's asset transaction and governing licence control. Fab's Personal tier requires < $100k revenue from digital-content activity of the acquirer **and controlling/common-control entities**, at the time of acquisition [3, §2(a)]. The quoted *Megascans* Personal Plan is specific to Megascans [4, Megascans Addendum §1(a)]. |
| Does the <$1M figure grant redistribution rights? | No. UE seat exceptions concern corporate-group revenue; royalty thresholds concern product revenue, and §4(a)(i) separately addresses Non-Engine Products [1, §§3, 4, 6]. None grants a standalone Fab-content licence. |
| Is showing an avatar alongside an LLM "training AI"? | Merely rendering it as the assistant's face does not on its face use the character/curves to train or test AI. Do not feed MetaHuman data or rendered output into ML training/evaluation without reviewing UE EULA §6(e) [1]. |

### Fab listing check (public listing data, 2026-10-22)

Public listing data from Fab's listing endpoint, read through the same
proxy as [3]. It shows what each listing offers, not what an account
actually accepted.

| Listing | Seller | Offered licence | Format, size | NoAI | Sodalis fit |
| --- | --- | --- | --- | --- | --- |
| [MetaHuman Jeans](https://www.fab.com/listings/07dc895c-7402-411c-a74a-e1c47b33ac68) (Anna) | Epic Games | Standard: Personal or Professional, both free | `.mhpkg`, 275 MB | Yes | In use |
| [MetaHuman Tucked T Shirt Variants](https://www.fab.com/listings/839b9239-5ea4-40a0-90b3-076e0d9959f7) (Anna) | Epic Games | Standard: Personal or Professional, both free | `.mhpkg`, 1.76 GB, 5 variants | Yes | In use |
| [MetaHuman Casual Sneakers](https://www.fab.com/listings/7e58d5c5-5666-4ab2-9c4e-011eeaba3c07) (Anna) | Epic Games | Standard: Personal or Professional, both free | `.mhpkg` | Yes | In use |
| [MetaHuman Slim Jeans Variants](https://www.fab.com/listings/c5ed3971-03fd-4cec-804c-646422881fb3) | Epic Games | Standard: Personal or Professional, both free | `.mhpkg`, 1.23 GB, 3 variants | Yes | Same workflow |
| [Skotukeda2](https://www.fab.com/listings/bf49f159-d975-4dbb-9d21-3c6fb8d061e7) | skotu keda | Standard: Personal or Professional, both free | `.mhpkg`, 413 MB, UE 5.7 | Yes | Editable MetaHuman: same workflow |
| [Skotukeda3](https://www.fab.com/listings/a29e472c-3340-46cd-84ac-3bbc34239cd0) | skotu keda | Standard: Personal or Professional, both free | `.mhpkg`, 402 MB, UE 5.8 | Yes | Editable MetaHuman: same workflow |
| [Skotukeda – Metahuman Character](https://www.fab.com/listings/5f2b0f38-6dd7-4dd8-999e-c97201344647) | skotu keda | Standard: Personal or Professional, both free | `.mhpkg`, 430 MB, UE 5.8 | Yes | Editable MetaHuman: same workflow |
| [Editable Metahuman – Hannah](https://www.fab.com/listings/60c6be06-f649-4f38-965d-6b1fadbf7d56) | GreyGameStudio | Standard: Personal or Professional, both free | `.mhpkg`, 139 MB, UE 5.7–5.8 | Yes | Editable MetaHuman: same workflow |
| [Modern Female Character](https://www.fab.com/listings/468f4d31-a500-430d-b832-736cc9896aa2) | Alpen wolf | Standard: Personal or Professional, both free | FBX, OBJ, `.blend`, UE, Unity; 4K textures | No | Poor: about 9k-triangle NPC; no face rig or ARKit/viseme morphs listed |

Free does not mean CC0; all are Fab Standard Licences. Each `.mhpkg`
garment contains the parametric wardrobe item, four LODs, materials and
textures for **every** variant. That explains why a clothing pack can be
larger than a character preset: Slim Jeans has three variants and Tucked
T-Shirt five. A converted Sodalis GLB keeps only the chosen variant at the
baked resolution. The third-party characters are presets for MetaHuman
Creator: their faces, and any clothing they reference, are the seller's
Content. They therefore add a seller licence on top of the open MetaHuman
question below. NoAI Content may not be used in Generative AI datasets,
development or training input [3, §6(b)(vii), §16(l)]. Rendering it in the
app is not one of those uses.

The apparent contradiction is resolved by separating **Project distribution**
from **standalone content distribution**. Fab §4(c) explicitly permits
end-user distribution of an app with licensed clothing; §5(a) forbids
handing out that clothing by itself. The same GLB file can be an included
dependency of a useful app yet also be trivially downloadable from a public
URL. The agreement does not specify a required DRM method, but requires
restricting end-user extraction or other out-of-app use [3, §4(c)].
Document the asset's separate licence and restrictions for end users rather
than asserting that Sodalis's MIT source-code licence applies to its contents.
Sodalis already makes this code-versus-model distinction for other avatars
in `apps/desktop/public/avatars/NOTICE.md`.

UE EULA §4's "object code and inseparable part" condition is written for
Products **incorporating Licensed Technology** [1, §4 preamble]. Do not
automatically treat every character model *developed using* Engine Code as
incorporating that technology: §4(a)(i) explicitly lists such models as
Non-Engine Products. Conversely, Fab garments are separately acquired
Content, not converted into MIT assets by exporting a GLB. Where a
MetaHuman-based character includes acquired wardrobe, groom or preset
assets, review each component's provenance. An open-source application can
use third-party content under a separate licence, but cannot relicense that
content under MIT without permission.

## Limitations

- The user identified Anna's three garment listings, all offered by Epic
  under the Fab Standard Licence (table above). We have not seen the
  account's **receipts or selected tier**, nor the hair or groom source.
  Personal tier eligibility depends on revenue of the acquirer and its
  common-control entities [3, §2(a)].
- The Standard Licence permits modifying Content [3, §3(a)], but forbids
  attempts to "translate" or "derive ... data from the Content"
  [3, §6(b)(i)]. Converting a garment to GLB is ordinary asset
  modification on a plain reading. The clause is not specific enough to
  rule that out entirely; include this in the Epic clarification.
- The MetaHuman Content Addendum in the archived Epic Content License
  retains UE-Only wording [4], while the current MetaHuman docs address
  upgraded 5.6+ characters under the UE EULA [2]. We did not obtain an
  authoritative clarification about a *newly created* UE 5.8 character.
- A static asset at `public/avatars/eval/` is directly fetchable by the
  browser when the dev server serves it. The assessment does not certify
  that shipping it from that path satisfies Fab §4(c)'s end-user
  restrictions, nor claim that technically preventing every extraction is
  required. Hosting, packaging, notices and end-user terms need review.
- The educational partner's presence does not make the university the
  acquiring or distributing licensee; UE EULA §9(d) also distinguishes
  educational access from users' distribution rights [1].
- This is a reading of primary contract text for planning, not legal advice.

## Open items

1. Record the selected licence tier, acquiring account and acquisition
   date for each listing above, plus any separately acquired groom or
   preset. Prefer the Professional tier when free, as it avoids the Personal
   revenue condition. Do the same for any third-party preset before use.
2. Confirm with Epic or qualified counsel which terms govern characters
   **newly authored in UE 5.8**, how the MetaHuman Addendum relates to the
   in-editor Creator, and whether GLB export of Fab MetaHuman Content to a
   non-Unreal web renderer is allowed under §6(b)(i).
3. Choose the release distribution approach and write an end-user notice:
   Sodalis code remains MIT; licensed content is for use *only inside
   Sodalis*, not independent reuse or extraction, subject to its actual
   licence. Evaluate whether a public, directly served GLB URL meets that
   restriction before shipping it.

## Sources

1. [Unreal Engine EULA](https://www.unrealengine.com/en-US/eula/unreal),
   §§1, 3, 4(a)(i), 6, 9(d); [archived 2026-10-05 copy read](https://web.archive.org/web/20261005183952id_/https://www.unrealengine.com/en-US/eula/unreal).
2. [Epic, MetaHuman Creator in Unreal Engine](https://dev.epicgames.com/documentation/en-us/metahuman/metahuman-creator-in-unreal-engine);
   [rendered copy read](https://r.jina.ai/https://dev.epicgames.com/documentation/en-us/metahuman/metahuman-creator-in-unreal-engine).
3. [Fab End User License Agreement](https://www.fab.com/eula),
   full binding text §§1, 2, 4(c), 5(a), 6;
   [rendered copy read](https://r.jina.ai/https://www.fab.com/eula).
4. [Epic Content License Agreement](https://www.unrealengine.com/eula/content),
   §§3-5, Megascans Addendum §1(a), MetaHuman Addendum §1;
   [archived 2026-10-12 copy read](https://web.archive.org/web/20261012094709id_/https://www.unrealengine.com/eula/content).
