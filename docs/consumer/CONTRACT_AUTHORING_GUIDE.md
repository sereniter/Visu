# Contract Authoring Guide

This guide covers everything needed to produce a valid contract for VISU. Bhairav authors contracts and passes them to VISU via the CLI.

---

## 1. Overview

### What is a contract?

A **contract** is a JSON file that describes what VISU should produce. The format depends on the run mode:

- **Mode A (UI Flow):** A flow definition with steps (navigate, click, fill, wait, screenshot, done).
- **Scene-driven Mode A (ui_flow_scenes):** A v1.5 scene contract with intro, summary, and recorded scenes (steps + narration). One contract → one final video.
- **Mode B (Recorded):** No contract file; you supply an input video and a narration script.
- **Mode C (Generative):** A structured scene contract (schema v1.4) with topic, language, scenes, visuals, and narration.

### Which mode to use

| Mode | Use when |
|------|----------|
| **ui_flow** | You want VISU to drive a browser, perform UI actions, and capture a single video. |
| **ui_flow_scenes** | You want a scene-driven tutorial: record with Playwright codegen, split by scene markers, add intro/summary; narration drives clip length. |
| **recorded** | You already have an MP4 and a script; VISU merges narration with the video. |
| **generative** | You want scene-based video from governed PNG assets and script templates (Mode C). |

### Current schema version

- **Scene contract (Mode C):** `1.4` (supports `visual.type`: `governed_image` or `remotion` with `SceneTitleCard`)
- **Scene contract (ui_flow_scenes):** `1.5` or `1.6` (mode `"ui_flow_scenes"`; v1.6 adds optional `renderer` on intro/summary and `post_production.useRemotionOverlays`)
- **Recorded wrap (Mode B):** `1.1` (optional `--wrap-contract` for intro/summary; see §3b)
- **Flow (Mode A):** flow schema v1

### Content Repository

All content is organised under two root folders configured in VISU:

- **contentRoot** — where you place inputs (recordings, visuals, scripts, contracts)
- **outputRoot** — where VISU writes completed videos

Within each root, content is organised by topic:

```
recipes/{topic}/         ← your inputs
menu_item/{topic}/{lang}/ ← completed videos
```

The `topic` field in your contract determines which subfolder VISU reads from and writes to.

---

## 2. Mode A — UI Flow Contract

### When to use Mode A

Use Mode A when the source of truth is a deterministic UI flow: VISU launches a browser, runs the steps, and records the result as video.

### Required fields and structure

- `flow_id` (string, non-empty)
- `version` (string, non-empty)
- `steps` (array of steps)

Each step must have:

- `step_id` (string, non-empty)
- `action` (one of: `navigate` | `click` | `fill` | `wait` | `screenshot` | `done`)

Optional per action:

- `url` for `navigate`
- `selector` for `click` / `fill`
- `value` for `fill`
- `timeout_ms` (non-negative integer)

### The `done` rule

The last step **must** be a `done` action, and it must appear **exactly once**. No steps are allowed after `done`.

### Full annotated example (Mode A)

```json
{
  "flow_id": "onboarding_walkthrough",
  "version": "1.0",
  "steps": [
    {
      "step_id": "s1",
      "action": "navigate",
      "url": "https://example.com"
    },
    {
      "step_id": "s2",
      "action": "wait",
      "timeout_ms": 2000
    },
    {
      "step_id": "s3",
      "action": "click",
      "selector": "#start-button"
    },
    {
      "step_id": "s4",
      "action": "fill",
      "selector": "#name",
      "value": "User Name"
    },
    {
      "step_id": "s5",
      "action": "screenshot"
    },
    {
      "step_id": "s6",
      "action": "done"
    }
  ]
}
```

### Flow versioning

Set `version` to a string you control (e.g. `"1.0"`). VISU records it in run metadata for traceability.

---

## 2b. Scene-driven Mode A — v1.5 Contract (ui_flow_scenes)

### When to use

