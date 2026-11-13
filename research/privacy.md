# Privacy and consent for an always-listening home assistant (Netherlands / EU)

Research notes. Facts only; no recommendations or decisions; not legal advice.
Documents fetched 2026-11-13. Source keys like `[S3 ¶16]` resolve to URLs in the **Sources** list at the end; the part after the key is the article / paragraph / section. "¶" = numbered paragraph of an EDPB/WP29 document. EDPB page numbers are PDF page numbers.

## Question

Sodalis is a local-first browser assistant for older adults on a tablet at home (Netherlands, public MIT repo). What do the GDPR, EU/Dutch (Autoriteit Persoonsgegevens, AP) and EDPB guidance (especially EDPB Guidelines 02/2021 on virtual voice assistants, v2.0, 7 July 2021) and established practice (Home Assistant Assist / openWakeWord / Year of the Voice, Apple Siri, Google Assistant, Amazon Alexa) say about always-listening devices in a home, covering: (1) what counts as processing before activation; (2) whether on-device wake-word/VAD buffering avoids personal-data processing; (3) consent / legal basis for household members and visitors; (4) listening indicator and mute; (5) retention of pre-activation audio; (6) added care for older adults / reduced capacity. Plus: who is the controller when open-source software runs on the user's own device.

## Summary of findings

- **EDPB 02/2021 describes the pre-activation phase as processing that exists but is minimal**: the VVA "is constantly listening", uses "a buffer of a few seconds", and "no other operation than wake-up expression detection is performed" and nothing leaves the device until the wake word is detected `[S1 ¶16, ¶18]`. The guidelines never say that this local phase is outside GDPR; they also never address RAM-only buffers explicitly (searched the whole PDF).
- **GDPR definitions are broad** (Art 4(1) "any information relating to an identified or identifiable natural person"; Art 4(2) "any operation … whether or not by automated means … collection, recording, … storage … use") `[S2 Art 4(1),(2)]`. Whether a transient audio buffer that is never persisted or transmitted counts is **not answered by any primary source I found**.
- **ePrivacy Art 5(3) / Telecommunicatiewet 11.7a** are triggered by storing/accessing information in terminal equipment. EDPB 2/2023 ¶44 says an app using the microphone "strictly inside the terminal" is not "gaining access" *as long as the information does not leave the device*; once it or "any derivation" is accessed (e.g. sent out), Art 5(3) applies `[S5 ¶44, ¶53]`. EDPB 02/2021 footnote 12 says that if VVAs move to edge computing "it will be necessary to reassess the applicability" of the ePrivacy Directive `[S1 fn 12]`.
- **Household exemption (Art 2(2)(c), Recital 18)** covers a natural person's purely personal/household activity but Recital 18 states the GDPR "applies to controllers or processors which provide the means" `[S2 Rec 18]`. CJEU construes the exemption narrowly (Ryneš ¶29–33; Jehovan todistajat ¶40–42) `[S10, S11]`. EDPB draft Guidelines 1/2020 (connected vehicles) say purely local applications fall outside the GDPR for the user but the manufacturer/service provider that supplies the means is covered when it acts as controller or processor `[S8 ¶71, ¶73]`.
- **Controller**: Art 4(7) turns on determining purposes and means; EDPB 7/2020 ¶45 says a controller need not have access to the data `[S2 Art 4(7); S7 ¶45]`. No EDPB text I could find addresses open-source software run by an end-user on their own device.
- **Voice biometrics / multiple users**: using voice for identification is Art 9 biometric processing needing explicit consent plus an alternative method; speaker recognition also processes voices of non-registered and accidental users `[S1 ¶81–82, ¶128, ¶130–132]`. EDPB says accidental activations are "highly unlikely" to count as consent `[S1 ¶30]` and that non-registered users' data should only be processed to execute their requests `[S1 ¶29]`.
- **Indicator/mute**: EDPB 02/2021 says it is "highly recommended" to inform users of device state with lights/icons/displays (¶51) and that state "should at all times be apparent", visual and acoustic (¶63) `[S1]`. No GDPR article I read, and no EDPB text, mentions a mute switch. Vendors: Home Assistant Voice PE has a hardware mute that "physically cuts power to the microphones" and an LED ring `[S13]`; Google documents a status indicator `[S17]`. In a browser, the W3C Media Capture spec says the User Agent MUST indicate capture state changes `[S21 §15]`.
- **Retention**: EDPB says data from a mistaken activation found in review "should be immediately deleted" (¶109) and that retention must be purpose-tied (¶95–98) `[S1]`. Google says audio snippets in standby "won't be sent or saved" `[S17]`. Home Assistant says its debug recording, when HA does the wake-word detection, saves everything the microphone picks up while waiting and "never deletes" it `[S14]`.
- **Older adults / reduced capacity**: Recital 75 names "vulnerable natural persons, in particular children" as a risk factor; Recital 38 is about children only `[S2 Rec 75, Rec 38]`. WP29 WP248 rev.01 criterion 7 explicitly lists "the elderly" among vulnerable data subjects `[S9 p.10]`; AP's DPIA page lists employees, children and patients as examples `[S19]`. EDPB 02/2021 lists "elderly people" as vulnerable users for transparency (¶52) and says VVAs "very likely" need a DPIA (¶141) `[S1]`. Dutch UAVG Art 5(2) moves consent to the legal representative for persons under curatele/bewind/mentorschap for matters they are incapable of `[S4]`.
- **Open-source / local-first**: Local processing reduces who receives data, but no primary source says it removes GDPR obligations from the software provider as such; EDPB 1/2020 draft ¶73 and Recital 18 say the provider of the means can still be controller/processor "when acting as" one `[S8 ¶73; S2 Rec 18]`.

---

## 1. What counts as processing before activation

