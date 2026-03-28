# Error Reference

Every hard-stop condition, what you see, and what to do.

---

## 1. How Errors Surface

- **Exit code:** On failure, VISU exits with code **1** (pipeline failure) or **2** (configuration or input error).
- **Logs:** VISU writes structured NDJSON to a log file (e.g. `logs/visu-{runId}.log`). Each line is a JSON object with `runId`, `timestamp`, `step`, and optional `level`, `message`, `payload`.
- **Metadata:** When the pipeline can write metadata on failure, `media_metadata.json` may be written with `status: "failed"`.
- **Artifacts:** Artifacts for the run are retained for debugging where possible.

---

## 2. Error Catalogue

Errors are identified by cause and typical log messages. Use this table to map what you see to a resolution.

| Error | Code | Cause | Resolution |
|-------|------|-------|-------------|
| `FFMPEG_NOT_FOUND` | 2 | FFmpeg not installed or not on PATH. | Install FFmpeg and ensure it is on PATH. |
| `FFMPEG_VERSION_LOW` | 2 | FFmpeg version below minimum (6.0). | Upgrade FFmpeg to ≥ 6.0. |
| `CONTRACT_SCHEMA_INVALID` | 2 | Contract fails schema validation. | Fix contract to match scene_schema_v1.3.json or run `visu migrate-contract`. |
| `CONTRACT_SCHEMA_OUTDATED` | 2 | Contract schema version is outdated (e.g. 1.2). | Run `visu migrate-contract --input <path> --output <path>`. |
| `LANGUAGE_NOT_SUPPORTED` | 2 | Language code not in registry. | Use a supported language code (`en`, `hi`, `te`, `ta` or as in config/languages.json). |
| `GENDER_NOT_AVAILABLE` | 2 | Gender not registered for that language. | Check available genders in Contract Authoring Guide; use a voice_gender that exists for the language. |
| `MODEL_FILE_MISSING` | 2 | Piper model file not found. | Install the model file per VISU models documentation (e.g. MODELS.md). |
| `MODEL_HASH_MISMATCH` | 2 | Model file hash does not match registry. | Re-download or fix the model file to match the hash in the language registry. |
| `VISUAL_ASSET_MISSING` | 2 | PNG asset not found at declared path. | Place the PNG at the path declared in the contract (or fix `asset_path`). |
| `PROVENANCE_MISSING` | 2 | Provenance sidecar not found (e.g. `.provenance.json`). | Generate the provenance sidecar for the PNG. |
| `PROVENANCE_HASH_MISMATCH` | 2 | PNG hash does not match sidecar `output_hash`. | Regenerate the PNG or the sidecar so they match. |
| `PNG_RESOLUTION_MISMATCH` | 2 | PNG dimensions are not 1920×1080. | Resize the PNG to 1920×1080. |
| `PROMPT_KEY_NOT_FOUND` | 2 | Prompt key not in prompt library. | Add the key to `prompts/prompt_library.json`. |
| `PROMPT_NOT_APPROVED` | 2 | Prompt key not approved. | Set `approved: true` for that key in the prompt library. |
| `TEMPLATE_KEY_NOT_FOUND` | 2 | Template key not in script templates. | Add the key to `{contentRoot}/{topic}/scripts/script_templates.json` or the repo `scripts/script_templates.json`. |
| `TEMPLATE_LANGUAGE_MISMATCH` | 2 | Template language ≠ scene narration language. | Use a template whose `language` matches the scene’s `narration.language`. |
| `DRIFT_VIOLATION` | 1 | Narration duration outside 200 ms drift limit. | Adjust `duration_sec` or narration speed in the contract. |
| `NARRATION_OVERFLOW` | 1 | Narration longer than scene `duration_sec`. | Increase `duration_sec` or reduce narration (e.g. template text or speed). |
| `INPUT_VIDEO_INVALID` | 2 | Mode B input not valid MP4 (e.g. no video stream, zero duration). | Ensure input is MP4 with a valid video stream and non-zero duration. |
| `NARRATION_EXCEEDS_VIDEO` | 2 | Mode B: narration duration longer than video duration. | Shorten narration (e.g. script text or speed) or use a longer video. |
| Music LUFS out of range | 1 | Mode B: background music WAV outside -17 to -15 LUFS. | Normalize the file with `tools/normalize-music-lufs.sh` or use a track already in range. |
| `AV_MERGE_FAILED` | 1 | FFmpeg merge process failed. | Check FFmpeg and log output in the run artifacts. |
| `METADATA_INVALID` | 1 | Output metadata failed schema validation. | Internal error — report to VISU owner. |
| `YOUTUBE_CREDENTIAL_MISSING` | 2 | Required env variables not set. | Set `VISU_YOUTUBE_CLIENT_ID`, `VISU_YOUTUBE_CLIENT_SECRET`, `VISU_YOUTUBE_REFRESH_TOKEN`. |
| `YOUTUBE_QUOTA_EXCEEDED` | 1 | Daily upload quota exhausted. | Wait or request quota increase. |
| `YOUTUBE_UPLOAD_FAILED` | 1 | Upload failed (e.g. 5xx). | Retry — often transient. |
| `REMOTION_NOT_FOUND` | 2 | `npx remotion` not available in PATH or install failed. | Run `npm install` in `remotion-templates` and ensure `npx remotion` works. |
| `REMOTION_TEMPLATES_NOT_FOUND` | 2 | `remotion-templates` directory (templatesRoot) not found. | Check `remotion.templatesRoot` in `config/shared.json` (after merge with the active mode file) and ensure the directory exists. |
| `REMOTION_PROPS_INVALID` | 2 | Remotion props failed validation against `remotion_props_schema_v1.json`. | Fix the props payload to satisfy the schema for the composition. |
| `REMOTION_RENDER_FAILED` | 1 | Remotion render process exited with non-zero code. | Inspect Remotion logs in the run log and fix the underlying error. |
| `REMOTION_OUTPUT_MISSING` | 1 | Remotion reported success but output MP4 was not written. | Check disk space, permissions, and output path. |
| `REMOTION_OUTPUT_PROFILE_MISMATCH` | 1 | ffprobe of the Remotion output does not match the locked VISU encoding profile. | Check `remotion.config.ts` and ensure codec, resolution, fps, pix_fmt, and colour settings match VISU. |
| `REMOTION_CHROMIUM_DRIFT` | 1 | Chromium binary hash differs from CHROMIUM_BINARY.lock. | Re-run `node scripts/record_chromium_hash.js` from repo root and commit `remotion-templates/CHROMIUM_BINARY.lock`. |
| `REMOTION_CHROMIUM_LOCK_MISSING` | 2 | CHROMIUM_BINARY.lock not found under remotion-templates. | Run `node scripts/record_chromium_hash.js` after `npm install` in remotion-templates and commit the file. |
| `REMOTION_LOGO_NOT_FOUND` | 2 | logoPath file not in remotion-templates/public/. | Place the file under `remotion-templates/public/` or fix logoPath to a filename that exists there. |
| **Sprint 13 — Remotion integration** | | | |
| `REMOTION_DISABLED_IN_CONFIG` | 2 | Contract or wrap requests Remotion (intro/summary/overlay/wrap/remotion scene) but `config.remotion.enabled` is false. | Set `remotion.enabled: true` in `config/shared.json` (or the appropriate mode overlay) or do not request Remotion in the contract/wrap. No silent fallback. |
| `REMOTION_OVERLAY_FAILED` | 1 | Mode A: SceneTitleCard or ProgressOverlay render or overlay composite failed (profile mismatch, stream mismatch, or Remotion/FFmpeg error). | Check run log for scene index and stderr; ensure Remotion compositions and FFmpeg overlay use locked profile. |
| `SCREEN_CAPTURE_FAILED` | 1 | External FFmpeg-based screen capture failed to start or exited with non-zero code. | Inspect stderr excerpt in logs; verify avfoundation device indices, microphone/screen permissions, and ffmpeg availability. |
| `SCREEN_CAPTURE_ALREADY_RUNNING` | 1 | Attempted to start screen capture while a previous capture is still active. | Ensure per-scene capture lifecycle is start→stop without overlap; fix engine logic. |
| `SCREEN_CAPTURE_TIMEOUT` | 1 | FFmpeg did not exit within timeout after stop signal. | Check for hung ffmpeg processes; adjust timeout or investigate system load. |
| `REMOTION_PROPS_COMPONENT_MISMATCH` | 2 | Props shape does not match the declared component (e.g. SceneTitleCard props for wrong composition). | Fix props to match the component’s schema in `remotion_props_schema_v1.json`. |
| `REMOTION_SCENE_RENDER_FAILED` | 1 | Mode C: Remotion render failed for a `type: "remotion"` scene. | Check run log for scene index and Remotion stderr; fix props or composition. |
| `MODE_C_UNKNOWN_SCENE_TYPE` | 2 | Mode C: scene `visual.type` is neither `governed_image` nor `remotion`. | Use `type: "governed_image"` or `type: "remotion"` only; fix or migrate contract. |
| `MODE_C_STREAM_PROFILE_MISMATCH` | 1 | Mode C: clip stream (codec/size/pix_fmt/fps) differs from others before timeline concat. | Ensure governed_image clips and Remotion outputs use the same locked profile. |
| `REMOTION_WRAP_COMPONENT_NOT_ALLOWED` | 2 | Mode B wrap: intro/summary component is not IntroCard/SummaryCard, or Mode C remotion component is not SceneTitleCard. | Use only the allowed component enum for that mode. |
| `REMOTION_WRAP_PROFILE_MISMATCH` | 1 | Mode B: intro, merged, or summary clip stream differs before concat. | Normalization and Remotion outputs must match locked profile. |
| `REMOTION_WRAP_CONCAT_FAILED` | 1 | Mode B: FFmpeg concat demuxer failed when joining intro + merged + summary. | Check run log for FFmpeg stderr; ensure all clips have identical stream params. |
| `RECORDED_WRAP_VALIDATION_FAILED` | 2 | Mode B: `--wrap-contract` JSON failed schema validation (recorded_wrap_schema_v1.1). | Fix the wrap contract to match the schema (schemaVersion, wrap.intro/wrap.summary, component enum). |
| `RECORDED_WRAP_FAILED` | 1 | Mode B: internal error (e.g. merged video path missing after AV merge). | Internal error — report to VISU owner. |

*Note:* The log uses `step` and `message` (and optional `payload`); the canonical names in the table map to these. If the codebase uses different wording, the resolution still applies.

---

## 3. Reading the Structured Log

Each log line is a single JSON object (NDJSON). Example error entry:

```json
{
  "runId": "abc-123",
  "timestamp": "2025-02-22T12:00:00.000Z",
  "step": "cli_error",
  "level": "error",
  "message": "Mode C failed",
  "payload": {
    "error": "Narration duration (1250ms) exceeds video duration (1000ms) for scene s1"
  }
}
```

Use `step` and `message` (and `payload`) to correlate with the error catalogue and determine the right resolution.