Use **ui_flow_scenes** when you want a narrated, scene-based tutorial: record a flow with Playwright codegen, insert `window.__VISU_SCENE_END__ = "scene_id"` at scene boundaries, then run `visu parse-recording` to produce a v1.5 contract. VISU renders intro (PNG + TTS), records each scene (narration duration drives clip length), renders summary (PNG + TTS), then concatenates and merges.

### Authoring workflow

1. Run `npx playwright codegen https://app.anukramai.com` and walk through the flow.
2. In the browser console at each scene boundary, run: `window.__VISU_SCENE_END__ = "s1_login";` (or your scene ID).
3. Save the codegen output as e.g. `recipes/{topic}/recording.js`.
4. Create a template map JSON mapping scene IDs to script template keys: `{"s1_login": "billing_login_en", ...}`.
5. Run `visu parse-recording --input recipes/{topic}/recording.js --template-map ... --output recipes/{topic}/contracts/{topic}_en.json --topic {topic} --language en --voice-gender female --music music/bg_track.mp3 --base-url https://app.anukramai.com`.
6. Add narration templates to `recipes/{topic}/scripts/script_templates.json` (intro, summary, and each scene key from the template map). Texts are loaded per flow from contentRoot; if that file is missing, the engine falls back to the repo `scripts/script_templates.json`.
7. Place intro and summary PNGs (and provenance) in `recipes/{topic}/visuals/`.
8. Run `visu run --mode ui_flow_scenes --contract recipes/{topic}/contracts/{topic}_en.json`.

### Required contract fields (v1.5)

- `schema_version`: `"1.5"`
- `mode`: `"ui_flow_scenes"`
- `video_id`, `topic`, `language`, `baseUrl`
- `intro`, `summary`: each with `scene_id`, `asset_path`, `prompt_key`, `seed`, `model_version`, `narration` (text_template_key, language, voice_gender, speed), `buffer_sec`, `music`
- `recording_enhancements`: e.g. clickSound, clickHighlight, cursorHighlight, zoomToAction, etc.
- `post_production`: stepTitleCard, progressIndicator, transitionSound, chapterMarkers, subtitleTrack, thumbnail, videoDescription
- `scenes`: array of `{ scene_id, title, narration, buffer_sec, music, steps }` where each step is `{ action, url? }`, `{ action, selector?, value? }`, or `{ action: "done" }`

Steps use relative URLs for `navigate` (resolved against `baseUrl`). See `schemas/scene_schema_v1.5.json` or `schemas/scene_schema_v1.6.json` for the full schema.

### Using Remotion for intro and summary (v1.6)

When Remotion is enabled in config (`remotion.enabled: true`), you can use **schema_version** `"1.6"` and set intro/summary to render via Remotion instead of PNG:

- Set **`intro.renderer`** and/or **`summary.renderer`** to `"remotion"`. Omit or set to `"png"` for the existing PNG-based behaviour.
- In **post_production**, set **`useRemotionOverlays`** to `true` to use Remotion for step title cards and progress indicator (SceneTitleCard, ProgressOverlay). Omit or `false` for FFmpeg drawtext.
- When **`useRemotionOverlays`** is **true**, the pipeline inserts **silent audio** (`title_card_pad.wav`) into **`narration_concat.wav`** before each step’s speech (after an optional **transition** beep) so spoken narration lines up with the silent title card on video. Consumer tools that analyze `narration_concat.wav` should treat it as **speech plus synthetic silence**, not raw TTS only.

Example snippet (v1.6):

```json
{
  "schema_version": "1.6",
  "mode": "ui_flow_scenes",
  "intro": {
    "renderer": "remotion",
    "scene_id": "intro",
    "asset_path": "assets/visuals/intro.png",
    "prompt_key": "intro_prompt",
    "seed": 12345,
    "model_version": "1.0",
    "narration": { ... },
    "buffer_sec": 0.5,
    "music": "music/bg.wav"
  },
  "summary": {
    "renderer": "remotion",
    ...
  },
  "post_production": {
    "useRemotionOverlays": true,
    ...
  },
  "scenes": [ ... ]
}
```

