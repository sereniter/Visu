# SPRINT_11_EXECUTION_PLAN_v1.0

**Status:** Implemented. Core engine, parse-recording, schema v1.5, intro/summary, recording enhancements, post-production (title card, progress, chapters, SRT, thumbnail, video description, transition sound), zoom-to-action (FFmpeg zoompan at click timestamps), default sounds, gated integration test with fixture content, and docs.  
**Applies To:** VISU — Scene-Driven Mode A + Viewer Experience Enhancements  
**Owner:** VISU Core Architecture  
**Prerequisites:** Sprint 10 patches complete  
**Target:** AnukramAI tutorial video production

---

## 1. Objective

Transform Mode A from a single-flow screen recorder into a scene-driven, narrated, professionally enhanced tutorial video engine.

One contract → N scenes → one final video. Fully automated. Any language. Any AnukramAI flow.

---

## 2. What This Sprint Delivers

**Core engine:**
- Scene-driven Mode A execution (`UIFlowSceneEngine`)
- Playwright codegen scene parser (`visu parse-recording`)
- Audio-first recording — narration duration drives clip length
- Introduction scene (Mode C pattern — PNG + TTS)
- Summary scene (same pattern)

**Recording enhancements:**
- Cursor highlight overlay
- Button highlight before click
- Click sound (Web Audio API)
- Ambient UI sounds (typing, page load)
- Zoom to action (subtle — 15-20%)

**Post-production enhancements:**
- Step title card per scene
- Progress indicator
- Transition sound between scenes
- Chapter markers in MP4
- Subtitle track (.srt)
- Thumbnail generation
- Video description assembly

---

## 3. Scope

### In Scope
- `UIFlowSceneEngine` — scene-driven Playwright execution
- `visu parse-recording` CLI — codegen output → scene contract
- Introduction and summary scene support
- All thirteen viewer experience enhancements
- Default ambient sound assets in `assets/sounds/`
- Scene contract schema update (v1.5)
- Full test coverage
- Consumer documentation updates

### Out of Scope
- AI-driven selector generation (Sprint 12)
- Option B keyboard shortcut recorder (future patch)
- Cloud rendering
- Mobile browser support

---

## 4. Authoring Workflow

```
1. npx playwright codegen https://app.anukramai.com
2. Walk through entire flow
3. At each scene boundary type in browser console:
   window.__VISU_SCENE_END__ = "s1_login";
4. Save codegen output as recipes/{topic}/recording.js
5. visu parse-recording \
     --input recipes/billing_flow/recording.js \
     --template-map recipes/billing_flow/template_map.json \
     --output recipes/billing_flow/contracts/billing_flow_en.json \
     --topic billing_flow \
     --language en \
     --voice-gender female \
     --music music/bg_track.mp3
6. Add narration templates to recipes/{topic}/scripts/script_templates.json (or repo scripts/ as fallback)
7. Place intro PNG + provenance in recipes/{topic}/visuals/
8. visu run --mode ui_flow_scenes \
     --contract recipes/billing_flow/contracts/billing_flow_en.json
```

---

## 5. Scene Contract Schema (v1.5)

**File:** `schemas/scene_schema_v1.5.json`

