# Sprint 11 — Complete Summary

**Sprint:** Scene-Driven Mode A + Viewer Experience Enhancements  
**Status:** Implemented  
**Plan:** `docs/SPRINT_11_EXECUTION_PLAN_v1.0.md`

---

## 1. Objective

Transform Mode A from a single-flow screen recorder into a **scene-driven, narrated, professionally enhanced tutorial video engine**: one v1.5 contract → intro + N recorded scenes + summary → one final video. Fully automated, any language, any flow.

---

## 2. What Was Delivered

### 2.1 Core Engine

| Deliverable | Description |
|-------------|-------------|
| **UIFlowSceneEngine** | `src/engines/ui_flow_scene_engine.ts` — validates v1.5 contract, renders intro/summary (PNG + TTS), runs per-scene Playwright recording (audio-first: narration duration drives clip length), concats timeline, applies post-production, AV merge, metadata and copy. |
| **visu parse-recording** | `src/cli/parse_recording.ts` — reads Playwright codegen JS, splits on `window.__VISU_SCENE_END__ = "scene_id"`, maps goto/click/fill/waitForSelector/screenshot to contract steps, applies template map, writes v1.5 contract. CLI: `--input`, `--template-map`, `--output`, `--topic`, `--language`, `--voice-gender`, `--music`, `--base-url`. |
| **Schema v1.5** | `schemas/scene_schema_v1.5.json` — `mode: "ui_flow_scenes"`, `baseUrl`, `intro`, `summary`, `recording_enhancements`, `post_production`, `scenes` with steps. Validator: `validateUIFlowScenesContract()` in `src/validators/scene_schema.ts`. |
| **Intro / summary** | Mode C pattern: PNG asset + TTS + buffer → clip; same encoding profile as scene clips. |

### 2.2 Recording Enhancements

| Enhancement | Implementation |
|-------------|----------------|
| **Cursor highlight** | Injected via `page.addInitScript`: fixed div following mouse, AnukramAI orange, pointer-events none. |
| **Button highlight** | Before each click step: outline + box-shadow on selector, wait `highlightDurationMs`, then click, then clear. |
| **Click sound** | When `soundsBaseUrl` unset: Web Audio oscillator beep. When set: `Audio(soundsBaseUrl + "/click.wav")` from static sounds server. |
| **Ambient sounds** | After navigate: `page_load.wav`. After fill: `keyboard.wav`. Served from `assets/sounds/` (or topic override) via `src/core/sounds_server.ts`. |
| **Zoom to action** | Click timestamps collected per scene; after timeline, global times computed; FFmpeg `zoompan` at each timestamp (configurable `zoomLevel`, 0.5s duration) in `post_production_helpers.applyZoomToAction()`. |

### 2.3 Post-Production

| Feature | Implementation |
|---------|----------------|
| **Step title card** | FFmpeg `drawtext` at segment start (2s), scene title. |
| **Progress indicator** | `drawtext` "Step X of N" per segment. |
| **Transition sound** | `assets/sounds/transition.wav` inserted between narration WAVs in WAV concat. |
| **Chapter markers** | MP4 metadata `CHAPTERnn`, `CHAPTERnnNAME` from cumulative segment times. |
| **Subtitle track** | `generateSrt()` → `subtitles.srt` from segment texts and durations; copied to output dir and menu_item. |
| **Thumbnail** | Frame at 3s + drawtext title → `thumbnail.png`. |
| **Video description** | `assembleVideoDescription()` from intro + scene titles/texts + summary → `upload_metadata.json` `description`. |

Helpers live in `src/engines/post_production_helpers.ts`.

### 2.4 Default Sounds & Script Templates

- **Sounds:** `assets/sounds/click.wav`, `keyboard.wav`, `page_load.wav`, `transition.wav` (+ README). Override per topic: `{contentRoot}/{topic}/sounds/`.
- **Script templates:** Loaded per flow from `{contentRoot}/{topic}/scripts/script_templates.json`; if missing, fallback to repo `scripts/script_templates.json`. Entries may use `text` or `template`; `language` must match scene narration. Same behaviour for Mode C (governedRoot = contentRoot/topic).

---

## 3. Authoring Workflow

