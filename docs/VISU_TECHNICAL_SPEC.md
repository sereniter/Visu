# VISU — Technical Specification

**Document**: VISU Technical Spec  
**Version**: 1.1 (Sprint 13)  
**Status**: Living document  
**Scope**: Architecture, implementation, and operations for the VISU codebase.

---

## 1. Overview

VISU (Viṣaya Sraṣṭā) is a **deterministic content execution engine**. It executes predefined flows, generates media assets, logs execution, and returns status. It does not perform strategy, KPI analysis, or autonomous decision-making; those belong to BHIRAV (orchestrator). VISU is infrastructure only.

- **Language**: TypeScript (ES2022, Node ESM)
- **Runtime**: Node.js 20 LTS (locked via `.nvmrc`)
- **Package**: `visu` @ 0.1.0, `"type": "module"`

---

## 2. Repository Layout

```
Visu/
├── docs/                    # Documentation
│   ├── consumer/            # Bhairav / OpenClaw integration (contract authoring, CLI, artifacts, errors, schemas)
│   ├── VISU_PRD_v1.0.md                     # Product requirements
│   ├── VISU_TECHNICAL_SPEC.md
│   ├── FLOW_EXECUTION_CONTRACT_v1.1.md      # Mode A execution semantics (authoritative)
│   ├── NARRATION_EXECUTION_CONTRACT_v1.0.md # Narration/TTS execution semantics (Sprint 3)
│   ├── SPRINT_3_EXECUTION_PLAN_v1.0.md     # Locked Sprint 3 execution plan
│   ├── SPRINT_4_EXECUTION_PLAN_v1.2_FINAL.md # AV merge / final.mp4 (Sprint 4)
│   ├── SPRINT_5_EXECUTION_PLAN_v1.1_FINAL.md # Mode B recorded adapter (Sprint 5)
│   ├── SPRINT_6A_EXECUTION_PLAN_v1.2_FINAL.md # Mode C minimal execution (Sprint 6A)
│   ├── SPRINT_12_EXECUTION_PLAN_v1.2.md      # Remotion foundation (Sprint 12)
│   ├── REMOTION_SETUP.md                     # Remotion install & Studio (Sprint 12)
│   └── REMOTION_BENCHMARK.md                 # Remotion render benchmark (Sprint 12)
├── artifacts/               # Per-run: {runId}/raw.webm, metadata.json, narration.wav; AV merge: final.mp4, media_metadata.json, environment_snapshot.json (Sprint 7), upload_metadata.json (optional). Mode C: scenes/, stitched_video.mp4, narration_concat.wav retained.
├── assets/
│   ├── music/               # Music WAVs (48 kHz stereo, LUFS -15 to -17)
│   ├── visuals/             # Governed PNGs + .provenance.json (Mode C)
│   └── fonts/               # Overlay fonts: NotoSans-Bold/Regular, NotoSansDevanagari-Bold, NotoSansTelugu-Bold, BebasNeue, Montserrat, Ramabhadra, Hind-Bold, Mukta-Bold (Sprint 13)
├── config/                  # default.json (timeouts, viewport, videoDir, remotion block (Sprint 12), etc.); languages.json (Sprint 8); grades.json, visual_styles.json (Sprint 13)
├── flows/                   # Flow definitions (JSON)
├── logs/                    # Run logs (NDJSON, one file per run)
├── prompts/                 # Prompt library (future)
├── schemas/                 # JSON Schema definitions
│   ├── flow_schema_v1.json
│   ├── log_schema_v1.json
│   ├── script_schema_v1.json     # Narration script schema (Sprint 3)
│   ├── media_metadata_schema_v1.json  # AV merge metadata (Sprint 4)
│   ├── scene_schema_v1.4.json   # Mode C contract (Sprint 13 — visual_style, motion, grade, overlays)
│   ├── scene_schema_v1.3.json   # Mode C contract (Sprint 8 patch — voice_gender, no voice)
│   ├── scene_schema_v1.2.json   # Rejected after patch (migrate to v1.3)
│   ├── scene_schema_v1.1.json   # Legacy (rejected)
│   ├── scene_schema_v1.json     # Legacy (rejected)
│   ├── language_registry_schema_v1.1.json  # config/languages.json (voices per gender)
│   ├── provenance_schema_v1.json # Provenance sidecar for governed PNGs
│   ├── environment_snapshot_schema_v1.json  # Determinism audit (Sprint 7)
│   ├── audit_output_schema_v1.json
│   ├── upload_metadata_schema_v1.json
│   └── remotion_props_schema_v1.json        # Remotion composition props (Sprint 12)
├── models/
│   └── piper/               # Piper TTS model weights (NOT committed to git; download via scripts/download_piper_models.sh)
│       ├── models.json      # Model manifest — source URLs, SHA256 hashes, sizes for all voices
│       ├── MODELS.md        # Setup instructions
│       ├── {voice}.onnx     # Model weights (local only; ~60–120 MB each)
│       └── {voice}.onnx.json # Model config (committed)
├── scripts/                 # record_chromium_hash.js (Sprint 12 — run from repo root after remotion-templates install); download_piper_models.sh (fetch + verify all Piper ONNX weights from models.json); script_templates.json (Mode C and ui_flow_scenes; per-flow: contentRoot/topic/scripts/ when present)
├── src/
│   ├── index.ts             # CLI entry
│   ├── core/                # Core contracts, config, logging, run metadata, TTS interfaces
│   │   ├── index.ts
│   │   ├── run_context.ts
│   │   ├── run_metadata.ts      # writeRunMetadata() → artifacts/{runId}/metadata.json
│   │   ├── config.ts            # getConfig(), getConfigHash(), getTTSConfig(), getEncodingProfile(), getRemotionConfig() (Sprint 4, 12)
│   │   ├── ui_flow_adapter_interface.ts
│   │   ├── tts_interface.ts     # TTSRequest, TTSResponse, ITTSAdapter (Sprint 3)
│   │   ├── wav_utils.ts         # WAV duration calculation (Sprint 3)
│   │   ├── language_config.ts  # getLanguageConfig(), getVoiceConfig(), getVoiceModelPaths() (Sprint 8 + patch)
│   │   └── logger.ts
│   ├── cli/                  # audit.ts, replay.ts, upload.ts, migrate_contract.ts (Sprint 8 patch)
│   ├── engines/                 # flow_executor (Mode A), narration_engine (Sprint 3), av_merge_engine, metadata_writer (Sprint 4), recorded_mode_engine (Sprint 5), timeline_engine, mode_c_engine, scene_render_engine, wav_concat_engine (Sprint 6B), upload_engine (Sprint 7), visual_style_resolver
│   ├── adapters/                # ui_flow_adapter (Playwright), tts/local_piper_adapter (Sprint 3), ffmpeg_adapter (Sprint 4 + Ken Burns/grade args Sprint 13), recorded_adapter (Sprint 5), remotion_adapter (Sprint 12)
│   └── validators/              # Schema validation (AJV), environment_snapshot_validator (Sprint 7), remotion_props_schema, remotion_output_validator (Sprint 12)
│       ├── flow_schema.ts
│       ├── flow_termination.ts
│       ├── log_schema.ts
│       ├── script_schema.ts     # Narration script validation (Sprint 3)
│       ├── av_drift_validator.ts    # AV drift ≤ 200ms (Sprint 4)
│       ├── music_lufs_validator.ts  # Music LUFS -15 to -17 (Sprint 4)
│       ├── media_metadata_schema.ts # media_metadata.json validation (Sprint 4)
│       ├── scene_schema.ts       # Mode C contract v1.2 (Sprint 8); v1.1 rejected
│       ├── language_registry_validator.ts  # Registry + model hash + scene language validation (Sprint 8)
│       ├── visual_asset_validator.ts # PNG + provenance + hash + dimensions (Sprint 6B)
│       ├── remotion_props_schema.ts  # Remotion props validation (Sprint 12)
│       └── remotion_output_validator.ts # ffprobe profile check for Remotion output (Sprint 12)
├── remotion-templates/       # Sub-package: Remotion compositions (Sprint 12). Entry calls registerRoot(RemotionRoot); remotion.config.ts uses Config.overrideFfmpegCommand.
├── tests/
│   ├── fixtures/             # Static binaries: av_merge; recorded; Mode C (scene1.mp4, scene2.mp4, scene*_narration.wav, contract_fixture.json)
│   ├── run_context.test.ts
│   ├── log_schema.test.ts
│   ├── flow_schema.test.ts
│   ├── ffmpeg_adapter.test.ts
│   ├── av_drift_validator.test.ts
│   ├── music_lufs_validator.test.ts
│   ├── av_merge_engine.test.ts
│   ├── metadata_writer.test.ts
│   ├── av_merge_integration.test.ts  # RUN_MEDIA_INTEGRATION=true
│   ├── recorded_adapter.test.ts
│   ├── recorded_mode_engine.test.ts
│   ├── recorded_integration.test.ts  # RUN_RECORDED_INTEGRATION=true
│   ├── scene_schema.test.ts
│   ├── timeline_engine.test.ts
│   ├── mode_c_engine.test.ts
│   ├── mode_c_integration.test.ts    # RUN_MODE_C_INTEGRATION=true
│   ├── remotion_adapter.test.ts     # Sprint 12
│   ├── remotion_output_validation.test.ts # Sprint 12
│   ├── visual_style_resolver.test.ts   # Sprint 13: style expansion, overrides, missing style
│   └── scene_schema_v1_4.test.ts       # Sprint 13: v1.4 schema validation
├── .nvmrc
├── ENVIRONMENT.md
├── AGENTS.md                # Governance and boundaries
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── tsconfig.test.json
├── vitest.config.ts
└── eslint.config.js
```