```json
{
  "schema_version": "1.5",
  "video_id": "billing_flow_en",
  "topic": "billing_flow",
  "language": "en",
  "mode": "ui_flow_scenes",
  "baseUrl": "https://app.anukramai.com",
  "intro": {
    "scene_id": "s0_intro",
    "asset_path": "visuals/billing_intro_12345_1.0.png",
    "prompt_key": "billing_intro",
    "seed": 12345,
    "model_version": "1.0",
    "narration": {
      "text_template_key": "billing_intro_en",
      "language": "en",
      "voice_gender": "female",
      "speed": 1.0
    },
    "buffer_sec": 1,
    "music": "music/bg_track.mp3"
  },
  "summary": {
    "scene_id": "s_summary",
    "asset_path": "visuals/billing_summary_12345_1.0.png",
    "prompt_key": "billing_summary",
    "seed": 12345,
    "model_version": "1.0",
    "narration": {
      "text_template_key": "billing_summary_en",
      "language": "en",
      "voice_gender": "female",
      "speed": 1.0
    },
    "buffer_sec": 1,
    "music": "music/bg_track.mp3"
  },
  "recording_enhancements": {
    "clickSound": true,
    "clickHighlight": true,
    "highlightColor": "#FF6B35",
    "highlightDurationMs": 600,
    "cursorHighlight": true,
    "ambientSounds": true,
    "zoomToAction": true,
    "zoomLevel": 0.18
  },
  "post_production": {
    "stepTitleCard": true,
    "progressIndicator": true,
    "transitionSound": true,
    "chapterMarkers": true,
    "subtitleTrack": true,
    "thumbnail": true,
    "videoDescription": true
  },
  "scenes": [
    {
      "scene_id": "s1_login",
      "title": "Step 1: Login",
      "narration": {
        "text_template_key": "billing_login_en",
        "language": "en",
        "voice_gender": "female",
        "speed": 1.0
      },
      "buffer_sec": 2,
      "music": "music/bg_track.mp3",
      "steps": [
        { "action": "navigate", "url": "/login" },
        { "action": "fill", "selector": "input[name='email']", "value": "demo@anukramai.com" },
        { "action": "fill", "selector": "input[name='password']", "value": "demo1234" },
        { "action": "click", "selector": "button[type='submit']" },
        { "action": "wait", "selector": ".dashboard" },
        { "action": "done" }
      ]
    }
  ]
}
```

**Key additions from v1.4:**
- `mode: "ui_flow_scenes"` — triggers scene-driven engine
- `baseUrl` — all navigate steps resolve relative to this
- `intro` — introduction scene (Mode C pattern)
- `summary` — closing scene (Mode C pattern)
- `recording_enhancements` — controls all recording overlays
- `post_production` — controls all post-production additions
- `scene.title` — used for title card and chapter markers
- Steps use relative URLs — `baseUrl` + `/login`

**Migration policy:**
- v1.4 contracts remain valid for Modes B and C
- v1.5 is required for `ui_flow_scenes` mode only
- No rejection of v1.4 — additive schema

---

## 6. New Engine — UIFlowSceneEngine

**File:** `src/engines/ui_flow_scene_engine.ts`

Per scene execution:

```
1.  Resolve narration template
2.  Generate TTS → measure narrationDurationMs
3.  recordingDurationMs = narrationDurationMs + (buffer_sec × 1000)
4.  Apply recording enhancements (inject CSS + JS into page)
5.  Start Playwright recording
6.  Execute steps (navigate relative to baseUrl)
7.  Wait for recordingDurationMs to elapse
8.  Stop recording → scene_{id}.webm
9.  Convert webm → scene_{id}.mp4 (locked encoding profile)
10. Mix narration + music → scene_{id}_audio.wav
11. AV merge → scene_{id}_final.mp4
12. Record click timestamps for zoom-to-action
```

Intro and summary scenes use Mode C pattern:
- PNG → clip (existing `SceneRenderEngine` PNG-to-clip path)
- TTS + music same as regular scenes

After all scenes:

```
13. TimelineEngine concat all scene clips → stitched.mp4
14. Apply post-production enhancements
15. Write chapter markers
16. Generate subtitle track
17. Generate thumbnail
18. Assemble video description
19. Final metadata write
```

---

## 7. Recording Enhancements

### 7.1 Cursor Highlight

Injected via `page.addInitScript` before recording starts:

```javascript
const cursor = document.createElement('div');
cursor.style.cssText = `
  position: fixed; width: 24px; height: 24px;
  border-radius: 50%; background: rgba(255,107,53,0.4);
  border: 2px solid #FF6B35; pointer-events: none;
  transform: translate(-50%,-50%); z-index: 99999;
  transition: all 0.1s ease;
`;
document.body.appendChild(cursor);
document.addEventListener('mousemove', e => {
  cursor.style.left = e.clientX + 'px';
  cursor.style.top = e.clientY + 'px';
});
```

### 7.2 Button Highlight Before Click

Applied by the engine before every `click` step:

```typescript
await page.locator(selector).evaluate(el => {
  el.style.outline = '3px solid #FF6B35';
  el.style.boxShadow = '0 0 12px rgba(255,107,53,0.8)';
  el.style.transition = 'all 0.2s ease';
});
await page.waitForTimeout(config.highlightDurationMs); // 600ms default
await page.locator(selector).click();
await page.locator(selector).evaluate(el => {
  el.style.outline = '';
  el.style.boxShadow = '';
});
```

