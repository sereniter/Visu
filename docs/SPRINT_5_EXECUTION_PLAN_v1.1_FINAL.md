# SPRINT_5_EXECUTION_PLAN_v1.1_FINAL

**Status:** Locked  
**Applies To:** VISU — Mode B (Recorded Adapter)  
**Owner:** VISU Core Architecture  
**Prerequisites:**
- Sprint 3 complete: TTS engine, `script_schema_v1.json`, `src/validators/script_schema.ts`, `getWavDurationMs` exported and tested from `wav_utils`
- Sprint 4 complete: AV Merge Engine, `media_metadata_schema_v1.json` updated with `sourceVideoPath` field

> **Note:** `media_metadata_schema_v1.json` is the authoritative source for all metadata field names. Both Sprint 4 and Sprint 5 documentation defers to the schema file. Sprint 4 documentation should be amended to replace `rawVideoPath` with `sourceVideoPath`.

---

## 1. Purpose

Mode B enables VISU to accept an externally recorded MP4, generate Telugu narration, and deterministically produce `final.mp4` using the Sprint 4 AV merge layer.

Mode B introduces no intelligence and no scene abstraction. It is deterministic post-processing of recorded input.

---

## 2. Scope

### In Scope
- `RecordedAdapter`
- Input video validation
- Mode B execution engine
- CLI support for `--mode recorded`
- Integration with TTS (Sprint 3) and AV Merge Engine (Sprint 4)
- Deterministic artifact production
- Input validation gates

### Out of Scope
- Scene schema
- Timeline engine
- Overlay engine
- Generative adapter
- Mode C execution contract
- Experiment logic
- Multi-language support

---

## 3. Architectural Position

```
Mode A: Automated UI Flow → raw.webm → merge
Mode B: External MP4     → narration → merge
Mode C: Structured scenes → timeline → merge
```

Mode B reuses Sprint 4's deterministic rendering backbone entirely. No new rendering logic.

---

## 4. Execution Flow (Authoritative)

### CLI Invocation

```
visu --mode recorded --video input.mp4 --script script.json
```

### Execution Steps

1. FFmpeg presence & version check (≥ 6.0)
2. Validate input video (RecordedAdapter)
3. Validate script (`script_schema_v1.json`)
4. Generate `narration.wav` (TTS engine)
5. Extract durations (`ffprobe` for video, `wav_utils` for narration)
6. Drift validation (pre-encode input gate)
7. AVMergeEngine execution
8. SHA256 computation (post-encode, post-faststart)
9. Metadata validation and write
10. Log completion

No silent correction permitted at any step.

---

## 5. RecordedAdapter Specification

**Location:** `src/adapters/recorded_adapter.ts`

### 5.1 Responsibilities

- Validate file existence
- Validate container format (MP4 only)
- Extract: duration, video codec, resolution
- Reject unsupported inputs
- Return structured validation result

### 5.2 Validation Rules

| Rule | Behavior |
|---|---|
| File does not exist | Fail |
| Container not MP4 | Fail |
| No video stream | Fail |
| Duration = 0 | Fail |
| Resolution | Logged only — no gate |

**Resolution Clarification:** Resolution is extracted and logged for observability. Mode B does not enforce resolution constraints. Re-encoding via Sprint 4 normalises output to the locked encoding profile.

### 5.3 Audio Stream Handling (Critical)

If the input MP4 contains one or more audio streams, they must be **explicitly excluded** from output.

**FFmpeg mapping rule:**

```
-map 0:v:0
-map [mixed_audio]
```

**Never use:**

```
-map 0:a
```

Original audio must never propagate into final output. Narration fully replaces input audio. This rule is mandatory and must be covered by a unit test via mock adapter argument inspection.

### 5.4 Narration-Only Edge Case (No Music)

When `musicPath` is null, the FFmpeg filter graph must handle a single audio input (narration only) without a mixing operation. The filter graph construction must branch:

```
if musicPath != null:
  build mix filter: narration + music with ducking
else:
  map narration.wav directly — no mixing operation
```

No mixing operation on a single audio stream. This branch must be unit tested.

---

## 6. Script Validation

Sprint 3 must have delivered:

```
schemas/script_schema_v1.json
src/validators/script_schema.ts
```

**Mode B depends on this validator. If script schema does not exist, Sprint 5 must not begin.**

Script validation is mandatory before narration generation. Invalid script → hard stop.

---

## 7. Drift Validation (Inherited from Sprint 4)

```
videoDurationMs    = ffprobe duration of input.mp4
narrationDurationMs = wav_utils.getWavDurationMs(narration.wav)
```

**Rules:**
```
narrationDurationMs ≤ videoDurationMs         → else fail immediately
(videoDurationMs - narrationDurationMs) ≤ 200ms → else fail
```

- No padding
- No silence injection
- No time stretching
- No trimming
- Hard stop on violation
- Log `driftMs`

Drift is validated **pre-encode** on inputs only. It does not inspect `final.mp4`.

---

## 8. Artifact Management

```
artifacts/{runId}/
  narration.wav
  final.mp4
  media_metadata.json
```

`RunContext.artifacts` updated with:
- `narrationPath`
- `finalVideoPath`
- `metadataPath`

