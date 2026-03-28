/**
 * FFmpeg adapter (Sprint 4). Deterministic argument builder, version check, full transcode (no stream copy).
 * Sprint 7: binary fingerprint = SHA256(version output + buildconf output).
 */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { getEncodingProfile, type EncodingProfile } from "../core/config.js";
import type { MotionParams } from "../engines/visual_style_resolver.js";

const MIN_FFMPEG_MAJOR = 6;
const DUCKING_DB = -14;

/** Single-pass ffprobe result for uniformity gate and drift (Mode C). */
export interface VideoStreamInfo {
  durationMs: number;
  codec_name: string;
  width: number;
  height: number;
  pix_fmt: string;
  /** Parsed fps from r_frame_rate (e.g. 30000/1001 → 29.97). */
  fps: number;
  /** Container format (e.g. "mov,mp4,m4a,3gp,3g2,mj2"). */
  format_name: string;
}

export interface FFmpegAdapterInterface {
  checkVersion(): Promise<{ version: string }>;
  /** Sprint 7: version + buildconf + SHA256 fingerprint for determinism audit. */
  getVersionBuildconfAndFingerprint(): Promise<{
    versionFull: string;
    buildconf: string;
    fingerprint: string;
  }>;
  getFfmpegPath(): string;
  getFfprobePath(): string;
  getVideoDurationMs(videoPath: string): Promise<number>;
  /** Single-pass ffprobe for Mode C: duration, codec, resolution, pix_fmt, r_frame_rate, format. */
  getVideoStreamInfo(videoPath: string): Promise<VideoStreamInfo>;
  /** Single-pass ffprobe for image (PNG): width, height. */
  getImageDimensions(imagePath: string): Promise<ImageDimensions>;
  getSceneClipArgs(params: { assetPath: string; durationSec: number; outputPath: string }): string[];
  getTranscodeArgs(params: {
    rawVideoPath: string;
    narrationPath: string;
    musicPath: string | null;
    outputPath: string;
    profile: EncodingProfile;
    videoDurationSec?: number;
  }): string[];
  runTranscode(args: string[]): Promise<void>;
}

/**
 * Build FFmpeg argument array for AV merge transcode. No shell concatenation; deterministic.
 * - Video: full transcode (libx264), never -c:v copy.
 * - Audio: narration + optional music with ducking; AAC 48kHz.
 */
/** When set with musicPath, music is looped/trimmed to this duration and amix uses duration=longest so music continues after narration (Mode B). */
export function buildTranscodeArgs(params: {
  rawVideoPath: string;
  narrationPath: string;
  musicPath: string | null;
  outputPath: string;
  profile: EncodingProfile;
  /** Optional. When music is present, loop/trim music to this many seconds so mix fills full video. */
  videoDurationSec?: number;
}): string[] {
  const { rawVideoPath, narrationPath, musicPath, outputPath, profile, videoDurationSec } = params;
  const args: string[] = ["-i", rawVideoPath, "-i", narrationPath];

  if (musicPath !== null) {
    args.push("-i", musicPath);
  }

  const hasMusic = musicPath !== null;
  if (hasMusic) {
    const sec = videoDurationSec != null && videoDurationSec > 0 ? Number(videoDurationSec.toFixed(3)) : null;
    if (sec != null) {
      // Mode B: loop/trim music to video duration; mix with duration=longest so music continues after narration
      args.push(
        "-filter_complex",
        `[2:a]aloop=loop=-1:size=2e+09,atrim=duration=${sec},asetpts=PTS-STARTPTS[mt];[mt]volume=0.28[music_bg];[1:a]volume=1[a_narr];[a_narr][music_bg]amix=inputs=2:duration=longest[mixed_audio]`
      );
    } else {
      const duckLinear = 10 ** (DUCKING_DB / 20);
      args.push(
        "-filter_complex",
        `[1:a]volume=1[a_narr];[2:a]volume=${duckLinear}[a_music];[a_narr][a_music]amix=inputs=2:duration=first[mixed_audio]`
      );
    }
    args.push("-map", "0:v:0", "-map", "[mixed_audio]");
  } else {
    args.push("-map", "0:v:0", "-map", "1:a:0");
  }

  args.push(
    "-map_metadata",
    "-1",
    "-c:v",
    profile.video_codec,
    "-preset",
    profile.preset,
    "-profile:v",
    profile.profile,
    "-pix_fmt",
    profile.pix_fmt,
    "-crf",
    String(profile.crf),
    "-c:a",
    profile.audio_codec,
    "-ar",
    String(profile.audio_sample_rate),
    "-movflags",
    "+faststart",
    outputPath
  );

  return args;
}

/**
 * Parse semantic version from ffmpeg -version (first line).
 */
