/**
 * Post-production helpers for scene-driven Mode A: title card, progress, chapters, SRT, thumbnail, description.
 */

import { existsSync, writeFileSync, copyFileSync } from "node:fs";
import { runFfmpeg } from "../adapters/ffmpeg_adapter.js";

/** Escape single quotes for FFmpeg drawtext text= (use '\''). */
function escapeDrawtext(s: string): string {
  return s.replace(/'/g, "'\\''");
}

export interface SegmentInfo {
  title: string;
  durationMs: number;
}

/**
 * Apply step title card and progress indicator to stitched video via drawtext.
 * Outputs to stitched_enhanced.mp4.
 */
export async function applyTitleCardAndProgress(params: {
  inputPath: string;
  outputPath: string;
  segments: SegmentInfo[];
  stepTitleCard: boolean;
  progressIndicator: boolean;
  ffmpegPath: string;
}): Promise<void> {
  const { inputPath, outputPath, segments, stepTitleCard, progressIndicator, ffmpegPath } = params;
  if (!stepTitleCard && !progressIndicator) {
    await runFfmpeg(ffmpegPath, ["-i", inputPath, "-c", "copy", outputPath]);
    return;
  }

  const parts: string[] = [];
  let cumulativeSec = 0;
  const totalSteps = segments.length;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const startSec = cumulativeSec;
    const endSec = cumulativeSec + seg.durationMs / 1000;
    cumulativeSec = endSec;

    if (stepTitleCard) {
      const titleEnd = Math.min(startSec + 2, endSec);
      parts.push(
        `drawtext=text='${escapeDrawtext(seg.title)}':enable='between(t\\,${startSec}\\,${titleEnd})':x=40:y=40:fontsize=36:fontcolor=white:borderw=2:bordercolor=black`
      );
    }
    if (progressIndicator) {
      const stepNum = i + 1;
      parts.push(
        `drawtext=text='Step ${stepNum} of ${totalSteps}':enable='between(t\\,${startSec}\\,${endSec})':x=w-tw-40:y=h-th-20:fontsize=24:fontcolor=white:borderw=1:bordercolor=black`
      );
    }
  }

  const filter = parts.join(",");
  await runFfmpeg(ffmpegPath, [
    "-i",
    inputPath,
    "-vf",
    filter,
    "-c:a",
    "copy",
    "-movflags",
    "+faststart",
    outputPath,
  ]);
}

/**
 * Apply subtle zoom at click timestamps (zoom-to-action). Uses FFmpeg zoompan with z expression
 * so that at each global click time we zoom to (1 + zoomLevel) for zoomDurationSec.
 */
export async function applyZoomToAction(params: {
  inputPath: string;
  outputPath: string;
  globalClickTimesSec: number[];
  zoomLevel: number;
  zoomDurationSec: number;
  width: number;
  height: number;
  ffmpegPath: string;
}): Promise<void> {
  const { inputPath, outputPath, globalClickTimesSec, zoomLevel, zoomDurationSec, width, height, ffmpegPath } = params;
  if (globalClickTimesSec.length === 0) {
    const { copyFileSync } = await import("node:fs");
    copyFileSync(inputPath, outputPath);
    return;
  }
  const z = 1 + zoomLevel;
  const parts = globalClickTimesSec.map((t) => `between(in_time\\,${t}\\,${t + zoomDurationSec})`).join("+");
  const zExpr = `if(gte(${parts}\\,1)\\,${z}\\,1)`;
  await runFfmpeg(ffmpegPath, [
    "-i",
    inputPath,
    "-vf",
    `zoompan=z='${zExpr}':d=1:s=${width}x${height}`,
    "-c:a",
    "copy",
    "-movflags",
    "+faststart",
    outputPath,
  ]);
}

/**
 * Add chapter metadata to MP4. Creates a new file with -c copy and chapter metadata.
 */
