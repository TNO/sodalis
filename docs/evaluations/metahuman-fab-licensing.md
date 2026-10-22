# MetaHuman and Fab content licensing for an open-source avatar GLB (task 0054)

Status: research note, not legal advice; last checked 2026-10-22.

## Summary and recommendation

Epic's [MetaHuman Creator documentation](https://dev.epicgames.com/documentation/en-us/metahuman/metahuman-creator-in-unreal-engine)
states that the Unreal Engine EULA applies to characters *upgraded* from
the web app to UE 5.6; in-editor Creator is the workflow in UE 5.6+ [[16]](#sources).
For an in-editor-authored UE 5.8 character such as Anna, it is reasonable
but **not expressly confirmed in that sentence** to apply the same EULA.
That EULA explicitly describes character models developed with Engine Code
as royalty-free Non-Engine Products, including in products using other
engines [[2]](#sources). Thus non-Unreal use is not categorically forbidden.
The still-published Epic Content License MetaHuman Addendum says content
you *acquire* is UE-Only [[1]](#sources); its applicability to newly
authored in-editor characters needs clarification before publication.

Open source and "under $1M" do not, by themselves, license third-party
clothing. A **Fab-licensed** outfit may be used in another engine and
included in a project, but not redistributed as a standalone asset
[[6]](#sources). The precise licence of each garment must be checked.
Don't put extracted Fab clothing or Epic-derived mappings/texture sources
in the public repo without clearance. Whether publishing a *newly
authored character-only* GLB in public is allowed depends on its provenance
and which licence applies; the EULA's object-code condition applies when
the Product **incorporates Licensed Technology**, not automatically to
every character model authored in the editor [[10]](#sources).

Rendering the avatar as an assistant's face is not obviously training or
testing an AI *on that avatar*, the activity restricted by the EULA
[[7]](#sources). This distinction supports continued local evaluation;
it does not eliminate the remaining licence and asset-provenance questions.
Seek a licence/legal determination before publishing the GLB or distributing
it in releases. This is an assessment of the cited terms, not legal advice.

## Scope

Covers only the question in task 0054's licensing note and in the user's
follow-up: whether Sodalis (open source, <$1M revenue, not training AI on
the character) can distribute (1) a GLB derived from the MetaHuman "Anna"
export and (2) Fab-sourced clothing, inside an open-source repository and
app. Does not cover Epic's Terms of Service, tax/export clauses, or Megascans
content (not used here; summarized only where it illuminates how Epic
structures "plans").

## Method and sources

Read archived primary licence texts and the MetaHuman Creator documentation
on 2026-10-22. Direct requests to unrealengine.com and fab.com returned
HTTP 403; Wayback snapshots of those URLs were used instead. The Fab page
is explicitly a nonbinding summary; its linked full agreement governs.
Each citation gives both the canonical URL and the copy read. No live
provider commands, logins, or purchases were run. The Creator in-app FAQ
and the Fab storefront UI
(revenue-tier selection, checkout flow) were **not** inspected — they sit
behind login/account state and were explicitly out of scope ("do not run
live provider commands").

## Results

### 1. Royalty exemption vs. content redistribution rights (distinct axes)

| Question | Governing clause | Depends on revenue? |
| --- | --- | --- |
| Do we owe Epic a royalty for distributing the Product? | Unreal Engine EULA §3(a), §4(b): no royalty unless **a Product** directly generates >$1,000,000 USD gross revenue [[8]](#sources) | Per-Product revenue, not company revenue |
| Do our developers need paid Seats? | §6(a)–(b): Seats required unless an exception applies; the "personal and indie exception" (§6(b)(i)) waives seats while the company group's trailing-12-month revenue is <$1,000,000 [[9]](#sources) | Yes — company revenue |
| Can we distribute a newly in-editor-authored character asset? | UE EULA §4(a)(i) permits distributing models made with Engine Code as Non-Engine Products; the Content License's MetaHuman Addendum covers acquired content, but its applicability to new in-editor characters is unresolved [[2]](#sources) [[1]](#sources) [[16]](#sources) | No revenue condition on the underlying asset-use question |
| Can we distribute the Fab clothing asset as a file? | Fab EULA "You may not: Resell or redistribute the asset for free on a standalone basis" [[6]](#sources) | **No** — the summary states "Both pricing tiers (Personal and Professional) grant you the same scope of rights" [[6]](#sources) |

Revenue and OSS status do not independently answer whether a particular
downloaded asset may be redistributed.

**The two "$1,000,000" thresholds are not the same measurement, and the
EULA states them separately:**

- The **seat-fee exception** (§6(b)(i)) is measured at the level of "you,
  together with any entities in your corporate group" — i.e. company-group
  gross revenue (including "any advances received or other funds raised")
  over the **trailing 12 months**, re-tested on a rolling basis
  [[9]](#sources).
- The **royalty threshold** (§4(b)) is measured per **Product**: "you will
  not be obligated to pay us royalty payments under this Agreement unless
  **a Product** directly generates more than $1,000,000 USD in gross
  revenue" [[8]](#sources) — i.e. it is not Sodalis's company-wide revenue,
  it is whatever a single distributed Product (app/build) itself earns.
  A zero- or low-revenue open-source Product would not cross this threshold
  regardless of Sodalis's or its backers' overall size.

Do not infer the company-group seat threshold from the revenue of this
open-source repository: if TNO or another legal entity exercises the licence,
its **whole corporate group's** revenue matters. A royalty-free
Non-Engine Product and a product with no direct revenue present separate
paths for avoiding royalties. Neither threshold overrides restrictions on
separately licensed Fab assets.

### 2. Asset form vs. embedded product

The UE EULA's object-code/inseparable-part rule is conditional: "Any Product
that you Distribute **that incorporates Licensed Technology**" must
incorporate it only in object code and inseparably [[10]](#sources). The
EULA separately calls character models *developed using Engine Code*
Non-Engine Products [[2]](#sources). Do not assume that a newly authored
GLB incorporates Licensed Technology merely because Unreal exported it.
Check whether the specific file embeds Starter Content, licensed presets,
or separately acquired Epic/Fab assets.

For **Licensed Content** under the Epic Content License, distribution
with a project is restricted to incorporated object code [[3]](#sources).
Sharing source-format content outside a project is limited to
employees/affiliates/contractors working on it [[4]](#sources), and
stand-alone transfers are barred [[5]](#sources). Whether a public GLB
is stand-alone distribution depends first on whether it contains such
Licensed Content; do not assume every character model does.

### 3. Shareability in a public repo

The Fab summary's permitted-use list only authorizes sharing "directly, via
a **private** repository or in the Project) with your collaborators that are
working on the Project with you" [[6]](#sources) — it does not authorize a
public repository, and the prohibited-use list separately bans free
standalone redistribution [[6]](#sources). The MetaHuman Content Addendum
and Content License's source-format restriction may also apply to acquired
characters [[1]](#sources) [[4]](#sources), but the scope for a *freshly
authored UE 5.8 character* is disputed (see below). No public-repository
carve-out for **Fab content** was found.

### 4. Seat/organization considerations

- Seats are personal to a User; two people on one machine occupy two seats,
  and the same person on several machines occupies one [[11]](#sources).
- Educational institutions may let *all* users of their computers access the
  Licensed Technology for educational purposes without seats, but "those
  users are not authorized under your License to Distribute the Licensed
  Technology (including as incorporated in a Product). For that, they must
  obtain a License of their own" [[12]](#sources). This directly supports
  the open question already recorded in task 0054: if a MetaHuman asset were
  authored at an educational partner under the educational exception, that
  partner's users are not thereby authorized to hand it to Sodalis/TNO for
  redistribution — whoever redistributes needs their own license grounding
  to do so. The primary sources read here do not say who, concretely,
  qualifies to redistribute in that scenario; it remains a legal question.

### 5. Generative AI restriction, and whether using an AI avatar is "training"

Two separate AI clauses exist:

- Unreal Engine EULA, general-restrictions list: you may not use "MetaHuman
  digital characters and animation curves (or any rendered output thereof if
  crafted to replicate the functionality of MetaHuman) to build or enhance
  any database or training or testing any artificial intelligence, machine
  learning, deep learning, neural networks, or similar technologies," and
  separately may not use the Licensed Technology "as a training input to any
  Generative AI Program or as prompt-based input where the Generative AI
  Program trains on input data" [[7]](#sources).
- Content License Agreement §17 "Artificial Intelligence": restricts only
  content explicitly tagged/labeled "NoAI" from being used in Generative AI
  Program datasets, development, or inputs, and has Epic reciprocally commit
  not to license its own Content for Generative AI use [[13]](#sources).

Rendering a converted MetaHuman GLB as the visual face of an LLM-driven
assistant — where the LLM/TTS stack is trained and run independently, and
the avatar only displays visemes/expressions computed from that stack's
output — is not literally "building or enhancing a database" or "training
or testing AI" with the character or its curves: no model is being fit to
the MetaHuman data itself. That is the task doc's reading, and this note
does not find anything in the text that contradicts it. However, the clause
also reaches "testing" any AI/ML "technology," and the phrase "or any
rendered output thereof if crafted to replicate the functionality of
MetaHuman" is broad and undefined — e.g., if a separate ML model is ever
trained or evaluated on the avatar's rendered frames or animation curves
(for instance, a lip-sync or expression-transfer model), that could
plausibly fall inside the restriction. The task doc's own flag — "legal must
confirm this" — is accurate; this research did not find primary-source text
resolving the ambiguity either way.

### 6. Fab assets and source material

The Fab Standard License (the "full text" linked from the one-page summary
at fab.com/eula is, per Epic's own cross-references, the Epic Content
License Agreement [[14]](#sources)) permits: commercial or private use;
modifying assets to incorporate them into Projects; commercially
distributing Projects with Fab assets incorporated; using assets with "any
compatible tools (usage is not limited to Unreal Engine)"; and sharing "via
a private repository or in the Project" with collaborators [[6]](#sources).
It forbids reselling or redistributing the asset for free on a standalone
basis, "or allow[ing] others to do the same" [[6]](#sources). A
"Reference-Only" pricing tier grants access to a referenced asset only, not
its source format [[6]](#sources); no credit to the original publisher is
required [[6]](#sources). This is more permissive on cross-engine use than
MetaHuman Content, but the standalone-redistribution ban applies regardless
of price paid or revenue.

### 7. UE 5.6+ MetaHuman Creator vs. the Content License

The follow-up question is correct to challenge the earlier framing. Epic's
own MetaHuman product documentation ("MetaHuman Creator in Unreal Engine")
states, in its own words:

> "As of Unreal Engine 5.6, MetaHuman Creator is fully integrated into
> Unreal Engine, providing you with greater flexibility and customization in
> creating and adding MetaHumans directly into your project. ... **The
> Unreal Engine EULA applies to MetaHuman characters you upgrade from the
> web application to Unreal Engine 5.6.** This documentation covers
> MetaHuman Creator in Unreal Engine only. MetaHuman characters for Unreal
> Engine 5.5 and earlier should continue to be created and edited in the
> MetaHuman web application." [[16]](#sources)

This is a genuine, documented distinction between two MetaHuman authoring
paths, and it changes the picture:

- **Pre-5.6 (cloud) MetaHuman Creator**, a separate web application whose
  output you "acquire" and "download," is what the Content License
  Agreement's MetaHuman Content Addendum is written for: that Addendum's own
  definition is "digital human characters made available through MetaHuman
  Creator that you **download**" [[1]](#sources) — acquisition language, not
  authoring-with-Engine-Code language.
- **5.6+ in-editor MetaHuman Creator** is, per the documentation above, now
  a plugin/editor tool inside Unreal Engine itself, opened by "double-
  clicking a MetaHuman character asset in the Content Browser" [[17]](#sources)
  — i.e., you are authoring with Engine Code inside the engine, not
  downloading a finished asset from a separate web service. Epic's
  documentation states specifically that the Unreal Engine EULA applies to
  characters **upgraded from the web app**. For characters created directly
  in-editor this is an inference, not an explicit assurance. That is the Unreal
  Engine EULA whose §4(a)(i) treats "character models and animations ...
  that you developed using Engine Code" as royalty-free Non-Engine Products
  that "remain Non-Engine Products even if included in Products that use or
  rely on other video game engines" [[2]](#sources) — i.e., it is written to
  permit the kind of other-engine portability the task doc assumed.
- Anna was authored in **UE 5.8.3** using the in-editor MetaHuman Creator
  per task 0054's progress notes, which is the 5.6+ path, not the legacy web
  application. **The UE-Only Content restriction cannot simply be assumed
  to apply to Anna**, but the governing terms for a newly created 5.8
  character are not expressly settled by the quoted upgrade sentence.

**What remains genuinely uncertain, not resolved by this correction:**

1. **A textual conflict, not yet reconciled.** The Content License
   Agreement's MetaHuman Content Addendum — read in archived snapshots from
   2026-06-22, 2026-09-15, and 2026-10-12, all textually identical — still
   defines MetaHuman Content broadly ("digital human characters created by
   your use of MetaHuman Creator") with no version cutoff, and still states
   "MetaHuman Content that you acquire may only be used and shared as
   UE-Only Content," with no 5.6+ carve-out written into the contract itself
   [[1]](#sources). The Content License's own change log says an earlier
   "EULA update 3" "deleted content restrictions specific to Metahumans in
   Metahuman Content Addendum" [[18]](#sources), but the addendum text
   actually read across three dated archive snapshots (spanning before and
   after that update was presumably live) still contains the UE-Only-Content
   restriction verbatim — so it is unclear what, if anything, "update 3"
   actually removed from this Addendum, or whether the change log is itself
   stale. This note did not find a version of the Content License Agreement
   with that restriction absent. In short: **Epic's documentation says one
   thing, Epic's contract text (as archived) still says another**, and nothing
   found here resolves that gap authoritatively.
2. **"Upgrade" vs. "create new" wording.** The quoted documentation sentence
   specifically says the Unreal Engine EULA applies to characters "you
   upgrade from the web application to Unreal Engine 5.6" — an upgrade/
   migration scenario. It does not, in so many words, separately confirm
   that a character created fresh in the 5.6+ in-editor tool (never having
   existed in the old web app) is treated identically. Given the same page
   states the web application is no longer the creation path for 5.6+ ("the
   following documentation covers MetaHuman Creator in Unreal Engine only")
   [[17]](#sources), it is a reasonable inference that newly created 5.6+
   characters are likewise governed by the Unreal Engine EULA — but it is an
   inference, not a quoted guarantee, and Anna's own creation history (fresh
   in 5.8.3, or migrated) was not re-verified against task 0054's notes as
   part of this round.
3. **This correction does not extend to Fab-sourced clothing/hair.** Those
   assets are *acquired* Licensed Content from Fab's marketplace, not
   something Sodalis authored with Engine Code, so they stay squarely under
   the Fab EULA / Content License regardless of which engine version
   authored the base character [[6]](#sources). Epic's own MetaHumans-on-Fab
   documentation describes Fab MetaHuman-compatible products (editable
   characters, grooms, skeletal/outfit clothing) as things "you acquire ...
   for use in your project," packaged in the `.mhpkg` format for Unreal
   Engine import [[19]](#sources) — consistent with Fab clothing remaining
   Licensed Content under the Content License/Fab EULA, not Non-Engine
   Product under §4(a)(i).
4. **Public-repo/stand-alone distribution remains a concern for any
   *acquired* Content, particularly Fab clothing.** The UE EULA's
   "inseparable part" restriction applies if the distributed Product
   *incorporates Licensed Technology* [[10]](#sources); it is not a
   blanket rule for a newly authored model. Character provenance and the
   particular outfit licence must be established first.

**Net assessment:** the royalty-free, portable-to-other-engines
path (§4(a)(i)) is very likely the one that actually applies to a MetaHuman
character authored with the in-editor Creator in UE 5.6+, which would
address the main thing the earlier note flagged as a blocker for the avatar
itself. That reading rests partly on an inference from Epic's documentation
about *upgraded* characters; Epic's unchanged MetaHuman Content Addendum is not
reconciled with it. The Fab clothing/hair distribution question remains
separate. Before releasing the GLB, resolve the licence and provenance of
each included component.

## Analysis

The task doc's existing citations (§4(a)(i) Non-Engine Products,
§6(b)(ii) educational exception, §6(e) generative-AI/MetaHuman restriction)
are each confirmed essentially as quoted, with one addition: the generative-
AI and MetaHuman-training restriction sits inside the general-restrictions
bullet list under §6, not as its own lettered subsection in the current text
[[7]](#sources) — a cosmetic correction, not a substantive one. The task
doc's reliance on §4(a)(i)'s "Non-Engine Products" clause is, per the
[results above](#7-ue-56-metahuman-creator-vs-the-content-license),
plausibly the *correct* governing clause for Anna specifically (UE 5.8.3,
in-editor Creator) — stronger support for the task doc's original position
than this note first credited, though resting on Epic documentation not yet
reconciled with Epic's own unchanged Addendum text.

Both clauses could apply to *different* authoring paths: the UE EULA to a
model developed in-editor, the Content License to acquired content. But
the archived Addendum's wording is broad enough that its scope cannot be
settled from this distinction alone. Epic's EULA itself notes that assets
available under separate agreements may remain Unreal-only [[2]](#sources).

## Limitations

- No primary source found (in the pages read) gives a bright-line test for
  "inseparable part of the Project" vs. "stand-alone" distribution of
  *Licensed Content* in a public repository; the UE EULA's rule for
  Licensed Technology is conditional on incorporating that technology
  [[10]](#sources) [[3]](#sources).
- Epic's MetaHuman product documentation (cited in Results §7) and
  Epic's Content License Agreement contract text (the MetaHuman Content
  Addendum) are not reconciled with each other as of the snapshots read;
  this note reports the conflict rather than picking a winner.
- The documentation statement that "the Unreal Engine EULA applies to
  MetaHuman characters you upgrade from the web application to Unreal
  Engine 5.6" is about upgraded characters; whether it extends with equal
  force to characters created fresh in 5.6+ (never having existed in the
  older web app) is inferred, not separately quoted.
- The in-product MetaHuman Creator EULA acceptance screen, the Fab
  storefront's checkout-time terms, and any account-specific or
  organization-specific license grants were not inspected (require login;
  out of scope per instructions).
- Epic's Terms of Service (epicgames.com/tos) and Privacy Policy are
  referenced by the EULAs but were not read for this note.
- unrealengine.com and fab.com blocked direct automated fetches (HTTP 403);
  all quotations here come from Wayback Machine snapshots of the same URLs,
  believed unaltered, but not independently diffed against the live page at
  fetch time. `dev.epicgames.com` documentation pages do not render
  server-side and required a reader-proxy workaround (r.jina.ai); two
  relevant MetaHuman doc pages (`metahuman-creator-overview`,
  `metahuman-creator-migration-guide`) remained blocked (403/CAPTCHA) even
  through that proxy and were not read.
- This is a plain reading of public contract text for internal planning
  purposes. It is not legal advice and does not substitute for review by
  qualified counsel, which task 0054 already calls for before any production
  distribution.

## Open items

- **Highest priority, new:** get Epic/legal confirmation reconciling the
  MetaHuman product documentation's "the Unreal Engine EULA applies to
  MetaHuman characters ... Unreal Engine 5.6+" statement [[16]](#sources)
  against the Content License's unchanged "UE-Only Content" Addendum text
  [[1]](#sources) and the change-log entry claiming MetaHuman-specific
  restrictions were deleted [[18]](#sources) — these three primary sources
  do not currently agree, and this note cannot resolve that conflict from
  the text alone.
- Get a legal opinion on whether a GLB converted from MetaHuman Content for
  a non-Unreal renderer can be distributed at all — now contingent on which
  of the two regimes above actually governs Anna (UE 5.8.3, in-editor
  Creator), not a settled "no" as the first draft of this note implied.
- Check the actual licence and provenance of each outfit/hair component,
  then ask whether publishing a GLB **containing Licensed Content** in a
  public repository amounts to stand-alone distribution under the Content
  License [[5]](#sources) or Fab terms [[6]](#sources). A newly authored
  character-only GLB may have different rights from its Fab-clothed version.
- Clarify, for an avatar authored under an educational partner's seat, who
  is authorized to redistribute it onward (per §9(d) of the Unreal Engine
  EULA, the institution's users cannot Distribute under the institution's
  License and need a License of their own) [[12]](#sources).
- If any ML model (lip-sync, expression transfer, etc.) is ever trained or
  evaluated using the MetaHuman animation curves or rendered frames, revisit
  the generative-AI/MetaHuman restriction before doing so [[7]](#sources).
- Re-check metahuman.com/license and fab.com/eula periodically; both are
  thin marketing/summary pages that point to the underlying EULAs, and Epic
  has superseded prior MetaHuman-specific agreements with the current
  Unreal Engine EULA plus Content License Agreement combination at least
  once already [[15]](#sources).
- Confirm whether Anna was created fresh in UE 5.8.3 or migrated/upgraded
  from an earlier MetaHuman web-app character; task 0054's notes record the
  authoring version (5.8.3) but this note did not re-verify the upgrade-vs-
  fresh-creation history, which matters given the documentation's "upgrade"
  wording (see Limitations).

## Sources

1. Epic Content License Agreement, MetaHuman Content Addendum §1 "UE-Only
   Content": <https://www.unrealengine.com/eula/content> (archived
   2026-10-12:
   <https://web.archive.org/web/20261012094709id_/https://www.unrealengine.com/eula/content>)
2. Unreal Engine EULA §4(a)(i), footnote after the Non-Engine Products
   examples: <https://www.unrealengine.com/en-US/eula/unreal> (archived
   2026-10-05:
   <https://web.archive.org/web/20261005183952id_/https://www.unrealengine.com/en-US/eula/unreal>)
3. Epic Content License Agreement §3(a) "Use by End Users, Publishers, and
   Distributors" (same archived URL as [1])
4. Epic Content License Agreement §4 "How You Can Share the Licensed Content
   When It Isn't Part of a Project" (same archived URL as [1])
5. Epic Content License Agreement §5(c)(ii) General Restrictions (same
   archived URL as [1])
6. Fab Standard License summary: <https://www.fab.com/eula> (archived
   2026-10-08:
   <https://web.archive.org/web/20261008013332id_/https://www.fab.com/eula>)
7. Unreal Engine EULA §6(e) General Restrictions bullet list (Generative AI
   Program / MetaHuman digital characters and animation curves) (same
   archived URL as [2])
8. Unreal Engine EULA §3(a) and §4(b) (same archived URL as [2])
9. Unreal Engine EULA §6(b)(i) "Personal and indie exception" (same archived
   URL as [2])
10. Unreal Engine EULA §4 preamble ("object code and only as an inseparable
    part of the Product") (same archived URL as [2])
11. Unreal Engine EULA §6(a) "Seat Subscriptions" (same archived URL as [2])
12. Unreal Engine EULA §9(d) "Use by Educational Institutions" (same
    archived URL as [2])
13. Epic Content License Agreement §17 "Artificial Intelligence" (same
    archived URL as [1])
14. Epic Content License Agreement, Marketplace/MetaHuman/Megascans
    addenda, read in full to confirm no separate "Fab Marketplace Content
    Addendum" text exists beyond the Marketplace Content Addendum and the
    fab.com/eula summary (same archived URL as [1])
15. Unreal Engine EULA §8(b) "Alternative and Additional Terms" (supersession
    of prior Unreal Engine EULA for Publishing/Creators and the MetaHuman
    Creator EULA) (same archived URL as [2])
16. Epic MetaHuman Documentation, "MetaHuman Creator in Unreal Engine" —
    "As of Unreal Engine 5.6, MetaHuman Creator is fully integrated into
    Unreal Engine... The Unreal Engine EULA applies to MetaHuman characters
    you upgrade from the web application to Unreal Engine 5.6":
    <https://dev.epicgames.com/documentation/en-us/metahuman/metahuman-creator-in-unreal-engine>
    (rendered via <https://r.jina.ai/>, since this page is a client-side
    Angular SSR shell with no server-rendered article content when fetched
    directly; read 2026-10-22)
17. Same page as [16] — "MetaHuman Creator is the MetaHuman Character
    Editor in Unreal Engine, opened by double-clicking a MetaHuman character
    asset in the Content Browser" and "This documentation covers MetaHuman
    Creator in Unreal Engine only. MetaHuman characters for Unreal Engine
    5.5 and earlier should continue to be created and edited in the
    MetaHuman web application."
18. Epic Content License Agreement change log, "EULA update 3" entry:
    "Deleted content restrictions specific to Metahumans in Metahuman
    Content Addendum": <https://www.unrealengine.com/eula-change-log/content>
    (only usable archived snapshot found, 2026-07-01:
    <https://web.archive.org/web/20260701id_/https://www.unrealengine.com/eula-change-log/content>) —
    compared against three dated snapshots of the live Content License
    Agreement text itself (2026-06-22, 2026-09-15, 2026-10-12), in which the
    MetaHuman Content Addendum's UE-Only-Content clause is unchanged; the
    discrepancy between this change-log entry and the live contract text is
    unresolved (see Update section above).
19. Epic MetaHuman Documentation, "MetaHumans on Fab" — Fab MetaHuman-
    channel products (editable characters, grooms, outfits) are packaged in
    `.mhpkg` format; "As a buyer, you can add any products you acquire that
    use the MetaHuman format directly to your Unreal Engine project":
    <https://dev.epicgames.com/documentation/en-us/metahuman/metahumans-on-fab>
    (rendered via <https://r.jina.ai/>; read 2026-10-22)

Also attempted and blocked/unusable: `metahuman-creator-overview` and
`metahuman-creator-migration-guide` (403/CAPTCHA even via the r.jina.ai
proxy), `unrealengine.com/eula-change-log/unreal` (no usable archived
snapshot found, 403 live), and general web search via Google/Bing/
DuckDuckGo (unusable for this research — garbled script output, irrelevant
results, or CAPTCHA walls).

Blocked at fetch time (HTTP 403 to automated requests; not followed further
since Wayback Machine snapshots of the same URLs were available and used
instead): `https://www.unrealengine.com/en-US/eula/unreal`,
`https://www.unrealengine.com/eula/content`, `https://www.fab.com/eula`,
`https://www.fab.com/content-guidelines` (this last one returned no usable
archived snapshot either; not cited above).
