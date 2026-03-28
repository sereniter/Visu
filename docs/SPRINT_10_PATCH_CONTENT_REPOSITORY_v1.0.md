# SPRINT_10_PATCH_CONTENT_REPOSITORY_v1.0

**Status:** Implemented  
**Applies To:** VISU — Content Repository Integration  
**Owner:** VISU Core Architecture  
**Base:** Sprint 8 patch complete  
**Scope:** Config, path resolution, output copy, contract schema — no pipeline changes

---

## Summary

VISU is integrated with a shared content repository. All run modes read inputs from `contentRoot` and completed videos are written to `outputRoot/{topic}/{language}/`. Config adds `contentRoot` and `outputRoot`; contract schema v1.4 adds `topic` and `language` at top level; v1.3 is rejected with migration message. Path resolution and output copy with SHA256 verification are implemented.

---

## Files Changed

- **config/default.json** *(today: `config/shared.json`; see docs/consumer/CONFIG_REFERENCE.md)* — `contentRoot`, `outputRoot` added
- **schemas/config_schema_v1.json** — new; required contentRoot, outputRoot
- **schemas/scene_schema_v1.4.json** — new; topic, language required; topic pattern no path separators
- **src/core/config.ts** — contentRoot, outputRoot on Config; `setConfigForTest` for tests
- **src/core/path_resolver.ts** — new; `resolveContentPath`, `resolveOutputPath`
- **src/validators/config_validator.ts** — new; `validateContentRoot`, `validateOutputRoot`, `validateTopicDir`
- **src/validators/scene_schema.ts** — v1.4 validator; v1.3 rejected with migration message
- **src/cli/migrate_contract.ts** — v1.3 → v1.4 migration (topic empty, language from first scene)
- **src/engines/metadata_writer.ts** — `copyOutputToRepository` with SHA256 verification
- **src/engines/mode_c_engine.ts** — ModeCContractV14; governedRoot from contentRoot/topic (scripts, prompts, and assets under topic root)
- **src/engines/scene_render_engine.ts** — ModeCContractV14
- **src/index.ts** — startup validation; path resolution for recorded/generative; output copy after success
- **tests/** — path_resolver, config_validator, metadata_writer copy tests; scene_schema v1.4; migrate v1.3→v1.4; mode_c v1.4 fixtures
- **docs/consumer/** — CONTRACT_AUTHORING_GUIDE (Content Repository), ARTIFACT_REFERENCE (output location), CLI_REFERENCE (contentRoot, outputRoot, --topic)