If the contract requests Remotion but `config.remotion.enabled` is false, the run fails with `REMOTION_DISABLED_IN_CONFIG` (no silent fallback).

---

## 3. Mode B — Recorded Contract

Mode B does **not** use a scene contract for the main run. You supply:

1. **Input video:** MP4 file with a valid video stream and non-zero duration.
2. **Script file:** JSON matching the script schema (version, language, text).
3. **Optional wrap contract:** JSON file passed via `--wrap-contract` (schema **recorded_wrap_schema_v1.1**). When present, VISU renders intro and/or summary (Remotion or PNG) and concatenates intro + merged video + summary. The wrap contract has `schemaVersion: "1.1"` and optional `wrap.intro` / `wrap.summary` with `renderer` (`"png"` | `"remotion"`), `component` (e.g. `IntroCard`, `SummaryCard` for Remotion), and `props`. Allowed Remotion components for wrap are IntroCard and SummaryCard only.

### Input video requirements

- Format: MP4
- Must have at least one video stream
- Duration &gt; 0
- File must exist at the path you pass to `--video`

### Script file format

```json
{
  "version": "1.0",
  "language": "te",
  "text": "Full narration text to be synthesized."
}
```

- `version`: must be `"1.0"` (or `"1.1"` when using optional music)
- `language`: must match a supported language in the language registry (e.g. `te`, `en`, `hi`)
- `text`: non-empty string (TTS will speak this)

### Optional background music (script schema v1.1)

Mode B supports an optional **`music`** field for a background music track:

- **`music`** (optional): path to a WAV file, **relative to `contentRoot/{topic}/`**. If present, the track is looped or trimmed to the video duration, mixed under narration at 15% level, and the mix runs for the **full video** (music continues after narration ends; no silence at the end). If absent, narration-only mix (existing behaviour).
- **Where to put the file:** `{contentRoot}/{topic}/music/<filename>.wav` (e.g. `recipes/login_flow/music/bg_track.wav`). In the script, set `"music": "music/bg_track.wav"`.
- Music file must be WAV format and must exist at the resolved path — run fails if declared but missing.
- LUFS of the source music must be in the -15 to -17 range (validated before mix).

Scripts without `music` (schema v1.0 or v1.1) remain valid; no migration required. You can set a **default** background music file in **`config/mode_b.json`** under `execution.defaultBackgroundMusicPath` (absolute path to a WAV file); when the script has no `music` field, that file is used if it exists (Mode B merge). Omit the key or leave it empty for narration-only when no script music is set. See [CONFIG_REFERENCE.md](./CONFIG_REFERENCE.md).

### Mode B drift rule

Mode B does **not** use the 200 ms drift rule. The rule is: **narration duration ≤ video duration**. If narration is longer than the video, the run fails. If narration is shorter, any gap is filled by silence or by background music (script `music` or **`config/mode_b.json`** **execution.defaultBackgroundMusicPath**) — no drift violation.

---

## 4. Mode C — Structured Scene Contract

### When to use Mode C

Use Mode C when you have governed visual assets (PNG + provenance), script templates, and a prompt library. VISU renders each scene (PNG → clip, template → narration), then concatenates and merges to produce `final.mp4`.

### Schema version

Mode C contracts use **scene schema v1.4**.

### Auto-tune (always on)

Generative mode **always** runs auto-tune; there is no `--auto-tune-durations` flag. Phase 1: TTS per scene, measure narration duration, set each scene’s `duration_sec = (narrationDurationMs + 20) / 1000` (20 ms buffer). Phase 2: Remotion per-scene render using tuned durations, then per-scene AV merge and concat. BHIRAV should invoke `--mode generative --contract <path>` only; VISU performs both phases.

### Full annotated example (Mode C v1.4 with Sprint 13 enhancements)

