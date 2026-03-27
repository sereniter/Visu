# VISU Environment Specification

## Node Version

- **Required**: Node.js 20 LTS
- Use `.nvmrc` to lock version: `20`

## Playwright

- **Version**: Managed via `package.json` dependency (`playwright`)
- Chromium browser is required; version is recorded per run in metadata.

## FFmpeg

- **Requirement**: System dependency (not an npm package)
- **Minimum version**: 6.0 (enforced for Mode C and AV merge)
- Used for audio/video merge, final rendering, and Mode C timeline concat
- Must be installed and available on `PATH`
- **Determinism**: The transcode step uses **-map_metadata -1** so container metadata (e.g. creation time) is not muxed into the output; this avoids metadata-driven SHA256 variance between runs.

## Piper (Local TTS)

- **Requirement**: `piper` CLI binary installed and available on `PATH`
- **Usage**: Local Text-to-Speech for narration (Sprint 3)
- **Verification**: `piper --version` must succeed

### Installing Piper from a tarball (e.g. piper_macos_x64.tar)

1. Extract the archive (from your Downloads folder):
   ```bash
   cd /Users/play/Downloads
   tar -xvf piper_macos_x64.tar
   ```
   (Use `tar -xzvf piper_macos_x64.tar.gz` if the file is `.tar.gz`.)

2. Move the binary to a directory on your PATH, or add its directory to PATH:
   ```bash
   # Option A: copy to a bin dir (e.g. under home)
   mkdir -p ~/bin
   cp piper ~/bin/   # or whatever the extracted binary is named
   export PATH="$HOME/bin:$PATH"

   # Option B: add the extracted directory to PATH
   export PATH="/Users/play/Downloads/piper_macos_x64:$PATH"
   ```
   To make PATH permanent, add the `export` line to `~/.zshrc`.

3. Verify: `piper --version`

### Piper Model Files (Sprint 8 + voice gender patch)

