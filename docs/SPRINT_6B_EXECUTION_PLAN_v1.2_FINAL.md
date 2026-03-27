# SPRINT_6B_EXECUTION_PLAN_v1.2_FINAL

**Status:** Locked  
**Applies To:** VISU — Mode C (Full Execution with Visual Asset Governance)  
**Owner:** VISU Core Architecture  
**Prerequisites:** Sprint 6A Complete  
**Spike Reference:** `docs/spikes/SDXL_DETERMINISM_SPIKE_RESULTS.json`

---

## 1. Objective

Complete Mode C to PRD-compliant scene governance while preserving:
- Determinism
- `< 20 min` runtime constraint
- No runtime AI inference
- No network calls

Visual generation is offline. Runtime validates governed assets and assembles deterministically.

---

## 2. Architectural Safeguards

### 2.1 Scene Clip Encoding Profile Lock

Mode C requires a PNG → MP4 encode per scene. This is a formally accepted double-encode exception for Mode C only — PNG has no existing video encoding so an initial encode is unavoidable. To prevent drift, the scene clip encode profile must be identical to the AVMergeEngine encoding profile (Sprint 4), except audio is omitted.

**Scene Clip Encoding Profile (Locked):**

```
ffmpeg -loop 1 -i {asset_path} \
  -t {duration_sec} \
  -r 30 \
  -c:v libx264 \
  -preset medium \
  -profile:v high \
  -pix_fmt yuv420p \
  -crf 18 \
  scene_{id}.mp4
```

No audio stream. Resolution: 1920x1080. No deviations permitted.

This ensures identical GOP structure, identical compression profile, no encoding parameter divergence, and deterministic downstream AVMergeEngine transcode.

**Test:** Snapshot test of FFmpeg argument array for scene clip conversion — must be identical across runs.

### 2.2 Media Metadata Scope Expansion

Sprint 6A declared `media_metadata.json` as output-level only. Sprint 6B formally expands scope for Mode C.

**Rule:** Scene-level metadata is permitted as a summary array in Mode C only.

Not permitted in scene array:
- Visual binary data
- Full prompt text
- Template text
- Timeline arrays

Only summary fields required for replay and audit.

This expansion is version-controlled under `media_metadata_schema_v1.json`. Must be reflected in `VISU_TECHNICAL_SPEC.md` version history.

**Test:** Schema validation test asserting scene array fields are summary-only and no prohibited fields are present.

### 2.3 WAV Concat Uniformity

Before WAV concat, validate per-scene WAV via single-pass ffprobe:

| Property | Required Value |
|---|---|
| Sample rate | 48000 Hz |
| Codec | PCM s16le |
| Channel count | Identical across all scenes |
| Bit depth | Identical across all scenes |

Single-pass ffprobe extraction reused for duration, sample rate, channels, and codec. No second pass.

```
ffmpeg -f concat -safe 0 -i wav_list.txt -c copy narration_concat.wav
```

Any mismatch → hard stop.

**Test:** Unit test asserting hard stop on sample rate mismatch, codec mismatch, and channel count mismatch.

### 2.4 PNG Resolution Verification

Before PNG → clip conversion, pipeline must verify:

1. PNG file exists
2. Provenance sidecar exists
3. `output_hash` in sidecar matches actual PNG SHA256
4. Actual PNG dimensions match sidecar resolution (1920x1080)

**Probing method:** `ffprobe` with image probe:

```bash
ffprobe -v error -select_streams v:0 \
  -show_entries stream=width,height \
  -of json image.png
```

This is consistent with the project's existing pattern of using ffprobe for all media inspection. No additional library dependency introduced.

If actual dimensions ≠ 1920x1080 → hard stop. Sidecar metadata alone is insufficient — actual file dimensions must be verified at runtime.

**Test:** Unit test asserting hard stop when PNG dimensions do not match sidecar-declared resolution.

---

## 3. Visual Asset Governance

**Asset location:**

```
assets/visuals/
  {prompt_key}_{seed}_{model_version}.png
  {prompt_key}_{seed}_{model_version}.provenance.json
```

Every PNG must have a corresponding provenance sidecar. No PNG without provenance is accepted.

**Provenance sidecar schema** (`schemas/provenance_schema_v1.json`):

