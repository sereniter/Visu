/**
 * AV merge engine (Sprint 4). Orchestrates full operation sequence Steps 0–10.
 * Produces final.mp4 and media_metadata.json. Depends only on FFmpegAdapter interface.
 */

import { existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { RunContext } from "../core/run_context.js";
import { getEncodingProfile } from "../core/config.js";
import { getWavDurationMs } from "../core/wav_utils.js";
import type { FFmpegAdapterInterface } from "../adapters/ffmpeg_adapter.js";
import { parseFfmpegVersion } from "../adapters/ffmpeg_adapter.js";
import { validateAvDrift } from "../validators/av_drift_validator.js";
import { validateMusicLufs } from "../validators/music_lufs_validator.js";
import { writeMediaMetadata, writeEnvironmentSnapshot } from "./metadata_writer.js";
import type { MediaMetadataSceneSummary } from "../validators/media_metadata_schema.js";
import type { EnvironmentSnapshotPayload } from "../validators/environment_snapshot_validator.js";

/** Callers must pass explicitly: Mode A → "ui_flow", Mode B → "recorded", Mode C (future) → "generative". */
export type AvMergeMetadataMode = "ui_flow" | "recorded" | "generative";

export interface AvMergeParams {
  rawVideoPath: string;
  narrationPath: string;
  musicPath: string | null;
  outputDir: string;
  context: RunContext;
  logger: { log: (step: string, options?: { payload?: object }) => void };
  adapter: FFmpegAdapterInterface;
  /** Written to media_metadata.json. Default "ui_flow" when omitted. Maturity: when Mode C is added, consider making mode required to avoid implicit defaults. */
  mode?: AvMergeMetadataMode;
  /** Optional source resolution for metadata (e.g. Mode B) — debugging. */
  sourceWidth?: number;
  sourceHeight?: number;
  /** Mode C: scene count and drift stats for media_metadata.json. */
  sceneCount?: number;
  maxDriftMs?: number;
  avgDriftMs?: number;
  /** Sprint 8: primary language, voiceGender, voiceId, piper model path and hash for media_metadata.json. */
  language?: string;
  voiceGender?: "male" | "female";
  voiceId?: string;
  piperModelPath?: string;
  piperModelHash?: string;
  /** Mode C: summary-only scene array for media_metadata.json. */
  scenes?: MediaMetadataSceneSummary[];
  /** Sprint 7: when provided, write environment_snapshot.json to outputDir. */
  envSnapshot?: EnvironmentSnapshotPayload;
}

/**
 * Run full AV merge: FFmpeg check → input validation → LUFS (if music) → duration → drift →
 * transcode → output validation → SHA256 → metadata write. Updates context.artifacts and context.environment.
 */
export async function runAvMerge(params: AvMergeParams): Promise<RunContext> {
  const { rawVideoPath, narrationPath, musicPath, outputDir, context, logger, adapter } = params;

  // Step 0 — FFmpeg presence, version (≥6) & fingerprint (Sprint 7)
  const ffmpegInfo = await adapter.getVersionBuildconfAndFingerprint();
  const ffmpegVersion = parseFfmpegVersion(ffmpegInfo.versionFull);
  const major = parseInt(ffmpegVersion.split(".")[0] ?? "0", 10);
  if (major < 6) {
    throw new Error(`FFmpeg version ${ffmpegVersion} is below minimum 6.0`);
  }
  logger.log("av_merge_ffmpeg_version", { payload: { ffmpegVersion } });
  const updatedContext: RunContext = {
    ...context,
    environment: { ...context.environment, ffmpegVersion },
  };

  // Step 1 — Input existence
  if (!existsSync(rawVideoPath)) {
    throw new Error(`rawVideoPath does not exist: ${rawVideoPath}`);
  }
  if (!existsSync(narrationPath)) {
    throw new Error(`narrationPath does not exist: ${narrationPath}`);
  }
  if (musicPath !== null && !existsSync(musicPath)) {
    throw new Error(`musicPath does not exist: ${musicPath}`);
  }

  // Step 2 — Music LUFS (conditional)
  let musicLufs: number | null = null;
  if (musicPath !== null) {
    const lufsResult = await validateMusicLufs(adapter.getFfmpegPath(), musicPath);
    if (!lufsResult.valid) {
      throw new Error(lufsResult.error ?? "Music LUFS validation failed");
    }
    musicLufs = lufsResult.lufs;
    logger.log("av_merge_music_lufs", { payload: { musicLufs } });
  } else {
    logger.log("av_merge_music_skip", { payload: { musicPath: null, musicLufs: null } });
  }

  // Step 3 — Duration extraction
  const videoDurationMs = await adapter.getVideoDurationMs(rawVideoPath);
  const narrationDurationMs = getWavDurationMs(narrationPath);
  logger.log("av_merge_durations", {
    payload: { videoDurationMs, narrationDurationMs },
  });

  // Step 4 — Drift validation (pre-encode).
  // Mode C ("generative") enforces a 200ms cap; Mode A ("ui_flow") and Mode B ("recorded")
  // only enforce narration ≤ video (no gap cap).
  const mode = params.mode ?? "ui_flow";
  const driftResult = validateAvDrift(videoDurationMs, narrationDurationMs, {
    maxDriftMs: mode === "generative" ? 200 : null,
  });
  if (!driftResult.valid) {
    throw new Error(driftResult.error ?? `AV drift validation failed: ${driftResult.driftMs}ms`);
  }
  logger.log("av_merge_drift", { payload: { driftMs: driftResult.driftMs } });

  // Step 5 — Transcode
  mkdirSync(outputDir, { recursive: true });
  const finalVideoPath = join(outputDir, "final.mp4");
  const profile = getEncodingProfile();
  const args = adapter.getTranscodeArgs({
    rawVideoPath,
    narrationPath,
    musicPath,
    outputPath: finalVideoPath,
    profile,
    videoDurationSec: musicPath !== null ? videoDurationMs / 1000 : undefined,
  });
  await adapter.runTranscode(args);

  // Step 6 — Output validation
  if (!existsSync(finalVideoPath)) {
    throw new Error("final.mp4 was not created");
  }
  const stat = statSync(finalVideoPath);
  if (stat.size <= 0) {
    throw new Error("final.mp4 has zero size");
  }

  // Step 7 — SHA256 (post-faststart, process already exited 0)
  // Step 8–10 — Metadata construction, schema validation, write + log
  const metadataPath = join(outputDir, "media_metadata.json");
  const mergeMode: AvMergeMetadataMode = params.mode ?? "ui_flow";
  const { metadataHash } = writeMediaMetadata(finalVideoPath, metadataPath, {
    runId: updatedContext.runId,
    mode: mergeMode,
    encodingProfileVersion: profile.encoding_profile_version,
    ffmpegVersion,
    ffmpegBinaryFingerprint: ffmpegInfo.fingerprint,
    sourceVideoPath: rawVideoPath,
    narrationPath,
    musicPath,
    musicLufs,
    durationMs: videoDurationMs,
    driftMs: driftResult.driftMs,
    crf: profile.crf,
    audioSampleRate: profile.audio_sample_rate,
    generatedAt: new Date().toISOString(),
    ...(params.sourceWidth != null && { sourceWidth: params.sourceWidth }),
    ...(params.sourceHeight != null && { sourceHeight: params.sourceHeight }),
    ...(params.sceneCount != null && { sceneCount: params.sceneCount }),
    ...(params.maxDriftMs != null && { maxDriftMs: params.maxDriftMs }),
    ...(params.avgDriftMs != null && { avgDriftMs: params.avgDriftMs }),
    ...(params.language != null && { language: params.language }),
    ...(params.voiceGender != null && { voiceGender: params.voiceGender }),
    ...(params.voiceId != null && { voiceId: params.voiceId }),
    ...(params.piperModelPath != null && { piperModelPath: params.piperModelPath }),
    ...(params.piperModelHash != null && { piperModelHash: params.piperModelHash }),
    ...(params.scenes != null && { scenes: params.scenes }),
  });
  logger.log("av_merge_metadata_written", { payload: { metadataPath, metadataHash } });

  if (params.envSnapshot) {
    const snapshotPath = join(outputDir, "environment_snapshot.json");
    writeEnvironmentSnapshot(snapshotPath, params.envSnapshot);
    logger.log("av_merge_environment_snapshot_written", { payload: { snapshotPath } });
  }

  return {
    ...updatedContext,
    artifacts: {
      ...updatedContext.artifacts,
      rawVideoPath,
      narrationPath,
      finalVideoPath,
      metadataPath,
    },
    status: "completed",
  };
}