---

## 3. Architecture Principles

### 3.1 Determinism

- Execution must be **reproducible**: same flow + same input → same outcome.
- Flow and schema versions are tracked; logs record `runId`, timestamps, and schema versions.
- No silent changes: version bumps and schema updates are explicit.

### 3.2 Layering and Boundaries

- **Core** (`src/core/`): Run context, logging, and shared contracts. Must **not** import from **adapters**.
- **Engines** (`src/engines/`): Flow and media pipeline execution (future).
- **Adapters** (`src/adapters/`): Playwright, FFmpeg, TTS, etc. (future).
- **Validators** (`src/validators/`): AJV-based validation against JSON schemas.

Enforcement: ESLint `no-restricted-imports` on `src/core/**/*.ts` forbids patterns: `**/adapters/**`, `src/adapters/*`, `../adapters/*`, `@adapters/*`.

### 3.3 Authority and Invocation

VISU is invoked only by:

- CLI
- BHIRAV (future)
- Explicit developer/script invocation

It does not initiate runs on its own.

---

## 4. Core Contracts

### 4.1 RunContext

**Location**: `src/core/run_context.ts`

Immutable execution context for a single run. All runs are described by this contract.

| Field | Type | Description |
|-------|------|--------------|
| `runId` | string | Unique run identifier (e.g. UUID) |
| `startedAt` | string | ISO 8601 start time |
| `environment` | object | `nodeVersion`, optional `playwrightVersion`, `ffmpegVersion` |
| `execution` | object | `mode`, `inputId`, `inputVersion` |
| `language` | `"te"` | Telugu only (Phase 1) |
| `versions` | object | `logSchema` (required), optional `flowSchema`, `sceneSchema`, `promptLibraryVersion` |
| `artifacts` | object | Optional `rawVideoPath`, `narrationPath`, `audioPath`, `finalVideoPath`, `metadataPath`. Mode A writes **artifacts/{runId}/metadata.json**; AV merge (Sprint 4) adds **final.mp4** and **media_metadata.json**; Mode B (Sprint 5) adds **narrationPath**, **final.mp4**, **media_metadata.json**. |
| `status` | enum | `initialized` \| `running` \| `failed` \| `completed` |
| `error?` | object | Optional `stage`, `message`, `stack` on failure |