**Technical description in EDPB 02/2021**
- Step 1 of the VVA flow: "the VVA is on standby. To be precise, it is constantly listening. However, until a specific wake-up expression has been detected no audio is transmitted out of the device receiving the voice and no other operation than wake-up expression detection is performed. For this purpose a buffer of a few seconds is used." `[S1 §2.3 ¶16]`
- Wake-up detection "takes place continuously from the moment the VVA is on, is carried out exclusively locally"; detection is probabilistic with "false rejection" and "false acceptance" `[S1 §2.4 ¶18]`. Providers often use a low first-pass threshold locally and a second, stricter pass on the server, so "unexpected and unwanted transmissions of data are likely to occur" `[S1 ¶19]`.
- EDPB notes accidental users: "saying the correct wake-up expression without knowing the VVA is active, or saying other words that are mistakenly identified by the VVA as the wake-up expression" `[S1 ¶37]`.

**GDPR definitions**
- Personal data = "any information relating to an identified or identifiable natural person"; processing = "any operation or set of operations … such as collection, recording, organisation, structuring, storage, adaptation or alteration, retrieval, consultation, use, disclosure by transmission …" `[S2 Art 4(1), 4(2)]`.
- Recital 26: identifiability takes account of "all the means reasonably likely to be used" `[S2 Rec 26]`.
- EDPB 02/2021: "Any interaction of a data subject with a VVA can fall under the scope of this definition" `[S1 ¶34]`; "voice data is inherently biometric personal data" `[S1 ¶31]` (but see tension noted in §Disagreements).
- Material scope: GDPR applies to processing "wholly or partly by automated means" `[S2 Art 2(1)]`.
- The EDPB guidelines do not state whether the few-second local buffer itself is "processing". They describe it as part of the operation and focus on transmission after activation `[S1 ¶16, ¶18, ¶117]`. ¶117: "If working as currently designed, VVAs do not send any information to the speech recognition cloud service until the wake-up expression is detected" `[S1 ¶117]`.

**ePrivacy Art 5(3) / Dutch Tw 11.7a**
- Directive 2002/58/EC Art 5(3): storing, or gaining access to information already stored, "in the terminal equipment of a subscriber or user is only allowed on condition that the subscriber or user concerned has given his or her consent, having been provided with clear and comprehensive information"; exceptions: sole purpose of transmission, or "strictly necessary in order for the provider of an information society service explicitly requested by the subscriber or user to provide the service" `[S3 Art 5(3)]`.
- Dutch implementation: Tw art. 11.7a(1) covers "via een elektronisch communicatienetwerk opslaan van of toegang verkrijgen tot informatie in de randapparatuur van een gebruiker"; (3)(b) exempts storage/access "strikt noodzakelijk … om de door de abonnee of gebruiker gevraagde dienst van de informatiemaatschappij te leveren" (text of the 2024-01-01 version) `[S6 art. 11.7a lid 1, 2, 3]`.
- EDPB 02/2021: Art 5(3) applies "whenever VVA stores or accesses information in the physical device linked to it" `[S1 ¶25]`; storing/accessing voice data requires consent "as a rule" with the two exceptions `[S1 ¶28]`; the exemption for "execute users' requests" is acknowledged `[S1 ¶29, ¶71]`; accidental activation: "highly unlikely that either of the exceptions … are applicable" `[S1 ¶30]`.
- EDPB 02/2021 fn 12: "It is possible that future VVA devices will adopt the edge computing paradigm and be capable of providing some service locally. In such event, it will be necessary to reassess the applicability of the e-Privacy Directive." `[S1 fn 12]`
- EDPB Guidelines 2/2023 (technical scope of Art 5(3)): "gaining access" arises when an entity instructs the terminal to send stored information, including by distributed software `[S5 ¶32–33]`; "storage" has no minimum duration or size and includes RAM `[S5 ¶37–38]`; "stored information" includes information produced by "sensors integrated into the terminal equipment or processes and programs executed on the terminal equipment" `[S5 ¶39]`.
- Same guidelines on local applications: use of microphone etc. via system APIs "strictly inside the terminal … would not constitute a 'gaining of access to information already stored' … as long as the information does not leave the device, but when this information or any derivation of this information is accessed, Article 5(3) ePD would apply" `[S5 ¶44]`. "Local processing": if processed information is "sent back over the network to a server", it is "gaining of access", and "The fact that this information is being produced locally does not preclude the application of Article 5(3)" `[S5 ¶52–53]`.
- Public network requirement: "The public availability of the communication network is necessary for the device to be considered a terminal equipment" `[S5 ¶26]`.
- Whether Art 5(3) applies to a purely on-device browser microphone pipeline that never transmits: EDPB 2/2023 ¶44 points to "no" for the access step; I found no EDPB/AP statement on browser-specific cases.

