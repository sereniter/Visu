/**
 * Timeline engine (Sprint 6A). Hard-cut multi-scene concat via FFmpeg concat demuxer only.
 * Single-pass ffprobe per scene; uniformity gate; per-scene drift rule; no transitions.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { FFmpegAdapterInterface, VideoStreamInfo } from "../adapters/ffmpeg_adapter.js";
import { fpsWithinTolerance, runFfmpeg } from "../adapters/ffmpeg_adapter.js";
import { getWavDurationMs } from "../core/wav_utils.js";
import { validateAvDrift } from "../validators/av_drift_validator.js";
import type { RemotionProbeResult } from "../validators/remotion_output_validator.js";

export interface TimelineSceneInput {
  video_path: string;
  narration_path: string;
  /** Optional scene identifier for logging. */
  scene_id?: string;
  /**
   * When true, skip **per-row** AV drift here (used by Mode A).
   * Drift is still enforced post-concat in `ui_flow_scene_engine` (step 16) after `narration_concat.wav` and merge-video alignment.
   */
  skip_per_segment_drift?: boolean;
  /**
   * When set, Mode A skips an extra ffprobe in `normalizeTimelineSegmentVideoForConcat` for this file (probe already done after scene final / overlay concat).
   */
  preConcatFfprobe?: RemotionProbeResult;
}

export interface TimelineSceneProbe {
  video_path: string;
  narration_path: string;
  videoDurationMs: number;
  narrationDurationMs: number;
  driftMs: number;
  streamInfo: VideoStreamInfo;
}

export interface TimelineResult {
  stitchedVideoPath: string;
  totalDurationMs: number;
  sceneProbes: TimelineSceneProbe[];
}

function enforceUniformity(probes: VideoStreamInfo[]): void {
  if (probes.length === 0) return;
  const first = probes[0];
  for (let i = 1; i < probes.length; i++) {
    const p = probes[i];
    if (p.codec_name !== first.codec_name) {
      throw new Error(
        `Scene asset uniformity failed: video codec mismatch (${first.codec_name} vs ${p.codec_name})`
      );
    }
    if (p.width !== first.width || p.height !== first.height) {
      throw new Error(
        `Scene asset uniformity failed: resolution mismatch (${first.width}x${first.height} vs ${p.width}x${p.height})`
      );
    }
    if (p.pix_fmt !== first.pix_fmt) {
      throw new Error(
        `Scene asset uniformity failed: pixel format mismatch (${first.pix_fmt} vs ${p.pix_fmt})`
      );
    }
    if (!fpsWithinTolerance(p.fps, first.fps)) {
      throw new Error(
        `Scene asset uniformity failed: framerate outside ±0.1 fps (${first.fps} vs ${p.fps})`
      );
    }
  }
}

/**
 * Run timeline: validate paths, single-pass ffprobe per scene, uniformity gate, drift check,
 * build concat list, run concat demuxer. Returns stitched video path and probe summary.
 */
export async function runTimeline(params: {
  scenes: TimelineSceneInput[];
  outputDir: string;
  adapter: FFmpegAdapterInterface;
  logger?: { log: (step: string, options?: { payload?: object }) => void };
}): Promise<TimelineResult> {
  const { scenes, outputDir, adapter, logger } = params;
  if (scenes.length === 0) {
    throw new Error("At least one scene required");
  }

  // 1) Validate paths exist
  for (const s of scenes) {
    if (!existsSync(s.video_path)) {
      throw new Error(`Scene video path does not exist: ${s.video_path}`);
    }
    if (!existsSync(s.narration_path)) {
      throw new Error(`Scene narration path does not exist: ${s.narration_path}`);
    }
  }

  // 2) Single-pass ffprobe per scene + narration duration + drift
  const sceneProbes: TimelineSceneProbe[] = [];
  const streamInfos: VideoStreamInfo[] = [];
  for (const s of scenes) {
    const streamInfo = await adapter.getVideoStreamInfo(s.video_path);
    streamInfos.push(streamInfo);
    const videoDurationMs = streamInfo.durationMs;
    const narrationDurationMs = getWavDurationMs(s.narration_path);

    let driftMs = 0;
    if (s.skip_per_segment_drift) {
      logger?.log("scene_drift_skipped", {
        payload: {
          sceneId: s.scene_id ?? null,
          videoDurationSec: videoDurationMs / 1000,
          narrationDurationSec: narrationDurationMs / 1000,
        },
      });
    } else {
      const driftResult = validateAvDrift(videoDurationMs, narrationDurationMs);
      if (!driftResult.valid) {
        throw new Error(
          `Per-scene drift violation for ${s.video_path}: ${driftResult.error ?? ""}`
        );
      }
      driftMs = driftResult.driftMs;
    }

    sceneProbes.push({
      video_path: s.video_path,
      narration_path: s.narration_path,
      videoDurationMs,
      narrationDurationMs,
      driftMs,
      streamInfo,
    });
  }

  // 3) Uniformity gate
  enforceUniformity(streamInfos);

  // 4) Build concat list and run concat demuxer
  mkdirSync(outputDir, { recursive: true });
  const stitchedVideoPath = join(outputDir, "stitched_video.mp4");
  const listPath = join(outputDir, "concat_list.txt");
  const listContent = sceneProbes
    .map((p) => `file '${p.video_path.replace(/'/g, "'\\''")}'`)
    .join("\n");
  writeFileSync(listPath, listContent, "utf-8");

  const concatArgs = [
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listPath,
    "-c",
    "copy",
    stitchedVideoPath,
  ];
  await runFfmpeg(adapter.getFfmpegPath(), concatArgs);

  const totalDurationMs = sceneProbes.reduce((sum, p) => sum + p.videoDurationMs, 0);
  logger?.log("timeline_concat_done", {
    payload: { stitchedVideoPath, totalDurationMs, sceneCount: scenes.length },
  });

  return {
    stitchedVideoPath,
    totalDurationMs,
    sceneProbes,
  };
}
