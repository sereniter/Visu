# VISU — Improvement To-Do List

**Purpose:** Track all identified improvements systematically post Sprint 11  
**Owner:** VISU Core Architecture  
**Last Updated:** Post Sprint 11  
**Format:** Priority ordered within each category. Mark status as: `[ ]` Pending · `[~]` In Progress · `[x]` Complete

---

## Priority 1 — Immediate Impact (Do First)

These five items directly unblock Bhairav development and real-world content production.

| # | Item | Category | Effort | Status |
|---|---|---|---|---|
| 1 | `--dry-run` flag — validate contract without executing a run | Architecture | Small | [ ] |
| 2 | Scroll action support in Mode A step contract | Mode A | Small | [ ] |
| 3 | Conditional step support (`wait_for_any`, `if_visible`) in Mode A | Mode A | Medium | [ ] |
| 4 | Pluggable upload adapter — S3 / internal CDN alongside YouTube | Delivery | Medium | [ ] |
| 5 | Run history index — lightweight query across runs by topic/language/date | Observability | Small | [ ] |

---

## Priority 2 — Quality and Robustness

These improve output quality and engine reliability for production use.

| # | Item | Category | Effort | Status |
|---|---|---|---|---|
| 6 | Lossless PNG-to-clip encode in Mode C (fix double lossy transcode) | Engine | Small | [ ] |
| 7 | Playwright step retry with configurable timeout | Mode A | Small | [ ] |
| 8 | Adaptive recording buffer — wait for step completion before stopping | Mode A | Medium | [ ] |
| 9 | Audio fade out at video end (FFmpeg `afade`) | Engine | Small | [ ] |
| 10 | Music volume per scene override in contract | Engine | Small | [ ] |
| 11 | Highlight colour per topic in config | Mode A | Small | [ ] |
| 12 | Thumbnail design — SVG template system for branded thumbnails | Delivery | Medium | [ ] |

---

## Priority 3 — Observability and Governance

These improve auditability, monitoring, and content governance.

| # | Item | Category | Effort | Status |
|---|---|---|---|---|
| 13 | Run diff tool — compare two runIds for changes in metadata/drift/duration | Observability | Medium | [ ] |
| 14 | Quality metrics per run — audio loudness, video brightness, narration clarity | Observability | Medium | [ ] |
| 15 | Contract version history per topic — enable rollback and comparison | Governance | Medium | [ ] |
| 16 | Topic-scoped prompt libraries — prevent key collisions across domains | Governance | Small | [ ] |
| 17 | Script template inheritance — base templates with topic overrides | Governance | Medium | [ ] |
| 18 | General contract migration graph — any version to current in one command | Architecture | Medium | [ ] |

---

## Priority 4 — Integration and Delivery

These improve how Bhairav and OpenClaw consume VISU.

| # | Item | Category | Effort | Status |
|---|---|---|---|---|
| 19 | VISU HTTP API mode — lightweight REST wrapper for Bhairav/OpenClaw integration | Architecture | Large | [ ] |
| 20 | Mobile chapter navigation — coordinate title cards with chapter markers | Delivery | Small | [ ] |
| 21 | YouTube upload quota dashboard — visible quota tracking per day | Delivery | Small | [ ] |
| 22 | `determinism.lock` file — committed expected fingerprints for CI | Architecture | Small | [ ] |

---

## Priority 5 — Future Hardware Dependent

These require hardware upgrade before they become viable.

| # | Item | Category | Blocker | Status |
|---|---|---|---|---|
| 23 | Sprint 12 — AI-driven Mode A via Gemini 2.5 Flash free tier | Mode A | None — API based | [ ] |
| 24 | AI4Bharat TTS adapter — higher quality Indian language voices | TTS | New machine or API | [ ] |
| 25 | Kokoro TTS adapter — higher quality English voice | TTS | New machine or API | [ ] |
| 26 | Stagehand adapter — local vision model via Ollama | Mode A | New machine (GPU) | [ ] |
| 27 | Bit-identical TTS narration — re-evaluate Piper determinism on Apple Silicon | Determinism | New machine | [ ] |
| 28 | SDXL runtime visual generation — re-evaluate on GPU hardware | Mode C | New machine (GPU) | [ ] |

---

## Priority 6 — Content Production (Not Code)

These are content tasks, not engineering tasks. Required before Bhairav can go live.

| # | Item | Category | Effort | Status |
|---|---|---|---|---|
| 29 | Billing flow — run end to end in English, Hindi, Telugu | Testing | Half day | [ ] |
| 30 | Source all four language Piper models + populate `modelHash` in `languages.json` | Models | Half day | [ ] |
| 31 | Source background music files (royalty-free MP3/WAV) per topic | Content | Half day | [ ] |
| 32 | Design intro/summary PNGs per topic (branded, not solid colour) | Content | Ongoing | [ ] |
| 33 | Build out narration template library — all topics, all four languages | Content | Ongoing | [ ] |
| 34 | Build out prompt library — all topics, all visual styles | Content | Ongoing | [ ] |

---

## Tracking Notes

### Effort Guide
- **Small** — half day or less, isolated change, minimal test surface
- **Medium** — one to two days, touches multiple files, moderate test surface
- **Large** — three or more days, architectural change, significant test surface

### How to Use This List
1. Pick the highest pending item from Priority 1 before moving to Priority 2
2. When starting an item mark it `[~]` In Progress
3. When complete mark it `[x]` Complete and note the sprint or patch it was delivered in
4. New items discovered during implementation go to the bottom of the relevant priority group

### Items That Become Sprints
Any Priority 1 or 2 item estimated Large automatically becomes a named sprint. Medium items can be grouped into a patch document. Small items can be implemented directly with a brief commit note.

---

## Sprint and Patch History Reference

| Sprint / Patch | What it delivered |
|---|---|
| Sprint 1 | Core engine foundation |
| Sprint 2 | Mode A (UI flow) + risk spikes |
| Sprint 3 | Narration / TTS layer (Piper) |
| Sprint 4 | AV merge layer |
| Sprint 5 | Mode B (recorded adapter) |
| Sprint 6A | Mode C minimal execution |
| Sprint 6B | Mode C full visual asset governance |
| Sprint 7 | Determinism verification + upload hardening |
| Sprint 8 | Multilingual extension (en, hi, te, ta) |
| Sprint 8 Patch — Voice Gender | Male/female voice selection + contract migration tool |
| Sprint 9 | Consumer documentation |
| Sprint 10 Patch — Content Repository | `contentRoot` / `outputRoot`, `topic` field |
| Sprint 10 Patch — Mode B Background Music | Music looping, drift rule update for Mode B |
| Sprint 11 | Scene-driven Mode A + all viewer experience enhancements |
| Sprint 11 Patch — Ambient Sounds | click.wav, keyboard.wav, page_load.wav wiring |
