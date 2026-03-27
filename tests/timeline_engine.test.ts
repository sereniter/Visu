import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MockFFmpegAdapter } from "./mocks/mock_ffmpeg_adapter.js";

vi.mock("../src/adapters/ffmpeg_adapter.js", async (importOriginal) => {
  const mod = await importOriginal() as { runFfmpeg: (path: string, args: string[]) => Promise<void> };
  return {
    ...mod,
    runFfmpeg: vi.fn().mockResolvedValue(undefined),
  };
});

const { runTimeline } = await import("../src/engines/timeline_engine.js");
const { createLogger } = await import("../src/core/logger.js");

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

describe("runTimeline", () => {
  it("produces stitched_video.mp4 and returns sceneProbes (multi-scene)", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "visu-timeline-"));
    const v1 = join(tmp, "v1.mp4");
    const v2 = join(tmp, "v2.mp4");
    const n1 = join(tmp, "n1.wav");
    const n2 = join(tmp, "n2.wav");
    writeFileSync(v1, "fake mp4 1");
    writeFileSync(v2, "fake mp4 2");
    const wav = createPcmWav(4.8, 48000, 1, 16);
    writeFileSync(n1, wav);
    writeFileSync(n2, wav);

    const adapter = new MockFFmpegAdapter();
    adapter.videoDurationMs = 4800;
    adapter.videoStreamInfo = {
      durationMs: 4800,
      codec_name: "h264",
      width: 1920,
      height: 1080,
      pix_fmt: "yuv420p",
      fps: 30,
      format_name: "mov,mp4,m4a,3gp,3g2,mj2",
    };

    const ffmpegMod = await import("../src/adapters/ffmpeg_adapter.js");
    const runFfmpegSpy = vi.mocked(ffmpegMod.runFfmpeg);

    const result = await runTimeline({
      scenes: [
        { video_path: v1, narration_path: n1 },
        { video_path: v2, narration_path: n2 },
      ],
      outputDir: join(tmp, "out"),
      adapter,
      logger: createLogger("run-1", join(tmp, "log.ndjson")),
    });

    expect(result.stitchedVideoPath).toMatch(/stitched_video\.mp4$/);
    expect(result.totalDurationMs).toBe(9600);
    expect(result.sceneProbes).toHaveLength(2);
    expect(runFfmpegSpy).toHaveBeenCalledTimes(1);
    const concatArgs = runFfmpegSpy.mock.calls[0]?.[1] ?? [];
    expect(concatArgs).toContain("-f");
    expect(concatArgs).toContain("concat");
    expect(concatArgs).toContain("-c");
    expect(concatArgs).toContain("copy");
  });

  it("single-pass ffprobe: getVideoStreamInfo called once per scene", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "visu-timeline-"));
    const v1 = join(tmp, "v1.mp4");
    const v2 = join(tmp, "v2.mp4");
    const n1 = join(tmp, "n1.wav");
    const n2 = join(tmp, "n2.wav");
    writeFileSync(v1, "fake");
    writeFileSync(v2, "fake");
    const wav = createPcmWav(2, 48000, 1, 16);
    writeFileSync(n1, wav);
    writeFileSync(n2, wav);

    const adapter = new MockFFmpegAdapter();
    adapter.videoStreamInfo = {
      durationMs: 2000,
      codec_name: "h264",
      width: 1920,
      height: 1080,
      pix_fmt: "yuv420p",
      fps: 30,
      format_name: "mov,mp4,m4a,3gp,3g2,mj2",
    };
    const getVideoStreamInfoSpy = vi.spyOn(adapter, "getVideoStreamInfo");

    await runTimeline({
      scenes: [
        { video_path: v1, narration_path: n1 },
        { video_path: v2, narration_path: n2 },
      ],
      outputDir: join(tmp, "out"),
      adapter,
    });

    expect(getVideoStreamInfoSpy).toHaveBeenCalledTimes(2);
    expect(getVideoStreamInfoSpy).toHaveBeenCalledWith(v1);
    expect(getVideoStreamInfoSpy).toHaveBeenCalledWith(v2);
  });

  it("uniformity gate — codec mismatch throws", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "visu-timeline-"));
    const v1 = join(tmp, "v1.mp4");
    const v2 = join(tmp, "v2.mp4");
    const n1 = join(tmp, "n1.wav");
    const n2 = join(tmp, "n2.wav");
    writeFileSync(v1, "fake");
    writeFileSync(v2, "fake");
    const wav = createPcmWav(2, 48000, 1, 16);
    writeFileSync(n1, wav);
    writeFileSync(n2, wav);

    const adapter = new MockFFmpegAdapter();
    adapter.getVideoStreamInfo = vi.fn()
      .mockResolvedValueOnce({
        durationMs: 2000,
        codec_name: "h264",
        width: 1920,
        height: 1080,
        pix_fmt: "yuv420p",
        fps: 30,
        format_name: "mov,mp4,m4a,3gp,3g2,mj2",
      })
      .mockResolvedValueOnce({
        durationMs: 2000,
        codec_name: "hevc",
        width: 1920,
        height: 1080,
        pix_fmt: "yuv420p",
        fps: 30,
        format_name: "mov,mp4,m4a,3gp,3g2,mj2",
      });

    await expect(
      runTimeline({
        scenes: [
          { video_path: v1, narration_path: n1 },
          { video_path: v2, narration_path: n2 },
        ],
        outputDir: join(tmp, "out"),
        adapter,
      })
    ).rejects.toThrow(/uniformity|codec mismatch/);
  });

  it("uniformity gate — framerate 29.97 vs 30.0 passes (within ±0.1)", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "visu-timeline-"));
    const v1 = join(tmp, "v1.mp4");
    const v2 = join(tmp, "v2.mp4");
    const n1 = join(tmp, "n1.wav");
    const n2 = join(tmp, "n2.wav");
    writeFileSync(v1, "fake");
    writeFileSync(v2, "fake");
    const wav = createPcmWav(2, 48000, 1, 16);
    writeFileSync(n1, wav);
    writeFileSync(n2, wav);

    const adapter = new MockFFmpegAdapter();
    adapter.getVideoStreamInfo = vi.fn()
      .mockResolvedValueOnce({
        durationMs: 2000,
        codec_name: "h264",
        width: 1920,
        height: 1080,
        pix_fmt: "yuv420p",
        fps: 29.97,
        format_name: "mov,mp4,m4a,3gp,3g2,mj2",
      })
      .mockResolvedValueOnce({
        durationMs: 2000,
        codec_name: "h264",
        width: 1920,
        height: 1080,
        pix_fmt: "yuv420p",
        fps: 30,
        format_name: "mov,mp4,m4a,3gp,3g2,mj2",
      });

    const result = await runTimeline({
      scenes: [
        { video_path: v1, narration_path: n1 },
        { video_path: v2, narration_path: n2 },
      ],
      outputDir: join(tmp, "out"),
      adapter,
    });
    expect(result.stitchedVideoPath).toBeDefined();
  });

  it("uniformity gate — 24fps vs 30fps throws", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "visu-timeline-"));
    const v1 = join(tmp, "v1.mp4");
    const v2 = join(tmp, "v2.mp4");
    const n1 = join(tmp, "n1.wav");
    const n2 = join(tmp, "n2.wav");
    writeFileSync(v1, "fake");
    writeFileSync(v2, "fake");
    const wav = createPcmWav(2, 48000, 1, 16);
    writeFileSync(n1, wav);
    writeFileSync(n2, wav);

    const adapter = new MockFFmpegAdapter();
    adapter.getVideoStreamInfo = vi.fn()
      .mockResolvedValueOnce({
        durationMs: 2000,
        codec_name: "h264",
        width: 1920,
        height: 1080,
        pix_fmt: "yuv420p",
        fps: 24,
        format_name: "mov,mp4,m4a,3gp,3g2,mj2",
      })
      .mockResolvedValueOnce({
        durationMs: 2000,
        codec_name: "h264",
        width: 1920,
        height: 1080,
        pix_fmt: "yuv420p",
        fps: 30,
        format_name: "mov,mp4,m4a,3gp,3g2,mj2",
      });

    await expect(
      runTimeline({
        scenes: [
          { video_path: v1, narration_path: n1 },
          { video_path: v2, narration_path: n2 },
        ],
        outputDir: join(tmp, "out"),
        adapter,
      })
    ).rejects.toThrow(/uniformity|framerate/);
  });

  it("per-scene drift — narration > video throws", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "visu-timeline-"));
    const v1 = join(tmp, "v1.mp4");
    const n1 = join(tmp, "n1.wav");
    writeFileSync(v1, "fake");
    const wav = createPcmWav(6, 48000, 1, 16);
    writeFileSync(n1, wav);

    const adapter = new MockFFmpegAdapter();
    adapter.videoStreamInfo = {
      durationMs: 5000,
      codec_name: "h264",
      width: 1920,
      height: 1080,
      pix_fmt: "yuv420p",
      fps: 30,
      format_name: "mov,mp4,m4a,3gp,3g2,mj2",
    };

    await expect(
      runTimeline({
        scenes: [{ video_path: v1, narration_path: n1 }],
        outputDir: join(tmp, "out"),
        adapter,
      })
    ).rejects.toThrow(/drift|exceeds video duration/);
  });

  it("per-scene drift — delta > 200ms throws", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "visu-timeline-"));
    const v1 = join(tmp, "v1.mp4");
    const n1 = join(tmp, "n1.wav");
    writeFileSync(v1, "fake");
    const wav = createPcmWav(2, 48000, 1, 16);
    writeFileSync(n1, wav);

    const adapter = new MockFFmpegAdapter();
    adapter.videoStreamInfo = {
      durationMs: 3000,
      codec_name: "h264",
      width: 1920,
      height: 1080,
      pix_fmt: "yuv420p",
      fps: 30,
      format_name: "mov,mp4,m4a,3gp,3g2,mj2",
    };

    await expect(
      runTimeline({
        scenes: [{ video_path: v1, narration_path: n1 }],
        outputDir: join(tmp, "out"),
        adapter,
      })
    ).rejects.toThrow(/drift|200ms/);
  });

  it("throws when scene video path does not exist", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "visu-timeline-"));
    const n1 = join(tmp, "n1.wav");
    const wav = createPcmWav(2, 48000, 1, 16);
    writeFileSync(n1, wav);

    const adapter = new MockFFmpegAdapter();

    await expect(
      runTimeline({
        scenes: [{ video_path: join(tmp, "nonexistent.mp4"), narration_path: n1 }],
        outputDir: join(tmp, "out"),
        adapter,
      })
    ).rejects.toThrow(/does not exist/);
  });
});
