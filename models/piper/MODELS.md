# Piper model files (Sprint 8 + voice gender patch)

**Current model files (this repo):** `en_US-lessac-high`, `en_US-ryan-high`; `hi_IN-priyamvada-medium`, `hi_IN-rohan-medium`; `te_IN-maya-medium`, `te_IN-venkatesh-medium`. Each needs `{voice}.onnx` + `{voice}.onnx.json`.

Piper model files are **binary assets** and are not committed to the repository. Place `.onnx` and `.onnx.json` files here **per language per gender** (male/female).

**Registry v1.1:** `config/languages.json` uses a `voices` object per language, keyed by gender (`male`, `female`). Each gender entry has `voice`, `modelPath`, `modelConfig`, `modelHash`. Only register genders that exist for that language on [Piper releases](https://github.com/rhasspy/piper/releases). If a language has only one gender available, register only that gender; requesting the unavailable gender will hard fail (no silent fallback).

**Expected hashes** are stored in `config/languages.json` under each language’s `voices.<gender>.modelHash`. The pipeline validator compares the on-disk file SHA256 against this value; mismatch causes a hard stop.

## Setup step (required after placing model files)

Until you populate hashes in `config/languages.json`, the language validation gate will fail (e.g. `RUN_MODE_C_INTEGRATION=true` will stop at model hash validation). This is correct behaviour.

For each model you download (per language, per gender):

1. Place the `.onnx` and `.onnx.json` files under `models/piper/` (paths must match `config/languages.json` for that language’s `voices.<gender>`).
2. Compute the SHA256 of the model file:
   ```bash
   shasum -a 256 models/piper/<voice>.onnx
   ```
   Example for Telugu male: `shasum -a 256 models/piper/te_IN-venkatesh-medium.onnx`
3. Copy the hex hash (first column) into `config/languages.json` under that language’s `voices.<gender>.modelHash`.
4. Repeat for each language and each gender as you add models.

## Per-language per-gender download and install

See **ENVIRONMENT.md** for:

- Download source per model (check Piper releases for available male/female voices per language)
- Installation command per language
- Note that expected hashes live in `config/languages.json`, not in this file

## Required files per language per gender

- `{voice}.onnx` — model weights
- `{voice}.onnx.json` — model config

Paths and voice IDs are defined in `config/languages.json` under `supported.<lang>.voices.<gender>`.