**Execution modes**: `ui_flow` | `ui_flow_scenes` | `recorded` | `generative` | `narrate`.

**Schema versioning**: `RunContext.versions.logSchema` must be set explicitly. Constant `LOG_SCHEMA_VERSION` (currently `"1.0"`) is exported from `run_context.ts` and must be used wherever a RunContext is built or where the log schema version is recorded.

### 4.2 Logging

**Location**: `src/core/logger.ts`

- **Format**: NDJSON (one JSON object per line) in `logs/visu-<runId>.log`.
- **Write model**: **Synchronous** (`fs.appendFileSync`). Order is deterministic; no async races. `close()` is a no-op kept for API compatibility.
- **Run ID**: `createRunId()` returns `crypto.randomUUID()`.
- **Timestamps**: `timestampIso()` returns `new Date().toISOString()` per entry.

**LogEntry** (per line):

- Required: `runId`, `timestamp`, `step`
- Optional: `level` (`info` | `warn` | `error` | `debug`), `message`, `payload` (object)

**API**:

- `createLogger(runId, logPath)` → `{ log(step, options?), close() }`
- `log(step, { level?, message?, payload? })` appends one line and returns.

---

## 5. Schemas and Validation

### 5.1 Log Schema (v1)

**File**: `schemas/log_schema_v1.json`

- **Purpose**: Validate each line of a run log (NDJSON).
- **Rules**: `additionalProperties: false`; required `runId`, `timestamp`, `step`; optional `level` (enum), `message`, `payload` (object).

**Validator**: `src/validators/log_schema.ts`

- `getLogEntryValidator()`: returns compiled AJV validator.
- `validateLogEntry(entry)` → `{ valid: true }` or `{ valid: false, errors: string[] }`.

Schema is loaded from `process.cwd()/schemas/log_schema_v1.json` at first use.

### 5.2 Flow Schema (v1)

**File**: `schemas/flow_schema_v1.json`

- **Purpose**: Validate flow definition JSON (UI flow).
- **Root**: `flow_id`, `version`, `steps` (array); `additionalProperties: false`.
- **Step**: `step_id`, `action` (enum: `navigate` | `click` | `fill` | `wait` | `screenshot` | `done`); optional `url`, `selector`, `value`, `timeout_ms`; `additionalProperties: false`.

**Validator**: `src/validators/flow_schema.ts`

- `getFlowValidator()`: returns compiled AJV validator.
- `validateFlow(flow)` → `{ valid: true }` or `{ valid: false, errors: string[] }`.

Schema path: `process.cwd()/schemas/flow_schema_v1.json`.

### 5.3 Script Schema (v1 / v1.1)

**File**: `schemas/script_schema_v1.json` (v1.0); optional extension for Mode B: `music` (v1.1 additive).

