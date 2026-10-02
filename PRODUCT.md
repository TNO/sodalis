# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

The user prefers TypeScript and pnpm, Mithril with mithril-materialized for
the frontend, Hono for backend capabilities where useful, and Rust for
performance-critical work. These are preferences rather than hard
requirements. The initial desktop host uses Vite; backend choices remain
deferred.

## Users

Sodalis is primarily for older adults who want digital tools to be easier to
use and more supportive. The interface must also remain useful to people with
different abilities and to general users.

## Product Purpose

Sodalis is a local-first, browser-based personal desktop with an embodied
conversational assistant. It helps people operate digital applications through
both a traditional GUI and natural conversation.

## Positioning

Sodalis integrates the desktop, trusted applications, assistant, avatar,
speech, and personal context as one platform. Cooperating apps can provide
semantic context so the assistant can help without relying on screenshots or
exposing arbitrary DOM.

## Operating Context

People use Sodalis in a browser to work with everyday applications such as
mail, calendar, contacts, photos, and home controls. Voice is expected to be a
primary input route; the GUI remains available and independently usable.
Assistant responses may be spoken and optionally shown as captions.

## Capabilities and Constraints

- Prefer local processing and storage; cloud integrations are optional.
- Keep LLM, speech, avatar, mail, memory, and home providers replaceable.
- Trusted apps expose structured semantic state; untrusted web apps remain
  sandboxed.
- Reading, searching, navigation, highlighting, and drafting are generally
  low risk. External effects and destructive actions require explicit
  confirmation enforced in code.
- The initial repository slice hosts Aster and a placeholder for the
  assistant/avatar. It does not yet include Mail, speech, a model, memory, or
  an avatar asset.
- The speech providers, avatar model, memory persistence, and deployment
  topology are undecided.

## Brand Commitments

The product is named Sodalis. The user does not want another imitation of a
macOS or Windows look and feel; the experience should be simple to use.

## Evidence on Hand

- `SODALIS_IMPLEMENTATION_SPEC.md` is the supplied architecture and product
  brief.
- Aster Desktop is the reference and initial desktop foundation.
- No approved avatar model, real Mail account, voice samples, or provider
  credentials are available; none should be implied or fabricated.

## Product Principles

- Preserve user control; the GUI remains usable without conversation.
- Prefer local-first handling for sensitive personal data.
- Keep providers replaceable and trusted-app context semantic.
- Confirm consequential actions before external side effects.
- Make important information clear in accessible text, not animation alone.

## Accessibility & Inclusion

Optimize for older adults and people with reduced dexterity, vision, hearing,
or technical confidence. Provide readable scalable text, large targets,
contrast, visible focus, touch and keyboard support, reduced motion, clear
microphone/listening state, easy correction of speech recognition, adjustable
speech rate, and optional captions for spoken responses. The avatar must not
be the only channel for important information.
