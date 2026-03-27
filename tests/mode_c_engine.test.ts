import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LOG_SCHEMA_VERSION, type RunContext } from "../src/core/run_context.js";
import { createLogger } from "../src/core/logger.js";
import { runModeC } from "../src/engines/mode_c_engine.js";
import { runSceneRender } from "../src/engines/scene_render_engine.js";
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

const FIXTURE_ASSET = "tests/fixtures/mode_c_governed/test_12345_1.0.png";

vi.mock("../src/adapters/ffmpeg_adapter.js", async (importOriginal) => {
  const mod = (await importOriginal()) as {
    runFfmpeg: (path: string, args: string[]) => Promise<void>;
  };
  const { mkdirSync: fsMkdir, writeFileSync: fsWrite } = await import("node:fs");
  const { dirname } = await import("node:path");
  return {
    ...mod,
    runFfmpeg: vi.fn().mockImplementation(async (_path: string, args: string[]) => {
      const outPath = args[args.length - 1];
      if (outPath && typeof outPath === "string") {
        fsMkdir(dirname(outPath), { recursive: true });
        if (outPath.endsWith(".wav")) {
          const sampleRate = 48000;
          const durationSec = outPath.includes("narration_concat") ? 9.6 : 4.8;
          const dataSize = Math.floor(durationSec * sampleRate) * 2;
          const buf = Buffer.alloc(44 + dataSize);
          buf.write("RIFF", 0, 4, "ascii");
          buf.writeUInt32LE(36 + dataSize, 4);
          buf.write("WAVE", 8, 4, "ascii");
          buf.write("fmt ", 12, 4, "ascii");
          buf.writeUInt32LE(16, 16);
          buf.writeUInt16LE(1, 20);
          buf.writeUInt16LE(1, 22);
          buf.writeUInt32LE(sampleRate, 24);
          buf.writeUInt32LE(sampleRate * 2, 28);
          buf.writeUInt16LE(2, 32);
          buf.writeUInt16LE(16, 34);
          buf.write("data", 36, 4, "ascii");
          buf.writeUInt32LE(dataSize, 40);
          fsWrite(outPath, buf);
        } else {
          fsWrite(outPath, "mock output", "utf-8");
        }
      }
    }),
  };
});

vi.mock("../src/engines/scene_render_engine.js", () => ({
  runSceneRender: vi.fn(),
}));

vi.mock("../src/validators/language_registry_validator.js", () => ({
  validateLanguageRegistry: vi.fn().mockReturnValue({ valid: true, data: {} }),
  validateSceneLanguages: vi.fn(),
  computeModelHash: vi.fn().mockReturnValue("a".repeat(64)),
}));