- **Purpose**: Validate narration script JSON for the TTS subsystem (Sprint 3). Mode B (Sprint 10 patch): optional `music` path (relative to `contentRoot/{topic}/`); when present, background music is mixed under narration and fills the remainder of the video.
- **Root**: `version` (`"1.0"` or `"1.1"`), `language`, `text` or template; v1.1 adds optional `music` (string). v1.0 scripts remain valid.

**Validator**: `src/validators/script_schema.ts`

- `getScriptValidator()`: returns compiled AJV validator.
- `validateScript(script)` → `{ valid: true }` or `{ valid: false, errors: string[] }`.

Schema path: `process.cwd()/schemas/script_schema_v1.json`.

### 5.4 Scene Schema (v1.4) — Mode C Contract (Sprint 13)

**Files**: `schemas/scene_schema_v1.4.json` (current), `schemas/scene_schema_v1.3.json` (accepted), `schemas/scene_schema_v1.2.json` (rejected), older versions rejected

- **Sprint 13 additions** (all optional, additive over v1.3): `visual.visual_style` (enum: war_documentary, historical_archive, geopolitical_tension, news_report, impact_moment), `visual.motion` (type, focus, intensity), `visual.grade` (enum matching grades.json), `overlays[]` array at scene root with 5 types: lower_third, stat_badge, source_tag, highlight_circle, arrow_pointer. v1.3 contracts continue to validate unchanged.
- **Custom validator**: `validateOverlays(overlays, sceneDurationSec)` enforces timing bounds, fade constraints, field exclusivity, coordinate bounds, and minimum arrow length. 9 hard-stop checks total.

- **Purpose**: Validate Mode C structured scene contract. Strict AJV. Root: `schema_version` ("1.3"), `video_id`, `scenes` (array, minItems 1). Each scene: `scene_id`, `duration_sec`, `visual` (type `"governed_image"`, …), `narration` (`text_template_key`, **`language`** (ISO 639-1), **`voice_gender`** ("male" | "female"), `speed`). **`voice`** field removed — resolved from registry by language + gender.
- **Migration**: v1.0, v1.1, v1.2 are **hard rejected** with messages directing migration to v1.3. Use `visu migrate-contract --input <path> --output <path>` to migrate v1.2 → v1.3.
- **Validator**: `src/validators/scene_schema.ts` — `validateSceneContract(data)` → `{ valid, data?: ModeCContractV13 } | { valid: false, errors }`.

### 5.5 Visual Styles and Grades (Sprint 13)

**Files**: `config/visual_styles.json`, `config/grades.json`

- **Visual Styles** (`visual_styles.json`): Maps preset names (e.g. `war_documentary`, `historical_archive`) to default `grade`, `motion` (type, focus, intensity), `overlay_font_color`, and `overlay_shadow`. When a scene has `visual_style` set, the resolver expands it to concrete motion and grade settings; explicit per-scene fields override style defaults.
- **Grades** (`grades.json`): Maps grade names to FFmpeg filter parameters: `eq` (contrast/brightness/saturation/gamma), `curves` (per-channel RGB), `vignette`, and `grain` (null = disabled, or noise filter string). Grain is currently disabled for all presets; noise texture is baked into source images.
- **Resolver**: `src/engines/visual_style_resolver.ts` — `resolveVisualStyle(scene)` expands `visual_style` into motion and grade config, merging with explicit scene overrides.

### 5.6 Language Registry (v1.1 — Sprint 8 patch)

**File**: `config/languages.json` (schema: `schemas/language_registry_schema_v1.1.json`)

- **Purpose**: Govern supported TTS languages with **voices** keyed by gender (`male`, `female`) per language. **Currently supported:** en (English), hi (Hindi), te (Telugu). **Tamil (ta):** model files are not available to download yet; Tamil will be implemented in a future release. Each gender entry has `voice`, `modelPath`, `modelConfig`, `modelHash`. Only register genders available for that language (see Piper releases); requesting unavailable gender → hard stop.
- **Validator**: `src/validators/language_registry_validator.ts` — `validateLanguageRegistry(cwd)`, `validateSceneLanguages(scenes, cwd)` (checks voice_gender in voices for language), `verifyModelHash(path, expectedHash, cwd)`.
- **Helper**: `src/core/language_config.ts` — `getLanguageConfig(languageCode, cwd)`, `getVoiceConfig(languageCode, gender, cwd)`, `getVoiceModelPaths(languageCode, gender, cwd)`.

### 5.7 Validation Stack

- **Engine**: AJV 8.x, `strict: true`, `allErrors: true`.
- **Usage**: Validators load schema from disk once and reuse compiled function. No runtime schema mutation.

---

## 6. CLI and Entry Point

**Entry**: `src/index.ts` (shebang `#!/usr/bin/env node`)

**Subcommands** (no mode):

