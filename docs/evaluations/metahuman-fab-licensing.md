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
`OA_TCrop*`, `Jeans` and `CasualSneakers`; these folder names do **not** prove
the Fab product listing, seller, selected licence or applicable transaction
date. The exact garment licence shown to the acquiring account has not been
verified here. A listing offered under a Creative Commons or other
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

## Analysis

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

- We have not seen the *actual Fab listing pages, transaction receipts or
  licence selection* for Anna's top, jeans, sneakers or hair. Asset folder
  names do not prove which licence was accepted or by whom. If the user saw
  "Unreal default license", confirm whether that means the Epic Content
  License, the Fab Standard License, or a listing-specific grant. Also
  confirm the account/legal entity that acquired them [3, §§1(b), 2].
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

1. Record the original Fab listing URL, seller, licence type/tier, account
   and acquisition date for *each* garment and any separately acquired
   groom/preset in Anna's GLB; check for UE-only or NoAI tags.
2. Confirm with Epic or qualified counsel which terms govern characters
   **newly authored in UE 5.8** and how the MetaHuman Addendum relates to
   the in-editor Creator.
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