- **Language registry v1.1**: `config/languages.json` defines supported languages (en, hi, te, ta) with a **voices** object per language keyed by gender (`male`, `female`). Each gender entry has `voice`, `modelPath`, `modelConfig`, `modelHash`. Only register genders that exist for that language (see [Piper releases](https://github.com/rhasspy/piper/releases)); requesting an unavailable gender causes a hard stop (no silent fallback).
- **Expected hashes**: Stored in `config/languages.json` under each language’s `voices.<gender>.modelHash`. The validator compares the on-disk model file SHA256 against this value; mismatch causes a hard stop. Do **not** duplicate hashes in this file; `config/languages.json` is the authoritative source.
- Model files live under `models/piper/`:
  - `{voice}.onnx` — model weights
  - `{voice}.onnx.json` — model config
- These files:
  - Are NOT committed to git (listed in `.gitignore` if under `models/`)
  - MUST be present on disk for narration runs to succeed
  - Are hash-verified at runtime against `config/languages.json`

**Download and setup**: See `models/piper/MODELS.md` for per-language per-gender directory layout and setup steps. After downloading, set each `voices.<gender>.modelHash` in `config/languages.json` to the actual file SHA256 (e.g. `shasum -a 256 models/piper/te_IN-venkatesh-medium.onnx`).

### Hash validator and model hash logging

- **Hash validator**: Before scene render, the pipeline runs language-registry validation (schema and scene languages). For each scene, the **model hash validator** checks that the Piper `.onnx` file exists and that its on-disk SHA256 equals the `voices.<gender>.modelHash` value in `config/languages.json`. Mismatch or missing file causes a hard stop (see `MODEL_HASH_MISMATCH` in `docs/consumer/ERROR_REFERENCE.md`). Implementation: `src/validators/language_registry_validator.ts` (`verifyModelHash`, invoked from `validateSceneLanguages`).
- **Log model hash per run**: Each Mode C run logs the verified model hashes in the `mode_c_language_valid` step (payload `modelHashes`: one entry per scene with `scene_id`, `language`, `voice_gender`, `modelPath`, `modelHash`). Each TTS synthesis logs the model hash used in the `narration_completed` step (`model_hash`). Use these logs to confirm which Piper model was used for reproducibility and auditing.

### Piper output sample rate and resampling

Many Piper models (including common Telugu models) output at **22050 Hz**. The pipeline requires **48000 Hz** for the WAV concat uniformity gate (Sprint 3 / 6B). The Piper adapter does not request a sample rate from Piper; it accepts whatever the model produces.

If the model’s native rate is not 48000 Hz, the adapter **resamples** the WAV to 48000 Hz with FFmpeg after synthesis, then returns the resampled file. Duration and all downstream steps use the resampled file. No pipeline changes are required; the adapter guarantees 48000 Hz output. If no 48000 Hz Telugu model is available, this resample step is the supported path.

### Piper determinism and SHA256 stability (Sprint 8)

Piper TTS is **functionally deterministic** — same text, same model, same speed produces correct and consistent narration across runs. It is **not bit-identical** due to ONNX floating-point variance on CPU. This applies to all four supported languages (en, hi, te, ta). The pipeline enforces drift, sample rate, and duration correctness. **SHA256 stability of `final.mp4`** is not guaranteed when narration is generated at runtime. For bit-identical output, use pre-generated governed WAV assets (Option B pattern from Sprint 6B). When hardware improves (e.g. Apple Silicon / GPU), bit-identical determinism should be re-evaluated per language. See `docs/DETERMINISM_CHECKLIST.md`.

## Resolution Lock

- **Resolution**: 1920x1080 (locked)
- All video output must conform to this resolution

## Headless Mode

- **Decision**: TRUE (locked)
- Browser automation runs in headless mode by default

## Mode C integration test fixtures

The Mode C integration test (`RUN_MODE_C_INTEGRATION=true`) uses **governed** fixtures under `tests/fixtures/mode_c_governed/`. No pre-rendered scene MP4s or narration WAVs are required; the pipeline generates them from the contract, prompt library, script templates, and governed PNGs.

**Layout:**

- `contract_v1.3_fixture.json` — Scene contract v1.3 (governed_image visuals, script template narration, `narration.language` and `narration.voice_gender` required; `voice` removed). v1.2 contracts are rejected; use `visu migrate-contract --input <v1.2> --output <v1.3>` to migrate.
- `prompts/prompt_library.json` — Prompt keys referenced by the contract (each must have `approved: true`)
- `scripts/script_templates.json` — Narration text templates; each entry has `text` or `template`, `language` (ISO 639-1), `variables`. Template `language` must match the scene’s `narration.language`. For Mode C and ui_flow_scenes, templates are loaded from `{contentRoot}/{topic}/scripts/script_templates.json` when present, else repo `scripts/`.
- `assets/visuals/*.png` — 1920×1080 governed PNGs; each must have a matching `*.provenance.json` sidecar with `output_hash` equal to the PNG’s SHA256

**Language registry**: Mode C loads the language registry from the repo root (`config/languages.json` v1.1). Ensure the contract’s `narration.language` and `narration.voice_gender` (male/female) exist in the registry for that language; model files must exist and `modelHash` must match.

**Determinism:** Piper is functionally deterministic but not bit-identical; integration tests do not assert SHA256 equality of `final.mp4`. For bit-identical output, use pre-generated governed WAVs. See `docs/DETERMINISM_CHECKLIST.md`.

## Strict determinism mode (Sprint 7, CI only)

Strict mode (`visu --mode recorded ... --strict-determinism` or `--mode generative ... --strict-determinism`) is intended for **CI and controlled environments only**. It is not expected to pass on developer machines with different package managers or OS configurations.

- **Behavior:** After a successful run, the engine runs an audit. If any of the following mismatch, the process exits with code 1: FFmpeg binary fingerprint, Piper binary fingerprint, Node version, config hash, encoding profile, or final video SHA256.
- **Escape hatch:** Use `--expected-ffmpeg-fingerprint <hash>` to compare the current FFmpeg fingerprint against a supplied value instead of the stored run value. Enables reproducibility verification in CI when the run’s environment snapshot is not the baseline.
- **Limitation:** Hardcoding hashes in shell scripts is fragile (hashes must be updated when FFmpeg is upgraded). A committed `determinism.lock` file with expected fingerprints is the recommended future evolution (Sprint 7+).

## Mode C (Sprint 6B) — Visual asset authoring

Mode C uses **governed** PNGs: each image must have a **provenance sidecar** `{base}.provenance.json` next to the PNG (e.g. `assets/visuals/intro_12345_1.0.png` and `assets/visuals/intro_12345_1.0.provenance.json`).

### Provenance sidecar

- Schema: `schemas/provenance_schema_v1.json`. Required fields include `prompt_key`, `prompt_text_hash`, `model`, `model_version`, `model_file_hash`, `seed`, `sampler`, `steps`, `resolution` (e.g. `"1920x1080"`), `torch_version`, `diffusers_version`, `generated_at`, `output_hash` (SHA256 of the PNG file). `additionalProperties: false`.
- Create the sidecar after generating the PNG; set `output_hash` to the hex SHA256 of the PNG file so the pipeline can verify integrity.

### Verifying PNG dimensions (ffprobe)

The pipeline verifies that each PNG is 1920×1080 using ffprobe. To check dimensions locally:

```bash
ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of json image.png
```

### Prompt library and script templates

- **Prompt library**: `prompts/prompt_library.json`. Each key used in a contract’s `visual.prompt_key` must exist and have `approved === true`.
- **Script templates**: Loaded per flow from `{contentRoot}/{topic}/scripts/script_templates.json`; if missing, the engine uses the repo `scripts/script_templates.json`. Each key used in `narration.text_template_key` must exist; each entry may use `text` or `template`; `language` must match the scene’s `narration.language` (en, hi, te, ta). Mismatch causes a hard stop.