1. Run `npx playwright codegen <baseUrl>` and walk the flow.
2. At each scene boundary in the browser console: `window.__VISU_SCENE_END__ = "s1_login";` (or your scene ID).
3. Save codegen as `recipes/{topic}/recording.js`.
4. Create template map JSON: `{"s1_login": "billing_login_en", ...}`.
5. Run `visu parse-recording --input ... --template-map ... --output ... --topic ... --language en --voice-gender female --music music/bg.mp3 --base-url <url>`.
6. Add narration templates to `recipes/{topic}/scripts/script_templates.json` (intro, summary, each scene key).
7. Place intro/summary PNGs (and optional provenance) in `recipes/{topic}/visuals/`.
8. Run `visu run --mode ui_flow_scenes --contract recipes/{topic}/contracts/<contract>.json`.

---

## 4. Pipeline Order (Scene-Driven)

1. FFmpeg version check (≥ 6.0)  
2. Contract validation (v1.5), language registry, script templates, intro/summary assets  
3. Render intro (PNG + TTS + music)  
4. For each scene: TTS → recording duration → inject enhancements → Playwright record → webm→mp4 → mix narration + music → AV merge; collect click timestamps  
5. Render summary (PNG + TTS + music)  
6. Timeline concat → stitched video  
7. Optional: title card + progress (drawtext) → stitched_enhanced.mp4  
8. Optional: zoom-to-action (zoompan at click times) → stitched_zoomed.mp4  
9. WAV concat (narration + optional transition.wav between segments)  
10. AVMergeEngine → final.mp4  
11. Optional: chapter markers, SRT, thumbnail, upload_metadata.json description  
12. Metadata write, copy to `outputRoot/{topic}/{language}/` (including subtitles.srt, thumbnail.png when present)  

---

## 5. Key Files

| Area | Files |
|------|--------|
| Engine | `src/engines/ui_flow_scene_engine.ts`, `src/engines/post_production_helpers.ts` |
| CLI | `src/cli/parse_recording.ts`, `src/index.ts` (ui_flow_scenes, parse-recording, extraFiles for copy) |
| Schema / types | `schemas/scene_schema_v1.5.json`, `src/validators/scene_schema.ts` (UIFlowSceneContractV15, intro/summary, recording_enhancements, post_production) |
| Sounds | `src/core/sounds_server.ts`, `assets/sounds/*.wav` |
| Metadata / copy | `src/engines/metadata_writer.ts` (CopyOutputParams.extraFiles) |
| Tests | `tests/scene_schema.test.ts`, `tests/parse_recording.test.ts`, `tests/ui_flow_scenes_integration.test.ts`; fixtures under `tests/fixtures/ui_flow_scenes/` |

---

## 6. Testing

- **Unit:** v1.5 schema, parse-recording (scene split, template map, step conversion), post-production behaviour covered in scene_schema and parse_recording tests.
- **Integration (gated):** `RUN_MODE_A_SCENES_INTEGRATION=true`. Uses `tests/fixtures/ui_flow_scenes/contract_v1.5_fixture.json` and topic `ui_flow_scenes_test` under the same dir; beforeAll creates placeholder intro/summary PNGs (FFmpeg) and sets contentRoot to fixtures dir. Asserts: status completed, final.mp4 and metadata exist, optional subtitles.srt and upload_metadata.json description.

---

## 7. Documentation Updated

- **Consumer:** CONTRACT_AUTHORING_GUIDE (scene-driven workflow, v1.5, script templates from contentRoot), CLI_REFERENCE (ui_flow_scenes, parse-recording), ERROR_REFERENCE (template key), ARTIFACT_REFERENCE and SCHEMA_REFERENCE (mode enum).
- **Technical:** VISU_TECHNICAL_SPEC (execution modes, script templates path, Mode C governedRoot = contentRoot/topic).
- **Environment:** ENVIRONMENT.md (script templates per-flow, text/template keys).
- **Sprint:** SPRINT_11_EXECUTION_PLAN status and success criteria; SPRINT_10_PATCH (governedRoot).

---

## 8. Success Criteria (Final)

All implemented except optional product-level “billing flow in all three languages”:

- UIFlowSceneEngine end-to-end, parse-recording, SCENE_END splitting  
- Intro/summary (Mode C pattern), audio-first recording  
- Cursor highlight, button highlight, click sound, ambient sounds, zoom-to-action  
- Title card, progress, transition sound, chapters, SRT, thumbnail, video description  
- Default sounds in repo, all enhancements contract-driven  
- Unit tests pass, gated integration test with fixture content  
- Build, test, lint pass; consumer and technical docs updated  

---

## 9. Out of Scope / Future

- **Sprint 12:** AI-driven Mode A (plain-language steps, no codegen).  
- **Future patches:** Fade out at video end, per-scene music volume, per-topic highlight colour.
