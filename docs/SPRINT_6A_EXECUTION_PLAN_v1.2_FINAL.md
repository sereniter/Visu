# SPRINT_6A_EXECUTION_PLAN_v1.2_FINAL

**Status:** Locked  
**Applies To:** VISU — Mode C (Minimal Structured Execution)  
**Owner:** VISU Core Architecture  
**Prerequisites:**
- Sprint 5 complete
- `script_schema_v1.json` and `wav_utils` confirmed exports from Sprint 3
- `media_metadata_schema_v1.json` using `sourceVideoPath` (Sprint 4 amendment applied)

---

## 1. Purpose

Sprint 6A introduces Mode C Minimal Execution: VISU executes a structured scene contract and produces a deterministic final video.

No intelligence. No generative logic. No overlays. No AI orchestration. No TTS generation.

Only deterministic multi-scene stitching from pre-baked assets.

---

## 2. Scope

### In Scope
- `scene_schema_v1.json` (strict AJV validation)
- Scene validator
- TimelineEngine (hard cut, concat demuxer only)
- Mode C engine
- CLI support (`--mode generative`)
- Integration with Sprint 4 AVMergeEngine
- Deterministic multi-scene assembly
- Per-scene ffprobe single-pass extraction
- Uniformity gate (codec, resolution, pixel format, framerate)

### Out of Scope
- Generative adapter
- Prompt composition
- TTS generation per scene
- Overlay engine
- Scene-level animation
- Crossfades
- Experiment logic
- Style profile system

---

## 3. Mode C Input Contract

### CLI Invocation

```
visu --mode generative --contract contract.json
```

> **CLI flag note:** `--mode generative` is retained for RunContext consistency. CLI help text must read: "Mode C (structured scenes; no AI generation in Sprint 6A)"

### Contract Structure

```json
{
  "schema_version": "1.0",
  "video_id": "string",
  "scenes": [
    {
      "scene_id": "string",
      "video_path": "string",
      "narration_path": "string",
      "duration_sec": number
    }
  ]
}
```

**Rules:**
- `additionalProperties: false`
- `scenes.length ≥ 1`
- All paths must exist on disk before execution
- `duration_sec > 0`
- No prompt fields, no style fields, no seed fields

### Narration Model (Explicit)

Mode C Minimal requires **pre-baked narration per scene**. Narration WAV files are external inputs declared in the contract. Sprint 6A does **not** call the TTS engine. Narration generation via template + TTS belongs to Sprint 6B.

---

## 4. Scene Schema

**Location:** `schemas/scene_schema_v1.json`  
**Validator:** `src/validators/scene_schema.ts`  

Strict AJV validation (`strict: true`). Execution aborts on any validation failure.

---

## 5. Timeline Engine

**Location:** `src/engines/timeline_engine.ts`

### 5.1 Concat Method — FFmpeg Concat Demuxer

```
ffmpeg -f concat -safe 0 -i list.txt -c copy stitched_video.mp4
```

**Rationale:** Preserves deterministic pipeline. Avoids unnecessary transcode. AVMergeEngine remains the single transcode point in the system. Concat filter (`-filter_complex concat`) is explicitly prohibited — it would re-encode and violate staged determinism.

### 5.2 Asset Uniformity Gate (Pre-Concat Hard Gate)

All scene video assets must be identical in:

| Property | Enforcement |
|---|---|
| Container | Must be MP4 |
| Video codec | Exact match |
| Resolution | Exact match |
| Pixel format | Exact match |
| Framerate | Within ±0.1 fps tolerance |

**Framerate Comparison Rule:**

Framerate must be compared as rational numbers, not raw strings.

1. Extract `r_frame_rate` via ffprobe (e.g. `30000/1001`, `30/1`)
2. Parse to float: `numerator / denominator`
3. Compare: `abs(fpsA - fpsB) ≤ 0.1`

This correctly handles 29.97 vs 30.0 without falsely failing. It correctly rejects 24fps vs 30fps.

Mismatch on any property → hard fail before concat begins.

### 5.3 Single-Pass ffprobe Extraction (Required)

TimelineEngine must perform **one ffprobe call per scene only**. Each call extracts:

- Duration
- Video codec
- Resolution
- Pixel format
- `r_frame_rate`

Results stored in memory. Uniformity comparison reuses this data. No second ffprobe pass is permitted. This preserves efficiency and avoids redundant I/O.

### 5.4 Responsibilities