**Household exemption (Art 2(2)(c), Recital 18) and its limits**
- Art 2(2)(c): GDPR does not apply to processing "by a natural person in the course of a purely personal or household activity" `[S2 Art 2(2)(c)]`.
- Recital 18: "However, this Regulation applies to controllers or processors which provide the means for processing personal data for such personal or household activities." `[S2 Rec 18]`
- CJEU Ryneš (C-212/13, 11 Dec 2014; under Directive 95/46 Art 3(2) second indent): exception "must be narrowly construed" (¶29), applies "only where it is carried out in the purely personal or household setting of the person processing the data" (¶31); a camera covering even partially a public space "cannot be regarded as … purely 'personal or household'" (¶33) `[S10 ¶29–35]`.
- CJEU Jehovan todistajat (C-25/17): "personal or household" refers "to the activity of the person processing the personal data and not to the person whose data are processed" (¶41); activity not purely personal "where its purpose is to make the data collected accessible to an unrestricted number of people or where that activity extends, even partially, to a public space" (¶42, citing Lindqvist C-101/01 ¶47) `[S11 ¶40–42]`.
- EDPB 3/2019 (video devices): exemption "must be narrowly construed" (¶12); video devices inside a private person's premises "may fall under the household exemption", depending on personal relationship with data subjects, scale/frequency suggesting professional activity, and potential adverse impact; "an overall assessment is needed" (¶13) `[S12 ¶11–13]`.
- EDPB draft 1/2020 (connected vehicles, v1.0 for consultation): applications with local processing where data are not transferred to a controller or processor "fall outside the scope of the GDPR" (¶71), but "it does apply to controllers or processors, which provide the means for processing personal data for such personal or household activities (car manufacturers, service provider, etc.)", who "must develop secure in-car application and with due respect to the principle of privacy by design and by default" (¶73) `[S8 ¶70–73]`. (Final v2.0 text not retrieved; see Gaps.)
- AP, on its public page about publishing personal data: household exception applies only if the activity is private, solely for own personal/household purposes, and visible to a limited circle `[S20]`.
- EDPB 02/2021 does not mention the household exemption (searched full text for "household/domestic/Article 2(2)"; only an unrelated mention of "people speaking in the household" in ¶131) `[S1 ¶131]`.

**Adjacent Dutch criminal-law text (not GDPR; verified text only, application unverified)**
- Wetboek van Strafrecht art. 139a(1): punishes whoever with a technical device intentionally listens to a conversation held in a dwelling, "anders dan in opdracht van een deelnemer aan dat gesprek", or records it without being a participant. Art. 139a(2)(2°) excludes recording "met een technisch hulpmiddel dat op gezag van degene bij wie de woning … in gebruik is, niet heimelijk aanwezig is" except in case of "kennelijk misbruik" `[S22 art. 139a lid 1, 2]`. I found no case law or AP/EDPB text applying this to voice assistants.

## 2. Does on-device wake-word / VAD buffering avoid personal-data processing?

**What the primary sources actually say**
- EDPB: local detection only, nothing transmitted pre-wake, buffer "of a few seconds" `[S1 ¶16, ¶18]`. The EDPB does not conclude that this phase is non-processing; it does state that accidental/false activations are a source of "unexpected and unwanted transmissions" and that for accidental activation consent is highly unlikely to be valid `[S1 ¶19, ¶30]`.
- EDPB 2/2023 on Art 5(3): purely in-device microphone use is not "gaining access" unless the data or a derivation leaves the device `[S5 ¶44]` (this addresses ePrivacy, not GDPR Art 4(2)).
- GDPR Art 2(2)(c) and Recital 18 may take the *user's own* purely personal activity out of scope while leaving the provider of the means in scope `[S2 Art 2(2)(c), Rec 18]`.
- I found no EDPB, AP or CJEU text stating that RAM-only pre-activation buffering is or is not "processing" under Art 4(2).