- `visu audit --runId <id>` — Run determinism audit (Sprint 7).
- `visu replay --runId <id>` — Replay and validate run artifacts.
- `visu upload --runId <id>` — Upload run artifacts (Sprint 7).
- `visu migrate-contract --input <path> --output <path>` — Migrate scene contract (e.g. v1.2 → v1.3). Replaces `narration.voice` with `narration.voice_gender` resolved from registry. Fails if output file exists (Sprint 8 patch).

**Modes**:

- `--mode ui_flow --flow <path>` — Mode A (UI flow execution).
- `--mode narrate --script <path>` — Narration / TTS (Sprint 3).
- `--mode recorded --video <path> --script <path>` — Mode B (external MP4 + script → narration → final.mp4; Sprint 5).
- `--mode generative --contract <path>` — Mode C (Remotion only): always runs auto-tune (Phase 1: TTS per scene, tune contract `duration_sec` from narration; Phase 2: per-scene SceneComposition render → per-scene AV merge → concat → final.mp4). No other options; requires `config.rendering.renderer === "remotion"`.

**Behavior (common)**:

1. Generate `runId` via `createRunId()`.
2. Open logger to `logs/visu-<runId>.log`.
3. Set log schema version from `LOG_SCHEMA_VERSION` and record it (e.g. in first log line payload).
4. Log `cli_start`, optional `cli_args` (if argv has args).

**Mode-specific**:

- **ui_flow**: Validates flow JSON, enforces termination rules, runs `FlowExecutor` with `UIFlowAdapter`, then writes `artifacts/{runId}/raw.webm` and `metadata.json` (see FLOW_EXECUTION_CONTRACT_v1.1).
- **narrate**: Validates script JSON (`script_schema_v1.json`), runs `NarrationEngine` with `LocalPiperAdapter` (Piper TTS), and writes `artifacts/{runId}/narration.wav`.

Finally, each mode logs `cli_end`, closes the logger, and sets `process.exitCode` based on run status.

---

## 7. Build and Test

### 7.1 TypeScript

- **Root config**: `tsconfig.json` (paths for `@core/*`, `@engines/*`, `@adapters/*`, `@validators/*`).
- **Build**: `tsconfig.build.json` extends root; `rootDir: "src"`, `outDir: "dist"`, includes only `src/**/*`. No path rewriting; runtime imports use relative paths where needed (e.g. CLI imports from `./core/...`).
- **Tests**: `tsconfig.test.json` (if present) / Vitest resolve aliases via `vitest.config.ts`.

### 7.2 Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `build` | `tsc -p tsconfig.build.json` | Emit `dist/` |
| `dev` | `ts-node --esm src/index.ts` | Run CLI from source |
| `test` | `vitest run` | Run test suite |
| `lint` | `eslint src tests` | Lint source and tests |
| `format` | `prettier --write "src/**/*.ts" "tests/**/*.ts"` | Format code |

### 7.3 Tests

- **Runner**: Vitest; aliases aligned with tsconfig paths.
- **Files**:
  - `tests/run_context.test.ts`
  - `tests/log_schema.test.ts`
  - `tests/flow_schema.test.ts`
  - `tests/flow_termination.test.ts`
  - `tests/flow_executor.test.ts`
  - `tests/ui_flow_smoke.test.ts` (env-gated with `RUN_INTEGRATION=true`)
  - `tests/wav_utils.test.ts` (WAV duration calculation, Sprint 3)
  - `tests/script_schema.test.ts` (narration script validation, Sprint 3)
  - `tests/tts_config.test.ts` (TTS config block, Sprint 3)
  - `tests/narration_engine.test.ts` (NarrationEngine + mock adapter, Sprint 3)
  - `tests/tts_piper_smoke.test.ts` (env-gated with `RUN_TTS_INTEGRATION=true`; real Piper, Sprint 3)
  - `tests/ffmpeg_adapter.test.ts`, `tests/av_drift_validator.test.ts`, `tests/music_lufs_validator.test.ts` (Sprint 4)
  - `tests/av_merge_engine.test.ts`, `tests/metadata_writer.test.ts` (Sprint 4)
  - `tests/av_merge_integration.test.ts` (env-gated with `RUN_MEDIA_INTEGRATION=true`; Sprint 4)
  - `tests/recorded_adapter.test.ts`, `tests/recorded_mode_engine.test.ts` (Sprint 5)
  - `tests/recorded_integration.test.ts` (env-gated with `RUN_RECORDED_INTEGRATION=true`; Sprint 5)
  - `tests/scene_schema.test.ts`, `tests/timeline_engine.test.ts`, `tests/mode_c_engine.test.ts`, `tests/visual_asset_validator.test.ts`, `tests/wav_concat_engine.test.ts` (Sprint 6B)
  - `tests/mode_c_integration.test.ts` (env-gated with `RUN_MODE_C_INTEGRATION=true`; v1.1 fixtures when enabled)