1. Validate all scene asset paths exist
2. Run single-pass ffprobe per scene
3. Enforce uniformity gate across all scenes
4. Enforce per-scene drift rule (see section 6)
5. Build concat list file deterministically
6. Execute FFmpeg concat demuxer → `stitched_video.mp4`
7. Pass `stitched_video.mp4` to AVMergeEngine

**Not permitted:** Transitions, blending, crossfade, trimming, auto-correction.

---

## 6. Per-Scene Drift Rule

For each scene:

```
narrationDurationMs ≤ videoDurationMs
(videoDurationMs - narrationDurationMs) ≤ 200ms
```

Hard fail on any scene violation. No padding, no stretching, no trimming.

Global video duration = sum of all scene durations.

---

## 7. Mode C Engine Flow (Authoritative)

1. FFmpeg presence & version check (≥ 6.0)
2. Contract validation against `scene_schema_v1.json`
3. For each scene (single-pass):
   - Validate path existence
   - Extract duration, codec, resolution, pixel format, framerate
   - Validate drift rule
4. Uniformity gate across all extracted scene data
5. TimelineEngine → `stitched_video.mp4` (concat demuxer)
6. AVMergeEngine (`mode: "generative"`)
7. SHA256 computation (post-encode, post-faststart)
8. Metadata construction and schema validation
9. Write `media_metadata.json`
10. Log completion

**No TTS step.**

---

## 8. Artifact Management

```
artifacts/{runId}/
  stitched_video.mp4      ← retained (see retention policy)
  final.mp4
  media_metadata.json
```

### Retention Policy — `stitched_video.mp4`

`stitched_video.mp4` is **retained** after successful run.

Rationale: replay support, drift diagnostics, scene assembly inspection, observability consistency. Deletion would harm replayability. Cleanup tooling may be introduced in Sprint 7 (Observability Hardening).

---

## 9. Metadata

`media_metadata.json` validated against `schemas/media_metadata_schema_v1.json`.

```json
{
  "runId": "string",
  "mode": "generative",
  "encodingProfileVersion": "string",
  "ffmpegVersion": "string",
  "sourceVideoPath": "artifacts/{runId}/stitched_video.mp4",
  "narrationPath": "string | null",
  "musicPath": "string | null",
  "musicLufs": "number | null",
  "sceneCount": 2,
  "maxDriftMs": 12,
  "avgDriftMs": 7,
  "durationMs": 12345,
  "crf": 18,
  "audioSampleRate": 48000,
  "duckingDb": -14,
  "outputPath": "string",
  "outputSha256": "string",
  "generatedAt": "ISO8601"
}
```

> **Note:** In Mode C, `sourceVideoPath` refers to `stitched_video.mp4` — the intermediate artifact passed into AVMergeEngine, not the original external input. This distinction must be documented in `VISU_TECHNICAL_SPEC.md`. The field meaning is consistent: "video passed into AVMergeEngine."

`additionalProperties: false` enforced.

Per-scene drift is logged in run logs only. `scene_metadata.json` is deferred to a future sprint.

---

## 10. Determinism Guarantees

Given identical:
- `contract.json`
- Scene video and narration assets
- Encoding profile
- FFmpeg version (≥ 6.0)

Output `final.mp4` must be bit-identical on same machine across runs.

Cross-machine bit-identical output is not guaranteed. Acceptable under current governance.

---

## 11. Testing Requirements

### Unit Tests

| Test | Validates |
|---|---|
| Scene schema — valid contract | Passes |
| Scene schema — missing field | Fails |
| Scene schema — `additionalProperties` | Fails |
| Uniformity gate — codec mismatch | Hard fail |
| Uniformity gate — framerate 29.97 vs 30.0 | Passes (within tolerance) |
| Uniformity gate — 24fps vs 30fps | Hard fail |
| Per-scene drift — narration > video | Hard fail |
| Per-scene drift — delta > 200ms | Hard fail |
| Single-pass ffprobe | No duplicate calls per scene |
| Timeline concat args snapshot | Deterministic argument array |
| Multi-scene merge success | `stitched_video.mp4` produced |
| Metadata `mode` field | Equals `"generative"` |
| `maxDriftMs` and `avgDriftMs` | Correctly computed |

### Integration Test (Gated)

```
RUN_MODE_C_INTEGRATION=true
```

**Fixtures** (static committed binaries):

```
tests/fixtures/
  scene1.mp4              ≤ 5 seconds, ≤ 5 MB
  scene2.mp4              ≤ 5 seconds, ≤ 5 MB
  scene1_narration.wav    matching scene1 duration
  scene2_narration.wav    matching scene2 duration
  contract_fixture.json
```

