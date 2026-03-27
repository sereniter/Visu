# Visu – Viṣaya Sraṣṭā (Deterministic Content Execution Engine)

VISU is a deterministic video and narration engine. It supports multiple **modes**; each mode has its own inputs, features, and output locations. This README is for agents or developers using Visu as a tool.

---

## Prerequisites

- **Node.js** (project runs from Visu repo root).
- **Config**: `config/default.json` in the Visu repo. Key settings:
  - **contentRoot** – Where input content lives (e.g. contracts, topic folders, scripts). Paths passed to Visu are **relative to contentRoot** unless noted.
  - **outputRoot** – Where final deliverables are copied (e.g. `final.mp4`, `media_metadata.json`). Format: `outputRoot/{topic}/{language}/`.
  - **execution.artifactsDir** – Run artifacts (intermediate and final files) go under `{cwd}/{artifactsDir}/{runId}/` (default `artifacts`).
- **Run from Visu root** so `config/default.json` and `dist/` are found:
  ```bash
  cd /path/to/Visu
  node dist/index.js --mode <mode> ...
  ```

---

## Where to place inputs

| Input type | Location | Notes |
|------------|----------|--------|
| **Content (contracts, topics, scripts, assets)** | Under **contentRoot** | Paths in commands are relative to `contentRoot` (e.g. `topic/artifacts/run/contract.json`). |
| **Flow JSON (ui_flow)** | Any path | Passed as `--flow <path>`; resolved from **process.cwd()** (Visu root). |
| **Script JSON (narrate)** | Any path | Passed as `--script <path>`; resolved from **process.cwd()**. |

Example: if `contentRoot` is `/Users/play/Documents/recipes`, then contract path `drone_wars_copycat/artifacts/drone-wars-run-001/contract_v1.4_sprint14_test.json` is resolved to `/Users/play/Documents/recipes/drone_wars_copycat/artifacts/drone-wars-run-001/contract_v1.4_sprint14_test.json`.

---

## Modes, features, commands, and outputs

### 1. `generative` (Mode C – Remotion only)

**Purpose:** Turn a scene contract (v1.4) into a single video: auto-tune durations from TTS, render each scene with Remotion (SceneComposition), merge audio per scene, concat, then copy to outputRoot.

**Features:**
- Auto-tune: TTS per scene → set contract `duration_sec` from narration (+20 ms buffer).
- Per-scene Remotion render (background, motion, grade, grain, overlays, fonts).
- Per-scene AV merge → concat → one `final.mp4`.
- Single artifact folder: `remotion_scenes/` (no separate `scenes/`).
- Requires `config.rendering.renderer === "remotion"`.

**Command:**
```bash
node dist/index.js --mode generative --contract "<path relative to contentRoot>"
```

**Example:**
```bash
node dist/index.js --mode generative --contract "drone_wars_copycat/artifacts/drone-wars-run-001/contract_v1.4_sprint14_test.json"
```

**Inputs:**
- Contract JSON (v1.4) at `contentRoot` + `--contract` path.
- Topic assets (e.g. visuals, script_templates) under `contentRoot/{topic}/` as expected by the contract.
- Config: `config/fonts.json`, `config/grades.json`, `remotion-templates`, Piper TTS (see config).

**Outputs:**
- **Run artifacts:** `{cwd}/artifacts/{runId}/`
  - `remotion_scenes/` – scene videos, per-scene AV merges, concat list.
  - `final.mp4`, `media_metadata.json`, `environment_snapshot.json`.
