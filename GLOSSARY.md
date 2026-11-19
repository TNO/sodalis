# Sodalis

Sodalis distinguishes avatar runtime compatibility from approval to distribute an asset.

## Avatar assets

**Profile-valid avatar**:
An avatar asset that satisfies the Sodalis Avatar Profile's structural and runtime compatibility checks. This status alone does not establish its licensing, visual quality, or suitability for distribution.

**Distribution-approved avatar**:
An avatar whose component rights permit the intended distribution and whose appearance and conversational animation have been reviewed and approved. A distribution-approved avatar must also be profile-valid.

**Prototype-only avatar**:
An avatar usable for a restricted prototype but not approved for commercial distribution, even if it is profile-valid.

## Interaction

**Activation**:
The moment Sodalis starts listening to a user's speech for a turn, whether prompted by the user, a household device, or Sodalis itself.

**Activation mode**:
The deliberate action or event that starts a listening period.

**Button activation**:
Starting a listening period through a deliberate button action rather than a spoken trigger.

**Physical-button activation**:
Button activation using a separate physical control rather than an on-screen control.

**False activation**:
An activation the user did not intend, in any mode: a wake word triggered by background sound, speech not addressed to Sodalis, or an unwanted prompt from Sodalis.

**Eagerness**:
How often a mode produces false activations. An eager mode irritates users.

**Pre-activation audio**:
Sound the device hears before an activation. Whether it leaves the device, how long it is held, and whether it is kept are the heart of a mode's privacy cost.

**Activation latency**:
The time from the end of the trigger to a visible and audible sign that Sodalis is listening.

**Missed activation**:
An intended activation that Sodalis did not register, forcing the user to retry.

**Activation effort**:
The deliberate actions (touches, spoken attempts, waiting) a user spends, retries included, to get Sodalis listening. Lower is better, especially for older adults.

**Enrolment**:
Recording a few samples of a person saying the wake phrase so Sodalis recognises that person's voice saying it.

**Standing open microphone**:
A microphone that is always on and treats any speech it hears as a possible turn, with no wake word or other trigger.

**Listening window**:
A short, bounded period after an activation or a prompt from Sodalis in which the user can speak without a new trigger.

**Avatar-initiated prompt**:
Sodalis speaking first, from a reminder, a household event or alert rule, or an inferred intent to talk, rather than in reply to the user. An unwanted one counts as a false activation.

**Administrator**:
The person responsible for installing Sodalis and setting up integrations that are not configured through the ordinary user interface.

**Trial period**:
A stretch of real use with a real signal, long enough to count a mode's false activations per waking hour before it is switched on for people.
_Avoid_: Soak

**Barge-in**:
The user speaking over Sodalis while it replies, which stops its speech and starts listening. It applies to replies marked interruptible and works only while a turn is active.