export function parseFfmpegVersion(stderr: string): string {
  const match = /ffmpeg version ([\d.]+)/i.exec(stderr);
  return match ? match[1].trim() : "";
}

/**
 * Run ffmpeg -version and -buildconf; return full version stderr, buildconf stdout, and fingerprint.
 * Fingerprint = SHA256(versionOutput + buildconfOutput). Throws on failure.
 */
/**
 * FFmpeg `-version` output is stderr on some builds and stdout on others (e.g. static builds).
 * `versionFull` uses stdout || stderr for logging and parseFfmpegVersion.
 * Fingerprint stays legacy: only stderr is hashed with buildconf so audit/replay hashes remain stable
 * when the same binary moved from stderr-only to stdout-only output.
 */
export function getFfmpegVersionBuildconfAndFingerprint(
  ffmpegPath: string
): Promise<{ versionFull: string; buildconf: string; fingerprint: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, ["-version"], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg -version exited ${code}`));
        return;
      }
      const versionFull = stdout.trim() || stderr.trim();
      const versionForFingerprint = stderr.trim();
      const proc2 = spawn(ffmpegPath, ["-buildconf"], { stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      proc2.stdout?.on("data", (chunk: Buffer) => {
        out += chunk.toString();
      });
      proc2.stderr?.on("data", (chunk: Buffer) => {
        out += chunk.toString();
      });
      proc2.on("close", (code2) => {
        if (code2 !== 0) {
          reject(new Error(`ffmpeg -buildconf exited ${code2}`));
          return;
        }
        const buildconf = out.trim();
        const concatenated = versionForFingerprint + "\n" + buildconf;
        const fingerprint = createHash("sha256").update(concatenated, "utf8").digest("hex");
        resolve({ versionFull, buildconf, fingerprint });
      });
      proc2.on("error", (err) => reject(err));
    });
    proc.on("error", (err) => reject(err));
  });
}

/**
 * Check FFmpeg is installed and version >= 6.0. Throws on failure.
 */
export function checkFfmpegVersion(ffmpegPath: string): Promise<{ version: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, ["-version"], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on("close", (code) => {
      const combined = stdout.trim() || stderr.trim();
      const version = parseFfmpegVersion(combined);
      if (code !== 0 || !version) {
        const detail = (stdout + stderr).trim().slice(0, 200);
        reject(new Error(`FFmpeg not available or version check failed: ${detail}`));
        return;
      }
      const major = parseInt(version.split(".")[0] ?? "0", 10);
      if (major < MIN_FFMPEG_MAJOR) {
        reject(new Error(`FFmpeg version ${version} is below minimum ${MIN_FFMPEG_MAJOR}.0`));
        return;
      }
      resolve({ version });
    });
    proc.on("error", (err) => reject(err));
  });
}

const FPS_TOLERANCE = 0.1;

/**
 * Parse r_frame_rate (e.g. "30000/1001", "30/1") to fps as float.
 */
export function parseRFrameRate(rFrameRate: string): number {
  const parts = rFrameRate.split("/").map((s) => s.trim());
  if (parts.length !== 2) {
    throw new Error(`Invalid r_frame_rate: ${rFrameRate}`);
  }
  const num = parseFloat(parts[0] ?? "0");
  const den = parseFloat(parts[1] ?? "1");
  if (den === 0 || Number.isNaN(num) || Number.isNaN(den)) {
    throw new Error(`Invalid r_frame_rate: ${rFrameRate}`);
  }
  return num / den;
}

/**
 * Single-pass ffprobe: duration, codec, resolution, pix_fmt, r_frame_rate, format_name.
 * Used by TimelineEngine for uniformity gate and drift; one call per scene.
 */
export function getVideoStreamInfo(
  ffprobePath: string,
  videoPath: string
): Promise<VideoStreamInfo> {
  return new Promise((resolve, reject) => {
    const args = [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=codec_name,width,height,pix_fmt,r_frame_rate",
      "-show_entries",
      "format=duration,format_name",
      "-of",
      "json",
      videoPath,
    ];
    const proc = spawn(ffprobePath, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    proc.stdout?.on("data", (chunk: Buffer) => {
      out += chunk.toString();
    });
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe exited ${code}`));
        return;
      }
      try {
        const json = JSON.parse(out) as {
          format?: { duration?: string; format_name?: string };
          streams?: Array<{
            codec_name?: string;
            width?: number;
            height?: number;
            pix_fmt?: string;
            r_frame_rate?: string;
          }>;
        };
        const format = json.format;
        const stream = json.streams?.[0];
        if (!format?.duration || !stream?.codec_name || stream.width == null || stream.height == null || !stream.pix_fmt || !stream.r_frame_rate) {
          reject(new Error("Missing required ffprobe fields"));
          return;
        }
        const durationSec = parseFloat(format.duration);
        if (Number.isNaN(durationSec) || durationSec < 0) {
          reject(new Error("Invalid duration from ffprobe"));
          return;
        }
        const fps = parseRFrameRate(stream.r_frame_rate);
        const formatName = format.format_name ?? "";
        if (!formatName.toLowerCase().includes("mp4") && !formatName.toLowerCase().includes("mov")) {
          reject(new Error(`Container must be MP4; got: ${formatName}`));
          return;
        }
        resolve({
          durationMs: Math.round(durationSec * 1000),
          codec_name: stream.codec_name,
          width: stream.width,
          height: stream.height,
          pix_fmt: stream.pix_fmt,
          fps,
          format_name: formatName,
        });
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
    proc.on("error", reject);
  });
}

