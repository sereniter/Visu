import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runRecordedMode, type ValidateRecordedVideoFn } from "../src/engines/recorded_mode_engine.js";
import { createLogger } from "../src/core/logger.js";
import { LOG_SCHEMA_VERSION, type RunContext } from "../src/core/run_context.js";
import { MockFFmpegAdapter } from "./mocks/mock_ffmpeg_adapter.js";
import type { ITTSAdapter, TTSRequest, TTSResponse } from "../src/core/tts_interface.js";

function createPcmWav(
  durationSeconds: number,
  sampleRate: number,
  numChannels: number,
  bitsPerSample: number
): Buffer {
  const bytesPerSample = bitsPerSample / 8;
  const totalSamples = Math.floor(durationSeconds * sampleRate);
  const dataSize = totalSamples * numChannels * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0, 4, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, 4, "ascii");
  buffer.write("fmt ", 12, 4, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  const byteRate = sampleRate * numChannels * bytesPerSample;
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(numChannels * bytesPerSample, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36, 4, "ascii");
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

/** TTS adapter that writes a real WAV so runAvMerge can read duration. */
class WavWritingTTSAdapter implements ITTSAdapter {
  async synthesize(request: TTSRequest): Promise<TTSResponse> {
    const audioPath = join(request.outputDir, "narration.wav");
    mkdirSync(request.outputDir, { recursive: true });
    const wav = createPcmWav(4.8, 48000, 1, 16);
    writeFileSync(audioPath, wav);
    return {
      audioPath,
      durationMs: 4800,
      provider: "mock",
      voiceId: request.voice,
      modelHash: "mock-hash",
      engineVersion: "1.0",
    };
  }
}

describe("runRecordedMode", () => {
  it("runs full sequence: validate video → script → narration → AV merge", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "visu-rec-"));
    const videoPath = join(tmp, "input.mp4");
    const scriptPath = join(tmp, "script.json");
    writeFileSync(videoPath, "fake mp4");
    writeFileSync(
      scriptPath,
      JSON.stringify({ version: "1.0", language: "te", text: "Test." })
    );

    const logPath = join(tmp, "log.ndjson");
    const logger = createLogger("rec-1", logPath);
    const context: RunContext = {
      runId: "rec-1",
      startedAt: new Date().toISOString(),
      environment: { nodeVersion: process.version },
      execution: { mode: "recorded", inputId: scriptPath, inputVersion: "1.0" },
      language: "te",
      versions: { logSchema: LOG_SCHEMA_VERSION },
      artifacts: {},
      status: "running",
    };

    const validateRecordedVideoFn: ValidateRecordedVideoFn = async () => ({
      valid: true,
      durationMs: 5000,
      videoCodec: "h264",
      width: 1920,
      height: 1080,
    });

    const ffmpegAdapter = new MockFFmpegAdapter();
    ffmpegAdapter.videoDurationMs = 5000;

    const result = await runRecordedMode({
      videoPath,
      scriptPath,
      context,
      logger,
      ffmpegAdapter,
      ttsAdapter: new WavWritingTTSAdapter(),
      validateRecordedVideoFn,
    });

    expect(result.status).toBe("completed");
    expect(result.artifacts.finalVideoPath).toBeDefined();
    expect(result.artifacts.metadataPath).toBeDefined();
    expect(result.artifacts.narrationPath).toBeDefined();
    expect(ffmpegAdapter.transcodeCalls.length).toBe(1);
  });

  it("fails when video validation returns invalid", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "visu-rec-"));
    const videoPath = join(tmp, "input.mp4");
    const scriptPath = join(tmp, "script.json");
    writeFileSync(videoPath, "fake");
    writeFileSync(
      scriptPath,
      JSON.stringify({ version: "1.0", language: "te", text: "Test." })
    );

    const logPath = join(tmp, "log.ndjson");
    const logger = createLogger("rec-2", logPath);
    const context: RunContext = {
      runId: "rec-2",
      startedAt: new Date().toISOString(),
      environment: { nodeVersion: process.version },
      execution: { mode: "recorded", inputId: scriptPath, inputVersion: "1.0" },
      language: "te",
      versions: { logSchema: LOG_SCHEMA_VERSION },
      artifacts: {},
      status: "running",
    };

    const validateRecordedVideoFn: ValidateRecordedVideoFn = async () => ({
      valid: false,
      error: "Container is not MP4",
    });

    await expect(
      runRecordedMode({
        videoPath,
        scriptPath,
        context,
        logger,
        ffmpegAdapter: new MockFFmpegAdapter(),
        ttsAdapter: new WavWritingTTSAdapter(),
        validateRecordedVideoFn,
      })
    ).rejects.toThrow(/Input video validation failed/);
  });

  it("fails when script is invalid", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "visu-rec-"));
    const videoPath = join(tmp, "input.mp4");
    const scriptPath = join(tmp, "script.json");
    writeFileSync(videoPath, "fake");
    writeFileSync(scriptPath, JSON.stringify({ invalid: "script" }));

    const logPath = join(tmp, "log.ndjson");
    const logger = createLogger("rec-3", logPath);
    const context: RunContext = {
      runId: "rec-3",
      startedAt: new Date().toISOString(),
      environment: { nodeVersion: process.version },
      execution: { mode: "recorded", inputId: scriptPath, inputVersion: "1.0" },
      language: "te",
      versions: { logSchema: LOG_SCHEMA_VERSION },
      artifacts: {},
      status: "running",
    };

    const validateRecordedVideoFn: ValidateRecordedVideoFn = async () => ({
      valid: true,
      durationMs: 5000,
      videoCodec: "h264",
    });

    await expect(
      runRecordedMode({
        videoPath,
        scriptPath,
        context,
        logger,
        ffmpegAdapter: new MockFFmpegAdapter(),
        ttsAdapter: new WavWritingTTSAdapter(),
        validateRecordedVideoFn,
      })
    ).rejects.toThrow(/Script validation failed/);
  });
});