- **Coverage**:
  - Existing: RunContext, log schema, flow schema, termination rules, FlowExecutor.
  - Sprint 3: Script schema, TTS config, WAV duration utility, NarrationEngine orchestration, env-gated Piper integration.
  - Sprint 4: FFmpeg adapter (version, transcode args, scene clip args), AV drift validator, music LUFS validator, AV merge engine, metadata writer, media metadata schema; env-gated AV merge integration.
  - Sprint 6B: Scene schema v1.1 (v1.0 rejected), visual asset validator, scene clip FFmpeg snapshot, WAV concat uniformity, Mode C full pipeline (scene render → timeline → wav concat → AV merge), metadata scene array; env-gated Mode C integration.
  - Sprint 13: Ken Burns motion args (6 types: zoom_in, pan_right, zoom_out, pan_left, pan_diagonal_tl, pan_diagonal_br; intensity clamp 0.05–0.35), grade filter args (eq + curves + vignette, no grain), overlay engine (text drawtext + PNG-based graphic compositing for highlight_circle and arrow_pointer), overlay validator (9 checks), visual style resolver, scene schema v1.4.

---

## 8. Environment and Deployment

**Ref**: `ENVIRONMENT.md`, `.nvmrc`

| Item | Requirement |
|------|--------------|
| Node | 20 LTS (`.nvmrc` = `20`) |
| Playwright | Installed; Chromium only. Version in metadata.json per run. |
| FFmpeg | System dependency on `PATH` |
| Resolution | 1920×1080 (locked) |
| Headless | true (browser automation) |

- **Secrets**: All API keys via `.env`; no hardcoded secrets or secret logging (per AGENTS.md).

### 8.1 Piper Model Setup

