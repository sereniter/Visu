import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateWavUniformity } from "../src/engines/wav_concat_engine.js";

function createPcmWav(
  durationSec: number,
  sampleRate: number,
  numChannels: number,
  bitsPerSample: number
): Buffer {
  const bytesPerSample = bitsPerSample / 8;
  const totalSamples = Math.floor(durationSec * sampleRate);
  const dataSize = totalSamples * numChannels * bytesPerSample;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0, 4, "ascii");
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8, 4, "ascii");
  buf.write("fmt ", 12, 4, "ascii");
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(numChannels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28);
  buf.writeUInt16LE(numChannels * bytesPerSample, 32);
  buf.writeUInt16LE(bitsPerSample, 34);
  buf.write("data", 36, 4, "ascii");
  buf.writeUInt32LE(dataSize, 40);
  return buf;
}

describe("validateWavUniformity", () => {
  it("passes when all WAVs are 48kHz PCM 16-bit same channels", () => {
    const tmp = mkdtempSync(join(tmpdir(), "wav-"));
    const w1 = join(tmp, "a.wav");
    const w2 = join(tmp, "b.wav");
    writeFileSync(w1, createPcmWav(1, 48000, 1, 16));
    writeFileSync(w2, createPcmWav(1, 48000, 1, 16));
    expect(() => validateWavUniformity([w1, w2])).not.toThrow();
  });

  it("throws on sample rate mismatch (48000 vs 44100)", () => {
    const tmp = mkdtempSync(join(tmpdir(), "wav-"));
    const w1 = join(tmp, "a.wav");
    const w2 = join(tmp, "b.wav");
    writeFileSync(w1, createPcmWav(1, 48000, 1, 16));
    writeFileSync(w2, createPcmWav(1, 44100, 1, 16));
    expect(() => validateWavUniformity([w1, w2])).toThrow(/48000 Hz|44100/);
  });

  it("throws on channel count mismatch", () => {
    const tmp = mkdtempSync(join(tmpdir(), "wav-"));
    const w1 = join(tmp, "a.wav");
    const w2 = join(tmp, "b.wav");
    writeFileSync(w1, createPcmWav(1, 48000, 1, 16));
    writeFileSync(w2, createPcmWav(1, 48000, 2, 16));
    expect(() => validateWavUniformity([w1, w2])).toThrow(/channel/);
  });

  it("throws when first WAV is not 48kHz", () => {
    const tmp = mkdtempSync(join(tmpdir(), "wav-"));
    const w1 = join(tmp, "a.wav");
    writeFileSync(w1, createPcmWav(1, 44100, 1, 16));
    expect(() => validateWavUniformity([w1])).toThrow(/48000 Hz/);
  });
});
