/**
 * Music LUFS validator (Sprint 4). Runs ebur128 via FFmpeg; asserts -15 to -17 LUFS.
 * Accepts null input (skip branch).
 */

import { spawn } from "node:child_process";

const MIN_LUFS = -17;
const MAX_LUFS = -15;

export interface MusicLufsResult {
  valid: boolean;
  lufs: number | null;
  error?: string;
}

/**
 * Measure integrated LUFS of an audio file using FFmpeg ebur128 filter.
 * Returns integrated I value (LUFS). Throws if ffmpeg fails or output cannot be parsed.
 */
export function measureLufs(ffmpegPath: string, audioPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const args = [
      "-i",
      audioPath,
      "-filter_complex",
      "ebur128=framelog=verbose",
      "-f",
      "null",
      "-",
    ];
    const proc = spawn(ffmpegPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on("close", (code) => {
      const match = /I:\s*(-?\d+\.?\d*)\s+LUFS/.exec(stderr);
      if (code !== 0 || !match) {
        reject(new Error(`FFmpeg ebur128 failed or could not parse LUFS: ${stderr.slice(-500)}`));
        return;
      }
      resolve(parseFloat(match[1]));
    });
    proc.on("error", reject);
  });
}

/**
 * Validate music file LUFS is in range -15 to -17. If musicPath is null, returns skip result.
 */
export async function validateMusicLufs(
  ffmpegPath: string,
  musicPath: string | null
): Promise<MusicLufsResult> {
  if (musicPath === null) {
    return { valid: true, lufs: null };
  }
  try {
    const lufs = await measureLufs(ffmpegPath, musicPath);
    if (lufs < MIN_LUFS || lufs > MAX_LUFS) {
      return {
        valid: false,
        lufs,
        error: `Music LUFS ${lufs.toFixed(2)} outside acceptable range [${MIN_LUFS}, ${MAX_LUFS}]`,
      };
    }
    return { valid: true, lufs };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { valid: false, lufs: null, error: message };
  }
}