**Vendor / project statements (first-party)**
- Google: "In standby mode, the device processes short snippets of audio (a few seconds) to detect an activation … If no activation is detected, then those audio snippets won't be sent or saved to Google." `[S17 section "Data security and privacy on devices that work with Assistant", standby paragraph]`
- Apple: "A very small speech recognizer runs all the time and listens for just those two words." On iPhone a low-power Always-On Processor runs a small detector and wakes the main processor, which "analyzes the signal using a larger DNN"; if the Siri server's recognizer hears something other than "Hey Siri" "the server sends a cancellation signal to the phone" `[S16 sections "The Detector", "Hey Siri Personalized" / server check]`. The same article says the always-on detector "respond[s] whenever anyone in the vicinity says the trigger phrase" and that enrollment examples are saved on the device `[S16 "Hey Siri Personalized"]`. Apple's description of the buffer length / pre-roll: **unverified** (not found in fetched Apple pages).
- Amazon Alexa: first-party pages (amazon.com help, Alexa privacy pages) returned 403/503 to automated fetch (with an explicit "automated access" notice) and were not circumvented. All Alexa claims: **unverified**.
- Home Assistant (official docs):
  - Architecture default: "the wake word detection is done inside Home Assistant. Voice satellite devices constantly sample current audio in your room for voice. When it detects voice, the satellite sends audio to Home Assistant where it checks if the wake word was said" `[S13a "The approach"]`. I.e. in the default HA design, audio can leave the satellite *before* wake-word confirmation (to the user's own HA server, on the LAN).
  - Exception: "Mobile devices like Android phones use microWakeWord for on-device wake word detection … Only after the wake word is detected does the device send audio to Home Assistant" `[S13a "Exception for mobile devices"]`; Android page: "which means your audio stays private and no audio is sent to Home Assistant until after the wake word is detected"; it "continuously monitors audio" and "runs entirely on your Android device" `[S15 "About wake word detection on Android"]`.
  - Wyoming satellite (project now marked unmaintained, replaced by Linux Voice Assistant): "Audio will be continuously streamed to the server, where wake word detection, etc. will occur"; with `--vad` "audio will only start streaming once speech has been detected"; with local wake word "Audio will only be streamed to the server after the wake word has been detected" `[S23 README "Remote Wake Word Detection", "Local Wake Word Detection"]`.
  - Source: `WakeWordSettings.audio_seconds_to_buffer: float = 0` — "Seconds of audio to buffer before detection and forward to STT" (default 0) `[S24 models.py class WakeWordSettings]`.

## 3. Consent / legal basis for household members and visitors

**GDPR text**
- Consent = "freely given, specific, informed and unambiguous indication … by a statement or by a clear affirmative action" `[S2 Art 4(11)]`; controller must be able to demonstrate it (Art 7(1)); withdrawal "as easy … as to give" (Art 7(3)) `[S2 Art 7]`; Recital 32: "Silence, pre-ticked boxes or inactivity should not therefore constitute consent" `[S2 Rec 32]`.
- Art 9(1): "biometric data for the purpose of uniquely identifying a natural person" is special-category; Art 9(2)(a) explicit consent `[S2 Art 9(1), 9(2)(a)]`. Recital 51: photographs etc. are biometric data "only when processed through a specific technical means allowing the unique identification or authentication" `[S2 Rec 51]`.

**EDPB 02/2021**
- Three classes of data subjects: registered users, non-registered users, and accidental users `[S1 ¶37]`; multiple users incl. "family", "an adult, a child, an elder or a disable person" `[S1 ¶38]`.
- Controllers must inform all users, "not only the user setting up the VVA" `[S1 ¶49, ¶58–59]`; they should inform non-registered/accidental users "at the earliest time possible and at the latest, at the time of the processing"; EDPB acknowledges this "could be especially difficult to fulfil in practice" `[S1 ¶59]`.
- Legal-basis analysis for executing requests: Art 5(3) exemption (¶29, ¶71) and Art 6(1)(b) contract with a registered user (¶74–75); "When using a VVA does not require to previously configure a user account … consent could be a possible legal basis" `[S1 ¶78]`. "Data controllers would need to attribute consent to specific users. Consequently, data controllers should only process non-registered users data to execute their requests." `[S1 ¶29]`
- Accidental activation: "highly unlikely that an accidental activation could be interpreted as a valid consent" `[S1 ¶30]`.
- Voice identification: biometric processing, "only data subjects' explicit consent seems applicable" `[S1 ¶81–82]`; explicit consent under Art 9(2)(a) with Art 7 conditions "and should offer an alternative identification method to biometrics" `[S1 ¶128]`. Speaker recognition "may require the voice biometrics of people speaking in the household to be recorded", "subjecting uninformed persons to biometric processing" `[S1 ¶130–131]`. EDPB: "biometric recognition is only activated at each use at the user's initiative, and not by a permanent analysis of the voices heard" `[S1 ¶132]`. "Voice models should be generated, stored and matched exclusively on the local device, not in remote servers" `[S1 ¶133]`. Accuracy/bias checks across demographic groups `[S1 ¶135]`.
- Separate opt-in per purpose (manual review, voice identification) `[S1 ¶90]`.
- EDPB 02/2021 contains **no** text on "guest mode" or visitor-specific controls (searched "guest").
- Vendor guest-mode documentation: **unverified** (not fetched for Google/Amazon/Apple).
- Apple: audio of "Recognize My Voice" setup syncs end-to-end encrypted across devices `[S15a Apple "Siri, Dictation & Privacy", sync paragraph]`; HA: no voice-ID found in pages read.

## 4. Visible listening indicator and mute

**Binding vs guidance**
- GDPR articles read (5(1)(a), 12(1), 13, 25) set transparency and by-design duties but contain no express listening-indicator or mute-control requirement `[S2 Art 5, 12, 13, 25]`. Art 12(1): information in "concise, transparent, intelligible and easily accessible form" `[S2 Art 12(1)]`; Art 25(2): by default only necessary data are processed (amount, extent, storage period, accessibility) `[S2 Art 25(2)]`; Recital 78 encourages producers to take data protection into account in design `[S2 Rec 78]`.
- EDPB 02/2021 (guidelines; preamble cites Art 70(1)(e),(j) GDPR): VVAs "going through a number of states" with "substantial asymmetry of information with the user, who is hardly aware if the device is listening" (¶50). "It is highly recommended that VVA designers and developers take adequate steps to fill those asymmetries … broadcasting the status of the machine with specific signals … visible icons or lights, or the use of displays on the device" (¶51). "Users should be able to determine whether a VVA is currently listening on its closed-loop circuit and especially whether it is streaming information to its back-end … all user feedback, including state changes should be available in visual and acoustic form at least" (¶63). Relevance to vulnerable users flagged at ¶52 `[S1 ¶50–52, ¶63]`.
- EDPB 02/2021 does not mention a mute switch / microphone kill switch (searched "mute", "switch").
- AP (IoT set-up page): devices with "geavanceerde microfoons … gekoppeld aan spraakherkenningssystemen" can capture data of others; "Stel uw apparaat zo af dat het de privacy van anderen niet aantast" `[S18b]`.

**Browser layer (relevant to a browser-based assistant)**
- W3C Media Capture and Streams §15 "Privacy Indicator Requirements": "The User Agent MUST indicate to the user when the value of anyAccessible changes. The User Agent MUST indicate to the user when the value of anyLive changes."; transitions indicated for "at least 3 seconds" (SHOULD); ongoing indication is "encouraged" (not required) `[S21 §15]`. This binds user agents implementing the spec, not web apps, and is a technical spec rather than law.

**Vendor / project practice**
- Home Assistant Voice Preview Edition: "Mute switch — Physically cuts power to the microphones for guaranteed privacy"; "Multicolored LED ring displays when it's listening" `[S13 "Mute switch", "Visual feedback"]`; blog: mute switch "physically cuts power to the microphone for ultimate privacy" `[S13b]`.
- Google: "The status indicator on your device lets you know when Google Assistant is activated"; examples: on-screen indicator or flashing LEDs `[S17 standby paragraph; "What are some types of activation methods?"]`. Google hardware mic-mute switch documentation: **unverified** (no live page found).
- Apple, Amazon (light ring / mic-off button): **unverified** at first-party source.
- HA 2023 blog: "To start, [the most private voice assistant] should only listen when you're ready to talk, rather than all the time" (push-to-talk device) `[S13c "World's Most Private Voice Assistant"]`.

**Radio Equipment Directive / EN 18031 (checked for relevance)**
- Directive 2014/53/EU Art 3(3)(e): radio equipment within specified categories "incorporates safeguards to ensure that the personal data and privacy of the user and of the subscriber are protected" `[S25 Art 3(3)(e)]`. Delegated Regulation (EU) 2022/30 Art 1(2)(a) applies 3(3)(e) to internet-connected radio equipment "capable of processing … personal data" (Recital 10 mentions microphones/speakers) `[S26 Art 1(2); Recitals 10–11]`. As published, Art 3 says it applies from 1 August 2024 `[S26 Art 3]` (a later postponement to 2025 is **unverified** here).
- Implementing Decision (EU) 2025/138 recital (3): EN 18031-1/-2/-3:2024 support Art 3(3)(d)/(e)/(f) respectively `[S27 recital 3]`. The content of EN 18031-2 is paywalled and was **not read**; I found no indicator/mute requirement in the legal texts read. These instruments attach to radio equipment (the tablet/hardware), not to a software-only project as such; whether and how they reach a software supplier was not examined (unverified).

## 5. Retention of pre-activation audio

**GDPR**
- Art 5(1)(c) data minimisation: "adequate, relevant and limited to what is necessary"; Art 5(1)(e) storage limitation: identifiable form "for no longer than is necessary for the purposes" `[S2 Art 5(1)(c),(e)]`. Art 25(2) default covers "the period of their storage" `[S2 Art 25(2)]`.

**EDPB 02/2021**
- Retention periods tied to purposes; "assess the maximum retention period for each data set and purpose" (¶95); minimisation of "type and quantity" (¶96); indefinite default retention "goes against the storage limitation principle" (¶98) `[S1 ¶95–98]`.
- After a query is answered "the personal data should be deleted unless the VVA designer or developer has a valid legal basis" (¶106); config defaults "an absolute minimum of stored user information" (¶108); "When during the review process the VVA provider or developer detects a recording originated on a mistaken activation, the recording and all the associated data should be immediately deleted and not used for any purpose" (¶109) `[S1 ¶106–109]`.
- Accidentally collected personal data should be deleted if no valid legal basis (executive summary; ¶30) `[S1 p.4; ¶30]`. By-default VVA "would store neither voice data nor a register of executed commands" (¶145) `[S1 ¶145]`.
- Background noise/other speakers: designers "should consider technologies deleting the background noise" (¶139); minimisation incl. not deriving mental state/disease from voice (¶136) `[S1 ¶136–139]`.
- No EDPB paragraph sets a retention period for the local few-second buffer.

**Vendors**
- Google: standby snippets "won't be sent or saved"; accidental activations can be deleted via "Hey Google, that wasn't for you" if Web & App Activity is on; users can auto-delete activity `[S17 standby; "might activate when you didn't intend it"; "deleted automatically"]`. Google speech-model page: under "ephemeral learning" audio samples sent to server RAM "are deleted from short-term memory within minutes" (this concerns post-activation audio processed on servers) `[S17b "Ephemeral learning"]`.
- Apple: "Your audio data is not stored by Apple unless you opt in to Improve Siri and Dictation"; related request data "may" be retained "for up to two years" under a rotating random identifier `[S15a "Siri and Dictation"]`. 2019 newsroom: Apple "will … work to delete any recording which is determined to be an inadvertent trigger of Siri"; after six months device data is disassociated from the random identifier `[S15b]`.
- Amazon: retention/auto-delete settings and false-activation handling: **unverified** (first-party pages blocked). EDPB cites Amazon's 28 June 2019 letter on deletion limits (fn 34) but I could not open it `[S1 fn 34]`.
- Home Assistant: debug recordings save "everything the microphone picks up while it's waiting for the wake word … Home Assistant never deletes the recordings" `[S14 "Debug recordings"]`; HA Cloud: partner speech service "does not retain or store your data" and HA Cloud "does not keep any record of your voice, data, or commands" `[S13 FAQ "How does Home Assistant Cloud maintain my privacy with voice?"]`.

## 6. Added care for older adults / people with reduced capacity

**GDPR**
- Recital 75: risks arise "where personal data of vulnerable natural persons, in particular of children, are processed"; also where data subjects "might be deprived of their rights and freedoms or prevented from exercising control" `[S2 Rec 75]`. Recital 38 specific protection is for children only `[S2 Rec 38]`. Recital 43: consent presumed not freely given where there is "a clear imbalance" or no separate consent for separate operations `[S2 Rec 43]`. Art 6(1)(f) balancing singles out children `[S2 Art 6(1)(f)]`.
- Art 35(1): DPIA where processing, "in particular using new technologies", "is likely to result in a high risk"; Art 35(3)(b) large-scale special-category processing; Art 35(7) minimum content; Art 35(9) seek views of data subjects "where appropriate" `[S2 Art 35]`.

**WP29 / EDPB / AP DPIA criteria**
- WP248 rev.01 criterion 7: "Vulnerable data subjects may include children …, employees, more vulnerable segments of the population requiring special protection (mentally ill persons, asylum seekers, or the elderly, patients, etc.), and in any case where an imbalance in the relationship between the position of the data subject and the controller can be identified." Criterion 8: new technology; "certain 'Internet of Things' applications could have a significant impact on individuals' daily lives and privacy; and therefore require a DPIA" `[S9 p.10 criteria 7–8]`.
- AP DPIA page: "Als vuistregel geldt dat u een DPIA moet uitvoeren als uw verwerking aan 2 of meer van deze criteria voldoet"; criterion 7 "Gegevens over kwetsbare personen" examples "werknemers, kinderen en patiënten"; criterion 8 notes IoT applications can require a DPIA `[S19 "De 9 criteria van toezichthouders voor DPIA", crit. 7–8]`. AP mandatory list (Stcrt. 2019, 64418) item 14 "Internet of things": "Grootschalige verwerkingen en/of stelselmatige monitoring van persoonsgegevens … gegenereerd door apparaten die verbonden zijn met internet … zoals slimme televisies, slimme huishoudelijke apparaten …" (large-scale and/or systematic only) `[S19b item 14]`.
- EDPB 02/2021: transparency issues "especially relevant considering the plurality of users and the presence among them of vulnerable categories of individuals, such as children, elderly people or users with audio-visual disabilities" (¶52); "It is very likely that VVA services fall into the categories … needing a DPIA", incl. "systematic monitoring", "new technology", "sensitive data and data concerning vulnerable data subjects" (¶141); voice interfaces can help "people with disabilities or dependency" (¶4) `[S1 ¶4, ¶52, ¶141]`. State-visibility to be accessible to people with disabilities (¶63) `[S1 ¶63]`.
- EDPB 05/2020 (consent) ¶124 references "vulnerable natural persons, especially children" in the context of Art 8; the guidelines (searched) contain no elderly-specific or capacity-specific consent guidance `[S28 ¶124]`.
- AP "Een 'slim' apparaat kopen": privacy risk "nog groter" if vulnerable persons use the device "zoals kinderen of mensen met een beperking", or the device records others "zoals uw huisgenoten, buurtgenoten, bezoekers of passanten" `[S18a section "Gegevens registreren en doorsturen"]`.
- I found no AP page specific to voice assistants or always-listening devices.

**Capacity under Dutch law**
- UAVG art. 5(2): if the data subject is "onder curatele is gesteld, dan wel ten behoeve van de betrokkene een bewind of mentorschap is ingesteld", for any consent under Art 4(11) GDPR "in de plaats van de toestemming van de betrokkene, die van zijn wettelijk vertegenwoordiger is vereist, voor zover het een aangelegenheid betreft waarvoor de betrokkene onbekwaam dan wel onbevoegd is"; art. 5(3)(c): withdrawal by the legal representative in that case `[S4 art. 5 lid 2, 3]`.
- WGBO / Burgerlijk Wetboek capacity rules (e.g. Boek 7 Titel 7 Afdeling 5): **not fetched; unverified**, and they concern medical-treatment relationships rather than consumer software.

**EU AI Act (Regulation (EU) 2024/1689), checked for relevance to voice emotion / biometrics (text as published in the OJ; later amendments not checked)**
- Art 3(39) "emotion recognition system": purpose of "identifying or inferring emotions or intentions … on the basis of their biometric data" `[S29 Art 3(39)]`.
- Art 5(1)(b) prohibits AI systems exploiting "vulnerabilities … due to their age, disability or a specific social or economic situation" with the objective or effect of materially distorting behaviour causing significant harm; Art 5(1)(f) prohibits inferring emotions "in the areas of workplace and education institutions" (home use not named); Art 5(1)(g) restricts biometric categorisation inferring race, political opinions, etc. `[S29 Art 5(1)(b),(f),(g)]`.
- Art 50(1): providers must ensure AI systems intended to interact directly with natural persons inform them they are interacting with AI "unless this is obvious"; Art 50(3): deployers of emotion recognition / biometric categorisation systems must inform exposed persons `[S29 Art 50(1),(3)]`.
- Art 113: Regulation applies from 2 August 2026 (Chapters I–II from 2 February 2025) as published `[S29 Art 113]`.
- EDPB 02/2021 ¶48, ¶68, ¶136: patented technologies infer health/emotional state from voice; unforeseen purposes such as "sentiment analysis or health condition assessment" are "far beyond the reasonable user expectations"; minimisation: do not derive "mental state, possible disease or circumstances of their life" `[S1 ¶48, ¶68, ¶136]`.

## 7. Controller picture when software is open source and runs on the user's own device

- GDPR Art 4(7): controller = "natural or legal person … which, alone or jointly with others, determines the purposes and means of the processing"; Art 4(8) processor "on behalf of the controller" `[S2 Art 4(7),(8)]`.
- EDPB 7/2020: "It is not necessary that the controller actually has access to the data that is being processed" (¶45; also ¶56 for joint controllership: "The fact that one of the parties does not have access to personal data processed is not sufficient to exclude joint controllership"); "determinative influence on the purpose and (essential) means" makes a controller; "non-essential means" (type of hard/software, detailed security measures) can be left to a processor `[S7 ¶45, ¶56; section on essential/non-essential means p.15]`. CJEU Jehovan todistajat: a community was a joint controller with members for door-to-door data collection (cited in EDPB 7/2020 ¶56) `[S7 ¶56]`.
- EDPB 02/2021 VVA roles: provider/designer, app developer, integrator, owner, user `[S1 ¶15]`; roles case-by-case, "designer may act as a data controller when determining the purposes and means of a processing" `[S1 ¶41–42]`; own-purpose use (e.g. improving the VVA with data) makes the designer a controller for that processing `[S1 Example 3]`. Stakeholders must "clearly decide and inform data subjects" of roles `[S1 ¶41]`.
- Household exemption for the end-user (Art 2(2)(c)) and provider-of-means language (Rec 18) as in §1 `[S2 Art 2(2)(c), Rec 18; S8 ¶71, ¶73]`.
- Where data does not leave the device and the provider receives no data: no EDPB/AP text I found resolves whether an open-source maintainer is a controller, processor or neither. EDPB 7/2020 and 02/2021 contain no mention of open-source distribution (searched "open source"; the only hits are unrelated footnotes). Recital 78: producers of products "should be encouraged to take into account the right to data protection" so that controllers/processors can comply `[S2 Rec 78]`.
- If a user-chosen cloud speech service (e.g. HA Cloud / other STT/LLM) is used, EDPB 02/2021 ¶42–43 on multiple independent controllers and information duties would be the relevant reference; HA documents Home Assistant Cloud as using Microsoft Azure speech under commercial terms with no retention `[S13 FAQ]`.

---

## Disagreements / gaps / unverified

**Tensions between sources**
1. EDPB 02/2021 ¶18 describes wake-word detection as "carried out exclusively locally", whereas Home Assistant's default architecture streams VAD-gated audio from the satellite to the HA server where wake-word detection occurs `[S1 ¶18; S13a "The approach"; S23]`. The EDPB also describes two-pass server confirmation (¶19), so "exclusively locally" is not the only pattern it recognises.
2. EDPB 02/2021 ¶31 states "voice data is inherently biometric personal data" while its own footnote 31 and ¶81/¶128 say special-category status depends on processing "for the purpose of uniquely identifying" (citing Recital 51's reasoning "The same reasoning applies to voice") `[S1 ¶31, fn 31, ¶81, ¶128; S2 Art 9(1), Rec 51]`.
3. EDPB 02/2021 ¶25–28 treats Art 5(3) as applying to VVAs that send voice to the cloud; EDPB 2/2023 ¶44 treats in-device microphone use that does not leave the device as not "gaining access". They address different fact patterns and I found no EDPB text reconciling them for fully local VVAs beyond fn 12 `[S1 ¶25–28, fn 12; S5 ¶44]`.
4. WP248 criterion 7 names "the elderly"; AP's Dutch DPIA page lists employees, children and patients as examples without naming older adults; Recital 38 covers children only; Recital 75 says "vulnerable natural persons, in particular children" `[S9 p.10; S19; S2 Rec 38, Rec 75]`.

**Not found / not addressed in primary sources**
- No EDPB/AP/CJEU statement on whether RAM-only pre-activation audio buffers are "processing" under Art 4(2) (EDPB only describes them, ¶16, ¶18).
- EDPB 02/2021 has no text on: household exemption, mute switches, guest mode, retention length of the local buffer, or open-source/self-hosted deployments (full-PDF searches).
- No AP page specific to voice assistants or always-listening devices found (AP site pages read: IoT, set up/buy smart devices, DPIA, DPIA list, household-exception page for publishing). Dutch case law and AP enforcement decisions on voice assistants were not searched.
- No binding rule requiring a listening indicator or mute control found in GDPR, ePrivacy, Tw, or the RED legal texts read.
- EDPB final Guidelines 1/2020 v2.0 not retrieved; draft v1.0 (consultation) cited for ¶70–73 `[S8]`. Final wording unverified.
- CJEU Lindqvist (C-101/01) not fetched directly (Cellar returned 404); its ¶47 is cited only as quoted in Jehovan todistajat ¶42 and EDPB 3/2019 fn 4 `[S11 ¶42; S12 fn 4]`. Planet49 (C-673/17) not reviewed.
- Amazon Alexa first-party documentation (wake-word handling, pre-roll buffer, mic-off button, light ring, retention, false-activation settings): **unverified**. amazon.com / amazon.nl / amazon.co.uk help pages returned 403/503 with an automated-access notice; not circumvented.
- Apple pre-activation buffer length/pre-roll, light/mute behaviour on HomePod: **unverified**. Google hardware mic-mute switch page and guest-mode docs: **unverified**.
- EN 18031-1/-2/-3 content: **unverified** (only the Commission decision referencing them was read). Application date of RED Delegated Regulation 2022/30 after any postponement: **unverified**.
- EU AI Act: only the OJ text as originally published was read; later amendments/postponements (if any) were not checked. Applicability of Art 50 to a given assistant not assessed.
- Dutch WGBO / Burgerlijk Wetboek capacity rules: not fetched. Only UAVG art. 5 verified.
- Tw 11.7a read in the 2024-01-01 consolidated version only; later amendments not checked.
- Wetboek van Strafrecht art. 139a text verified; no source found applying it to voice assistants.

**Access notes**
- EUR-Lex (eur-lex.europa.eu) returned an anti-bot challenge (HTTP 202, empty body). Official OJ texts were retrieved from the Publications Office Cellar (`publications.europa.eu/resource/celex/<CELEX>` with `Accept: application/xhtml+xml`); the EUR-Lex URLs below are the canonical citations for the same texts.
- Home Assistant docs are live web pages (not versioned snapshots); core source was read from the `dev` branch.

---

## Sources

Key | Document | URL
---|---|---
S1 | EDPB Guidelines 02/2021 on virtual voice assistants, v2.0 (adopted 7 July 2021) | https://www.edpb.europa.eu/system/files/documents/2021-07/edpb_guidelines_202102_on_vva_v2.0_adopted_en.pdf (landing page: https://www.edpb.europa.eu/public-consultations/guidelines-022021-on-virtual-voice-assistants_en)
S2 | Regulation (EU) 2016/679 (GDPR), Arts 2, 4, 5, 6, 7, 9, 12, 13, 25, 35; Recitals 18, 26, 32, 38, 43, 51, 58, 75, 78, 91 | https://eur-lex.europa.eu/eli/reg/2016/679/oj (retrieved via http://publications.europa.eu/resource/celex/32016R0679)
S3 | Directive 2002/58/EC consolidated (incl. 2009/136/EC), Art 5 | https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02002L0058-20091219 (retrieved via http://publications.europa.eu/resource/celex/02002L0058-20091219)
S4 | Uitvoeringswet AVG, art. 5 (Toestemming van wettelijk vertegenwoordiger) | https://wetten.overheid.nl/jci1.3:c:BWBR0040940&hoofdstuk=1&artikel=5
S5 | EDPB Guidelines 2/2023 on Technical Scope of Art. 5(3) of ePrivacy Directive (v2.0) | https://www.edpb.europa.eu/system/files/documents/2024-10/edpb_guidelines_202302_technical_scope_art_53_eprivacydirective_v2_en_0.pdf
S6 | Telecommunicatiewet art. 11.7a (version 2024-01-01) | https://wetten.overheid.nl/BWBR0009950/2024-01-01
S7 | EDPB Guidelines 07/2020 on the concepts of controller and processor (v2.1) | https://www.edpb.europa.eu/system/files/documents/2023-10/EDPB_guidelines_202007_controllerprocessor_final_en.pdf
S8 | EDPB Guidelines 1/2020 connected vehicles, v1.0 (public-consultation version; final v2.0 not retrieved) | https://www.edpb.europa.eu/system/files/consultation/edpb_guidelines_202001_connectedvehicles.pdf
S9 | Article 29 WP, Guidelines on DPIA, WP248 rev.01 (endorsed by EDPB) | https://ec.europa.eu/newsroom/article29/redirection/document/47711
S10 | CJEU C-212/13 Ryneš, 11 Dec 2014 | https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62013CJ0212 (retrieved via Cellar celex/62013CJ0212)
S11 | CJEU C-25/17 Jehovan todistajat | https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62017CJ0025 (retrieved via Cellar celex/62017CJ0025)
S12 | EDPB Guidelines 3/2019 on video devices | https://www.edpb.europa.eu/system/files/documents/files/file1/edpb_guidelines_201903_video_devices_en_0.pdf
S13 | Home Assistant Voice Preview Edition page (mute switch, LED ring, privacy FAQ) | https://www.home-assistant.io/voice-pe/
S13a | Home Assistant, "The Home Assistant approach to wake words" | https://www.home-assistant.io/voice_control/about_wake_word/
S13b | Home Assistant blog, "The era of open voice assistants has arrived" (Voice PE) | https://www.home-assistant.io/blog/2024/12/19/voice-preview-edition-the-era-of-open-voice/
S13c | Home Assistant blog, "Year of the Voice – Chapter 2: Let's talk" | https://www.home-assistant.io/blog/2023/04/27/year-of-the-voice-chapter-2/
S14 | Home Assistant, Assist pipeline integration docs ("Debug recordings") | https://www.home-assistant.io/integrations/assist_pipeline/
S15 | Home Assistant, Assist on Android (on-device microWakeWord) | https://www.home-assistant.io/voice_control/android/
S15a | Apple, "Siri, Dictation & Privacy" | https://www.apple.com/legal/privacy/data/en/ask-siri-dictation/
S15b | Apple Newsroom, "Improving Siri's privacy protections" (Aug 2019) | https://www.apple.com/newsroom/2019/08/improving-siris-privacy-protections/
S16 | Apple Machine Learning Research, "Hey Siri: An On-device DNN-powered Voice Trigger for Apple's Personal Assistant" | https://machinelearning.apple.com/research/hey-siri
S17 | Google Home & Nest Help, "Data security and privacy on devices that work with Assistant" | https://support.google.com/googlenest/answer/7072285?hl=en
S17b | Google Assistant Help, "Learn how Google improves speech models" | https://support.google.com/assistant/answer/10176224?hl=en
S18a | AP, "Een 'slim' apparaat kopen" | https://www.autoriteitpersoonsgegevens.nl/themas/internet-slimme-apparaten/internet-of-things/een-slim-apparaat-kopen
S18b | AP, "Een 'slim' apparaat instellen" | https://www.autoriteitpersoonsgegevens.nl/themas/internet-slimme-apparaten/internet-of-things/een-slim-apparaat-instellen
S19 | AP, "Data protection impact assessment (DPIA)" | https://www.autoriteitpersoonsgegevens.nl/themas/basis-avg/praktisch-avg/data-protection-impact-assessment-dpia
S19b | AP, Besluit lijst verplichte DPIA, Stcrt. 2019, 64418 (27 Nov 2019) | https://www.autoriteitpersoonsgegevens.nl/uploads/imported/stcrt-2019-64418.pdf
S20 | AP, "Persoonsgegevens publiceren en verwijderen" (section "Persoonlijk of huishoudelijk gebruik") | https://www.autoriteitpersoonsgegevens.nl/themas/internet-slimme-apparaten/persoonsgegevens-op-internet/persoonsgegevens-publiceren-en-verwijderen
S21 | W3C Media Capture and Streams (Candidate Recommendation Draft, 12 Nov 2026), §15 Privacy Indicator Requirements | https://www.w3.org/TR/mediacapture-streams/
S22 | Wetboek van Strafrecht art. 139a | https://wetten.overheid.nl/jci1.3:c:BWBR0001854&titeldeel=V&artikel=139a
S23 | rhasspy/wyoming-satellite README (project marked no longer maintained) | https://github.com/rhasspy/wyoming-satellite/blob/master/README.md
S24 | home-assistant/core `assist_pipeline/models.py` (class `WakeWordSettings`), `dev` branch | https://github.com/home-assistant/core/blob/dev/homeassistant/components/assist_pipeline/models.py
S25 | Directive 2014/53/EU (RED), Art 3(3) | https://eur-lex.europa.eu/eli/dir/2014/53/oj (retrieved via Cellar celex/32014L0053)
S26 | Commission Delegated Regulation (EU) 2022/30, Arts 1, 3; Recitals 10–11 | https://eur-lex.europa.eu/eli/reg_del/2022/30/oj (retrieved via Cellar celex/32022R0030)
S27 | Commission Implementing Decision (EU) 2025/138 (EN 18031-1/-2/-3:2024), recital 3 | https://eur-lex.europa.eu/eli/dec_impl/2025/138/oj (retrieved via Cellar celex/32025D0138)
S28 | EDPB Guidelines 05/2020 on consent | https://www.edpb.europa.eu/system/files/documents/files/file1/edpb_guidelines_202005_consent_en.pdf
S29 | Regulation (EU) 2024/1689 (AI Act), Arts 3(39), 5(1)(b),(f),(g), 50, 113 | https://eur-lex.europa.eu/eli/reg/2024/1689/oj (retrieved via Cellar celex/32024R1689)
