# SPRINT_8_PATCH_v1.0 — Male/Female Voice Selection

**Status:** Locked  
**Applies To:** VISU — Sprint 8 Patch (Voice Gender Extension)  
**Owner:** VISU Core Architecture  
**Base:** SPRINT_8_EXECUTION_PLAN_v1.1_FINAL  
**Scope:** Language registry, scene schema, voice resolution — no pipeline changes

---

## 1. Objective

Add male/female voice selection to the multilingual TTS layer. Voice is resolved from language + gender via the registry. No hardcoded voice IDs in contracts.

---

## 2. Pre-Implementation Check — Gender Availability

Before writing any code, verify which genders exist for each language on the Piper releases page:

```
https://github.com/rhasspy/piper/releases
```

**Policy for languages with only one gender available:**
- Register only the available gender
- Hard fail if the unavailable gender is requested
- Do NOT silently fall back to the available gender — silent fallback hides contract errors

Document available genders per language in `models/piper/MODELS.md`.

---

## 3. Language Registry Update

**File:** `config/languages.json`

Replace the flat `voice`, `modelPath`, `modelConfig`, `modelHash` fields per language with a `voices` object keyed by gender:

```json
{
  "version": "1.1",
  "supported": {
    "en": {
      "name": "English",
      "adapter": "local_piper",
      "sampleRate": 48000,
      "nativeModelRate": 22050,
      "voices": {
        "female": {
          "voice": "en_US-lessac-high",
          "modelPath": "models/piper/en_US-lessac-high.onnx",
          "modelConfig": "models/piper/en_US-lessac-high.onnx.json",
          "modelHash": "sha256-of-model-file"
        },
        "male": {
          "voice": "en_US-ryan-high",
          "modelPath": "models/piper/en_US-ryan-high.onnx",
          "modelConfig": "models/piper/en_US-ryan-high.onnx.json",
          "modelHash": "sha256-of-model-file"
        }
      }
    },
    "hi": {
      "name": "Hindi",
      "adapter": "local_piper",
      "sampleRate": 48000,
      "nativeModelRate": 22050,
      "voices": {
        "female": {
          "voice": "hi_IN-female-...",
          "modelPath": "models/piper/hi_IN-female-....onnx",
          "modelConfig": "models/piper/hi_IN-female-....onnx.json",
          "modelHash": "sha256-of-model-file"
        },
        "male": {
          "voice": "hi_IN-male-...",
          "modelPath": "models/piper/hi_IN-male-....onnx",
          "modelConfig": "models/piper/hi_IN-male-....onnx.json",
          "modelHash": "sha256-of-model-file"
        }
      }
    },
    "te": {
      "name": "Telugu",
      "adapter": "local_piper",
      "sampleRate": 48000,
      "nativeModelRate": 22050,
      "voices": {
        "female": {
          "voice": "te_IN-female-...",
          "modelPath": "models/piper/te_IN-female-....onnx",
          "modelConfig": "models/piper/te_IN-female-....onnx.json",
          "modelHash": "sha256-of-model-file"
        }
      }
    },
    "ta": {
      "name": "Tamil",
      "adapter": "local_piper",
      "sampleRate": 48000,
      "nativeModelRate": 22050,
      "voices": {
        "female": {
          "voice": "ta_IN-female-...",
          "modelPath": "models/piper/ta_IN-female-....onnx",
          "modelConfig": "models/piper/ta_IN-female-....onnx.json",
          "modelHash": "sha256-of-model-file"
        }
      }
    }
  }
}
```

> Telugu and Tamil entries above show female-only as a placeholder. Update after confirming available genders from Piper releases.

**Schema update:** `schemas/language_registry_schema_v1.json` → `v1.1`  
- `voices` object replaces flat voice fields  
- Each gender entry: `voice`, `modelPath`, `modelConfig`, `modelHash` all required  
- `additionalProperties: false` at both registry and voice entry level

---

## 4. Scene Schema Update (v1.3)

**File:** `schemas/scene_schema_v1.3.json`

Replace `narration.voice` with `narration.voice_gender`:

```json
{
  "narration": {
    "text_template_key": "intro_invoice_creation_te",
    "language": "te",
    "voice_gender": "female",
    "speed": 1.0
  }
}
```

**Rules:**
- `voice_gender` required — must be `"male"` or `"female"`
- `voice` field removed from contract — resolved internally from language + gender
- Requested gender must exist in `voices` object for the declared language
- Missing gender for language → hard stop with message: "Gender 'male' is not registered for language 'te'. Available: female"

**Migration policy:**
- `schema_version: "1.2"` contracts rejected after this patch
- Error message: "Contract schema v1.2 is not supported. Migrate to v1.3."
- No auto-migration

---

## 5. Voice Resolution

**File:** `src/core/language_config.ts`

Replace `getLanguageConfig(language)` with:

```typescript
export function getVoiceConfig(
  language: string,
  gender: "male" | "female"
): VoiceConfig

// Returns:
// {
//   voice: string
//   modelPath: string
//   modelConfig: string
//   modelHash: string
//   sampleRate: number
//   nativeModelRate: number
//   adapter: string
// }
```

Hard fails with structured error if:
- Language not in registry
- Gender not registered for that language

`getLanguageConfig(language)` retained for cases where gender is not relevant (registry-level checks).

---

## 6. Language Validation Gate Update

Step 2 of the validation gate updated:

```
2. narration.voice_gender exists in voices for narration.language
   → if not: hard stop with available genders listed in error
```

Replaces the previous voice ID match check. Voice ID is now internal — never in contracts.

---

## 7. Scene Render Update

**File:** `src/engines/scene_render_engine.ts`

Adapter instantiation updated:

```typescript
const voiceConfig = getVoiceConfig(
  scene.narration.language,
  scene.narration.voice_gender
);
const adapter = new LocalPiperAdapter(
  voiceConfig.modelPath,
  voiceConfig.modelConfig
);
```

No other render logic changes.

---

## 8. Metadata Update

Add `voiceGender` to top-level and per-scene metadata:

```json
{
  "language": "te",
  "voiceGender": "female",
  "voiceId": "te_IN-female-...",
  "piperModelPath": "models/piper/te_IN-female-....onnx",
  "piperModelHash": "sha256"
}
```

Per-scene in scenes array:

```json
{
  "scene_id": "s1",
  "language": "te",
  "voiceGender": "female",
  "driftMs": 12
}
```

---

## 9. Model File Governance Update

Each gender requires its own model files:

```
models/piper/
  en_US-lessac-high.onnx          ← en female
  en_US-lessac-high.onnx.json
  en_US-ryan-high.onnx            ← en male
  en_US-ryan-high.onnx.json
  hi_IN-female-....onnx
  hi_IN-female-....onnx.json
  hi_IN-male-....onnx
  hi_IN-male-....onnx.json
  te_IN-female-....onnx
  te_IN-female-....onnx.json
  ta_IN-female-....onnx
  ta_IN-female-....onnx.json
```

Update `models/piper/MODELS.md` with download instructions per language per gender. Update `modelHash` in `config/languages.json` after placing each file.

---

## 10. Testing Requirements

### Unit Tests (additions to existing suite)

| Test | Validates |
|---|---|
| `getVoiceConfig` — valid language + gender | Returns correct config |
| `getVoiceConfig` — unknown language | Hard stop |
| `getVoiceConfig` — gender not registered | Hard stop with available genders in message |
| Schema v1.3 — `voice_gender` missing | Fails |
| Schema v1.3 — invalid gender value | Fails |
| Schema v1.3 — `voice` field present | Fails (`additionalProperties: false`) |
| Schema v1.2 contract rejected | Hard fail with migration message |
| Language validation gate — gender unavailable | Hard stop with helpful message |
| Metadata — `voiceGender` present top-level | Correct value |
| Metadata — `voiceGender` present per-scene | Correct value |

### Integration Tests

Update existing multilingual fixtures to `schema_version: "1.3"` with `voice_gender` field. No SHA256 equality assertions. Same correctness assertions as Sprint 8 plus:
- `media_metadata.voiceGender` matches contract
- `media_metadata.scenes[0].voiceGender` matches contract

---

## 11. Files Changed

```
config/
  languages.json                         ← voices object per language

schemas/
  language_registry_schema_v1.1.json     ← updated for voices structure
  scene_schema_v1.3.json                 ← voice_gender replaces voice

src/
  core/
    language_config.ts                   ← getVoiceConfig() added
  validators/
    language_registry_validator.ts       ← gender availability check
  engines/
    scene_render_engine.ts               ← getVoiceConfig() call

models/
  piper/
    MODELS.md                            ← per-language per-gender download instructions

tests/
  language_registry_validator.test.ts    ← gender tests added
  language_schema.test.ts               ← v1.3 tests, v1.2 rejection
  multilingual_narration.test.ts         ← fixtures updated to v1.3
  fixtures/multilingual/
    contract_en.json                     ← updated to v1.3
    contract_hi.json
    contract_te.json
    contract_ta.json
```

---

## 12. Success Criteria

Patch is complete when:

- [ ] Gender availability confirmed per language from Piper releases
- [ ] `config/languages.json` uses `voices` object per language
- [ ] Language registry schema updated to v1.1
- [ ] Scene schema v1.3 uses `voice_gender`, removes `voice`
- [ ] Schema v1.2 contracts rejected with migration message
- [ ] `getVoiceConfig(language, gender)` resolves correctly
- [ ] Unavailable gender produces hard stop with helpful error message
- [ ] Scene render uses `getVoiceConfig` — no hardcoded voice IDs
- [ ] `voiceGender` in metadata top-level and per-scene
- [ ] `models/piper/MODELS.md` documents all gender variants
- [ ] All unit tests pass
- [ ] Integration tests pass with v1.3 fixtures
- [ ] `npm run build`, `npm test`, `npm run lint` all pass

