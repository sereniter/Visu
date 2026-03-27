# SPRINT_8_EXECUTION_PLAN_v1.1

**Status:** Lock Candidate  
**Applies To:** VISU — Multilingual Extension (AnukramAI)  
**Owner:** VISU Core Architecture  
**Prerequisites:** Sprint 7 Complete  
**Target Languages:** English (`en`), Hindi (`hi`), Telugu (`te`), Tamil (`ta`)

---

## 1. Objective

Extend VISU from a Telugu-only single-language engine to a governed multilingual production engine supporting English, Hindi, Telugu, and Tamil.

No new rendering logic. No new pipeline stages. The extension is entirely in:
- Language registry governance
- TTS adapter selection per language
- Script template language dimension
- Scene schema language field
- Voice registry and validation

The pipeline itself does not change.

---

## 2. Scope

### In Scope
- Language registry (`config/languages.json`)
- Language registry validator
- Scene schema update (`narration.language` field)
- Script template language dimension enforcement
- Voice registry per language
- TTS adapter selection by language at runtime
- CLI language validation
- Metadata language field
- Test coverage for all four languages
- Documentation

### Out of Scope
- New TTS engines (Piper remains the adapter for all four languages in this sprint)
- AI4Bharat adapter (future sprint when hardware improves)
- Translation pipeline
- Language detection
- Mixed-language scenes
- Subtitle generation
- Language-specific style profiles
- Voice quality evaluation framework

---

## 3. Architecture Decision — Single Adapter, Multiple Models

For this sprint: Piper remains the sole TTS adapter. Each language maps to a different Piper model file. The adapter is instantiated with the model path resolved from the language registry.

This is the minimal change that achieves multilingual support without introducing adapter complexity. When AI4Bharat or Kokoro become viable, they slot in as new adapters behind the existing `ITTSAdapter` interface.

---

## 4. Language Registry

**Location:** `config/languages.json`

```json
{
  "version": "1.0",
  "supported": {
    "en": {
      "name": "English",
      "adapter": "local_piper",
      "modelPath": "models/piper/en_US-lessac-high.onnx",
      "modelConfig": "models/piper/en_US-lessac-high.onnx.json",
      "voice": "en_US-lessac-high",
      "sampleRate": 48000,
      "nativeModelRate": 22050,
      "modelHash": "sha256-of-model-file"
    },
    "hi": {
      "name": "Hindi",
      "adapter": "local_piper",
      "modelPath": "models/piper/hi_IN-...",
      "modelConfig": "models/piper/hi_IN-....json",
      "voice": "hi_IN-...",
      "sampleRate": 48000,
      "nativeModelRate": 22050,
      "modelHash": "sha256-of-model-file"
    },
    "te": {
      "name": "Telugu",
      "adapter": "local_piper",
      "modelPath": "models/piper/te_IN-...",
      "modelConfig": "models/piper/te_IN-....json",
      "voice": "te_IN-...",
      "sampleRate": 48000,
      "nativeModelRate": 22050,
      "modelHash": "sha256-of-model-file"
    },
    "ta": {
      "name": "Tamil",
      "adapter": "local_piper",
      "modelPath": "models/piper/ta_IN-...",
      "modelConfig": "models/piper/ta_IN-....json",
      "voice": "ta_IN-...",
      "sampleRate": 48000,
      "nativeModelRate": 22050,
      "modelHash": "sha256-of-model-file"
    }
  }
}
```

**Changes from v1.0:**
- `resampleRequired` removed — adapter determines resampling need dynamically via `getWavFormat()` at runtime. Static config field was redundant and a maintenance risk.
- `modelHash` added — machine-readable expected SHA256 per model. Validator compares against actual file hash directly. `ENVIRONMENT.md` references `languages.json` as the authoritative hash source.

**Rules:**
- `additionalProperties: false`
- All model paths must exist on disk before pipeline execution
- `sampleRate` must be 48000 (pipeline requirement)
- `nativeModelRate` documents actual model output rate for observability
- `modelHash` is the authoritative expected hash — validator uses this, not `ENVIRONMENT.md`
- Language codes follow ISO 639-1

**Schema:** `schemas/language_registry_schema_v1.json`  
**Validator:** `src/validators/language_registry_validator.ts`

