# VISU – ARCHITECTURE.md
Viṣaya Sraṣṭā (Deterministic Content Execution Engine)

## Purpose
VISU is a deterministic execution engine responsible for:
- Running predefined UI flows
- Generating media assets
- Uploading content (if configured)
- Logging execution results

VISU does NOT perform strategy, KPI reasoning, or mission control.

---

## Layer 1: Orchestrator Layer
Responsible for:
- Reading flow definitions
- Managing execution lifecycle
- Handling structured logging
- Returning execution status

Core Files:
- /core/orchestrator.js
- /core/logger.js

---

## Layer 2: Automation Layer
Responsible for:
- Browser launch
- UI interaction
- Deterministic flow execution

Tool:
- Playwright

All selectors must be versioned and reproducible.

---

## Layer 3: Media Layer
Responsible for:
- Script generation (if required)
- TTS audio generation
- Audio + video merge
- Final rendering

Tools:
- TTS API
- FFmpeg

Media stored under:
- /media/raw
- /media/audio
- /media/final

---

## Layer 4: Output Layer
Responsible for:
- Optional YouTube upload
- Returning execution result
- Recording metadata

---

## Logging Philosophy
Every execution must:
- Record flow name
- Record flow version
- Record execution ID
- Record duration
- Record status
- Record error (if any)

No KPI or mission-level logic exists in VISU.

---

## Architectural Principles
- Deterministic execution only
- No autonomous decision-making
- No strategy logic
- No recursive self-modification
- Clear separation from BHIRAV layer

Last Updated: 2026-02-18
