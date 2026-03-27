# SPRINT_7_EXECUTION_PLAN_v1.2_FINAL

**Status:** Locked  
**Focus:** Upload Productionization + Determinism Verification Hardening  
**Owner:** VISU Core Architecture  
**Prerequisites:** Sprints 1–6B Complete (all three modes operational)

**Implementation:** Completed. See CONTRIBUTING.md, DETERMINISM_CHECKLIST.md, ENVIRONMENT.md, and CLI commands `visu audit`, `visu replay`, `visu upload`.

---

## 1. Objective

Elevate VISU from:
> "Deterministic by design"

To:
> "Deterministic and provably verifiable"

Sprint 7 adds the audit, verification, and upload layer across all three modes. No new rendering logic. No new adapters. Hardening only.

---

## 2. Binary Fingerprinting

### 2.1 FFmpeg Fingerprint

During every run:

1. Capture `ffmpeg -version` output
2. Capture `ffmpeg -buildconf` output
3. Concatenate both outputs
4. Compute: `ffmpegBinaryFingerprint = SHA256(concatenated_output)`

**Stored in `media_metadata.json`:**

```json
{
  "ffmpegBinaryFingerprint": "sha256-string"
}
```

**Full verbose environment stored in:**

```
artifacts/{runId}/environment_snapshot.json
```

This keeps `media_metadata.json` clean and audit comparison precise. No brittle string diff.

### 2.2 Piper Fingerprint

**Primary (authoritative):**

```
piperBinaryFingerprint = SHA256(path_to_piper_binary)
```

**Secondary (best-effort):**

- Attempt `piper --version`
- Exit code 0 → store version string in `environment_snapshot.json`
- Exit non-zero → log `"piperVersion": "unavailable"`

Audit never fails solely due to missing version string. Binary hash is authoritative.

### 2.3 Node Version

- `process.version` captured at run start
- Stored in `environment_snapshot.json`
- Verified against `.nvmrc` in audit

---

## 3. Environment Snapshot

**Location:** `artifacts/{runId}/environment_snapshot.json`  
**Schema:** `schemas/environment_snapshot_schema_v1.json`

```json
{
  "ffmpegVersionFull": "string",
  "ffmpegBuildConf": "string",
  "ffmpegBinaryFingerprint": "string",
  "nodeVersion": "string",
  "piperVersion": "string | unavailable",
  "piperBinaryFingerprint": "string",
  "piperModelHash": "string",
  "configHash": "string",
  "capturedAt": "ISO8601"
}
```

`additionalProperties: false`. All fields required except `piperVersion` (nullable).

**Schema file:** `schemas/environment_snapshot_schema_v1.json`  
Written and validated on every run. Retained alongside other artifacts.

---

## 4. Strict Determinism Mode

### 4.1 Scope

Strict mode is **CI and controlled environment enforcement only**. It is not expected to pass on developer machines with different package managers or OS configurations.

### 4.2 CLI

```
visu --mode recorded|generative ... --strict-determinism
```

**Hard fails if any of:**
- FFmpeg binary fingerprint mismatch
- Piper binary fingerprint mismatch
- Node version mismatch
- Config hash mismatch
- Encoding profile mismatch

### 4.3 Escape Hatch

```
visu --mode recorded ... --strict-determinism --expected-ffmpeg-fingerprint <hash>
```

If `--expected-ffmpeg-fingerprint` is provided, the audit compares against the supplied value rather than a stored run value. Enables controlled CI pipelines and reproducibility verification.

**Documented limitation:** Hardcoding hashes in shell scripts is fragile — hashes must be manually updated when FFmpeg is upgraded. A `determinism.lock` file (committed to the repository, containing expected fingerprints) is the recommended future evolution. Tracked as a Sprint 7+ improvement.

---

## 5. Audit CLI

### 5.1 Invocation

```
visu audit --runId <id>
```

### 5.2 Verification Checks

| Check | Source |
|---|---|
| FFmpeg binary fingerprint | `environment_snapshot.json` vs current |
| Piper binary fingerprint | `environment_snapshot.json` vs current |
| Node version | `environment_snapshot.json` vs `.nvmrc` |
| Config hash | `environment_snapshot.json` vs current config |
| Encoding profile | `media_metadata.json` vs locked profile |
| Final video SHA256 | `media_metadata.json` vs actual `final.mp4` |
| PNG provenance hashes (Mode C) | `media_metadata.json` scenes array vs actual assets |

### 5.3 Determinism Level

Derived from `media_metadata.mode` per run:

| Mode | Determinism Level |
|---|---|
| `ui_flow` | `environment-sensitive` |
| `recorded` | `binary-sensitive` |
| `generative` | `binary-sensitive` |

Never reported as a global system property. Always per-run.

### 5.4 Audit Output Schema

See `schemas/audit_output_schema_v1.json`. Output includes `runId`, `mode`, `determinismLevel`, `status` (PASS/FAIL), `checked` (booleans), `mismatches` (field, severity, expected, actual).

### 5.5 Exit Code Contract

| Condition | Exit Code |
|---|---|
| PASS | 0 |
| FAIL (determinism mismatch) | 1 |
| Execution error (invalid runId, malformed metadata, missing files) | 2 |

Shell-pipeline safe. CI-compatible.

---

## 6. Replay CLI

```
visu replay --runId <id>
```

**Verifies:**
- All artifacts exist
- `final.mp4` SHA256 matches `media_metadata.outputSha256`
- Binary fingerprints from `environment_snapshot.json` reported
- Drift between current environment and stored environment reported
- Outputs replay report alongside audit output

---

## 7. Upload Hardening

### 7.1 YouTube Upload

- Automated upload via YouTube Data API v3 (structure in place; add `googleapis` and OAuth for full implementation)
- OAuth credentials loaded from environment variables (never in repo)
- Validated at boot — fail immediately if credentials absent

### 7.2 Quota Governance

- Daily upload limit guard (10,000 units/day default)
- Quota tracker logged per run
- 403 error classified as quota exhaustion — no retry
- 5xx errors → retry with exponential backoff
- Retry only for transient failures

### 7.3 Upload Metadata

Stored in `artifacts/{runId}/upload_metadata.json`. Schema: `schemas/upload_metadata_schema_v1.json`.

### 7.4 Credential Governance

- No credentials in repository
- ENV variable loading with validation at boot (VISU_YOUTUBE_CLIENT_ID, VISU_YOUTUBE_CLIENT_SECRET, VISU_YOUTUBE_REFRESH_TOKEN)
- Boot fails hard if required credentials absent

---

## 8. Artifact Retention

All intermediate artifacts retained by default. See VISU_TECHNICAL_SPEC.md artifact layout. Optional cleanup CLI tracked as Sprint 7+.

---

## 9. Determinism Checklist — Updated

Mode A guarantee corrected to **environment-sensitive**. Checklist governance in CONTRIBUTING.md.

---

## 10. New Files (Implemented)

- `src/cli/audit.ts`, `replay.ts`, `upload.ts`
- `src/engines/upload_engine.ts`
- `src/validators/environment_snapshot_validator.ts`
- `schemas/environment_snapshot_schema_v1.json`, `audit_output_schema_v1.json`, `upload_metadata_schema_v1.json`
- `docs/DETERMINISM_CHECKLIST.md` (updated), `CONTRIBUTING.md`, `ENVIRONMENT.md` (strict mode)

---

## 11–15. Testing, Documentation, Success Criteria

Unit tests added for audit (exit 2, options), environment snapshot validator. All existing tests pass. Build and lint pass. Documentation updated per plan.