Piper ONNX model weights are **not committed to the repository** (files are 60–120 MB each; the two English models exceed GitHub's 100 MB per-file limit). They must be downloaded locally before running any TTS or Mode C pipeline.

**Manifest**: `models/piper/models.json` — committed, machine-readable. Contains for each voice: `voice`, `language`, `region`, `gender`, `quality`, `size_bytes`, `sha256`, `onnx_url`, `config_url`. Source: [https://huggingface.co/rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices).

**Download script**: `scripts/download_piper_models.sh`

```bash
# Download all missing models and verify SHA256
./scripts/download_piper_models.sh

# Verify already-downloaded files only (no download)
./scripts/download_piper_models.sh --verify

# Force re-download (e.g. after corruption)
./scripts/download_piper_models.sh --force
```

The script reads `models/piper/models.json`, downloads each `.onnx` and `.onnx.json` via `curl`, and verifies the SHA256 of every `.onnx` file against the manifest. Exits with code 1 if any hash mismatches.

**Currently registered voices:**

| Voice | Language | Gender | Quality | Size |
|-------|----------|--------|---------|------|
| `en_US-lessac-high` | English | female | high | 109 MB |
| `en_US-ryan-high` | English | male | high | 115 MB |
| `hi_IN-priyamvada-medium` | Hindi | female | medium | 61 MB |
| `hi_IN-rohan-medium` | Hindi | male | medium | 60 MB |
| `te_IN-maya-medium` | Telugu | female | medium | 60 MB |
| `te_IN-venkatesh-medium` | Telugu | male | medium | 61 MB |

After downloading, each model's SHA256 must match `config/languages.json → voices.<gender>.modelHash`. The pipeline validates this at runtime via `language_registry_validator.ts`.

---

## 9. Governance and Contracts

**Ref**: `AGENTS.md`

**Flow execution (Mode A)**: `docs/FLOW_EXECUTION_CONTRACT_v1.1.md` is the authoritative behavioral contract for UI flow execution. It defines termination rules, retry/timeout policy, logging guarantees, adapter sequencing, and **run artifact layout**. Each run produces `artifacts/{runId}/raw.webm` and `artifacts/{runId}/metadata.json`; the latter contains `flowId`, `flowVersion`, `playwrightVersion`, `nodeVersion`, `configHash`, `videoPath`, `generatedAt` (see contract §9). Implementations in `src/engines/flow_executor.ts` and `src/adapters/ui_flow_adapter.ts` must conform to it.

**Media metadata `mode`**: For observability, `media_metadata.json` has a required `mode` field. All callers of the AV merge path must pass explicitly: **Mode A → `"ui_flow"`**, **Mode B → `"recorded"`**, **Mode C → `"generative"`**. The schema enum locks these values to prevent drift.

**`sourceVideoPath` semantics**: In all modes, `sourceVideoPath` is the **video path passed into AVMergeEngine** (the single transcode point). In Mode A and B this is the raw/recorded video. **In Mode C it is the intermediate `stitched_video.mp4`** produced by the timeline engine (concat demuxer), not the original per-scene files. This distinction is required for replay and observability consistency.

**Media metadata scope**: `media_metadata.json` is output-level (run, encoding, source paths, drift, SHA256). **Scope expansion (Sprint 6B):** Mode C may include an optional **scene array** (summary-only: `scene_id`, `promptKey`, `seed`, `modelVersion`, `assetHash`, `narrationDurationMs`, `driftMs`). No visual binary, full prompt text, template text, or timeline arrays. Governed by `media_metadata_schema_v1.json`; version history in technical spec. Mode C also adds `sceneCount`, `maxDriftMs`, `avgDriftMs`. **`narration_concat.wav`** is retained as an intermediate artifact (same policy as `stitched_video.mp4`).

**Mode C — triple-encode exception (Sprint 13)**: PNG has no existing video encoding; Mode C requires one PNG→MP4 encode per scene (scene clip). Scenes with overlays undergo a second encode (overlay pass), making three total encodes through the pipeline (scene clip → overlaid clip → final.mp4). This is a formally accepted triple-encode exception for Mode C overlay scenes only. Non-overlay scenes remain at double-encode. The encoding profile is **locked** across all passes (libx264, preset medium, profile high, pix_fmt yuv420p, crf 18, 30 fps, no audio) so downstream transcode is deterministic.

**Mode C — visual asset governance**: Governed PNGs live under `assets/visuals/` (relative to topic root) with provenance sidecar `{base}.provenance.json`. Every PNG must have a sidecar; `output_hash` must match PNG SHA256; actual dimensions verified via ffprobe (1920×1080). Prompt keys must exist in `prompts/prompt_library.json` with `approved === true`. Script template keys must exist in `{contentRoot}/{topic}/scripts/script_templates.json` (or repo `scripts/script_templates.json` when absent). Same script template path applies to **ui_flow_scenes** (scene-driven Mode A).

**Recorded mode (Mode B)** — **Drift rule:** narration duration ≤ video duration only (no 200 ms rule). If narration exceeds video, the run fails with `NARRATION_EXCEEDS_VIDEO`. Optional **background music**: script field `music` (path relative to `contentRoot/{topic}/`) or, when the script has no `music` field, config **execution.defaultBackgroundMusicPath** (absolute path). If set and the file exists, the WAV is looped/trimmed to video duration (FFmpeg aloop + atrim), mixed with narration at 15% music level, and **amix uses duration=longest** so the output runs for the full video — music continues alone after narration ends with no silence. Music file must pass LUFS validation (-15 to -17). AVMergeEngine uses a three-input filter graph (video + narration + music) when `musicPath` is set and passes `videoDurationSec` so the adapter can build this graph; otherwise two-input (video + narration). **Failure:** If TTS or a later step throws, the engine logs `recorded_failed` with `status: "failed"` and the error, then rethrows. Partial artifacts (e.g. `narration.wav`) may remain under `artifacts/{runId}/`; there is no automatic cleanup.

**Narration execution (TTS)**: `docs/NARRATION_EXECUTION_CONTRACT_v1.0.md` is the behavioral contract for the narration subsystem (Sprint 3). It defines script schema expectations, adapter responsibilities (`LocalPiperAdapter`), duration calculation via WAV header parsing, logging guarantees (including `scriptHash`, `tts_provider`, `tts_engine_version`, `model_hash`), and deterministic use of Piper with fixed model files.

- VISU does not own strategy, KPI, or business memory; it only executes and logs.
- On failure: log clearly, exit safely, return structured failure; no autonomous recovery.
- New features must preserve determinism and must not introduce autonomous decision-making.
- Core must not depend on adapters (enforced by ESLint).

---

## 10. Version History and References

- **PRD**: `docs/VISU_PRD_v1.0.md` (product scope, input modes, scene schema governance, NFRs).
- **Sprint 1**: Repository init, environment lock, RunContext, logging, flow/log schemas, validators, tests, CLI producing structured logs—all in place.
- **Technical spec**: This document; update on significant architectural or contract changes.
- **Sprint 2**: Mode A UI flow — config, termination rule, adapter (executeStep/close), FlowExecutor, CLI (--mode ui_flow, --flow), artifacts/{runId}/raw.webm and artifacts/{runId}/metadata.json (flowId, flowVersion, playwrightVersion, nodeVersion, configHash, videoPath, generatedAt).
- **Sprint 3**: Narration / TTS — TTS config block, TTS core interfaces, WAV duration utility, script schema + validator, NarrationEngine, LocalPiperAdapter (Piper), CLI (`--mode narrate --script`), artifacts/{runId}/narration.wav, and env-gated Piper smoke test.
- **Sprint 4**: AV merge — Encoding profile in config (v1, libx264, AAC 48 kHz), FFmpeg adapter (version ≥ 6.0, full transcode, no stream copy), AV drift validator (narration ≤ video, delta ≤ 200 ms), music LUFS validator (-15 to -17), metadata writer (SHA256, media_metadata_schema_v1.json), av_merge_engine (Steps 0–10), artifacts final.mp4 and media_metadata.json; unit and env-gated integration tests. See `docs/SPRINT_4_EXECUTION_PLAN_v1.2_FINAL.md`.
- **Sprint 5**: Mode B (recorded) — RecordedAdapter (MP4 validation), recorded_mode_engine, CLI `--mode recorded --video --script`, media metadata schema (`sourceVideoPath`, `driftMs`, `mode`); unit and env-gated recorded integration test. See `docs/SPRINT_5_EXECUTION_PLAN_v1.1_FINAL.md`.
- **Sprint 6A**: Mode C (minimal structured execution) — Scene schema v1.0, TimelineEngine, Mode C engine (pre-baked assets). See `docs/SPRINT_6A_EXECUTION_PLAN_v1.2_FINAL.md`.
- **Sprint 6B**: Mode C (full execution with visual asset governance) — Scene schema **v1.1** (v1.0 hard rejected), provenance sidecar, visual asset validator (PNG + hash + ffprobe dimensions 1920×1080), scene clip encoding (locked profile, double-encode exception documented), scene_render_engine (PNG→clip, script templates, TTS, unified drift), wav_concat_engine (uniformity 48 kHz PCM s16le → `narration_concat.wav`), prompt library and script template validation; metadata **scene array** (summary-only); `narration_concat.wav` and `stitched_video.mp4` retained. See `docs/SPRINT_6B_EXECUTION_PLAN_v1.2_FINAL.md` (or sprint plan in repo). Spike: `docs/spikes/SDXL_DETERMINISM_SPIKE_RESULTS.json`.

- **Sprint 13**: Visual enhancements for Mode C — Ken Burns motion (6 motion types via FFmpeg zoompan filter, intensity 0.05–0.35, internal scale 3840), color grading (eq + curves + vignette via config/grades.json, grain disabled), text overlays (lower_third, stat_badge, source_tag via FFmpeg drawtext), graphic overlays (highlight_circle, arrow_pointer via runtime PNG generation + FFmpeg filter_complex overlay), visual style presets (config/visual_styles.json with resolver), scene schema v1.4 (additive over v1.3). Scene render engine updated: scenes with motion skip `-loop 1 -t` to let zoompan control frame generation. Overlay engine generates transparent PNGs using pure Node.js (Buffer + zlib, zero runtime dependencies) for circle and arrow annotations, then composites via FFmpeg `-filter_complex`. All 367 tests passing.

- **Sprint 14**: Full Remotion rendering backend — Remotion becomes the default renderer (`config/default.json` → `rendering.renderer: "remotion"`); FFmpeg remains as opt-in fallback (`"ffmpeg"`). New `TransitionComposition` replaces per-scene FFmpeg concat: sequences all scenes via `@remotion/transitions` `<TransitionSeries>` with `fade`, `slide`, `wipe`, `flip`, `clockWipe`, `iris`, `light_leak`, `none` transitions. `SceneComposition` stacks all visual layers: `KenBurnsScene` (6 motion types + 6 easing options including `spring`), `GradedScene` (CSS filter grades + SVG curves + vignette), `FilmGrainOverlay` (seeded canvas, deterministic seed 42), `MotionBlurWrapper` (`@remotion/motion-blur` `<CameraMotionBlur>`), `ParallaxScene` (two-layer depth compositing), `VideoScene` (`<OffthreadVideo>`), `AudioLayer` (`<Audio>` ambient loop + SFX via `<Sequence>`), text overlays (`LowerThird` with `slide_up`/`fade` animation, `StatBadge` with spring count-up, `SourceTag`), graphic overlays (`GlowHighlight` with SVG `feGaussianBlur` + pulse, `ArrowPointer` with draw-on, `ShapeOverlay` using `@remotion/shapes` + `@remotion/paths` `evolvePath` for path draw-on animation). Font registry via `config/fonts.json` (5 styles × 3 languages) resolved at render time by `@remotion/google-fonts`. `LightLeakOverlay` via `@remotion/light-leaks`. New packages: `@remotion/transitions`, `@remotion/shapes`, `@remotion/paths`, `@remotion/motion-blur`, `@remotion/light-leaks` (all at 4.0.435). Schema v1.4 extended with optional additive fields: `scene.transition`, `scene.audio`, `visual.motion.easing`, `visual.motion.motion_blur`, `visual.grain`, `visual.parallax`, overlay `animation`/`count_up`/`glow`/`glow_radius`/`shape`/`size`/`fill`/`draw_on`/`language`. Total frames calculation: `sum(scene.duration_sec × fps) − sum(transition.duration_sec × fps)` per transition (light_leak overlays do not shorten timeline). `mode_c_engine.ts` routes to Remotion when `renderer === "remotion"`: renders `TransitionComposition` to `stitched_video.mp4`, then AV merges with `narration_concat.wav` (unchanged). FFmpeg fallback path is Sprint 13 code, untouched. All 402 tests passing (35 new Sprint 14 tests + 367 existing, zero regressions).

**Mode C — known limitations (future hardening):** (1) Concat demuxer uniformity gate checks codec, resolution, pix_fmt, and framerate only. (2) Narration WAV concat enforces 48 kHz, PCM 16-bit, same channel count; mismatch yields deterministic failure (no implicit resample). (3) ffprobe used for image dimensions and per-scene video/WAV metadata; one pass per asset.