```json
{
  "schema_version": "1.4",
  "video_id": "my_video_001",
  "topic": "my_topic",
  "language": "en",
  "scenes": [
    {
      "scene_id": "intro",
      "duration_sec": 5.0,
      "visual": {
        "type": "governed_image",
        "asset_path": "assets/visuals/intro_frame.png",
        "prompt_key": "intro_prompt",
        "seed": 12345,
        "model_version": "1.0",
        "visual_style": "war_documentary",
        "motion": { "type": "zoom_in", "focus": "center", "intensity": 0.20 },
        "grade": "cinematic_dark"
      },
      "narration": {
        "text_template_key": "intro_script",
        "language": "te",
        "voice_gender": "male",
        "speed": 0.95
      },
      "overlays": [
        {
          "type": "lower_third",
          "text": "Introduction",
          "font_size": 42,
          "start_sec": 1.0,
          "end_sec": 4.0
        }
      ]
    }
  ]
}
```

All Sprint 13 fields (`visual_style`, `motion`, `grade`, `overlays`) are optional. A v1.3 contract without these fields is still valid against the v1.4 schema.

### Scene object fields

| Field | Type | Description |
|-------|------|-------------|
| `scene_id` | string | Unique identifier for the scene. |
| `duration_sec` | number | Duration of the scene clip in seconds (must be &gt; 0). |
| `visual` | object | Governed image spec (see below). |
| `narration` | object | Script template + language + voice (see below). |
| `overlays` | array | (Optional, Sprint 13) Array of overlay objects to render on top of the scene clip. See §4b. |

**visual** — oneOf:

- **governed_image:** `type: "governed_image"`, `asset_path`, `prompt_key`, `seed`, `model_version`. Scene must have `duration_sec`.
- **remotion:** `type: "remotion"`, `component: "SceneTitleCard"`, `props` (object). Scene has **no** `duration_sec`; duration comes from the composition. Props must match `remotion_props_schema_v1.json`. Only SceneTitleCard is allowed for Mode C remotion scenes.

| Field (governed_image) | Type | Description |
|-------|------|-------------|
| `type` | string | Must be `"governed_image"`. |
| `asset_path` | string | Path to the PNG (relative to project root or governed root). |
| `prompt_key` | string | Key in the prompt library for this asset. |
| `seed` | integer | Seed used for generation (for provenance). |
| `model_version` | string | Model version string. |
| `visual_style` | string | (Optional, Sprint 13) Preset name from `config/visual_styles.json`. Expands to default motion + grade. |
| `motion` | object | (Optional, Sprint 13) Ken Burns motion override: `type`, `focus`, `intensity`. |
| `grade` | string | (Optional, Sprint 13) Color grade name from `config/grades.json`. |

**visual_style** presets: `war_documentary`, `historical_archive`, `geopolitical_tension`, `news_report`, `impact_moment`. Each preset sets default motion and grade; explicit `motion` or `grade` fields override the preset defaults.

**motion** fields:

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | One of: `zoom_in`, `pan_right`, `zoom_out`, `pan_left`, `pan_diagonal_tl`, `pan_diagonal_br`. |
| `focus` | string | Focus point (e.g. `"center"`). |
| `intensity` | number | Motion strength (clamped to 0.05–0.35 at render time). Higher = more visible movement. |

**narration**

| Field | Type | Description |
|-------|------|-------------|
| `text_template_key` | string | Key in the script templates file; template language must match `language`. |
| `language` | string | ISO 639-1 code: `en`, `hi`, or `te`. |
| `voice_gender` | string | `"male"` or `"female"`. Must be available for the chosen language (see table below). |
| `speed` | number | Speech rate (e.g. 0.95 = slightly slower). |

### voice_gender

Allowed values: `"male"` or `"female"`. The chosen gender must be registered for the scene’s `language` in the language registry.

### Available languages and genders

| Language code | Language | Male | Female |
|---------------|----------|------|--------|
| `en` | English | ✓ | ✓ |
| `hi` | Hindi | ✓ | ✓ |
| `te` | Telugu | ✓ | ✓ |