---

## 5. Model File Governance

Piper model files are binary assets. They cannot be committed to the repository.

**Location:** `models/piper/`  
**Required per language:**
- `{voice}.onnx` — model weights
- `{voice}.onnx.json` — model config

**Hash verification:**
- Expected hash stored in `config/languages.json` under `modelHash`
- Validator computes `SHA256(model file)` and compares against `modelHash`
- Mismatch → hard stop
- `ENVIRONMENT.md` references `languages.json` as the authoritative source — no duplicate hash storage

**Per run logging:**
- Model file SHA256 logged in `environment_snapshot.json`
- Model path logged in `media_metadata.json`

**`ENVIRONMENT.md`** documents:
- Download source per model
- Installation command per language
- Note: expected hashes live in `config/languages.json`, not in this file

---

## 6. Scene Schema Update (v1.2)

**Location:** `schemas/scene_schema_v1.2.json`

Add `narration.language` as a required field:

```json
{
  "narration": {
    "text_template_key": "intro_invoice_creation_te",
    "language": "te",
    "voice": "te_IN-...",
    "speed": 1.0
  }
}
```

**Rules:**
- `language` is required
- `language` must exist in `config/languages.json`
- `voice` must match the voice registered for that language
- Mismatch between `language` and `voice` → hard stop

**Migration policy:**
- `schema_version: "1.1"` contracts are rejected after Sprint 8
- Error message: "Contract schema v1.1 is not supported. Migrate to v1.2."
- No auto-migration

> **Future sprint note:** A contract migration tool should be built before AnukramAI contracts are shared externally with Bhairav or OpenClaw. Each schema version bump currently invalidates all existing contracts. This is manageable for personal use but becomes a governance problem at scale.

---

## 7. Script Template Language Enforcement

**Location:** `scripts/script_templates.json`

Templates are language-specific. Each template key must declare its language:

```json
{
  "intro_invoice_creation_te": {
    "template": "ఈ వీడియోలో మనం ...",
    "language": "te",
    "variables": []
  },
  "intro_invoice_creation_en": {
    "template": "In this video we will ...",
    "language": "en",
    "variables": []
  },
  "intro_invoice_creation_hi": {
    "template": "इस वीडियो में हम ...",
    "language": "hi",
    "variables": []
  },
  "intro_invoice_creation_ta": {
    "template": "இந்த வீடியோவில் நாம் ...",
    "language": "ta",
    "variables": []
  }
}
```

**Template key convention:** `{topic}_{language_code}`

**Validation:**
- Template `language` field must match scene `narration.language`
- Mismatch → hard stop
- Template language must exist in language registry

---

## 8. TTS Adapter — Language-Aware Resolution

`NarrationEngine` resolves the TTS adapter and model path from the language registry at runtime:

```typescript
const langConfig = getLanguageConfig(scene.narration.language);
const adapter = new LocalPiperAdapter(langConfig.modelPath, langConfig.modelConfig);
```

No hardcoded model paths anywhere in engine code. All model selection is registry-driven.

The existing resampling logic in `local_piper_adapter.ts` determines resampling need dynamically via `getWavFormat()` after synthesis. No adapter changes needed — the registry drives the model path, the adapter handles the rest.

---

## 9. Metadata Extensions

Add to `media_metadata.json` top-level:

```json
{
  "language": "te",
  "voiceId": "te_IN-...",
  "piperModelPath": "models/piper/te_IN-....onnx",
  "piperModelHash": "sha256"
}
```

Add `language` to per-scene object in scenes array (Mode C):

```json
{
  "scenes": [
    {
      "scene_id": "s1",
      "language": "te",
      "promptKey": "invoice_dashboard_intro",
      "seed": 12345,
      "modelVersion": "1.0",
      "assetHash": "sha256",
      "narrationDurationMs": 7800,
      "driftMs": 12
    }
  ]
}
```

Top-level `language` reflects the primary language of the run. Per-scene `language` enables future mixed-language contracts to be auditable.

---

## 10. Language Validation Gate

Added to execution flow after contract validation:

For each scene:
1. `narration.language` exists in language registry
2. `narration.voice` matches registered voice for that language
3. `text_template_key` language matches `narration.language`
4. Model file exists at registered path
5. `SHA256(model file)` matches `modelHash` in `config/languages.json`

