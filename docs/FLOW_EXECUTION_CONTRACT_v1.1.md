# FLOW_EXECUTION_CONTRACT_v1.1

Status: Locked  
Applies To: Mode A (UI Flow Execution)  
Owner: VISU Core Architecture  
Governance Reference: GOVERNANCE_SYSTEM.md

------------------------------------------------------------------------

# 1. Purpose

This document defines the deterministic execution semantics for VISU UI Flow Mode (Mode A).

It governs:

- Flow schema expectations
- Execution behavior
- Adapter responsibilities
- Failure semantics
- Logging guarantees
- Determinism constraints

This contract is authoritative. Implementation must conform to it.

------------------------------------------------------------------------

# 2. Allowed Actions

Valid action enum:

`navigate` | `click` | `fill` | `wait` | `screenshot` | `done`

No additional actions permitted.

------------------------------------------------------------------------

# 3. Mandatory Termination Rule

A flow MUST:

1. Contain at least one step.
2. Contain exactly one `done` action.
3. Have `done` as the final step.
4. Contain no steps after `done`.

Violation results in validation failure before execution begins.

------------------------------------------------------------------------

# 4. Execution Semantics

Execution is strictly sequential.

For each step:

1. Log step_started
2. Execute adapter method
3. Log step_completed

On error:

1. Log step_failed
2. Set RunContext.status = "failed"
3. Close adapter
4. Terminate execution immediately

No continuation after failure.

------------------------------------------------------------------------

# 5. done Action Semantics

When `done` is encountered:

1. Log flow_completed
2. Set RunContext.status = "completed"
3. Close adapter
4. Return RunContext

`done` is an explicit normal-termination signal.

------------------------------------------------------------------------

# 6. Timeout Policy

Timeout is configuration-driven:

`ACTION_TIMEOUT_MS = config.execution.actionTimeoutMs`

Timeout MUST NOT be hardcoded.

Default Phase 1 value: 10000ms

No implicit Playwright retries allowed.

------------------------------------------------------------------------

# 7. Retry Policy

No retries for any action in Phase 1.

If selector fails → flow fails.

Retries mask nondeterminism and are prohibited.

------------------------------------------------------------------------

# 8. Playwright Recording Policy

Use built-in Playwright recordVideo in browser context.

Recording configuration:

- Scoped to viewport (1920x1080)
- Saved to configured videoDir
- Deterministic resolution

Critical sequencing rule:

The video file is only flushed after context.close() resolves.

Adapter.close() MUST:

1. Capture video reference (e.g. page.video()) before any close; once page.close() is called, that reference may be invalid.
2. Await page.close()
3. Await context.close()
4. Only after context.close(): retrieve final video path (e.g. await video.path())
5. Await browser.close()
6. Return video path (typically after moving to a deterministic path such as artifacts/{runId}/raw.webm)

Media processing must not begin before adapter.close() completes.

------------------------------------------------------------------------

# 9. Run Artifact Layout

Each successful or failed run that records video MUST produce:

- **artifacts/{runId}/raw.webm** — The recorded WebM (viewport-sized, deterministic). Written by the adapter after context.close(); may be moved from Playwright’s temp path to this path.
- **artifacts/{runId}/metadata.json** — Run metadata for traceability, A/B experiments, and debugging. Written by the invoker (e.g. CLI) after the run. Structure:

```json
{
  "flowId": "...",
  "flowVersion": "...",
  "playwrightVersion": "...",
  "nodeVersion": "...",
  "configHash": "...",
  "videoPath": "...",
  "generatedAt": "..."
}
```

- `flowId`, `flowVersion`: from the executed flow.
- `playwrightVersion`, `nodeVersion`: runtime environment.
- `configHash`: stable hash of config (e.g. SHA-256 of config JSON) for reproducibility.
- `videoPath`: absolute path to raw.webm for this run.
- `generatedAt`: ISO 8601 run start time.

------------------------------------------------------------------------

# 10. Determinism Controls

Adapter must:

- Lock viewport to configured size
- Disable animations via injected CSS
- Lock locale
- Use explicit awaits
- Avoid implicit Playwright auto-wait magic

------------------------------------------------------------------------

# 11. Logging Guarantees

Each step generates:

- step_started
- step_completed OR step_failed

Flow termination generates:

- flow_completed OR failure state

Logs must conform to log_schema_v1.json.

------------------------------------------------------------------------

# 12. Architectural Boundaries

- core MUST NOT import adapters
- FlowExecutor must not import Playwright
- Playwright lives exclusively in adapters/

------------------------------------------------------------------------

# 13. Determinism Guarantee

Given:

- Identical flow JSON
- Identical config
- Identical environment

Execution must produce:

- Identical action sequence
- Identical video resolution
- Identical log structure

------------------------------------------------------------------------

FLOW_EXECUTION_CONTRACT_v1.1 is now locked.

------------------------------------------------------------------------

# 15. Mode A (ui_flow_scenes) v2 implementation notes

This section documents the current Mode A implementation as it evolved in Sprints 11–13. It does not change the original contract but clarifies how the engine satisfies it with a shared browser and external screen capture.

## 15.1 Playwright locator model

- Scene contracts store **structured locator descriptors** instead of string selectors.
- The engine reconstructs native Playwright calls:
  - `getByRole()`, `getByText()`, `getByLabel()`, `getByPlaceholder()`, `locator().filter().nth()`.
- This guarantees Mode A execution matches the original recorded script semantics under strict mode.

## 15.2 Shared browser + FFmpeg screen capture

- Mode A v2 uses a **single Chromium browser + context + page** for all scenes.
- Video is captured via external FFmpeg `avfoundation` screen capture (30fps, 1920×1080, libx264 yuv420p).
- Per scene:
  1. FFmpeg capture starts, waits for first `frame=` on stderr and a small configurable buffer.
  2. All steps for that scene run on the shared page.
  3. FFmpeg capture stops; the raw clip is written as `scene_{scene_id}_raw.mp4`.
- This preserves DOM/session state across scenes while keeping capture deterministic.

## 15.3 Audio and background music

- Per-scene audio is **pure narration** (TTS only).
- Background music is applied **once** at the final AV merge stage over the stitched video using `defaultBackgroundMusicPath` from config.
- Result: narration plays from t=0; music continues underneath the entire final video.

## 15.4 Drift and uniformity rules (Mode A)

- Scene-level A/V drift is **not capped** for Mode A; only the invariant `narration ≤ video` is enforced.
- Timeline uniformity (codec, resolution, pixel format, fps) remains strict across all segments (intro, scenes, summary).
- Intro and summary (Remotion compositions) and scene clips are all normalized to 1920×1080, 30fps, h264/yuv420p.

## 15.5 Determinism and output copy

- `final.mp4` is considered immutable **only after**:
  - timeline concat,
  - optional zoom,
  - chapter markers,
  - subtitles,
  - thumbnail extraction,
  - upload metadata generation.
- The SHA256 in `media_metadata.json` is recomputed at this point, immediately before:
  - copying `final.mp4` and `media_metadata.json` into `outputRoot/{topic}/{language}/`, and
  - verifying that the destination hash matches the recorded `outputSha256`.
- Re-running the same contract is allowed and overwrites existing output files while preserving bit-for-bit verification.