/**
 * Compare fps with ±0.1 tolerance (rational comparison).
 */
export function fpsWithinTolerance(a: number, b: number): boolean {
  return Math.abs(a - b) <= FPS_TOLERANCE;
}

/**
 * Get video duration in ms via ffprobe. Uses format duration.
 */
export function getVideoDurationMs(ffprobePath: string, videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const args = [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      videoPath,
    ];
    const proc = spawn(ffprobePath, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    proc.stdout?.on("data", (chunk: Buffer) => {
      out += chunk.toString();
    });
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe exited ${code}`));
        return;
      }
      const sec = parseFloat(out.trim());
      if (Number.isNaN(sec) || sec < 0) reject(new Error("Could not parse video duration"));
      else resolve(Math.round(sec * 1000));
    });
    proc.on("error", reject);
  });
}

/** Image dimensions from ffprobe (PNG/static image). */
export interface ImageDimensions {
  width: number;
  height: number;
}

/**
 * Single-pass ffprobe for image file (e.g. PNG): width and height.
 * Consistent with project pattern of using ffprobe for all media inspection.
 */
export function probeImageDimensions(
  ffprobePath: string,
  imagePath: string
): Promise<ImageDimensions> {
  return new Promise((resolve, reject) => {
    const args = [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height",
      "-of", "json",
      imagePath,
    ];
    const proc = spawn(ffprobePath, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    proc.stdout?.on("data", (chunk: Buffer) => {
      out += chunk.toString();
    });
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe exited ${code}`));
        return;
      }
      try {
        const json = JSON.parse(out) as { streams?: Array<{ width?: number; height?: number }> };
        const stream = json.streams?.[0];
        if (stream?.width == null || stream?.height == null) {
          reject(new Error("Missing width/height in ffprobe output"));
          return;
        }
        resolve({ width: stream.width, height: stream.height });
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
    proc.on("error", reject);
  });
}

const SCENE_CLIP_FPS = 30;

/**
 * Build FFmpeg argument array for PNG → scene clip (Mode C). Locked profile: identical to
 * AVMergeEngine video encoding (libx264, preset medium, profile high, pix_fmt yuv420p, crf 18),
 * no audio. Ensures identical GOP/compression for deterministic downstream transcode.
 */
export function buildSceneClipArgs(params: {
  assetPath: string;
  durationSec: number;
  outputPath: string;
  profile: EncodingProfile;
}): string[] {
  const { assetPath, durationSec, outputPath, profile } = params;
  return [
    "-loop",
    "1",
    "-i",
    assetPath,
    "-t",
    String(durationSec),
    "-r",
    String(SCENE_CLIP_FPS),
    "-c:v",
    profile.video_codec,
    "-preset",
    profile.preset,
    "-profile:v",
    profile.profile,
    "-pix_fmt",
    profile.pix_fmt,
    "-crf",
    String(profile.crf),
    outputPath,
  ];
}