---

## 13. Contract Migration Tool

**Location:** `src/cli/migrate_contract.ts`

### Purpose

VISU owns the schema. VISU provides the migration path. Bhairav and OpenClaw should never need to understand VISU's internal schema history to produce valid contracts.

### CLI

```
visu migrate-contract --input contract_v1.2.json --output contract_v1.3.json
```

Reads the old contract, applies the transformation rules for that version transition, writes a valid new contract. Exits with code 0 on success, code 1 on failure.

### Supported Transitions (at patch completion)

| From | To | Transformation |
|---|---|---|
| `1.0` → `1.1` | Adds `narration.language: "te"` (default, must be reviewed) |
| `1.1` → `1.2` | Adds `narration.language` from existing `narration.voice` prefix |
| `1.2` → `1.3` | Replaces `narration.voice` with `narration.voice_gender` resolved from registry |

### Transformation Rules — v1.2 → v1.3

```typescript
// For each scene:
// 1. Look up narration.voice in language registry
// 2. Resolve gender from voice ID
// 3. Replace narration.voice with narration.voice_gender
// 4. Update schema_version to "1.3"
```

If `narration.voice` cannot be resolved to a gender from the registry — warn and set `voice_gender: "female"` as default, flag scene for manual review in output.

### Chained Migration

```
visu migrate-contract --input contract_v1.0.json --output contract_v1.3.json
```

Tool applies all intermediate transitions in sequence. Consumer does not need to know intermediate versions.

### Output Format

On success:
```json
{
  "status": "ok",
  "fromVersion": "1.2",
  "toVersion": "1.3",
  "scenesModified": 3,
  "warnings": []
}
```

On partial success (manual review needed):
```json
{
  "status": "warning",
  "fromVersion": "1.2",
  "toVersion": "1.3",
  "scenesModified": 3,
  "warnings": [
    "scene s2: voice_gender defaulted to female — review manually"
  ]
}
```

### Testing

| Test | Validates |
|---|---|
| v1.2 → v1.3 clean transition | Output valid against v1.3 schema |
| v1.0 → v1.3 chained transition | Output valid against v1.3 schema |
| Unresolvable voice → warning + default | Status "warning", scene flagged |
| Invalid input file | Exit code 1, structured error |
| Output file already exists | Fail with message — no silent overwrite |

---

## 14. Files Changed (Updated)

```
config/
  languages.json                         ← voices object per language

schemas/
  language_registry_schema_v1.1.json     ← updated for voices structure
  scene_schema_v1.3.json                 ← voice_gender replaces voice

src/
  cli/
    migrate_contract.ts                  ← NEW: contract migration tool
  core/
    language_config.ts                   ← getVoiceConfig() added
  validators/
    language_registry_validator.ts       ← gender availability check
  engines/
    scene_render_engine.ts               ← getVoiceConfig() call

models/
  piper/
    MODELS.md                            ← per-language per-gender download instructions

tests/
  migrate_contract.test.ts               ← NEW: migration tool tests
  language_registry_validator.test.ts    ← gender tests added
  language_schema.test.ts               ← v1.3 tests, v1.2 rejection
  multilingual_narration.test.ts         ← fixtures updated to v1.3
  fixtures/multilingual/
    contract_en.json                     ← updated to v1.3
    contract_hi.json
    contract_te.json
    contract_ta.json
  fixtures/migration/
    contract_v1.0_input.json             ← migration test fixture
    contract_v1.2_input.json             ← migration test fixture
    contract_v1.3_expected.json          ← expected output fixture
```

---

## 15. Success Criteria (Updated)

Patch is complete when:

- [ ] Gender availability confirmed per language from Piper releases
- [ ] `config/languages.json` uses `voices` object per language
- [ ] Language registry schema updated to v1.1
- [ ] Scene schema v1.3 uses `voice_gender`, removes `voice`
- [ ] Schema v1.2 contracts rejected with migration message
- [ ] `getVoiceConfig(language, gender)` resolves correctly
- [ ] Unavailable gender produces hard stop with helpful error message
- [ ] Scene render uses `getVoiceConfig` — no hardcoded voice IDs
- [ ] `voiceGender` in metadata top-level and per-scene
- [ ] `models/piper/MODELS.md` documents all gender variants
- [ ] `visu migrate-contract` handles v1.0 → v1.3 and v1.2 → v1.3
- [ ] Chained migration works in single command
- [ ] Unresolvable voice produces warning, not hard stop
- [ ] Migration tool tests pass
- [ ] All existing unit tests pass
- [ ] Integration tests pass with v1.3 fixtures
- [ ] `npm run build`, `npm test`, `npm run lint` all pass