### 7.3 Click Sound

Injected via `page.addInitScript`:

```javascript
const ctx = new AudioContext();
document.addEventListener('click', () => {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = 800;
  gain.gain.setValueAtTime(0.2, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.08);
});
```

### 7.4 Ambient UI Sounds

**Default assets** (committed to repo under `assets/sounds/`):
- `assets/sounds/keyboard.wav` — soft keyboard typing sound
- `assets/sounds/page_load.wav` — subtle whoosh for navigation

Played via Web Audio API injection:

```javascript
const sounds = {
  keyboard: new Audio('/visu_sounds/keyboard.wav'),
  pageLoad: new Audio('/visu_sounds/page_load.wav')
};
```

VISU serves sounds from a local static server during recording. Override per topic by placing files in `recipes/{topic}/sounds/`.

### 7.5 Zoom to Action

Applied during FFmpeg post-processing after recording. Click timestamps are logged per step during execution. FFmpeg `zoompan` filter applied at each click timestamp:

```
zoom level: 1.18 (18% zoom — subtle)
duration: 1.5 seconds per zoom event
transition: smooth ease in/out
centre: coordinates of clicked element
```

FFmpeg filter generated programmatically from click timestamp array.

---

## 8. Post-Production Enhancements

### 8.1 Step Title Card

FFmpeg `drawtext` overlay at scene start:

```
"Step 1: Login"
Font: default system font
Size: 36px
Position: top-left, 40px margin
Background: semi-transparent black pill
Duration: 2.0 seconds fade in/out
```

### 8.2 Progress Indicator

FFmpeg `drawtext` burned throughout each scene:

```
"Step 2 of 5"
Font: default system font
Size: 24px
Position: bottom-right, 20px margin
Color: white with shadow
```

### 8.3 Transition Sound

**Default asset:** `assets/sounds/transition.wav` — subtle chime, 0.5 seconds

Mixed at scene boundaries during WAV concat via WAVConcatEngine. Volume: 0.3.

### 8.4 Chapter Markers

Written to MP4 metadata via FFmpeg `-metadata` during final encode:

```
CHAPTER01=00:00:00.000
CHAPTER01NAME=Introduction
CHAPTER02=00:00:14.000
CHAPTER02NAME=Step 1: Login
CHAPTER03=00:00:28.000
CHAPTER03NAME=Step 2: Navigate to Billing
...
```

Timestamps calculated from cumulative scene durations. Visible in YouTube, VLC, and all chapter-aware players.

### 8.5 Subtitle Track

`.srt` file generated from narration text + timestamps:

```
1
00:00:14,000 --> 00:00:26,000
Welcome to AnukramAI. To get started,
enter your email and password.

2
00:00:28,000 --> 00:00:38,000
Click Billing in the navigation menu
to access the billing dashboard.
```

Timestamps derived from scene start times + narration duration. Written to `artifacts/{runId}/subtitles.srt` and `menu_item/{topic}/{language}/subtitles.srt`.

### 8.6 Thumbnail Generation

FFmpeg extracts frame at 3 seconds into the video (past intro, into first scene):

```bash
ffmpeg -i final.mp4 -ss 00:00:03 -vframes 1 thumbnail_raw.png
```

`drawtext` overlays title on thumbnail:

```
Video title from contract video_id
Font size: 48px
Position: bottom-left
Background: AnukramAI brand color bar
```

Written to `menu_item/{topic}/{language}/thumbnail.png`.

### 8.7 Video Description

Assembled from narration templates across all scenes in order:

```
{intro_template_text}

Step 1: Login
{billing_login_template_text}

Step 2: Navigate to Billing
{billing_menu_template_text}

...

{summary_template_text}

---
Generated by VISU for AnukramAI
```

Written to `upload_metadata.json` as `description` field. Used automatically by `visu upload`.

---

## 9. visu parse-recording CLI

**File:** `src/cli/parse_recording.ts`

```bash
visu parse-recording \
  --input recipes/billing_flow/recording.js \
  --template-map recipes/billing_flow/template_map.json \
  --topic billing_flow \
  --language en \
  --voice-gender female \
  --music music/bg_track.mp3 \
  --base-url https://app.anukramai.com \
  --output recipes/billing_flow/contracts/billing_flow_en.json
```