describe("runModeC", () => {
  it("validates contract and fails on invalid schema or v1.0", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "visu-modec-"));
    const contractPath = join(tmp, "contract.json");
    writeFileSync(
      contractPath,
      JSON.stringify({ schema_version: "1.0", video_id: "v1" }),
      "utf-8"
    );
    const logger = createLogger("run-1", join(tmp, "log.ndjson"));
    const context: RunContext = {
      runId: "run-1",
      startedAt: new Date().toISOString(),
      environment: { nodeVersion: process.version },
      execution: { mode: "generative", inputId: contractPath, inputVersion: "1.0" },
      language: "te",
      versions: { logSchema: LOG_SCHEMA_VERSION },
      artifacts: {},
      status: "running",
    };

    await expect(
      runModeC({
        contractPath,
        context,
        logger,
        adapter: new MockFFmpegAdapter(),
      })
    ).rejects.toThrow(/Contract validation failed|Contract schema v1.0 is not supported|Migrate to v1\.1/);
  });

  it("rejects v1.1 contract with migration message", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "visu-modec-"));
    const contractPath = join(tmp, "contract.json");
    writeFileSync(
      contractPath,
      JSON.stringify({
        schema_version: "1.1",
        video_id: "v1",
        scenes: [
          {
            scene_id: "s1",
            duration_sec: 1,
            visual: {
              type: "governed_image",
              asset_path: "x.png",
              prompt_key: "k",
              seed: 1,
              model_version: "1.0",
            },
            narration: {
              text_template_key: "t",
              voice: "v",
              speed: 1,
            },
          },
        ],
      }),
      "utf-8"
    );
    const logger = createLogger("run-1", join(tmp, "log.ndjson"));
    const context: RunContext = {
      runId: "run-1",
      startedAt: new Date().toISOString(),
      environment: { nodeVersion: process.version },
      execution: { mode: "generative", inputId: contractPath, inputVersion: "1.3" },
      language: "te",
      versions: { logSchema: LOG_SCHEMA_VERSION },
      artifacts: {},
      status: "running",
    };

    await expect(
      runModeC({
        contractPath,
        context,
        logger,
        adapter: new MockFFmpegAdapter(),
      })
    ).rejects.toThrow(/Contract schema v1.1 is not supported|Migrate to v1.2/);
  });

  it("rejects v1.2 contract with migration message", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "visu-modec-"));
    const contractPath = join(tmp, "contract.json");
    writeFileSync(
      contractPath,
      JSON.stringify({
        schema_version: "1.2",
        video_id: "v1",
        scenes: [
          {
            scene_id: "s1",
            duration_sec: 1,
            visual: {
              type: "governed_image",
              asset_path: "x.png",
              prompt_key: "k",
              seed: 1,
              model_version: "1.0",
            },
            narration: {
              text_template_key: "t",
              language: "te",
              voice: "te_IN-venkatesh-medium",
              speed: 1,
            },
          },
        ],
      }),
      "utf-8"
    );
    const logger = createLogger("run-1", join(tmp, "log.ndjson"));
    const context: RunContext = {
      runId: "run-1",
      startedAt: new Date().toISOString(),
      environment: { nodeVersion: process.version },
      execution: { mode: "generative", inputId: contractPath, inputVersion: "1.3" },
      language: "te",
      versions: { logSchema: LOG_SCHEMA_VERSION },
      artifacts: {},
      status: "running",
    };

    await expect(
      runModeC({
        contractPath,
        context,
        logger,
        adapter: new MockFFmpegAdapter(),
      })
    ).rejects.toThrow(/Contract schema v1.2 is not supported|Migrate to v1.3/);
  });

  it("runs full flow with mock adapter and writes metadata with mode generative and sceneCount/maxDriftMs/avgDriftMs and scenes array", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "visu-modec-"));
    const runId = "run-modec-1";
    const artifactsDir = join(process.cwd(), "artifacts", runId);
    const scenesDir = join(artifactsDir, "scenes");
    mkdirSync(scenesDir, { recursive: true });
    const v1 = join(scenesDir, "scene_s1.mp4");
    const v2 = join(scenesDir, "scene_s2.mp4");
    const n1 = join(scenesDir, "scene_s1_narration.wav");
    const n2 = join(scenesDir, "scene_s2_narration.wav");
    writeFileSync(v1, "fake mp4");
    writeFileSync(v2, "fake mp4");
    const wav = createPcmWav(4.8, 48000, 1, 16);
    writeFileSync(n1, wav);
    writeFileSync(n2, wav);

    const contract = {
      schema_version: "1.4",
      video_id: "vid-1",
      topic: "test_topic",
      language: "te",
      scenes: [
        {
          scene_id: "s1",
          duration_sec: 4.8,
          visual: {
            type: "governed_image",
            asset_path: FIXTURE_ASSET,
            prompt_key: "test_scene",
            seed: 12345,
            model_version: "1.0",
          },
          narration: {
            text_template_key: "test_scene_narration",
            language: "te",
            voice_gender: "male",
            speed: 1.0,
          },
        },
        {
          scene_id: "s2",
          duration_sec: 4.8,
          visual: {
            type: "governed_image",
            asset_path: FIXTURE_ASSET,
            prompt_key: "test_scene",
            seed: 12345,
            model_version: "1.0",
          },
          narration: {
            text_template_key: "test_scene_narration",
            language: "te",
            voice_gender: "male",
            speed: 1.0,
          },
        },
      ],
    };
    const contractPath = join(tmp, "contract.json");
    writeFileSync(contractPath, JSON.stringify(contract), "utf-8");

    vi.mocked(runSceneRender).mockResolvedValue({
      sceneVideoPaths: [v1, v2],
      sceneNarrationPaths: [n1, n2],
      artifacts: [
        { scene_id: "s1", videoPath: v1, narrationPath: n1, narrationDurationMs: 4800, driftMs: 0 },
        { scene_id: "s2", videoPath: v2, narrationPath: n2, narrationDurationMs: 4800, driftMs: 0 },
      ],
    });

    const adapter = new MockFFmpegAdapter();
    adapter.videoDurationMs = 9600;
    adapter.videoStreamInfo = {
      durationMs: 4800,
      codec_name: "h264",
      width: 1920,
      height: 1080,
      pix_fmt: "yuv420p",
      fps: 30,
      format_name: "mov,mp4,m4a,3gp,3g2,mj2",
    };

    const logger = createLogger(runId, join(tmp, "log.ndjson"));
    const context: RunContext = {
      runId,
      startedAt: new Date().toISOString(),
      environment: { nodeVersion: process.version },
      execution: { mode: "generative", inputId: contractPath, inputVersion: "1.3" },
      language: "te",
      versions: { logSchema: LOG_SCHEMA_VERSION },
      artifacts: {},
      status: "running",
    };

    const result = await runModeC({
      contractPath,
      context,
      logger,
      adapter,
    });

    expect(result.status).toBe("completed");
    expect(result.artifacts.finalVideoPath).toMatch(/final\.mp4$/);
    expect(result.artifacts.metadataPath).toMatch(/media_metadata\.json$/);

    const metadataPath = result.artifacts.metadataPath ?? "";
    const { readFileSync } = await import("node:fs");
    const metadata = JSON.parse(readFileSync(metadataPath, "utf-8"));
    expect(metadata.mode).toBe("generative");
    expect(metadata.sceneCount).toBe(2);
    expect(metadata.maxDriftMs).toBeDefined();
    expect(metadata.avgDriftMs).toBeDefined();
    expect(metadata.sourceVideoPath).toMatch(/stitched_video\.mp4$/);
    expect(metadata.narrationPath).toMatch(/narration_concat\.wav$/);
    expect(Array.isArray(metadata.scenes)).toBe(true);
    expect(metadata.scenes).toHaveLength(2);
    expect(metadata.language).toBe("te");
    expect(metadata.voiceId).toBe("te_IN-venkatesh-medium");
    expect(metadata.scenes?.[0]?.language).toBe("te");
  });

  it("fails deterministically when narration WAVs have wrong sample rate (no implicit resample)", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "visu-modec-"));
    const runId = "run-modec-uniformity";
    const artifactsDir = join(process.cwd(), "artifacts", runId);
    const scenesDir = join(artifactsDir, "scenes");
    mkdirSync(scenesDir, { recursive: true });
    const n1 = join(scenesDir, "scene_s1_narration.wav");
    const n2 = join(scenesDir, "scene_s2_narration.wav");
    writeFileSync(n1, createPcmWav(4.8, 44100, 1, 16));
    writeFileSync(n2, createPcmWav(4.8, 48000, 1, 16));
    const v1 = join(scenesDir, "scene_s1.mp4");
    const v2 = join(scenesDir, "scene_s2.mp4");
    writeFileSync(v1, "fake");
    writeFileSync(v2, "fake");

    vi.mocked(runSceneRender).mockResolvedValue({
      sceneVideoPaths: [v1, v2],
      sceneNarrationPaths: [n1, n2],
      artifacts: [
        { scene_id: "s1", videoPath: v1, narrationPath: n1, narrationDurationMs: 4800, driftMs: 0 },
        { scene_id: "s2", videoPath: v2, narrationPath: n2, narrationDurationMs: 4800, driftMs: 0 },
      ],
    });

    const contract = {
      schema_version: "1.4",
      video_id: "vid-1",
      topic: "test_topic",
      language: "te",
      scenes: [
        {
          scene_id: "s1",
          duration_sec: 4.8,
          visual: { type: "governed_image", asset_path: FIXTURE_ASSET, prompt_key: "test_scene", seed: 12345, model_version: "1.0" },
          narration: { text_template_key: "test_scene_narration", language: "te", voice_gender: "male", speed: 1.0 },
        },
        {
          scene_id: "s2",
          duration_sec: 4.8,
          visual: { type: "governed_image", asset_path: FIXTURE_ASSET, prompt_key: "test_scene", seed: 12345, model_version: "1.0" },
          narration: { text_template_key: "test_scene_narration", language: "te", voice_gender: "male", speed: 1.0 },
        },
      ],
    };
    const contractPath = join(tmp, "contract.json");
    writeFileSync(contractPath, JSON.stringify(contract), "utf-8");

    const adapter = new MockFFmpegAdapter();
    adapter.videoStreamInfo = {
      durationMs: 4800,
      codec_name: "h264",
      width: 1920,
      height: 1080,
      pix_fmt: "yuv420p",
      fps: 30,
      format_name: "mov,mp4,m4a,3gp,3g2,mj2",
    };
    const logger = createLogger(runId, join(tmp, "log.ndjson"));
    const context: RunContext = {
      runId,
      startedAt: new Date().toISOString(),
      environment: { nodeVersion: process.version },
      execution: { mode: "generative", inputId: contractPath, inputVersion: "1.3" },
      language: "te",
      versions: { logSchema: LOG_SCHEMA_VERSION },
      artifacts: {},
      status: "running",
    };

    await expect(
      runModeC({ contractPath, context, logger, adapter })
    ).rejects.toThrow(/48000 Hz|44100/);
  });
});