---

## 9. Metadata

`media_metadata.json` validated against `schemas/media_metadata_schema_v1.json`.

**Required fields for Mode B run:**

```json
{
  "runId": "string",
  "mode": "recorded",
  "encodingProfileVersion": "string",
  "ffmpegVersion": "string",
  "sourceVideoPath": "string",
  "narrationPath": "string",
  "musicPath": "string | null",
  "musicLufs": "number | null",
  "durationMs": 12345,
  "driftMs": 0,
  "crf": 18,
  "audioSampleRate": 48000,
  "duckingDb": -14,
  "outputPath": "string",
  "outputSha256": "string",
  "generatedAt": "ISO8601"
}
```

> `sourceVideoPath` is the unified field name across Mode A and Mode B. `rawVideoPath` is retired. The schema file is authoritative.

`additionalProperties: false` enforced.

---

## 10. Determinism Guarantees

Given identical:
- `input.mp4`
- `script.json`
- TTS model and version
- Encoding profile
- FFmpeg version (≥ 6.0)

Mode B must produce bit-identical `final.mp4` on the same machine across runs.

Cross-machine bit-identical output is not guaranteed. This is acceptable under current governance.

SHA256 stability is scoped to `final.mp4` only. Fixture container metadata does not affect this guarantee.

---

## 11. Testing Requirements

### Unit Tests

| Test | Validates |
|---|---|
| Reject non-MP4 input | Container validation |
| Reject missing file | Existence check |
| Reject zero-duration video | Duration gate |
| Drift violation — narration > video | Directionality rule |
| Drift violation — delta > 200ms | Delta rule |
| Audio stream exclusion | FFmpeg map args never include `0:a` |
| Narration-only filter graph | No mixing op when `musicPath` is null |
| Mode B engine orchestration | Mock adapters, step sequence, failure propagation |

### Integration Test (Gated)

```
RUN_RECORDED_INTEGRATION=true
```

**Fixtures** (static committed binaries — never generated during test):

```
tests/fixtures/
  recorded_fixture.mp4     ≤ 10 seconds, ≤ 5 MB
  script_fixture.json
```

**Verifies:**
- `final.mp4` exists
- Drift ≤ 200ms
- SHA256 identical across two consecutive runs
- `media_metadata.json` valid against schema
- All log entries present

---

## 12. Failure Modes

Mode B must fail hard on:

| Condition | Behaviour |
|---|---|
| Invalid container | Hard stop |
| Missing video stream | Hard stop |
| Drift violation | Hard stop |
| FFmpeg version below 6.0 | Hard stop |
| Metadata validation failure | Hard stop |
| Script schema validation failure | Hard stop |

No recovery logic permitted.

---

## 13. New Files

```
src/
  adapters/
    recorded_adapter.ts
  engines/
    recorded_mode_engine.ts

tests/
  recorded_adapter.test.ts
  recorded_mode_engine.test.ts
  recorded_integration.test.ts
  fixtures/
    recorded_fixture.mp4       ← static committed binary
    script_fixture.json
```

---

## 14. Documentation Updates

- `VISU_TECHNICAL_SPEC.md` — repository layout, architecture section, test inventory, version history
- `docs/SPRINT_5_EXECUTION_PLAN_v1.1_FINAL.md` — saved for traceability
- `SPRINT_4_EXECUTION_PLAN_v1.2_FINAL.md` — amendment note: `rawVideoPath` → `sourceVideoPath`, defer to schema file

---

## 15. Success Criteria

Sprint 5 is complete when:

- [x] VISU processes external MP4 deterministically end-to-end
- [x] Input validation gates enforced (container, stream, duration)
- [x] Original audio excluded from output — never propagates
- [x] Script schema validated before narration generation
- [x] Narration integrates correctly via Sprint 4 merge layer
- [x] Drift validated pre-encode with directionality rule
- [x] Narration-only filter graph (no music) handled correctly
- [x] `sourceVideoPath` used consistently — `rawVideoPath` retired
- [x] SHA256 stable across two runs (scoped to `final.mp4`)
- [x] `media_metadata.json` valid and complete
- [x] All unit tests pass
- [x] Integration test passes with SHA256 stability
- [x] `npm run build`, `npm test`, `npm run lint` all pass
- [x] Documentation updated

---

## 16. Issue Resolution Status

| Issue | Status |
|---|---|
| Audio stream exclusion from output | Closed — explicit mapping rule + unit test |
| Script schema prerequisite | Closed — hard gate before Sprint 5 begins |
| Resolution ambiguity | Closed — logged only, no gate |
| Metadata field conflict (`rawVideoPath` vs `inputVideoPath`) | Closed — unified as `sourceVideoPath` |
| Fixture SHA256 scope | Closed — scoped to `final.mp4` only |
| `wav_utils` dependency | Closed — named prerequisite |
| Narration-only filter graph edge case | Closed — explicit branch + unit test |
| Sprint 4 retroactive field rename | Closed — schema file is authoritative, Sprint 4 docs amended |

No remaining open items.

---

## Governance Alignment

Mode B remains:
- Execution-only
- Deterministic
- Infrastructure-scoped
- Strategy-free

All narrative decisions remain external. VISU does not choose content.