**Parser behaviour:**

1. Read codegen JS file
2. Split at `window.__VISU_SCENE_END__ = "{scene_id}"` markers
3. Convert each Playwright statement to contract step format
4. Look up template key from `--template-map`
5. Write v1.5 contract JSON

**Supported codegen statement conversions:**

| Playwright codegen | Contract step |
|---|---|
| `page.goto(url)` | `{ "action": "navigate", "url": "..." }` |
| `page.click(selector)` | `{ "action": "click", "selector": "..." }` |
| `page.fill(selector, value)` | `{ "action": "fill", "selector": "...", "value": "..." }` |
| `page.waitForSelector(selector)` | `{ "action": "wait", "selector": "..." }` |
| `page.screenshot()` | `{ "action": "screenshot" }` |
| `__VISU_SCENE_END__` | Scene boundary |

End of each scene gets `{ "action": "done" }` automatically.

**template_map.json:**

```json
{
  "s1_login": "billing_login_en",
  "s2_billing_menu": "billing_menu_en",
  "s3_customer": "billing_customer_en",
  "s4_product": "billing_product_en",
  "s5_generate_bill": "billing_generate_en"
}
```

---

## 10. Default Sound Assets

**Location:** `assets/sounds/`  
**Committed to repo** — small WAV files, total < 500KB

| File | Description | Duration |
|---|---|---|
| `click.wav` | Soft mouse click tone | 80ms |
| `keyboard.wav` | Single keypress sound | 120ms |
| `page_load.wav` | Subtle navigation whoosh | 400ms |
| `transition.wav` | Scene transition chime | 500ms |

All at 48000 Hz. Override per topic by placing files in `recipes/{topic}/sounds/`.

---

## 11. Updated Mode A Pipeline (Scene-Driven)

```
1.  FFmpeg version check (≥ 6.0)
2.  Contract validation (scene_schema_v1.5)
3.  Language registry validation
4.  Script template validation
5.  Visual asset validation (intro + summary PNGs)
6.  Render intro scene (PNG → clip + TTS + music)
7.  For each scene:
      a. Generate TTS → measure duration
      b. recordingDuration = narrationDuration + buffer_sec
      c. Inject recording enhancements into Playwright
      d. Start Playwright recording
      e. Execute steps (relative URLs resolved against baseUrl)
      f. Wait for recordingDuration
      g. Stop recording → scene.webm
      h. Convert webm → scene.mp4
      i. Mix narration + music → scene_audio.wav
      j. AV merge → scene_final.mp4
      k. Log click timestamps for zoom-to-action
8.  Render summary scene (PNG → clip + TTS + music)
9.  TimelineEngine concat all clips → stitched.mp4
10. Apply zoom-to-action (FFmpeg zoompan per click timestamp)
11. Apply step title cards (FFmpeg drawtext per scene)
12. Apply progress indicator (FFmpeg drawtext per scene)
13. WAV concat with transition sounds at boundaries
14. AVMergeEngine (final audio + video merge)
15. Write chapter markers to MP4 metadata
16. Generate subtitle track (.srt)
17. Generate thumbnail
18. Assemble video description
19. SHA256 computation
20. Metadata construction + validation
21. Write media_metadata.json
22. Copy to menu_item/{topic}/{language}/
23. Log completion
```

---

## 12. Determinism Classification

Scene-driven Mode A inherits Mode A's classification:

**Environment-sensitive** — Playwright recording timing is non-deterministic. Click timestamps, page load times, and animation states vary between runs. SHA256 stability is not guaranteed.

All post-production enhancements (title cards, progress indicators, zoom, chapters, subtitles) are deterministic given identical inputs. The non-determinism source is the Playwright recording itself.

---

## 13. New Files