**Fixture generation** (documented in `ENVIRONMENT.md`):

```bash
ffmpeg -i recorded_fixture.mp4 -t 5 -c copy scene1.mp4
ffmpeg -i recorded_fixture.mp4 -ss 5 -t 5 -c copy scene2.mp4
```

> **Known limitation:** `-c copy` with `-ss` may start `scene2.mp4` on a non-keyframe, causing a minor visual artifact at the scene boundary. This is acceptable for test fixtures and does not affect determinism or concat demuxer correctness. Production Mode C assets are expected to be properly encoded. Optional fix (non-mandatory):
> ```bash
> ffmpeg -i recorded_fixture.mp4 -ss 5 -t 5 -c:v libx264 -preset veryfast -crf 18 scene2.mp4
> ```

**Verifies:**
- `stitched_video.mp4` exists
- `final.mp4` exists
- SHA256 identical across two consecutive runs
- `media_metadata.json` valid against schema
- `sceneCount` = 2
- `maxDriftMs` and `avgDriftMs` present and correct
- All log entries present

---

## 12. Failure Modes

| Condition | Behaviour |
|---|---|
| Missing scene file | Hard stop |
| Scene asset uniformity mismatch | Hard stop |
| Per-scene drift violation | Hard stop |
| Invalid contract schema | Hard stop |
| FFmpeg version below 6.0 | Hard stop |
| Metadata validation failure | Hard stop |
| Concat demuxer error | Hard stop |

No auto-correction permitted.

---

## 13. New Files

```
src/
  engines/
    timeline_engine.ts
  validators/
    scene_schema.ts

schemas/
  scene_schema_v1.json

tests/
  scene_schema.test.ts
  timeline_engine.test.ts
  mode_c_engine.test.ts
  mode_c_integration.test.ts
  fixtures/
    scene1.mp4
    scene2.mp4
    scene1_narration.wav
    scene2_narration.wav
    contract_fixture.json
```

---

## 14. Documentation Updates

- `VISU_TECHNICAL_SPEC.md` — add Mode C to architecture, repository layout, test inventory, version history; clarify `sourceVideoPath` semantics across modes
- `ENVIRONMENT.md` — fixture generation commands, keyframe limitation note
- `docs/SPRINT_6A_EXECUTION_PLAN_v1.2_FINAL.md` — saved for traceability

---

## 15. Success Criteria

Sprint 6A is complete when:

- [ ] VISU executes structured multi-scene contract end-to-end
- [ ] Scene schema strictly validated before execution
- [ ] Asset uniformity gate enforced (including framerate tolerance)
- [ ] Single-pass ffprobe per scene confirmed
- [ ] Hard-cut timeline via concat demuxer works
- [ ] Per-scene drift enforced with directionality rule
- [ ] `stitched_video.mp4` retained as intermediate artifact
- [ ] `maxDriftMs` and `avgDriftMs` logged in metadata
- [ ] `sourceVideoPath` points to `stitched_video.mp4` correctly
- [ ] SHA256 stable across two runs
- [ ] No TTS calls in engine flow
- [ ] No overlay logic
- [ ] No generative logic
- [ ] All unit tests pass
- [ ] Integration test passes
- [ ] `npm run build`, `npm test`, `npm run lint` all pass
- [ ] Documentation updated

---

## 16. Issue Resolution Status

| Issue | Status |
|---|---|
| Concat method unspecified | Closed — demuxer + uniformity gate |
| Narration origin ambiguous | Closed — external input, no TTS in 6A |
| Framerate tolerance undefined | Closed — ±0.1 fps rational comparison |
| Fixture keyframe artifact | Closed — documented in `ENVIRONMENT.md` |
| ffprobe double-pass risk | Closed — single-pass required and tested |
| `stitched_video.mp4` retention | Closed — retained, referenced in metadata |
| `sourceVideoPath` semantic ambiguity | Closed — documented in `VISU_TECHNICAL_SPEC.md` |

No remaining open items.

---

## Governance Alignment

- PRD Mode C contract: satisfied (schema-governed, deterministic)
- `FINAL_PLAN` Sprint 6 scope: satisfied (Mode C Adapter + Schema Validation)
- Determinism guarantees: preserved
- Idempotent rendering requirement: preserved
- Single transcode point: preserved (AVMergeEngine only)
- Replayability: preserved (`stitched_video.mp4` retained)