export function getKenBurnsArgs(
  motion: MotionParams | null,
  durationSec: number,
  fps: number,
): string {
  if (!motion) return "";

  const focus = motion.focus ?? "center";
  let intensity = motion.intensity ?? 0.20;
  if (intensity > 0.35) intensity = 0.35;
  if (intensity < 0.05) intensity = 0.05;

  const totalFrames = Math.round(durationSec * fps);
  if (!Number.isFinite(totalFrames) || totalFrames <= 0) {
    throw new Error("KEN_BURNS_INVALID_DURATION");
  }

  const step = intensity / totalFrames;
  const stepStr = step.toFixed(8);
  const intensityStr = intensity.toFixed(3);
  const totalFramesStr = String(totalFrames);

  const focusX =
    focus === "left"
      ? "0"
      : focus === "right"
        ? "iw-(iw/zoom)"
        : "iw/2-(iw/zoom/2)";
  const focusY =
    focus === "top"
      ? "0"
      : focus === "bottom"
        ? "ih-(ih/zoom)"
        : "ih/2-(ih/zoom/2)";

  let zoomExpr: string;
  let xExpr: string;
  let yExpr: string;

  switch (motion.type) {
    case "zoom_in":
      zoomExpr = `min(zoom+${stepStr},1+${intensityStr})`;
      xExpr = focusX;
      yExpr = focusY;
      break;
    case "zoom_out":
      zoomExpr = `if(eq(on,1),1+${intensityStr},max(zoom-${stepStr},1))`;
      xExpr = focusX;
      yExpr = focusY;
      break;
    case "pan_left":
      zoomExpr = "1";
      xExpr = `iw*${intensityStr}-iw*${intensityStr}*(on/${totalFramesStr})`;
      yExpr = "ih/2-(ih/zoom/2)";
      break;
    case "pan_right":
      zoomExpr = "1";
      xExpr = `iw*${intensityStr}*(on/${totalFramesStr})`;
      yExpr = "ih/2-(ih/zoom/2)";
      break;
    case "pan_diagonal_tl":
      zoomExpr = `min(zoom+${stepStr},1+${intensityStr})`;
      xExpr = `iw*${intensityStr}-iw*${intensityStr}*(on/${totalFramesStr})`;
      yExpr = `ih*${intensityStr}-ih*${intensityStr}*(on/${totalFramesStr})`;
      break;
    case "pan_diagonal_br":
      zoomExpr = `min(zoom+${stepStr},1+${intensityStr})`;
      xExpr = `iw*${intensityStr}*(on/${totalFramesStr})`;
      yExpr = `ih*${intensityStr}*(on/${totalFramesStr})`;
      break;
    default:
      throw new Error(`KEN_BURNS_UNKNOWN_TYPE: ${motion.type}`);
  }

  return `scale=3840:-1,zoompan=z='${zoomExpr}':x='${xExpr}':y='${yExpr}':d=${totalFramesStr}:s=1920x1080:fps=${fps},setsar=1`;
}

export function getGradeArgs(
  gradeName: string | null,
  gradesConfig: import("../engines/visual_style_resolver.js").GradesConfig,
): string {
  if (!gradeName) return "";
  const preset = gradesConfig.grades[gradeName];
  if (!preset) {
    throw new Error(`GRADE_UNKNOWN: grade "${gradeName}" not found in grades config`);
  }

  const segments: string[] = [];
  if (preset.eq) segments.push(`eq=${preset.eq}`);
  if (preset.curves) segments.push(`curves=${preset.curves}`);
  if (preset.vignette) segments.push(`vignette=${preset.vignette}`);
  if (preset.grain) segments.push(preset.grain);

  if (segments.length === 0) return "";
  return segments.join(",");
}

/**
 * Run FFmpeg with given argument array. Resolves when process exits with 0; rejects otherwise.
 */
export function runFfmpeg(ffmpegPath: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited ${code}: ${stderr.slice(-500)}`));
    });
    proc.on("error", reject);
  });
}

export class FFmpegAdapter implements FFmpegAdapterInterface {
  constructor(
    private ffmpegPath: string = "ffmpeg",
    private ffprobePath: string = "ffprobe"
  ) {}

  async checkVersion(): Promise<{ version: string }> {
    return checkFfmpegVersion(this.ffmpegPath);
  }

  async getVersionBuildconfAndFingerprint(): Promise<{
    versionFull: string;
    buildconf: string;
    fingerprint: string;
  }> {
    return getFfmpegVersionBuildconfAndFingerprint(this.ffmpegPath);
  }

  getFfmpegPath(): string {
    return this.ffmpegPath;
  }

  getFfprobePath(): string {
    return this.ffprobePath;
  }

  async getVideoDurationMs(videoPath: string): Promise<number> {
    return getVideoDurationMs(this.ffprobePath, videoPath);
  }

  async getVideoStreamInfo(videoPath: string): Promise<VideoStreamInfo> {
    return getVideoStreamInfo(this.ffprobePath, videoPath);
  }

  async getImageDimensions(imagePath: string): Promise<ImageDimensions> {
    return probeImageDimensions(this.ffprobePath, imagePath);
  }

  getSceneClipArgs(params: {
    assetPath: string;
    durationSec: number;
    outputPath: string;
  }): string[] {
    return buildSceneClipArgs({ ...params, profile: getEncodingProfile() });
  }

  getTranscodeArgs(params: {
    rawVideoPath: string;
    narrationPath: string;
    musicPath: string | null;
    outputPath: string;
    profile: EncodingProfile;
    videoDurationSec?: number;
  }): string[] {
    return buildTranscodeArgs(params);
  }

  async runTranscode(args: string[]): Promise<void> {
    return runFfmpeg(this.ffmpegPath, args);
  }
}