```
src/
  engines/
    ui_flow_scene_engine.ts          ← NEW: scene-driven Mode A
  cli/
    parse_recording.ts               ← NEW: codegen → contract parser

schemas/
  scene_schema_v1.5.json             ← NEW: ui_flow_scenes mode

assets/
  sounds/
    click.wav                        ← NEW: default click sound
    keyboard.wav                     ← NEW: default keyboard sound
    page_load.wav                    ← NEW: default page load sound
    transition.wav                   ← NEW: default transition sound

tests/
  ui_flow_scene_engine.test.ts       ← NEW
  parse_recording.test.ts            ← NEW
  fixtures/
    billing_codegen_fixture.js       ← NEW: sample codegen output
    template_map_fixture.json        ← NEW
    billing_contract_v1.5.json       ← NEW: expected contract output

docs/
  consumer/
    CONTRACT_AUTHORING_GUIDE.md      ← updated: ui_flow_scenes mode
    CLI_REFERENCE.md                 ← updated: parse-recording command
  SPRINT_11_EXECUTION_PLAN_v1.0.md
```

---

## 14. Testing Requirements

### Unit Tests

| Test | Validates |
|---|---|
| Schema v1.5 — valid contract | Passes |
| Schema v1.5 — `mode` not `ui_flow_scenes` | Fails |
| Schema v1.5 — `baseUrl` missing | Fails |
| Schema v1.5 — `intro` missing | Fails |
| Parse recording — valid codegen input | Correct contract output |
| Parse recording — no SCENE_END markers | Single scene contract |
| Parse recording — unknown statement | Skipped with warning |
| Parse recording — template map applied | Template keys correct |
| Click highlight — args snapshot | Deterministic |
| Zoom to action — FFmpeg args from timestamps | Correct zoompan filter |
| Title card — drawtext args per scene | Correct |
| Chapter markers — timestamp calculation | Correct cumulative times |
| Subtitle timing — narration duration alignment | Correct |
| Thumbnail — frame extracted at 3s | File exists |
| Video description — all templates assembled | Correct order |
| Transition sound mixed at boundaries | WAV concat args correct |

### Integration Test (Gated)

```
RUN_MODE_A_SCENES_INTEGRATION=true
```

Uses billing flow contract with two scenes + intro + summary.

Verifies:
- All scene clips produced
- Intro and summary scenes produced
- `final.mp4` duration = sum of all scene durations
- Chapter markers present in MP4 metadata
- `subtitles.srt` exists and has correct scene count
- `thumbnail.png` exists
- `upload_metadata.json` has `description` field populated
- Output copied to `menu_item/`

---

## 15. Success Criteria

Sprint 11 is complete when:

- [x] `UIFlowSceneEngine` executes scene-driven Mode A end to end
- [x] `visu parse-recording` converts codegen output to v1.5 contract
- [x] `SCENE_END` markers split scenes correctly
- [x] Intro and summary scenes produced via Mode C pattern
- [x] Audio-first recording — narration drives clip duration
- [x] Cursor highlight active during recording
- [x] Button highlight + click sound on every click
- [x] Ambient sounds on fill and navigate actions
- [x] Zoom to action applied subtly (configurable %) at click timestamps
- [x] Step title card on each scene
- [x] Progress indicator throughout
- [x] Transition sound between scenes
- [x] Chapter markers in final MP4
- [x] Subtitle track generated
- [x] Thumbnail generated
- [x] Video description assembled
- [x] Default sounds committed to `assets/sounds/`
- [x] All enhancements configurable via contract
- [ ] Billing flow test produces complete video in all three languages (product-level; optional)
- [x] All unit tests pass
- [x] Integration test passes (gated by `RUN_MODE_A_SCENES_INTEGRATION=true`; fixture content under `tests/fixtures/ui_flow_scenes/`)
- [x] `npm run build`, `npm test`, `npm run lint` all pass
- [x] Consumer docs updated

---

## 16. Future Sprint Notes

**Sprint 12 — AI-driven Mode A**
Replace manual selector steps with plain language instructions processed by Gemini 2.5 Flash free tier. No selectors, no codegen. Just describe what to do in English and the engine figures out the UI.

**Fade out at video end**
Music and audio fade in the last 1-2 seconds. FFmpeg `afade` filter. Small patch post Sprint 11.

**Music volume per scene**
Some scenes may need quieter or louder background music. Per-scene `musicVolume` override in contract. Currently all scenes use the same volume.

**Highlight colour per topic**
Currently hardcoded to AnukramAI orange `#FF6B35`. A brand colour config per topic would allow different products to have their own highlight colour.