Any failure → hard stop before any rendering begins.

---

## 11. Updated Mode C Pipeline

```
1.  FFmpeg version check (≥ 6.0)
2.  Contract validation (scene_schema_v1.2)
3.  Language registry validation (all scene languages supported)
4.  Prompt library validation
5.  Script template validation (language match enforced)
6.  Visual asset validation (PNG + provenance + hash + dimensions)
7.  Scene render orchestrator:
      a. PNG → scene clip (locked profile)
      b. Language registry lookup → model path resolution
      c. Template resolve → TTS (language-correct model) → narration WAV
      d. WAV metadata extraction single-pass
      e. Unified drift validation
8.  TimelineEngine concat → stitched_video.mp4
9.  WAV concat engine → narration_concat.wav
10. AVMergeEngine (mode: "generative")
11. SHA256 computation
12. Metadata construction + schema validation
13. Write media_metadata.json
14. Log completion
```

---

## 12. Determinism Classification Update

| Language | Piper Determinism | Notes |
|---|---|---|
| English | Functionally deterministic | Not bit-identical — ONNX CPU variance |
| Hindi | Functionally deterministic | Same |
| Telugu | Functionally deterministic | Documented in Sprint 7 |
| Tamil | Functionally deterministic | Same |

**Determinism checklist statement (updated):**

> Piper TTS is **functionally deterministic** — same text, same model, same speed produces correct and consistent narration across runs. It is **not bit-identical** due to ONNX floating point variance on CPU hardware. This applies to all four supported languages. The pipeline enforces drift, sample rate, and duration correctness. SHA256 stability of `final.mp4` is not guaranteed when narration is generated at runtime. For bit-identical output, use pre-generated governed WAV assets (Option B pattern from Sprint 6B). When hardware improves (Apple Silicon / GPU), bit-identical determinism should be re-evaluated per language.

---

## 13. New Files

```
config/
  languages.json

schemas/
  language_registry_schema_v1.json
  scene_schema_v1.2.json

src/
  validators/
    language_registry_validator.ts
  core/
    language_config.ts              ← getLanguageConfig() helper

models/
  piper/
    .gitkeep                        ← directory committed, binaries not
    MODELS.md                       ← download instructions per language

tests/
  language_registry_validator.test.ts
  language_schema.test.ts
  multilingual_narration.test.ts
  fixtures/
    multilingual/
      contract_en.json              ← 1 scene, duration_sec: 2.0, en template
      contract_hi.json              ← 1 scene, duration_sec: 2.0, hi template
      contract_te.json              ← 1 scene, duration_sec: 2.0, te template
      contract_ta.json              ← 1 scene, duration_sec: 2.0, ta template
```

---

## 14. Testing Requirements

### Unit Tests

| Test | Validates |
|---|---|
| Language registry — all four languages valid | Passes |
| Language registry — unknown language code | Hard stop |
| Language registry — `modelHash` mismatch | Hard stop |
| Scene schema v1.2 — `narration.language` missing | Fails |
| Scene schema v1.2 — language not in registry | Fails |
| Voice mismatch (language vs voice) | Hard stop |
| Template language mismatch | Hard stop |
| Model path missing | Hard stop |
| Language config resolution — `en` | Returns correct model path |
| Language config resolution — `hi`, `te`, `ta` | Returns correct model paths |
| Schema v1.1 contract rejected | Hard fail with migration message |
| Per-scene `language` in metadata scenes array | Present and correct |

### Integration Tests (Gated)

```
RUN_MULTILINGUAL_INTEGRATION=true
```

**Minimum fixture spec per language:**
- Single scene
- `duration_sec: 2.0`
- Template key from the language-specific template set
- Committed PNG asset (can reuse existing Sprint 6B fixture)
- Narration speed tuned so drift passes within 200ms

**Each test verifies:**
- Correct model loaded (model path matches registry)
- Narration WAV produced at 48000 Hz
- Drift passes (≤ 200ms)
- `media_metadata.language` matches contract language
- `media_metadata.scenes[0].language` matches contract language
- Pipeline completes without error
- `final.mp4` exists and is non-zero size

