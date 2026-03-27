import { describe, it, expect } from "vitest";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getWavDurationMs, getWavFormat } from "../src/core/wav_utils.js";

function createPcmWav(durationSeconds: number, sampleRate: number, numChannels: number, bitsPerSample: number): Buffer {
  const bytesPerSample = bitsPerSample / 8;
  const totalSamples = Math.floor(durationSeconds * sampleRate);
  const dataSize = totalSamples * numChannels * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0, 4, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, 4, "ascii");
  buffer.write("fmt ", 12, 4, "ascii");
  buffer.writeUInt32LE(16, 16); // PCM
  buffer.writeUInt16LE(1, 20); // audio format
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  const byteRate = sampleRate * numChannels * bytesPerSample;
  buffer.writeUInt32LE(byteRate, 28);
  const blockAlign = numChannels * bytesPerSample;
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36, 4, "ascii");
  buffer.writeUInt32LE(dataSize, 40);

  // data section is already zeroed
  return buffer;
}

describe("getWavDurationMs", () => {
  it("computes duration for a valid PCM WAV", () => {
    const dir = mkdtempSync(join(tmpdir(), "visu-wav-"));
    const file = join(dir, "test.wav");
    const buffer = createPcmWav(1, 48000, 1, 16); // 1 second
    writeFileSync(file, buffer);

    const duration = getWavDurationMs(file);
    expect(duration).toBeGreaterThanOrEqual(995);
    expect(duration).toBeLessThanOrEqual(1005);
  });
});

describe("getWavFormat", () => {
  it("returns sample rate and channel count from header", () => {
    const dir = mkdtempSync(join(tmpdir(), "visu-wav-"));
    const file = join(dir, "test.wav");
    const buffer = createPcmWav(0.5, 48000, 2, 16);
    writeFileSync(file, buffer);

    const format = getWavFormat(file);
    expect(format.sampleRate).toBe(48000);
    expect(format.numChannels).toBe(2);
    expect(format.bitsPerSample).toBe(16);
  });
});

