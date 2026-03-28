# NARRATION_EXECUTION_CONTRACT_v1.0

Status: Draft (Sprint 3)  
Applies To: Narration / TTS Subsystem (Mode: `narrate`)  
Owner: VISU Core Architecture  
Governance Reference: GOVERNANCE_SYSTEM.md

------------------------------------------------------------------------

# 1. Purpose

This document defines the deterministic execution semantics for the VISU Narration / Text-to-Speech (TTS) subsystem in Sprint 3.

It governs:

- Script input expectations
- Adapter responsibilities
- Engine behavior
- Logging guarantees
- Artifact layout
- Determinism constraints

This contract is authoritative for Mode `narrate`. Implementation must conform to it.

------------------------------------------------------------------------

# 2. Input Script Contract

## 2.1 Schema

Narration input MUST conform to `schemas/script_schema_v1.json`.

Root object:

```json
{
  "version": "1.0",
  "language": "te",
  "text": "..."
}
```

- `version`: `"1.0"` only (Phase 1).
- `language`: `"te"` only (Telugu).
- `text`: non-empty string. Content is treated as full narration text.

No additional properties are permitted (`additionalProperties: false`).

## 2.2 Validation

Before any synthesis:

1. Load script JSON from disk.
2. Validate against `script_schema_v1.json` via AJV.
3. On failure:
   - Log `validation_error` with error details.
   - Abort without invoking the TTS adapter.

------------------------------------------------------------------------

# 3. Engine Semantics (NarrationEngine)

The NarrationEngine is responsible for orchestrating a single narration run.

Given:

- A validated script object.
- A `RunContext` with `execution.mode = "narrate"`.
- A logger (NDJSON, schema-conformant).
- An `ITTSAdapter` implementation.

The engine MUST:

1. Compute `scriptHash = SHA-256(script.text)` using UTF-8 encoding.
2. Log `narration_start` with payload:
   - `language`
   - `scriptHash`
   - `provider` (from config: `tts.provider`)
   - `voiceId` (from config: `tts.defaultVoice`)
   - `sampleRate` (from config: `tts.sampleRate`)
3. Build a `TTSRequest` with:
   - `text = script.text`
   - `runId = context.runId`
   - `voice = tts.defaultVoice`
   - `speechRate = tts.speechRate`
   - `sampleRate = tts.sampleRate`
   - `outputFormat = "wav"`
   - `outputDir = artifacts/{runId}` (resolved from config.execution.artifactsDir)
4. Call `adapter.synthesize(request)`.
5. On success:
   - Set `context.artifacts.audioPath = response.audioPath`.
   - Set `context.status = "completed"`.
   - Log `narration_completed` with payload:
     - `scriptHash`
     - `tts_provider`
     - `tts_engine_version` (Piper binary version, if available)
     - `voice_id`
     - `speech_rate`
     - `duration_ms`
     - `audio_path`
     - `model_hash`
6. Return the updated `RunContext` and `TTSResponse` extended with `scriptHash`.

Error handling behavior for the engine is defined in §6.

------------------------------------------------------------------------

# 4. Adapter Contract (ITTSAdapter)

The TTS adapter interface is defined in `src/core/tts_interface.ts` and exported via `src/core/index.ts`.

## 4.1 Interface

```ts
export interface TTSRequest {
  text: string;
  runId: string;
  voice: string;
  speechRate: number;
  sampleRate: number;
  outputFormat: "wav";
  outputDir: string;
}

export interface TTSResponse {
  audioPath: string;
  durationMs: number;
  provider: string;
  voiceId: string;
  modelHash: string;
  engineVersion?: string;
}

export interface ITTSAdapter {
  synthesize(request: TTSRequest): Promise<TTSResponse>;
}
```

## 4.2 Implementation Boundary

- Adapters MAY import system libraries (e.g. `child_process`, `fs`).
- Adapters MUST NOT be imported by `src/core/` (enforced by ESLint).
- Engines depend on `ITTSAdapter` only (constructor injection or function parameter), never on concrete adapter classes.

------------------------------------------------------------------------

# 5. LocalPiperAdapter Semantics

The Sprint 3 implementation of `ITTSAdapter` is `LocalPiperAdapter` in `src/adapters/tts/local_piper_adapter.ts`.

## 5.1 Initialization

Before the first synthesis, the adapter MUST:

1. Resolve:
   - `modelPath = resolve(process.cwd(), tts.modelPath)`
   - `modelConfigPath = resolve(process.cwd(), tts.modelConfigPath)`
2. Fail fast if either path does not exist:
   - Throw: `Piper model file not found at <path>. See ENVIRONMENT.md.`
   - Throw: `Piper model config file not found at <path>. See ENVIRONMENT.md.`
3. Read the model file (`.onnx`) and compute:
   - `modelHash = SHA-256(modelFileBytes)`
4. Execute `piper --version` once:
   - Capture stdout as `engineVersion` (trimmed).
   - If the command fails, loggable error is allowed but synthesis may still proceed without `engineVersion`.

Initialization MUST be performed at most once per process.

## 5.2 Synthesis

For each `TTSRequest`, the adapter MUST:

1. Resolve `outputDir` to an absolute path and ensure it exists:
   - `baseDir = resolve(process.cwd(), config.execution.artifactsDir, runId)`
   - `mkdir -p baseDir`
   - `outputPath = baseDir + "/narration.wav"`
