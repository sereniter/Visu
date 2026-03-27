import { readFileSync } from "node:fs";

/** Parsed WAV format from header (PCM only). Used for uniformity check before concat. */
export interface WavFormat {
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
}

function parseWavHeader(path: string): { format: WavFormat; dataChunkSize: number } {
  const header = readFileSync(path);
  if (header.length < 44) {
    throw new Error("Invalid WAV file: header too short");
  }
  if (header.toString("ascii", 0, 4) !== "RIFF" || header.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Invalid WAV file: missing RIFF/WAVE header");
  }
  const fmtChunkId = header.toString("ascii", 12, 16);
  if (fmtChunkId !== "fmt ") {
    throw new Error("Invalid WAV file: missing fmt chunk");
  }
  const audioFormat = header.readUInt16LE(20);
  const numChannels = header.readUInt16LE(22);
  const sampleRate = header.readUInt32LE(24);
  const bitsPerSample = header.readUInt16LE(34);
  if (audioFormat !== 1) {
    throw new Error("Unsupported WAV format: only PCM (format 1) is supported");
  }
  if (numChannels === 0 || sampleRate === 0 || bitsPerSample === 0) {
    throw new Error("Invalid WAV header: zero channel, sample rate, or bits per sample");
  }
  let dataOffset = 36;
  while (dataOffset + 8 <= header.length) {
    const chunkId = header.toString("ascii", dataOffset, dataOffset + 4);
    const chunkSize = header.readUInt32LE(dataOffset + 4);
    if (chunkId === "data") {
      return {
        format: { sampleRate, numChannels, bitsPerSample },
        dataChunkSize: chunkSize,
      };
    }
    dataOffset += 8 + chunkSize;
  }
  throw new Error("Invalid WAV file: data chunk not found");
}

/** Return sample rate and channel count for uniformity check (e.g. Mode C narration concat). */
export function getWavFormat(path: string): WavFormat {
  return parseWavHeader(path).format;
}

export function getWavDurationMs(path: string): number {
  const { format, dataChunkSize } = parseWavHeader(path);
  const bytesPerSample = format.bitsPerSample / 8;
  const totalSamples = dataChunkSize / (format.numChannels * bytesPerSample);
  const durationSeconds = totalSamples / format.sampleRate;
  return Math.round(durationSeconds * 1000);
}

