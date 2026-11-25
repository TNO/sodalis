---
layout: home

hero:
  name: Sodalis
  text: A more approachable digital companion
  tagline: A research prototype exploring a personal desktop and conversational assistant for everyday life.
  actions:
    - theme: brand
      text: Explore Sodalis
      link: /guide/overview
    - theme: alt
      text: Set up the prototype
      link: /guide/setup

features:
  - title: A desktop and a companion
    details: Use a graphical desktop alongside an assistant that can respond in text and speech.
  - title: Explore a simulated home
    details: Ask about generated household data in a read-only replay, without connecting a real home.
  - title: Designed for user control
    details: The project explores accessible interaction, local processing, and explicit boundaries around assistant access.
---

## Vision and current state

Sodalis aims to make digital tools more approachable, particularly for older
adults and people with different abilities. The current system is a research
prototype, not a production-ready service. Its simulated home is not a real
Home Assistant integration, and its capabilities and model responses have
limits.

<div class="explore-paths">
  <a class="explore-path" :href="withBase('/architecture/decisions.html')" aria-labelledby="decisions-title" aria-describedby="decisions-description">
    <span class="explore-label">The thinking behind Sodalis</span>
    <strong id="decisions-title">Why we built it this way <span aria-hidden="true">→</span></strong>
    <span id="decisions-description">Explore the decisions, alternatives, and evidence behind the design.</span>
  </a>
  <a class="explore-path" :href="withBase('/guide/future-work.html')" aria-labelledby="future-title" aria-describedby="future-description">
    <span class="explore-label">Looking ahead</span>
    <strong id="future-title">Where we could go next <span aria-hidden="true">→</span></strong>
    <span id="future-description">Discover opportunities to continue the research and develop the prototype.</span>
  </a>
</div>

## Demo

A demonstration video may be added here later. No video is available yet.

<script setup>
import { withBase } from 'vitepress'
</script>

<style scoped>
.explore-paths {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin: 32px 0;
}

.explore-path {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 24px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-2);
  font-size: 14px;
  line-height: 1.6;
  text-decoration: none;
  transition: border-color 0.2s, background-color 0.2s;
}

.explore-path:hover {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-bg-alt);
}

.explore-path:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 3px;
}

.explore-path strong {
  color: var(--vp-c-text-1);
  font-size: 18px;
}

.explore-label {
  color: var(--vp-c-brand-1);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

@media (max-width: 640px) {
  .explore-paths {
    grid-template-columns: 1fr;
  }
}
</style>
