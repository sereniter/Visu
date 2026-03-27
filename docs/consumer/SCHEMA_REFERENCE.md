# Schema Reference

The locked schemas Bhairav authors against. Concise and precise.

---

## 1. Current Schema Versions

| Schema | Version | File |
|--------|---------|------|
| Scene contract (Mode C) | 1.4 | `schemas/scene_schema_v1.4.json` |
| Scene contract (ui_flow_scenes) | 1.5 / 1.6 | `schemas/scene_schema_v1.5.json`, `schemas/scene_schema_v1.6.json` (v1.6: optional renderer, useRemotionOverlays) |
| Recorded wrap (Mode B optional) | 1.1 | `schemas/recorded_wrap_schema_v1.1.json` |
| Media metadata | 1.0 | `schemas/media_metadata_schema_v1.json` |
| Upload metadata | 1.0 | `schemas/upload_metadata_schema_v1.json` |
| Language registry | 1.1 | `schemas/language_registry_schema_v1.1.json` |
| Flow (Mode A) | 1 | `schemas/flow_schema_v1.json` |
| Mode B script (narration + optional music) | 1.0 / 1.1 | `schemas/script_schema_v1.json` (optional `music` in v1.1) |

---

## 2. Mode B Script (v1.0 / v1.1) — Optional Background Music

Mode B uses a script JSON (version, language, text or template). Script schema v1.1 adds an optional **`music`** field: path to a WAV file relative to `contentRoot/{topic}/`. When present, that track is used as background music (looped/trimmed to video duration, mixed at 15%, full video). When absent, config **execution.defaultBackgroundMusicPath** can supply a default track. See **Contract Authoring Guide** for path rules, LUFS (-15 to -17), and default config.

---

## 3. Scene Contract v1.4 — Mode C (governed_image | remotion)

Mode C uses **scene schema v1.4**. Each scene’s `visual` is a **oneOf**:

- **governed_image** — PNG asset: `type`, `asset_path`, `prompt_key`, `seed`, `model_version`; scene has `duration_sec`.
- **remotion** — Remotion composition: `type: "remotion"`, `component: "SceneTitleCard"`, `props` (object); scene has **no** `duration_sec` (duration comes from composition/render).

**Sprint 13 additions (all optional, additive):**
- `visual.visual_style` — preset name (e.g. `war_documentary`) expanding to default motion + grade from `config/visual_styles.json`.
- `visual.motion` — Ken Burns override: `{ type, focus, intensity }`. Six types: zoom_in, pan_right, zoom_out, pan_left, pan_diagonal_tl, pan_diagonal_br.
- `visual.grade` — color grade name (e.g. `cinematic_dark`) from `config/grades.json`.
- `overlays[]` — array of overlay objects (lower_third, stat_badge, source_tag, highlight_circle, arrow_pointer) with timing fields.

Only `SceneTitleCard` is allowed for remotion scenes in Mode C. Props must match `remotion_props_schema_v1.json`. Validate against `schemas/scene_schema_v1.4.json`.

---

## 3b. Scene Contract v1.6 — ui_flow_scenes (optional Remotion intro/summary)

Same required fields as v1.5. v1.6 adds:

- **intro** / **summary**: optional **`renderer`** — `"png"` (default) or `"remotion"`. When `"remotion"`, VISU renders via Remotion (IntroCard/SummaryCard) instead of PNG + TTS clip.
- **post_production**: optional **`useRemotionOverlays`** (boolean). When true and `config.remotion.enabled` is true, step title cards and progress indicator use Remotion (SceneTitleCard, ProgressOverlay) instead of FFmpeg drawtext.

Schema file: `schemas/scene_schema_v1.6.json`.

---

## 3c. Recorded Wrap v1.1 — Mode B optional intro/summary

Optional JSON passed via `--wrap-contract`. Schema: `schemas/recorded_wrap_schema_v1.1.json`.

- **schemaVersion:** `"1.1"`.
- **wrap** (optional): **intro** and/or **summary**, each with:
  - **renderer:** `"png"` | `"remotion"`.
  - **component:** `"IntroCard"` (intro) or `"SummaryCard"` (summary) when renderer is Remotion.
  - **props:** object matching the component’s props schema.

When present, VISU concatenates: intro clip + merged (video + narration) + summary clip. All clips must match the locked encoding profile.

---

## 3d. Scene Contract v1.3 — Annotated Full Example (Mode C, governed_image only)

Complete working example with every required field. Paths and keys must exist in your project (prompt library, script templates, PNG + provenance).