> **No SHA256 equality assertion.** Piper is functionally deterministic but not bit-identical on CPU. Integration tests assert pipeline correctness, not bit-identical output. SHA256 stability tests are only valid when all inputs including narration WAVs are static governed assets.

---

## 15. Documentation Updates

- `ENVIRONMENT.md`:
  - Model download instructions per language
  - `models/piper/` directory setup
  - Note: expected model hashes live in `config/languages.json`
- `VISU_TECHNICAL_SPEC.md`:
  - Multilingual architecture section
  - Language registry as governance layer
  - Scene schema v1.2
  - Determinism classification updated for all four languages
- `DETERMINISM_CHECKLIST.md`:
  - Piper described as functionally deterministic, not bit-identical
  - Applies to all four supported languages
  - SHA256 stability requires pre-generated governed WAV assets
  - SHA256 equality assertions removed from integration tests
- `docs/SPRINT_8_EXECUTION_PLAN_v1.1.md` — saved for traceability

---

## 16. Success Criteria

Sprint 8 is complete when:

- [ ] Language registry defined, schema-validated, `modelHash` per language
- [ ] `resampleRequired` removed from registry — adapter uses runtime detection
- [ ] All four language models downloaded and paths documented
- [ ] Scene schema v1.2 enforces `narration.language`
- [ ] Schema v1.1 contracts rejected with migration message
- [ ] Script templates have language dimension enforced
- [ ] Voice / language mismatch causes hard stop
- [ ] Model hash verified from `languages.json` — not from `ENVIRONMENT.md`
- [ ] TTS adapter resolves model path from registry — no hardcoding
- [ ] Resampling works correctly for all four language models
- [ ] `language` logged at top level and per-scene in `media_metadata.json`
- [ ] Model hash logged in `environment_snapshot.json`
- [ ] Determinism checklist updated — functionally deterministic, not bit-identical
- [ ] No SHA256 equality assertions in multilingual integration tests
- [ ] All unit tests pass
- [ ] Integration test passes for all four languages
- [ ] `npm run build`, `npm test`, `npm run lint` all pass
- [ ] `ENVIRONMENT.md` updated with all four model download instructions

---

## 17. Issue Resolution Status

| Issue | Status |
|---|---|
| `resampleRequired` field redundant | Closed — removed, adapter uses runtime detection |
| Schema migration cliff for external consumers | Closed — future sprint note added to section 6 |
| Per-scene `language` missing from metadata | Closed — added to scenes array spec |
| Model hash in `ENVIRONMENT.md` not machine-readable | Closed — `modelHash` in `languages.json`, validator uses it directly |
| Integration fixture content underspecified | Closed — minimum fixture spec defined |
| Determinism checklist overstated | Closed — functionally deterministic, not bit-identical |
| SHA256 equality assertions in integration tests | Closed — removed, correctness assertions only |

No remaining open items.

---

## 18. Future Sprint Notes (Post Sprint 8)

**AI4Bharat adapter** — When hardware improves, evaluate AI4Bharat models for Hindi, Telugu, and Tamil. Slot in as a new `ITTSAdapter` implementation. Registry gains `"adapter": "ai4bharat"` as a valid value. No pipeline changes required.

**Kokoro adapter** — For English, Kokoro produces higher quality output than Piper. Same adapter interface pattern.

**`determinism.lock`** — When models and binaries stabilise, commit expected hashes to a lock file so CI can verify the full environment without manual hash management.

**Mixed-language contracts** — A contract where Scene 1 is English and Scene 2 is Hindi. The architecture supports this today via per-scene language lookup. It needs a test and a schema note explicitly permitting it.

**Contract migration tool** — Before AnukramAI contracts are shared externally with Bhairav or OpenClaw, build a migration tool that upgrades contracts across schema versions. Each sprint currently invalidates prior contracts with no automated path forward.

**Voice quality evaluation** — A lightweight offline tool to compare TTS output quality across models per language. Useful when evaluating AI4Bharat vs Piper for Indian languages.

**Bit-identical narration** — Re-evaluate Piper determinism when moving to Apple Silicon or GPU hardware. If bit-identical output becomes achievable, SHA256 stability assertions can be reinstated in integration tests.