2. Invoke Piper CLI (plain text, no SSML):
   - Command shape:
     - `piper --model <modelPath> --config <modelConfigPath> --output_file <outputPath> --length_scale <1/speechRate>`
   - Pipe `request.text` to Piper stdin.
3. Capture stderr and exit code:
   - On non-zero exit:
     - Throw: `Piper synthesis failed with code <code>: <stderr or 'no stderr'>`
4. On success:
   - Compute `durationMs` using `getWavDurationMs(outputPath)` (see §5.3).
   - Return:
     - `audioPath = outputPath`
     - `durationMs`
     - `provider = "local_piper"`
     - `voiceId = request.voice`
     - `modelHash` (from initialization)
     - `engineVersion` (if available)

## 5.3 WAV Duration Calculation

Duration MUST be computed from the WAV file header; no external tools (e.g. ffprobe) are permitted in Sprint 3.

Implementation:

- Use `getWavDurationMs(filePath)` in `src/core/wav_utils.ts`:
  - Verify RIFF/WAVE header.
  - Read PCM fields:
    - `numChannels`, `sampleRate`, `bitsPerSample`.
  - Locate `data` chunk and read `dataChunkSize`.
  - Compute:

  \[
  durationMs = \left(\frac{dataChunkSize}{sampleRate \times numChannels \times (bitsPerSample / 8)}\right) \times 1000
  \]

- Round to nearest millisecond.
- Throw if header is invalid or `data` chunk is missing.

------------------------------------------------------------------------

# 6. Error Handling and Failure Semantics

On any adapter error:

- The adapter MUST:
  - Throw a descriptive `Error` (never silently return partial data).
- The engine MUST:
  - Treat any thrown error from `synthesize()` as a terminal failure for this narration run.
  - Set `RunContext.status = "failed"`.
  - Populate `RunContext.error` with:
    - `stage = "narration"`
    - `message = error.message`
    - `stack = error.stack` (if available)
  - Log `narration_failed` with payload:
    - `message`
    - `scriptHash` (if computed)
    - `provider` (if known)
    - Any relevant stderr details.

The CLI (`--mode narrate`) MUST:

- Set `process.exitCode = 1` when narration fails.
- Log `cli_error` for:
  - Script load failures.
  - Script validation failures.
  - Top-level narration exceptions.

No retries are permitted in Sprint 3. Failure is final for that run.

------------------------------------------------------------------------

# 7. Logging Requirements

Each narration run MUST log, at minimum:

- `runId`
- `scriptHash`
- `tts_provider`
- `tts_engine_version` (if available)
- `voice_id`
- `speech_rate`
- `duration_ms`
- `audio_path`
- `model_hash`

Logs MUST conform to `schemas/log_schema_v1.json`:

- `runId`, `timestamp`, `step` required on every line.
- `payload` used for structured fields above.
- `level` used as appropriate (`info` / `error`).

No experiment flags or variant identifiers are permitted in Sprint 3:

- `experiment_enabled` — **out of scope**
- `variant_id` — **out of scope**
- `seed` — **out of scope**

------------------------------------------------------------------------

# 8. Artifact Layout

Every narration run MUST produce:

- **artifacts/{runId}/narration.wav** — Audio file produced by Piper.

Constraints:

- Format: WAV (PCM).
- Sample rate: 48000 Hz (from config).
- Channels and bit depth dependent on model; determinism must hold under fixed model + config.

Additional metadata files for narration are optional in Sprint 3; if added later, they MUST be versioned and schema-governed.

------------------------------------------------------------------------

# 9. Determinism Rules

When experiment mode is disabled (default and only state in Sprint 3):

- `speechRate` is fixed (from config).
- `voice` is fixed (from config).
- `modelPath` and `modelConfigPath` are fixed (from config).
- `modelHash` is recorded per run.
- `tts_engine_version` is stable across runs (fixed Piper binary).

Given:

- Identical script JSON (including `text` and `version`).
- Identical effective config for `tts` and `execution` *(today: `config/shared.json` + mode overlay as applicable; see docs/consumer/CONFIG_REFERENCE.md).*
- Identical runtime environment (Node version, Piper binary, model files).

The system MUST produce:

- Identical `scriptHash`.
- Identical `modelHash`.
- Identical `tts_engine_version`.
- WAV outputs that are bitwise identical, or differ only in header fields that do not affect actual sample data.

Any change to model file or Piper binary requires:

- Config update (if paths change).
- Implicit `modelHash` / `tts_engine_version` change in logs, visible for replay analysis.

------------------------------------------------------------------------

# 10. Mode Integration and Scope

This contract applies only to:

- CLI: `--mode narrate --script <path>`
- Internal call path: `runNarrateMode` → `runNarration` → `LocalPiperAdapter.synthesize`

Explicitly out of scope for Sprint 3:

- Video merge or composition.
- Segment-level narration tied to scenes.
- Emotion or style variation.
- Experimentation, A/B testing, or adaptive speech parameters.
- Any cloud-based TTS providers.

Future sprints MAY add:

- Additional adapters (Google, Azure, ElevenLabs, etc.).
- SSML-based adapters.
- Segment-level schemas and scene-aware narration.

These extensions MUST:

- Preserve determinism guarantees.
- Be governed by updated versions of this contract (e.g. `NARRATION_EXECUTION_CONTRACT_v1.1`).

------------------------------------------------------------------------

NARRATION_EXECUTION_CONTRACT_v1.0 is now drafted for Sprint 3.

