# Changelog

## 1.0.0 — 2026-09-15

### Game and replay experience

- Two-role browser game with a seeded simulation, ten autonomous bots, public objectives, collectibles, alarms, and security sweepers.
- Keyboard and touch movement, replay scrubbing, playback speeds, actor trails, and an event timeline.
- Compressed replay sharing through Cloudflare Pages Functions and D1, with self-contained share links as a fallback.
- Anonymous profiles, replay queues, and separate faker and spotter ratings and leaderboards.

### Polish and fixes

- Shared native dialogs with initial focus, keyboard focus containment, Escape handling, and focus restoration.
- Single scrolling content areas and visible dialog actions on small screens.
- WebP versions of twelve runtime artwork assets: **85.5% fewer combined bytes** than the source PNGs, with original artwork and sprite sheet geometry preserved.
- Self-reviews excluded from competitive totals and rankings; duplicate submissions retain their original result without scoring again.
- First-time visitors can submit a guess directly from a shared link without an existing server profile.
- Gameplay screenshot, portfolio case study, and repository setup and verification documentation.

### Development

- Reproducible artwork optimization script.
- Strict frontend and Pages Functions type checks, generated Cloudflare binding types, game-logic tests, and GitHub Actions configuration.
- Local acceptance regression covering a winning seeded run, compressed replay storage and retrieval, a different profile's review, ratings, leaderboards, duplicate submissions, and self-review exclusions.