```json
{
  "prompt_key": "string",
  "prompt_text_hash": "sha256 of resolved prompt text",
  "model": "stable-diffusion-xl",
  "model_version": "1.0",
  "model_file_hash": "sha256 of model weights file",
  "seed": 12345,
  "sampler": "DDIM",
  "steps": 30,
  "resolution": "1920x1080",
  "torch_version": "2.2.2",
  "diffusers_version": "0.27.2",
  "generated_at": "ISO8601",
  "output_hash": "sha256 of PNG file"
}
```

`additionalProperties: false`. All fields required.

**Prompt library validation:**
- Key must exist in `prompts/prompt_library.json`
- `approved === true` required
- Version tracked in provenance sidecar and metadata
- No raw prompt text permitted in scene contract

---

## 4. Scene Schema v1.1

**Location:** `schemas/scene_schema_v1.1.json`  
**Validator:** `src/validators/scene_schema.ts` (updated)

```json
{
  "schema_version": "1.1",
  "video_id": "string",
  "scenes": [
    {
      "scene_id": "string",
      "duration_sec": 8,
      "visual": {
        "type": "governed_image",
        "asset_path": "assets/visuals/invoice_dashboard_intro_12345_1.0.png",
        "prompt_key": "invoice_dashboard_intro",
        "seed": 12345,
        "model_version": "1.0"
      },
      "narration": {
        "text_template_key": "intro_invoice_creation",
        "voice": "telugu_female_01",
        "speed": 1.0
      }
    }
  ]
}
```

**Rules:**
- `additionalProperties: false`
- `visual.type` must be `"governed_image"`
- `visual.asset_path` must exist with valid provenance sidecar
- `visual.seed` required
- `visual.model_version` required
- `narration.text_template_key` must exist in `scripts/script_templates.json`
- `duration_sec > 0`

**Schema version migration policy:**
- `schema_version: "1.0"` contracts are hard rejected after Sprint 6B
- Error message must state: "Contract schema v1.0 is not supported. Migrate to v1.1."
- No silent fallback. No auto-migration.

---

## 5. Script Template Governance

**Location:** `/scripts/script_templates.json`

```json
{
  "intro_invoice_creation": {
    "template": "ఈ వీడియోలో మనం ...",
    "language": "te",
    "variables": []
  }
}
```

- Key existence checked before narration generation
- Template resolution must succeed
- Rendered text must be non-empty
- Language must be `"te"` (Telugu only, Phase 1)

---

## 6. Scene Render Orchestrator

**Location:** `src/engines/scene_render_engine.ts`

For each scene in order:

1. Validate visual asset existence
2. Validate provenance sidecar existence
3. Verify `output_hash` matches actual PNG SHA256
4. Verify actual PNG dimensions via ffprobe (1920x1080)
5. Convert PNG → scene clip (locked profile)
6. Resolve `text_template_key` from script templates
7. Generate narration WAV via Piper (Sprint 3 TTS)
8. Extract WAV metadata via single-pass ffprobe
9. Validate unified drift rule
10. Store scene artifacts

**Returns:**
- Array of scene video paths (for TimelineEngine)
- Array of scene WAV paths (for WAV concat)
- Per-scene drift metrics

---

## 7. Unified Drift Rule

For each scene:

```
narrationDurationMs ≤ (duration_sec × 1000)
((duration_sec × 1000) − narrationDurationMs) ≤ 200ms
```

- Narration overflow (narration > `duration_sec`) → hard stop
- Narration more than 200ms under `duration_sec` → hard stop
- Narration within 200ms under `duration_sec` → valid

No auto-padding. No time stretching. No silence injection.

---

## 8. WAV Concat Engine

**Location:** `src/engines/wav_concat_engine.ts`

After all scene narration WAVs are generated and validated:

1. Validate all WAV files exist
2. Validate uniformity (sample rate, codec, channels, bit depth)
3. Concatenate in scene order
4. Output: `artifacts/{runId}/narration_concat.wav`

`narration_concat.wav` is retained as an intermediate artifact for replayability (consistent with `stitched_video.mp4` retention policy from Sprint 6A).

---

## 9. Updated Mode C Pipeline (Authoritative)

```
1.  FFmpeg version check (≥ 6.0)
2.  Contract validation (scene_schema_v1.1)
3.  Prompt library validation (all prompt_keys exist + approved)
4.  Script template validation (all text_template_keys exist)
5.  Visual asset validation (PNG + provenance + hash + resolution)
6.  Scene render orchestrator:
      a. PNG → scene clip (locked profile, per scene)
      b. Template resolve → TTS → narration WAV (per scene)
      c. WAV metadata extraction single-pass (per scene)
      d. Unified drift validation (per scene)
7.  TimelineEngine concat → stitched_video.mp4 (demuxer, uniformity enforced)
8.  WAV concat engine → narration_concat.wav (uniformity enforced)
9.  AVMergeEngine (mode: "generative")
10. SHA256 computation (post-encode, post-faststart)
11. Metadata construction + schema validation
12. Write media_metadata.json
13. Log completion
```

