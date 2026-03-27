/**
 * Metadata writer (Sprint 4). Computes SHA256 of final.mp4, builds metadata object,
 * validates against schema, writes media_metadata.json.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  validateMediaMetadata,
  type MediaMetadataPayload,
  type MediaMetadataMode,
  type MediaMetadataSceneSummary,
} from "../validators/media_metadata_schema.js";
import {
  validateEnvironmentSnapshot,
  type EnvironmentSnapshotPayload,
} from "../validators/environment_snapshot_validator.js";
import { resolveOutputPath } from "../core/path_resolver.js";

const DUCKING_DB = -14;

export function computeFileSha256(filePath: string): string {
  const buf = readFileSync(filePath);
  return createHash("sha256").update(buf).digest("hex");
}

export function buildMediaMetadata(params: {
  runId: string;
  mode: MediaMetadataMode;
  encodingProfileVersion: string;
  ffmpegVersion: string;
  ffmpegBinaryFingerprint: string;
  sourceVideoPath: string;
  narrationPath: string;
  musicPath: string | null;
  musicLufs: number | null;
  durationMs: number;
  driftMs: number;
  crf: number;
  audioSampleRate: number;
  outputPath: string;
  outputSha256: string;
  generatedAt: string;
  sourceWidth?: number;
  sourceHeight?: number;
  sceneCount?: number;
  maxDriftMs?: number;
  avgDriftMs?: number;
  language?: string;
  voiceGender?: "male" | "female";
  voiceId?: string;
  piperModelPath?: string;
  piperModelHash?: string;
  scenes?: MediaMetadataSceneSummary[];
}): MediaMetadataPayload {
  const payload: MediaMetadataPayload = {
    runId: params.runId,
    mode: params.mode,
    encodingProfileVersion: params.encodingProfileVersion,
    ffmpegVersion: params.ffmpegVersion,
    ffmpegBinaryFingerprint: params.ffmpegBinaryFingerprint,
    sourceVideoPath: params.sourceVideoPath,
    narrationPath: params.narrationPath,
    musicPath: params.musicPath,
    musicLufs: params.musicLufs,
    durationMs: params.durationMs,
    driftMs: params.driftMs,
    crf: params.crf,
    audioSampleRate: params.audioSampleRate,
    duckingDb: DUCKING_DB,
    outputPath: params.outputPath,
    outputSha256: params.outputSha256,
    generatedAt: params.generatedAt,
  };
  if (params.sourceWidth != null) payload.sourceWidth = params.sourceWidth;
  if (params.sourceHeight != null) payload.sourceHeight = params.sourceHeight;
  if (params.sceneCount != null) payload.sceneCount = params.sceneCount;
  if (params.maxDriftMs != null) payload.maxDriftMs = params.maxDriftMs;
  if (params.avgDriftMs != null) payload.avgDriftMs = params.avgDriftMs;
  if (params.language != null) payload.language = params.language;
  if (params.voiceGender != null) payload.voiceGender = params.voiceGender;
  if (params.voiceId != null) payload.voiceId = params.voiceId;
  if (params.piperModelPath != null) payload.piperModelPath = params.piperModelPath;
  if (params.piperModelHash != null) payload.piperModelHash = params.piperModelHash;
  if (params.scenes != null) payload.scenes = params.scenes;
  return payload;
}

/**
 * Compute SHA256 of output file, build metadata, validate against schema, write to metadataPath.
 * Returns the written metadata. Throws if validation fails or write fails.
 */
export function writeMediaMetadata(
  outputPath: string,
  metadataPath: string,
  params: Omit<MediaMetadataPayload, "outputSha256" | "duckingDb" | "outputPath"> & {
    outputSha256?: string;
    generatedAt?: string;
  }
): { metadata: MediaMetadataPayload; metadataHash: string } {
  const outputSha256 = params.outputSha256 ?? computeFileSha256(outputPath);
  const generatedAt = params.generatedAt ?? new Date().toISOString();
  const metadata = buildMediaMetadata({
    ...params,
    outputPath,
    outputSha256,
    generatedAt,
  });

  const result = validateMediaMetadata(metadata);
  if (!result.valid) {
    throw new Error(`Media metadata schema validation failed: ${result.errors.join("; ")}`);
  }

  const json = JSON.stringify(result.data, null, 2);
  writeFileSync(metadataPath, json, "utf-8");
  const metadataHash = createHash("sha256").update(json, "utf8").digest("hex");
  return { metadata: result.data, metadataHash };
}

/**
 * Write and validate environment_snapshot.json (Sprint 7). Throws if validation fails.
 */
export function writeEnvironmentSnapshot(
  snapshotPath: string,
  payload: EnvironmentSnapshotPayload
): void {
  const result = validateEnvironmentSnapshot(payload);
  if (!result.valid) {
    throw new Error(`Environment snapshot validation failed: ${result.errors.join("; ")}`);
  }
  const json = JSON.stringify(result.data, null, 2);
  writeFileSync(snapshotPath, json, "utf-8");
}

export interface CopyOutputParams {
  finalVideoPath: string;
  metadataPath: string;
  metadata: MediaMetadataPayload;
  topic: string;
  language: string;
  logger: { log: (step: string, options?: { message?: string; payload?: object }) => void };
  /** Optional files to copy to menu_item (e.g. subtitles.srt, thumbnail.png). */
  extraFiles?: { sourcePath: string; destFileName: string }[];
}

/**
 * Copy final.mp4 and media_metadata.json to outputRoot/{topic}/{language}/.
 * Creates directory if needed. Verifies SHA256 of copied file matches metadata.outputSha256.
 * Logs overwrite warning if final.mp4 already exists at destination. Throws on copy or verify failure.
 */
export function copyOutputToRepository(params: CopyOutputParams): string {
  const { finalVideoPath, metadataPath, metadata, topic, language, logger, extraFiles } = params;
  const outDir = resolveOutputPath(topic, language);
  mkdirSync(outDir, { recursive: true });
  const destVideoPath = join(outDir, "final.mp4");
  const destMetadataPath = join(outDir, "media_metadata.json");

  if (existsSync(destVideoPath)) {
    logger.log("output_copy_overwrite", {
      message: "Overwriting existing final.mp4 at output path",
      payload: { outputPath: destVideoPath },
    });
  }

  copyFileSync(finalVideoPath, destVideoPath);
  copyFileSync(metadataPath, destMetadataPath);

  if (extraFiles?.length) {
    for (const { sourcePath, destFileName } of extraFiles) {
      if (existsSync(sourcePath)) {
        copyFileSync(sourcePath, join(outDir, destFileName));
      }
    }
  }

  const copiedSha256 = computeFileSha256(destVideoPath);
  if (copiedSha256 !== metadata.outputSha256) {
    throw new Error(
      `Output copy SHA256 mismatch: copied ${copiedSha256}, expected ${metadata.outputSha256}`
    );
  }

  logger.log("output_copy_complete", {
    payload: {
      outputPath: destVideoPath,
      sha256Verified: true,
    },
  });
  return destVideoPath;
}
