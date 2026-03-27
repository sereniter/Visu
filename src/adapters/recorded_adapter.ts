/**
 * RecordedAdapter (Sprint 5). Validates externally recorded MP4 input for Mode B.
 * File existence, container format (MP4 only), video stream, duration > 0.
 * Resolution and codec extracted for logging only; no resolution gate.
 */

import { existsSync } from "node:fs";
import { spawn } from "node:child_process";

export type RecordedValidationResult =
  | {
      valid: true;
      durationMs: number;
      videoCodec: string;
      width?: number;
      height?: number;
    }
  | {
      valid: false;
      error: string;
    };

interface FfprobeFormat {
  format_name?: string;
  duration?: string;
}

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
}

export interface FfprobeOutput {
  format?: FfprobeFormat;
  streams?: FfprobeStream[];
}

/**
 * Run ffprobe with -show_format -show_streams -of json. Returns parsed JSON or throws.
 */
export function runFfprobeJson(ffprobePath: string, videoPath: string): Promise<FfprobeOutput> {
  return new Promise((resolve, reject) => {
    const args = [
      "-v", "error",
      "-show_format",
      "-show_streams",
      "-of", "json",
      videoPath,
    ];
    const proc = spawn(ffprobePath, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    proc.stdout?.on("data", (chunk: Buffer) => {
      out += chunk.toString();
    });
    proc.stderr?.on("data", (chunk: Buffer) => {
      out += chunk.toString();
    });
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe exited ${code}: ${out.slice(-500)}`));
        return;
      }
      try {
        const data = JSON.parse(out) as FfprobeOutput;
        resolve(data);
      } catch {
        reject(new Error("ffprobe output was not valid JSON"));
      }
    });
    proc.on("error", reject);
  });
}

export type FfprobeRunner = (ffprobePath: string, videoPath: string) => Promise<FfprobeOutput>;

/**
 * Validate recorded input video. MP4 only; file must exist; must have video stream; duration > 0.
 * Resolution and codec are returned for observability only.
 * Optional runFfprobe injector for tests.
 */
export async function validateRecordedVideo(
  ffprobePath: string,
  videoPath: string,
  runFfprobe?: FfprobeRunner
): Promise<RecordedValidationResult> {
  if (!existsSync(videoPath)) {
    return { valid: false, error: `File does not exist: ${videoPath}` };
  }

  const probe = runFfprobe ?? runFfprobeJson;
  let data: FfprobeOutput;
  try {
    data = await probe(ffprobePath, videoPath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { valid: false, error: message };
  }

  const formatName = (data.format?.format_name ?? "").toLowerCase();
  const isMp4 = formatName.includes("mp4") || formatName.includes("mov");
  if (!isMp4) {
    return { valid: false, error: `Container is not MP4: ${formatName || "unknown"}` };
  }

  const videoStreams = (data.streams ?? []).filter((s) => s.codec_type === "video");
  if (videoStreams.length === 0) {
    return { valid: false, error: "No video stream found" };
  }

  const durationSec = parseFloat(data.format?.duration ?? "0");
  const durationMs = Math.round(durationSec * 1000);
  if (durationMs <= 0 || Number.isNaN(durationMs)) {
    return { valid: false, error: "Video duration is zero or invalid" };
  }

  const firstVideo = videoStreams[0];
  const videoCodec = firstVideo.codec_name ?? "unknown";
  const width = firstVideo.width;
  const height = firstVideo.height;

  return {
    valid: true,
    durationMs,
    videoCodec,
    width: width != null ? Number(width) : undefined,
    height: height != null ? Number(height) : undefined,
  };
}