export async function addChapterMarkers(params: {
  inputPath: string;
  outputPath: string;
  segments: SegmentInfo[];
  ffmpegPath: string;
}): Promise<void> {
  const { inputPath, outputPath, segments, ffmpegPath } = params;
  const args: string[] = ["-i", inputPath, "-c", "copy", "-map_metadata", "-1"];
  let cumulativeSec = 0;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const ts = formatChapterTime(cumulativeSec);
    args.push("-metadata", `CHAPTER${String(i + 1).padStart(2, "0")}=${ts}`);
    args.push("-metadata", `CHAPTER${String(i + 1).padStart(2, "0")}NAME=${seg.title}`);
    cumulativeSec += seg.durationMs / 1000;
  }
  args.push("-movflags", "+faststart", outputPath);
  await runFfmpeg(ffmpegPath, args);
}

function formatChapterTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.000`;
}

function formatSrtTime(ms: number): string {
  const totalSec = ms / 1000;
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  const fr = Math.floor((totalSec % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(fr).padStart(3, "0")}`;
}

/**
 * Generate SRT from segment texts and durations.
 */
export function generateSrt(params: {
  segments: { title: string; durationMs: number; text: string }[];
  outputPath: string;
}): void {
  const { segments, outputPath } = params;
  let startMs = 0;
  const lines: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const endMs = startMs + seg.durationMs;
    lines.push(String(i + 1));
    lines.push(`${formatSrtTime(startMs)} --> ${formatSrtTime(endMs)}`);
    lines.push(seg.text.replace(/\r\n/g, "\n").trim());
    lines.push("");
    startMs = endMs;
  }
  writeFileSync(outputPath, lines.join("\n"), "utf-8");
}

/**
 * Extract thumbnail at 3s and optionally add drawtext overlay.
 */
export async function generateThumbnail(params: {
  videoPath: string;
  outputPath: string;
  title: string;
  ffmpegPath: string;
}): Promise<void> {
  const { videoPath, outputPath, title, ffmpegPath } = params;
  const tempPath = outputPath.replace(/\.png$/, "_raw.png");
  await runFfmpeg(ffmpegPath, [
    "-i",
    videoPath,
    "-ss",
    "00:00:03",
    "-vframes",
    "1",
    "-q:v",
    "2",
    tempPath,
  ]);
  if (!existsSync(tempPath)) {
    return;
  }
  // Many FFmpeg builds (including your local one) do not have drawtext
  // compiled in. Since Mode A does not require text overlays on thumbnails,
  // degrade gracefully: try drawtext once, and if it fails, fall back to the
  // raw frame without text.
  const escaped = escapeDrawtext(title);
  try {
    await runFfmpeg(ffmpegPath, [
      "-i",
      tempPath,
      "-vf",
      `drawtext=text='${escaped}':x=40:y=h-th-40:fontsize=48:fontcolor=white:borderw=2:bordercolor=black`,
      "-y",
      outputPath,
    ]);
  } catch {
    // drawtext not available – just use the raw frame.
    copyFileSync(tempPath, outputPath);
  }
  try {
    const { unlink } = await import("node:fs/promises");
    await unlink(tempPath);
  } catch {
    // ignore
  }
}

/**
 * Assemble video description from intro + scene titles + scene texts + summary.
 */
export function assembleVideoDescription(params: {
  introText: string;
  sceneTitles: string[];
  sceneTexts: string[];
  summaryText: string;
}): string {
  const { introText, sceneTitles, sceneTexts, summaryText } = params;
  const parts: string[] = [introText.trim()];
  for (let i = 0; i < sceneTitles.length; i++) {
    parts.push("");
    parts.push(sceneTitles[i]!);
    parts.push((sceneTexts[i] ?? "").trim());
  }
  parts.push("");
  parts.push(summaryText.trim());
  parts.push("");
  parts.push("---");
  parts.push("Generated by VISU for AnukramAI");
  return parts.join("\n");
}