No fallback paths. No partial execution on failure.

---

## 10. Metadata

`media_metadata.json` validated against updated `schemas/media_metadata_schema_v1.json`.

```json
{
  "mode": "generative",
  "sceneCount": 3,
  "sceneSchemaVersion": "1.1",
  "promptLibraryVersion": "1.0",
  "sourceVideoPath": "artifacts/{runId}/stitched_video.mp4",
  "maxDriftMs": 12,
  "avgDriftMs": 7,
  "scenes": [
    {
      "scene_id": "s1",
      "promptKey": "invoice_dashboard_intro",
      "seed": 12345,
      "modelVersion": "1.0",
      "assetHash": "sha256",
      "narrationDurationMs": 7800,
      "driftMs": 12
    }
  ],
  "encodingProfileVersion": "v1",
  "ffmpegVersion": "6.0",
  "outputSha256": "string",
  "generatedAt": "ISO8601"
}
```

Scene array is summary-only, Mode C only, and optional for Modes A and B. `additionalProperties: false` enforced.

---

## 11. Artifact Layout

```
artifacts/{runId}/
  scenes/
    scene_{id}.mp4              ← PNG → clip output (retained)
    scene_{id}_narration.wav    ← per-scene TTS output (retained)
  stitched_video.mp4            ← timeline concat output (retained)
  narration_concat.wav          ← WAV concat output (retained)
  final.mp4
  media_metadata.json
```

All intermediate artifacts are retained for replayability and debugging. Cleanup tooling deferred to Sprint 7.

---

## 12. Determinism Guarantees

Given identical:
- `contract.json`
- PNG files in `assets/visuals/`
- Provenance sidecars
- Prompt library
- Script templates
- Piper TTS model
- Encoding profile
- FFmpeg version (≥ 6.0)

Output `final.mp4` must be bit-identical on same machine across runs. No runtime inference. No hardware-dependent variability.

---

## 13. Testing Requirements

### Unit Tests

| Test | Validates |
|---|---|
| Schema v1.1 — valid contract | Passes |
| Schema v1.0 — rejected | Hard fail with migration message |
| `visual.type` not `governed_image` | Fails |
| PNG missing | Hard stop |
| Provenance sidecar missing | Hard stop |
| Provenance hash mismatch | Hard stop |
| PNG dimensions mismatch (ffprobe) | Hard stop |
| Prompt key not in library | Hard stop |
| Prompt key `approved: false` | Hard stop |
| Script template key missing | Hard stop |
| Narration overflow | Hard stop |
| Narration > 200ms under duration | Hard stop |
| WAV sample rate mismatch | Hard stop |
| WAV codec mismatch | Hard stop |
| WAV channel count mismatch | Hard stop |
| Scene clip FFmpeg arg snapshot | Identical across runs |
| WAV concat arg snapshot | Identical across runs |
| Scene render orchestrator sequence | Correct order, mock adapters |
| Metadata scene array — prohibited fields absent | Schema validation |
| `narration_concat.wav` retained | Artifact exists post-run |

### Integration Test (Gated)

```
RUN_MODE_C_FULL=true
```

**Fixtures:**

```
tests/fixtures/
  contract_v1.1_fixture.json

assets/visuals/
  test_scene_12345_1.0.png
  test_scene_12345_1.0.provenance.json
```

**Verifies:**
- All validation gates pass in correct order
- `stitched_video.mp4` exists and is retained
- `narration_concat.wav` exists and is retained
- `final.mp4` exists
- SHA256 identical across two consecutive runs
- Scene-level metadata present, complete, and summary-only
- `maxDriftMs` and `avgDriftMs` correct
- All log entries present

---

## 14. Failure Modes

| Condition | Behaviour |
|---|---|
| PNG missing | Hard stop |
| Provenance sidecar missing | Hard stop |
| Provenance hash mismatch | Hard stop |
| PNG dimensions mismatch | Hard stop |
| Prompt key unapproved | Hard stop |
| Script template missing | Hard stop |
| Narration overflow | Hard stop |
| Narration drift > 200ms under | Hard stop |
| WAV uniformity mismatch | Hard stop |
| Schema v1.0 contract | Hard stop with migration message |
| FFmpeg version below 6.0 | Hard stop |
| Metadata validation failure | Hard stop |

