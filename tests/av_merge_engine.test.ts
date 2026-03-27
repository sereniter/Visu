import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAvMerge } from "../src/engines/av_merge_engine.js";
import { createLogger } from "../src/core/logger.js";
import { LOG_SCHEMA_VERSION, type RunContext } from "../src/core/run_context.js";
import { MockFFmpegAdapter } from "./mocks/mock_ffmpeg_adapter.js";

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

describe("runAvMerge", () => {
  it("runs full sequence and returns context with artifacts", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "visu-av-"));
    const rawPath = join(tmp, "raw.webm");
    const narrPath = join(tmp, "narration.wav");
    const outDir = join(tmp, "out");
    writeFileSync(rawPath, "fake webm");
    const wav = createPcmWav(4.8, 48000, 1, 16);
    writeFileSync(narrPath, wav);

    const logPath = join(tmp, "log.ndjson");
    const logger = createLogger("run-1", logPath);
    const context: RunContext = {
      runId: "run-1",
      startedAt: new Date().toISOString(),
      environment: { nodeVersion: process.version },
      execution: { mode: "narrate", inputId: "test", inputVersion: "1.0" },
      language: "te",
      versions: { logSchema: LOG_SCHEMA_VERSION },
      artifacts: {},
      status: "running",
    };

    const adapter = new MockFFmpegAdapter();
    adapter.videoDurationMs = 5000;

    const result = await runAvMerge({
      rawVideoPath: rawPath,
      narrationPath: narrPath,
      musicPath: null,
      outputDir: outDir,
      context,
      logger,
      adapter,
    });

    expect(result.status).toBe("completed");
    expect(result.artifacts.finalVideoPath).toBe(join(outDir, "final.mp4"));
    expect(result.artifacts.metadataPath).toBe(join(outDir, "media_metadata.json"));
    expect(result.environment.ffmpegVersion).toBe("6.1.1");
    expect(adapter.transcodeCalls.length).toBe(1);
  });

  it("fails when raw video path does not exist", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "visu-av-"));
    const narrPath = join(tmp, "narration.wav");
    writeFileSync(narrPath, createPcmWav(1, 48000, 1, 16));
    const logPath = join(tmp, "log.ndjson");
    const logger = createLogger("run-2", logPath);
    const context: RunContext = {
      runId: "run-2",
      startedAt: new Date().toISOString(),
      environment: { nodeVersion: process.version },
      execution: { mode: "narrate", inputId: "test", inputVersion: "1.0" },
      language: "te",
      versions: { logSchema: LOG_SCHEMA_VERSION },
      artifacts: {},
      status: "running",
    };
    const adapter = new MockFFmpegAdapter();

    await expect(
      runAvMerge({
        rawVideoPath: join(tmp, "nonexistent.webm"),
        narrationPath: narrPath,
        musicPath: null,
        outputDir: join(tmp, "out"),
        context,
        logger,
        adapter,
      })
    ).rejects.toThrow(/does not exist/);
  });
});
