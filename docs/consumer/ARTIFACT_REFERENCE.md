# Artifact Reference

What VISU produces per run, where it lives, and what to read.

---

## 1. Artifact Layout

By default, artifacts for each run are written under `artifacts/{runId}/`. The base directory is configurable (see VISU configuration).

```
artifacts/{runId}/
  final.mp4                 ← publish-ready video
  media_metadata.json       ← run summary and integrity data
  environment_snapshot.json ← binary fingerprints and environment (for audit)
  upload_metadata.json      ← written after upload (YouTube video ID, etc.)
```

- **runId** is a UUID generated at the start of the run and printed or available in logs and metadata.

After a successful run, VISU copies `final.mp4` and `media_metadata.json` to:

```
{outputRoot}/{topic}/{language}/
```

The run artifacts remain in `artifacts/{runId}/` as always.

---

## 2. media_metadata.json — Field Reference

Read this file to confirm success and get paths and integrity data. All fields Bhairav should care about are listed below.

### Common fields (all modes)

| Field | Type | Description |
|-------|------|-------------|
| `runId` | string | Unique run identifier. |
| `mode` | string | `ui_flow` \| `ui_flow_scenes` \| `recorded` \| `generative`. |
| `status` | string | `completed` \| `failed` (when metadata is written on failure). |
| `encodingProfileVersion` | string | Encoding profile version used. |
| `ffmpegVersion` | string | FFmpeg version used. |
| `ffmpegBinaryFingerprint` | string | SHA256 of FFmpeg version + buildconf (for determinism audit). |
| `durationMs` | number | Final video duration in ms. |
| `outputPath` | string | Path to `final.mp4`. |
| `outputSha256` | string | SHA256 of `final.mp4`. |
| `generatedAt` | string | ISO8601 timestamp. |

### Mode C and/or multi-scene

| Field | Type | Description |
|-------|------|-------------|
| `language` | string | Primary language code (ISO 639-1). |
| `voiceGender` | string | `male` \| `female` (primary). |
| `sceneCount` | number | Number of scenes (Mode C). |
| `maxDriftMs` | number | Maximum AV drift across scenes. |
| `avgDriftMs` | number | Average AV drift across scenes. |
| `scenes` | array | Per-scene summary (see below). |

### Mode B — background music

When Mode B uses background music (script `music` or config **execution.defaultBackgroundMusicPath**), the following are set in `media_metadata.json`:

| Field | Type | Description |
|-------|------|-------------|
| `musicPath` | string \| null | Path to the WAV used for background music, or null if no music. |
| `musicLufs` | number \| null | Measured LUFS of the source music (-15 to -17 required), or null. |

The mix runs for the full video (music continues after narration ends). See Contract Authoring Guide and Schema Reference.

Other fields (e.g. `sourceVideoPath`, `narrationPath`, `crf`, `audioSampleRate`, `piperModelPath`, `piperModelHash`, `voiceId`) may be present for compatibility or auditing; the tables above cover what is needed for integration.

### Mode A (`ui_flow_scenes`) — intermediate artifacts

These files typically live under `artifacts/{runId}/` beside `final.mp4`:

| File | When | Notes |
|------|------|--------|
| `stitched_video.mp4` | Always (timeline step) | Hard-cut concat of intro + scenes + summary clips. |
| `{index}_{scene_id}_timeline_norm.mp4` | When a timeline segment had no audio stream | Muxed silent AAC for concat compatibility; final segment uses the probed `video_path` only. |
| `title_card_pad.wav` | When `useRemotionOverlays` is on (resolved) | Silence matching the Remotion title-card length; prepended in `narration_concat.wav` before each step’s speech (with optional `transition.wav` before the pad). |
| `narration_concat.wav` | Always | Full narration mix for AV merge; with Remotion overlays on, may include synthetic silence segments as above — do not assume speech-only. |

### Per-scene fields (inside `scenes[]`)

| Field | Type | Description |
|-------|------|-------------|
| `scene_id` | string | Scene identifier from the contract. |
| `language` | string | Scene language. |
| `voiceGender` | string | Scene voice gender. |
| `driftMs` | number | AV drift for this scene. |
| `narrationDurationMs` | number | Narration WAV duration in ms. |

Additional fields such as `promptKey`, `seed`, `modelVersion`, `assetHash` may appear for auditing.

---

## 3. How to Confirm a Successful Run

A run is successful when:

1. **Exit code** of `visu run` is **0**.
2. **`media_metadata.status`** is **`"completed"`**.
3. **File exists** at `media_metadata.outputPath` (typically `artifacts/{runId}/final.mp4`).
4. **(Optional)** `media_metadata.outputSha256` matches the SHA256 of the file at `outputPath`.

If the exit code is 0 but you need to double-check, read `media_metadata.json` and verify `status === "completed"` and that `final.mp4` exists.

---

## 4. upload_metadata.json — Field Reference

Written after a successful `visu upload` (or by the upload path) in the same run directory.

| Field | Type | Description |
|-------|------|-------------|
| `youtubeVideoId` | string | YouTube video ID. |
| `uploadedAt` | string | ISO8601 upload timestamp. |
| `title` | string | Video title used. |
| `visibility` | string | `public` \| `unlisted` \| `private`. |

---

## 5. How OpenClaw Should Poll for Completion

VISU is a **synchronous CLI**: it does not expose a polling API. OpenClaw should:

1. Spawn VISU as a subprocess (e.g. `visu run --mode …`).
2. Wait for the process to exit.
3. If exit code is **0**, read `artifacts/{runId}/media_metadata.json` and confirm `status === "completed"` and that `final.mp4` exists at `outputPath`.

Exit code 0 means the run completed; the `status` field confirms whether the pipeline succeeded or reported failure while still writing metadata.