Availability depends on installed Piper models and `config/languages.json`. If a gender is not listed for a language, VISU will fail with a configuration error.

### prompt_key

References an entry in the **prompt library** (`prompts/prompt_library.json`). The key must exist and the entry must have `approved: true`. VISU does not use the prompt text at runtime for rendering; it is used for governance and provenance.

### text_template_key

References an entry in the **script templates**. Templates are loaded from the flow: `{contentRoot}/{topic}/scripts/script_templates.json`; if that file is missing, the engine uses the repo `scripts/script_templates.json`. Each entry may use `text` or `template`; the key must exist and the entry’s `language` must match the scene’s `narration.language`. The resolved text is sent to TTS.

### duration_sec and narration drift

Each scene has a fixed video duration (`duration_sec`). The narration WAV must not exceed that duration, and the gap between video end and narration end must not exceed **200 ms** (drift rule). If TTS output is too long, increase `duration_sec` or reduce `speed`.

### 4b. Overlays (Sprint 13)

Scenes can include an `overlays` array with text and graphic annotations rendered on top of the scene clip. Five overlay types are supported:

| Type | Category | Description |
|------|----------|-------------|
| `lower_third` | Text | Title bar at the bottom of the frame. Fields: `text`, `font_size`, `start_sec`, `end_sec`. |
| `stat_badge` | Text | Stat/number badge. Fields: `text`, `font_size`, `start_sec`, `end_sec`. |
| `source_tag` | Text | Source citation tag. Fields: `text`, `font_size`, `start_sec`, `end_sec`. |
| `highlight_circle` | Graphic | Translucent circle highlighting a subject. Fields: `cx`, `cy`, `radius`, `start_sec`, `end_sec`. |
| `arrow_pointer` | Graphic | Arrow pointing at a subject. Fields: `x1`, `y1`, `x2`, `y2`, `start_sec`, `end_sec`. |

**Common fields for all overlays:**

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | One of the five types above. |
| `start_sec` | number | When the overlay appears (seconds from scene start, ≥ 0). |
| `end_sec` | number | When the overlay disappears (must be > `start_sec`, ≤ scene `duration_sec`). |

**Validation rules (9 checks):**
1. `start_sec` and `end_sec` must be within `[0, duration_sec]`.
2. `end_sec` must be greater than `start_sec`.
3. Text overlays must have non-empty `text`.
4. `highlight_circle` coordinates (`cx`, `cy`) must be within frame bounds (1920×1080); `radius` > 0.
5. `arrow_pointer` coordinates must be within frame bounds; arrow must have non-zero length.
6. Font sizes for text overlays must be > 0 (when specified).

**Example overlay array:**

```json
"overlays": [
  {
    "type": "lower_third",
    "text": "Operation Thunder — Day 3",
    "font_size": 42,
    "start_sec": 1.0,
    "end_sec": 4.5
  },
  {
    "type": "highlight_circle",
    "cx": 960,
    "cy": 540,
    "radius": 120,
    "start_sec": 2.0,
    "end_sec": 5.0
  },
  {
    "type": "arrow_pointer",
    "x1": 400,
    "y1": 300,
    "x2": 700,
    "y2": 500,
    "start_sec": 3.0,
    "end_sec": 6.0
  }
]
```

**Rendering pipeline:** Text overlays use FFmpeg `drawtext`. Graphic overlays (circle, arrow) are rendered as transparent PNGs at runtime and composited via FFmpeg `filter_complex` with the `overlay` filter. Overlays are applied after the scene clip is rendered (post motion + grade), as a separate overlay pass.

### Visual asset requirements (Mode C)

- **Format:** PNG
- **Dimensions:** 1920×1080 (exact)
- **Provenance:** A sidecar file must exist at the same path with `.provenance.json` (e.g. `intro_frame.provenance.json`). The sidecar’s `output_hash` must match the SHA256 of the PNG.

---

## 5. Language and Voice Reference

### Supported languages

| Code | Language |
|------|----------|
| `en` | English |
| `hi` | Hindi |
| `te` | Telugu |

