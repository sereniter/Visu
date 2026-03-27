/**
 * WAV concat engine (Sprint 6B). Validates WAV uniformity (48kHz, PCM s16le, same channels/bit depth),
 * then concatenates in scene order → narration_concat.wav.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getWavFormat } from "../core/wav_utils.js";
import { runFfmpeg } from "../adapters/ffmpeg_adapter.js";

const REQUIRED_SAMPLE_RATE = 48000;
const REQUIRED_BITS_PER_SAMPLE = 16;

export interface WavConcatInput {
  wavPaths: string[];
  outputPath: string;
  ffmpegPath: string;
}

/**
 * Validate uniformity: 48kHz, PCM (16-bit), identical channel count and bit depth across all WAVs.
 * Hard stop on any mismatch.
 */
export function validateWavUniformity(wavPaths: string[]): void {
  if (wavPaths.length === 0) return;
  const first = getWavFormat(wavPaths[0]);
  if (first.sampleRate !== REQUIRED_SAMPLE_RATE) {
    throw new Error(
      `WAV sample rate must be ${REQUIRED_SAMPLE_RATE} Hz; ${wavPaths[0]} has ${first.sampleRate} Hz`
    );
  }
  if (first.bitsPerSample !== REQUIRED_BITS_PER_SAMPLE) {
    throw new Error(
      `WAV bit depth must be ${REQUIRED_BITS_PER_SAMPLE}; ${wavPaths[0]} has ${first.bitsPerSample}`
    );
  }
  for (let i = 1; i < wavPaths.length; i++) {
    const fmt = getWavFormat(wavPaths[i]);
    if (fmt.sampleRate !== REQUIRED_SAMPLE_RATE) {
      throw new Error(
        `WAV sample rate must be ${REQUIRED_SAMPLE_RATE} Hz; ${wavPaths[i]} has ${fmt.sampleRate} Hz`
      );
    }
    if (fmt.numChannels !== first.numChannels) {
      throw new Error(
        `WAV channel count must match; ${wavPaths[0]} has ${first.numChannels}, ${wavPaths[i]} has ${fmt.numChannels}`
      );
    }
    if (fmt.bitsPerSample !== first.bitsPerSample) {
      throw new Error(
        `WAV bit depth must match; ${wavPaths[0]} has ${first.bitsPerSample}, ${wavPaths[i]} has ${fmt.bitsPerSample}`
      );
    }
  }
}

/**
 * Run WAV concat: validate all exist, validate uniformity, write concat list, run ffmpeg -f concat -safe 0 -i list -c copy output.
 * Output path is retained as intermediate artifact (Sprint 6B).
 */
export async function runWavConcat(params: WavConcatInput): Promise<void> {
  const { wavPaths, outputPath, ffmpegPath } = params;
  if (wavPaths.length === 0) throw new Error("No WAV paths to concat");
  for (const p of wavPaths) {
    if (!existsSync(p)) throw new Error(`WAV file not found: ${p}`);
  }
  validateWavUniformity(wavPaths);
  mkdirSync(join(outputPath, ".."), { recursive: true });
  const listPath = outputPath.replace(/\.wav$/, "_list.txt");
  const listContent = wavPaths
    .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
    .join("\n");
  writeFileSync(listPath, listContent, "utf-8");
  const args = ["-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outputPath];
  await runFfmpeg(ffmpegPath, args);
}