- **Deliverables (on success):** copied to **outputRoot/{topic}/{language}/** (e.g. `final.mp4`, `media_metadata.json`).
- **Logs:** `logs/visu-{runId}.log`.

---

### 2. `ui_flow` (Mode A)

**Purpose:** Execute a UI flow (Playwright); record a single video (e.g. raw.webm).

**Features:**
- Validates flow JSON and termination rules.
- Runs flow with UIFlowAdapter; writes raw capture and metadata.

**Command:**
```bash
node dist/index.js --mode ui_flow --flow <path to flow JSON>
```

**Inputs:**
- Flow JSON path is relative to **process.cwd()** (Visu root).

**Outputs:**
- **Run artifacts:** `artifacts/{runId}/raw.webm`, `metadata.json`.
- **Logs:** `logs/visu-{runId}.log`.
- No copy to outputRoot in this mode.

---

### 3. `narrate`

**Purpose:** TTS only: script JSON → one narration WAV.

**Features:**
- Validates script schema; runs Piper TTS; writes one WAV.

**Command:**
```bash
node dist/index.js --mode narrate --script <path to script JSON>
```

**Inputs:**
- Script JSON path is relative to **process.cwd()**.

**Outputs:**
- **Run artifacts:** `artifacts/{runId}/narration.wav`.
- **Logs:** `logs/visu-{runId}.log`.

---

### 4. `recorded` (Mode B)

**Purpose:** External MP4 + narration script → normalized video + TTS → AV merge → final video. Optional wrap (intro/summary). Output can be copied to outputRoot.

**Features:**
- Normalize input video; generate narration from script; merge; optional Remotion intro/summary wrap.
- Validates contentRoot, outputRoot, and topic dir.

**Command:**
```bash
node dist/index.js --mode recorded --topic <topic> --video <path under topic> --script <path under topic/scripts>
```
Optional: `--wrap-contract <path under topic>`.

**Inputs:**
- All paths resolved from **contentRoot**:
  - Video: `contentRoot/{topic}/{--video}`.
  - Script: `contentRoot/{topic}/scripts/{--script}`.
  - Wrap contract (if any): `contentRoot/{topic}/{--wrap-contract}`.

**Outputs:**
- **Run artifacts:** `artifacts/{runId}/` (e.g. `final.mp4`, `media_metadata.json`; wrap outputs if used).
- **Deliverables (on success):** **outputRoot/{topic}/{language}/**.
- **Logs:** `logs/visu-{runId}.log`.

---

### 5. `ui_flow_scenes`

**Purpose:** Scene-driven flow from a v1.5 contract: Playwright scenes, optional intro/summary, Remotion overlays, timeline concat, AV merge, optional upload. Final output copied to outputRoot.

**Features:**
- Contract-driven scenes; per-scene capture and narration; timeline concat; AV merge; optional SRT/thumbnail; copy to outputRoot.

**Command:**
```bash
node dist/index.js --mode ui_flow_scenes --contract "<path relative to contentRoot>"
```

**Inputs:**
- Contract (v1.5) at `contentRoot` + `--contract` path.
- Topic content (scripts, assets) under `contentRoot/{topic}/` as required by the contract.

**Outputs:**
- **Run artifacts:** `artifacts/{runId}/` (scene clips, stitched video, final.mp4, media_metadata.json, etc.).
- **Deliverables (on success):** **outputRoot/{topic}/{language}/**.
- **Logs:** `logs/visu-{runId}.log`.

---

## Summary: output locations

| Output | Where |
|--------|--------|
| **Run artifacts (all modes)** | `{Visu cwd}/artifacts/{runId}/` (e.g. `final.mp4`, `media_metadata.json`, intermediate files). |
| **Final deliverables (recorded, generative, ui_flow_scenes on success)** | **outputRoot/{topic}/{language}/** (e.g. `final.mp4`, `media_metadata.json`). Config key: `outputRoot` (e.g. `/Users/play/Documents/menu_item`). |
| **Logs** | `logs/visu-{runId}.log` (NDJSON). |

---

## Other commands (no `--mode`)

Invoke as `node dist/index.js <command> ...` from Visu root:

- `node dist/index.js audit --runId <id>` – Determinism audit for a run.
- `node dist/index.js replay --runId <id>` – Replay and validate run artifacts.
- `node dist/index.js resume --run-id <id> --contract <path>` – Resume a failed generative run (re-encode stitched video, merge narration, write final).
- `node dist/index.js add-audio --run-id <id> --contract <path>` – Add concat narration to an existing stitched video and merge.
- `node dist/index.js upload --runId <id>` – Upload run artifacts.
- `node dist/index.js migrate-contract --input <path> --output <path>` – Migrate contract (e.g. v1.2 → v1.3).

---

## For BHIRAV / consumer integration

This section addresses contract authoring, exit codes, timeouts, and language/voice so adapters (e.g. `visu_adapter.ts`) can invoke VISU correctly and handle failures.

### Consumer docs (contracts, CLI, errors, artifacts, schemas)

**`docs/consumer/`** is the canonical reference for Bhairav/OpenClaw:

| Document | Contents |
|----------|----------|
| **CONTRACT_AUTHORING_GUIDE.md** | Mode A/B/C contract authoring, required fields, examples, script templates, wrap contracts. |
| **CLI_REFERENCE.md** | All commands, flags, and options (invoke as `node dist/index.js ...` from Visu root). |
| **ERROR_REFERENCE.md** | Exit codes, error catalogue, how to read the structured log, partial-artifact detection. |
| **ARTIFACT_REFERENCE.md** | Artifact layout, `media_metadata.json` fields, what to read for success/failure. |
| **SCHEMA_REFERENCE.md** | Schema locations and versions. |

Use these when authoring contracts or handling VISU output and errors.

### Contract schema (Mode C generative) — minimum for authoring

Mode C uses **scene contract v1.4**. The contract your engine produces must satisfy this.

**Root (required):** `schema_version`, `video_id`, `topic`, `language`, `scenes`.

**Per scene (required):** `scene_id`, `duration_sec`, `visual`, `narration`.

- **`schema_version`**: `"1.4"`.
- **`topic`**: string, no slashes (e.g. `drone_wars_copycat`). Determines `contentRoot/{topic}/` and `outputRoot/{topic}/{language}/`.
- **`language`**: primary language code (e.g. `en`, `hi`, `te`). Must exist in the language registry.
- **`scenes[]`**: array of scene objects.

**Per-scene `visual` (governed_image):** `type: "governed_image"`, `asset_path`, `prompt_key`, `seed`, `model_version`. Optional: `visual_style`, `motion`, `grade`, `grain`, `parallax`, `overlays`.

**Per-scene `narration`:** `text_template_key`, `language`, `voice_gender`, `speed`.

- **`voice_gender`**: `"male"` or `"female"`. Must be a voice registered for that `language` in `config/languages.json` (see Language registry below).

Optional per scene: `transition`, `audio`, `overlays`. Full enums and shapes are in `schemas/scene_schema_v1.4.json` and **docs/consumer/CONTRACT_AUTHORING_GUIDE.md**.

### Auto-tune (generative) — no flag, always on

**Generative mode always runs auto-tune.** There is no `--auto-tune-durations` flag; do not pass it.

- **Phase 1:** TTS per scene (Piper), measure `narrationDurationMs`, then set each scene’s `duration_sec = (narrationDurationMs + 20) / 1000` (20 ms buffer). Phase 1 WAVs are reused in Phase 2.
- **Phase 2:** Remotion per-scene render (SceneComposition) using the tuned durations, then per-scene AV merge, then concat → `final.mp4`.

So from BHIRAV’s perspective: invoke `--mode generative --contract <path>`; VISU handles both phases and drift control internally.

### Exit codes and structured failure

| Exit code | Meaning |
|-----------|--------|
| **0** | Success. Deliverables written; copy to outputRoot done when applicable. |
| **1** | Pipeline failure (e.g. drift violation, AV merge failure, Remotion render failure). Artifacts may be partial. |
| **2** | Configuration or input error (e.g. missing `--contract`, invalid contract, missing contentRoot/outputRoot). |

- **Structured log:** `logs/visu-{runId}.log` (NDJSON). Each line has `runId`, `timestamp`, `step`, and optional `message`, `payload`. On failure, look for `step` values like `mode_c_failed`, `av_merge_*`, `remotion_*`, and `payload.error` or `message`.
- **Partial artifacts:** e.g. `artifacts/{runId}/remotion_scenes/` may have some scene videos but no `final.mp4` if the run failed during concat or AV merge. Check for `final.mp4` and `media_metadata.json` to confirm success; if missing, treat as failure and use the log to diagnose (see **docs/consumer/ERROR_REFERENCE.md**).

### Timeout expectations (ballpark)

Use these to set subprocess timeouts in `visu_adapter.ts`:

| Mode | Ballpark | Notes |
|------|----------|--------|
| **generative** | 15–60+ min | Depends on scene count (TTS + Remotion render per scene + AV merge). 8 scenes can be 20–40 min. |
| **ui_flow_scenes** | 10–30+ min | Playwright + Remotion + concat; depends on scene count and flow length. |
| **recorded** | 2–10 min | Normalize + TTS + merge; wrap adds Remotion time. |
| **narrate** | 0.5–2 min | TTS only. |
| **ui_flow** | 1–5 min | Single browser flow; depends on steps. |

These are indicative; allow headroom for slow I/O or Remotion builds.

### Language registry and voice resolution

Valid **(language, voice_gender)** pairs are defined in **`config/languages.json`** (under Visu repo). VISU validates every scene’s `narration.language` and `narration.voice_gender` against this registry at startup; invalid combinations cause exit **2** (e.g. language not supported or gender not available for that language).

- **Registry path:** `config/languages.json` (relative to Visu root). Structure: `supported.<lang>.voices.<male|female>` with `voice`, `modelPath`, `modelConfig`, `modelHash`.
- **Typical entries:** e.g. `en` (male, female), `hi` (male, female), `te` (e.g. male only). If a language has only `male`, then `voice_gender: "female"` for that language will fail validation.
- **BHIRAV:** Before calling VISU, ensure every scene’s `narration.language` and `narration.voice_gender` exist in the registry (or read the registry once and restrict contract authoring to those pairs). See **docs/consumer/CONTRACT_AUTHORING_GUIDE.md** for errors like `LANGUAGE_NOT_SUPPORTED` and `GENDER_NOT_AVAILABLE`.

---

## Quick reference: run from outside Visu

Always run from Visu root so config and `dist` are used. Example with deliverables under `outputRoot` (e.g. `/Users/play/Documents/menu_item`):

```bash
cd /path/to/Visu
node dist/index.js --mode generative --contract "drone_wars_copycat/artifacts/drone-wars-run-001/contract_v1.4_sprint14_test.json"
```

On success, `final.mp4` and `media_metadata.json` are in `outputRoot/{topic}/{language}/` (topic and language from the contract). Run artifacts remain in `Visu/artifacts/{runId}/`.