### Available genders per language

See the table in Section 4. Voice IDs (e.g. Piper voice names) are configured in the language registry and are **not** specified in the contract; contracts use only `language` and `voice_gender`.

---

## 6. Drift Rule Explained

### What drift means

**Drift** is the difference between the scene video duration and the narration (WAV) duration. If narration is longer than the video, the run fails (overflow). If narration is shorter than the video, the gap must be within the allowed limit (for Mode C) or may be filled by background music (Mode B).

### Mode B vs Mode C

| Mode | Drift rule |
|------|------------|
| **Mode B (recorded)** | Narration duration ≤ video duration only. No 200 ms limit. When `music` is set, music fills the gap after narration ends. |
| **Mode C (generative)** | Per scene: narration ≤ video and `(video_duration_ms - narration_duration_ms)` ≤ **200 ms**. |

### The 200 ms rule (Mode C)

For each Mode C scene, `(video_duration_ms - narration_duration_ms)` must be ≤ **200 ms**. If the gap is larger, VISU fails the run (e.g. `DRIFT_VIOLATION`).

### How to tune duration_sec (Mode C)

- If narration often overflows: increase `duration_sec` for that scene or reduce `speed`.
- If drift often exceeds 200 ms: decrease `duration_sec` so the video is closer to the narration length, or increase narration length (e.g. template text).

---

## 7. Contract Validation

### Before submitting

- Ensure the JSON is valid and the file path is correct.
- For Mode C: ensure `schema_version` is `"1.4"` and all required fields (including `topic`, `language`) are present. For ui_flow_scenes use `schema_version` `"1.5"` and `mode` `"ui_flow_scenes"`.
- For Mode A: ensure the last step is `done` and no steps follow it.
- Run `visu migrate-contract` if you have an older schema (e.g. 1.2 → 1.3).

### What validation errors look like

- **Flow:** "Flow schema validation failed" or "Flow termination rule violated" with details in the log.
- **Scene contract:** "Contract validation failed" with Ajv/schema error messages (e.g. missing required property, invalid enum). For Mode B wrap: `RECORDED_WRAP_VALIDATION_FAILED` when `--wrap-contract` JSON does not match recorded_wrap_schema_v1.1.
- **Language/gender:** "Language … is not in the registry" or "Gender … is not registered for language …".

### How to fix common errors

- **Schema invalid:** Fix the JSON to match `schemas/scene_schema_v1.4.json` (Mode C), `schemas/scene_schema_v1.5.json` or `schemas/scene_schema_v1.6.json` (ui_flow_scenes), `schemas/recorded_wrap_schema_v1.1.json` (Mode B wrap), or the flow schema (Mode A).
- **Schema outdated:** Run `visu migrate-contract --input <path> --output <path>`.
- **Prompt/template key not found:** Add the key to `prompts/prompt_library.json` or `scripts/script_templates.json` (for ui_flow_scenes/Mode C use `{contentRoot}/{topic}/scripts/script_templates.json` or repo `scripts/script_templates.json`), and ensure `approved: true` for prompts.
- **Template language mismatch:** Use a template whose `language` field matches the scene’s `narration.language`.

---

## 8. Schema Migration

### When to migrate

When the contract uses an older `schema_version` (e.g. 1.2) and VISU expects 1.3, run the migration tool instead of editing by hand.

### visu migrate-contract

```bash
visu migrate-contract --input contract_v1.2.json --output contract_v1.3.json
```

- Fails if the output file already exists.
- Reads the input contract, migrates to the current schema (e.g. 1.2 → 1.3), and writes the output.
- For 1.2 → 1.3: replaces `narration.voice` with `narration.voice_gender` using the language registry.

### Migration output

The command prints a JSON report to stdout with `status` (`ok` or `warning`), `fromVersion`, `toVersion`, `scenesModified`, and `warnings`. If a voice cannot be resolved to a gender, a warning is added and a default gender may be used; review the output and fix the contract if needed.