All failures: log structured error, set `status = failed`, leave artifacts intact for debugging. No silent correction.

---

## 15. New Files

```
src/
  validators/
    visual_asset_validator.ts
    scene_schema.ts              ← updated for v1.1
  engines/
    scene_render_engine.ts
    wav_concat_engine.ts

schemas/
  scene_schema_v1.1.json
  provenance_schema_v1.json
  media_metadata_schema_v1.json  ← updated (scene array added)

assets/
  visuals/                       ← governed PNG assets

docs/
  spikes/
    SDXL_DETERMINISM_SPIKE_RESULTS.json

tools/
  generate_visual.py             ← offline authoring tool (not pipeline)
```

---

## 16. Documentation Updates

- `VISU_TECHNICAL_SPEC.md`:
  - Mode C full pipeline form
  - Visual asset governance system
  - Double-encode exception formally documented
  - `sourceVideoPath` semantics (points to `stitched_video.mp4` in Mode C)
  - Metadata scope expansion noted in version history
  - `narration_concat.wav` added to artifact layout
- `ENVIRONMENT.md`:
  - Authoring workflow for visual generation
  - Provenance sidecar creation
  - ffprobe image dimension probe command
- `docs/spikes/SDXL_DETERMINISM_SPIKE_RESULTS.json` — committed for traceability

---

## 17. Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Double encode drift | Low | Profile locked, snapshot tested |
| Metadata scope creep | Low | Explicitly governed, schema enforced |
| WAV concat mismatch | Low | Uniformity gate, fully specified |
| PNG resolution mismatch | Low | ffprobe verification at runtime |
| Runtime AI instability | Eliminated | Offline generation only |

Overall risk: **Low–Medium**. Acceptable.

---

## 18. Success Criteria

Sprint 6B is complete when:

- [ ] Scene schema v1.1 strictly validated
- [ ] Schema v1.0 contracts rejected with migration message
- [ ] Visual asset provenance validated per scene (PNG + sidecar + hash + dimensions)
- [ ] PNG dimensions verified via ffprobe before conversion
- [ ] Scene clip encoding profile identical to AVMergeEngine profile (snapshot tested)
- [ ] Prompt library enforcement active (`approved === true`)
- [ ] Script template enforcement active
- [ ] Narration generated per scene via Piper
- [ ] Unified drift rule enforced per scene
- [ ] WAV uniformity validated (sample rate, codec, channels, bit depth)
- [ ] WAV concat produces `narration_concat.wav` deterministically
- [ ] `narration_concat.wav` retained as intermediate artifact
- [ ] Scene-level metadata in `media_metadata.json` (summary-only)
- [ ] Metadata scope expansion documented in `VISU_TECHNICAL_SPEC.md`
- [ ] Identical contract + assets produces identical `final.mp4`
- [ ] Spike results committed to `docs/spikes/`
- [ ] All unit tests pass
- [ ] Integration test passes with SHA256 stability
- [ ] `npm run build`, `npm test`, `npm run lint` all pass
- [ ] Documentation updated

---

## 19. Issue Resolution Status

| Issue | Status |
|---|---|
| SDXL hardware constraint | Closed — runtime inference removed, spike archived |
| CPU non-determinism | Closed — PNG assets are static, no runtime inference |
| Schema v1.0 migration policy | Closed — hard reject with migration message |
| WAV concat unspecified | Closed — `wav_concat_engine.ts` fully specified |
| Double transcode point | Closed — formally accepted exception, documented |
| `duration_sec` vs drift tolerance conflict | Closed — unified single rule |
| Model file governance | Closed — provenance sidecar system |
| Scene clip encoding profile unspecified | Closed — locked profile, snapshot tested |
| PNG dimension probing method unspecified | Closed — ffprobe, consistent with existing pattern |
| Enforcement checklist not mapped to tests | Closed — each item mapped to named test |
| `narration_concat.wav` retention policy | Closed — retained, consistent with Sprint 6A policy |

No remaining open items.

---

## Strategic Note

Sprint 6B completes Mode C compliance. After this sprint VISU executes all three input modes deterministically. Sprint 7 (Observability Hardening) runs across all three modes with full knowledge of their real failure surfaces — the strongest possible foundation for hardening work.