```json
{
  "schema_version": "1.3",
  "video_id": "my_video_001",
  "scenes": [
    {
      "scene_id": "intro",
      "duration_sec": 5.0,
      "visual": {
        "type": "governed_image",
        "asset_path": "assets/visuals/intro.png",
        "prompt_key": "intro_prompt",
        "seed": 12345,
        "model_version": "1.0"
      },
      "narration": {
        "text_template_key": "intro_script",
        "language": "te",
        "voice_gender": "male",
        "speed": 0.95
      }
    },
    {
      "scene_id": "outro",
      "duration_sec": 3.0,
      "visual": {
        "type": "governed_image",
        "asset_path": "assets/visuals/outro.png",
        "prompt_key": "outro_prompt",
        "seed": 67890,
        "model_version": "1.0"
      },
      "narration": {
        "text_template_key": "outro_script",
        "language": "te",
        "voice_gender": "male",
        "speed": 1.0
      }
    }
  ]
}
```

- **schema_version:** Must be the string `"1.3"`.
- **video_id:** Your identifier for the video.
- **scenes:** At least one scene. Each scene has `scene_id`, `duration_sec` (&gt; 0), `visual` (governed_image with `asset_path`, `prompt_key`, `seed`, `model_version`), and `narration` (`text_template_key`, `language`, `voice_gender`, `speed`).
- **voice_gender:** Only `"male"` or `"female"`; must be available for the given `language` in the language registry.

---

## 4. Media Metadata v1.0 — Annotated Full Example

Example of what VISU writes to `artifacts/{runId}/media_metadata.json`. Not all fields are present in every run (e.g. Mode C adds `scenes`, `sceneCount`, `maxDriftMs`, `avgDriftMs`).

```json
{
  "runId": "550e8400-e29b-41d4-a716-446655440000",
  "mode": "generative",
  "encodingProfileVersion": "v1",
  "ffmpegVersion": "6.0",
  "ffmpegBinaryFingerprint": "abc123...",
  "sourceVideoPath": "",
  "narrationPath": "",
  "musicPath": null,
  "musicLufs": null,
  "durationMs": 8000,
  "driftMs": 0,
  "crf": 18,
  "audioSampleRate": 48000,
  "duckingDb": -14,
  "outputPath": "artifacts/550e8400-e29b-41d4-a716-446655440000/final.mp4",
  "outputSha256": "def456...",
  "generatedAt": "2025-02-22T12:00:00.000Z",
  "language": "te",
  "voiceGender": "male",
  "sceneCount": 2,
  "maxDriftMs": 50,
  "avgDriftMs": 25,
  "scenes": [
    {
      "scene_id": "intro",
      "language": "te",
      "voiceGender": "male",
      "driftMs": 30,
      "narrationDurationMs": 4970
    },
    {
      "scene_id": "outro",
      "language": "te",
      "voiceGender": "male",
      "driftMs": 20,
      "narrationDurationMs": 2980
    }
  ]
}
```

- **runId:** UUID for the run.
- **mode:** `ui_flow` | `ui_flow_scenes` | `recorded` | `generative`.
- **outputPath** / **outputSha256:** Path to `final.mp4` and its SHA256.
- **generatedAt:** ISO8601.
- **musicPath** / **musicLufs:** When Mode B uses background music (script or config default), path to the WAV and its measured LUFS; otherwise null.
- **scenes:** Mode C only; per-scene summary (no full prompt/template text).

---

## 5. Version History

| Version | Change | Migration |
|---------|--------|-----------|
| 1.0 | Initial schema. | — |
| 1.1 | Added `narration.language`. | `visu migrate-contract`. |
| 1.2 | Language governance tightened. | `visu migrate-contract`. |
| 1.3 | `voice` replaced by `voice_gender` (male/female). | `visu migrate-contract`. |
| 1.4 | Mode C: `visual` oneOf governed_image \| remotion (SceneTitleCard); remotion scenes have no duration_sec. Sprint 13: optional `visual_style`, `motion`, `grade` on visual; optional `overlays[]` on scene. | — |
| 1.5 | ui_flow_scenes: intro, summary, recording_enhancements, post_production, scenes with steps. | — |
| 1.6 | ui_flow_scenes: optional intro/summary `renderer` (png \| remotion), post_production `useRemotionOverlays`. | — |

Older scene contract versions (1.0–1.2) are rejected at runtime. Use the migration tool for 1.x → 1.3. For Mode C use 1.4; for ui_flow_scenes use 1.5 or 1.6.

---

## 6. How to Validate a Contract Manually

- **Option 1 — Run validation:** Run the pipeline with the contract; VISU validates before rendering. Use a minimal single-scene contract and short `duration_sec` if you only want to verify schema and references.
- **Option 2 — JSON schema:** Validate against the correct schema: `scene_schema_v1.4.json` (Mode C), `scene_schema_v1.5.json` or `scene_schema_v1.6.json` (ui_flow_scenes), `recorded_wrap_schema_v1.1.json` (Mode B wrap). Use any JSON Schema validator (e.g. ajv-cli). This catches schema violations but not runtime checks (e.g. prompt key exists, template language match).
- **Migration:** For older contracts, run `visu migrate-contract --input <path> --output <path>` to produce a v1.3 contract; the tool reports warnings (e.g. voice → gender resolution).

There is no `--dry-run` flag; validation is performed at the start of `visu run --mode generative --contract <path>` (or ui_flow_scenes / recorded with wrap).
