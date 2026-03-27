import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  validateRecordedVideo,
  runFfprobeJson,
  type FfprobeOutput,
} from "../src/adapters/recorded_adapter.js";

describe("validateRecordedVideo", () => {
  it("rejects when file does not exist", async () => {
    const result = await validateRecordedVideo("ffprobe", "/nonexistent/video.mp4");
    expect(result.valid).toBe(false);
    expect("error" in result && result.error).toContain("does not exist");
  });

  it("rejects when container is not MP4", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "visu-rec-"));
    const videoPath = join(tmp, "input.webm");
    writeFileSync(videoPath, "fake webm");

    const runFfprobe = async (): Promise<FfprobeOutput> => ({
      format: { format_name: "matroska,webm", duration: "5.0" },
      streams: [{ codec_type: "video", codec_name: "vp8", width: 1920, height: 1080 }],
    });

    const result = await validateRecordedVideo("ffprobe", videoPath, runFfprobe);
    expect(result.valid).toBe(false);
    expect("error" in result && result.error).toMatch(/not MP4|unknown/);
  });

  it("rejects when no video stream", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "visu-rec-"));
    const videoPath = join(tmp, "audio_only.mp4");
    writeFileSync(videoPath, "fake");

    const runFfprobe = async (): Promise<FfprobeOutput> => ({
      format: { format_name: "mov,mp4,m4a", duration: "3.0" },
      streams: [{ codec_type: "audio", codec_name: "aac" }],
    });

    const result = await validateRecordedVideo("ffprobe", videoPath, runFfprobe);
    expect(result.valid).toBe(false);
    expect("error" in result && result.error).toContain("No video stream");
  });

  it("rejects when duration is zero", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "visu-rec-"));
    const videoPath = join(tmp, "zero.mp4");
    writeFileSync(videoPath, "fake");

    const runFfprobe = async (): Promise<FfprobeOutput> => ({
      format: { format_name: "mov,mp4,m4a", duration: "0" },
      streams: [{ codec_type: "video", codec_name: "h264", width: 1920, height: 1080 }],
    });

    const result = await validateRecordedVideo("ffprobe", videoPath, runFfprobe);
    expect(result.valid).toBe(false);
    expect("error" in result && result.error).toMatch(/duration|zero|invalid/);
  });

  it("returns valid with durationMs, videoCodec, resolution when valid MP4", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "visu-rec-"));
    const videoPath = join(tmp, "valid.mp4");
    writeFileSync(videoPath, "fake");

    const runFfprobe = async (): Promise<FfprobeOutput> => ({
      format: { format_name: "mov,mp4,m4a", duration: "4.5" },
      streams: [{ codec_type: "video", codec_name: "h264", width: 1280, height: 720 }],
    });

    const result = await validateRecordedVideo("ffprobe", videoPath, runFfprobe);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.durationMs).toBe(4500);
      expect(result.videoCodec).toBe("h264");
      expect(result.width).toBe(1280);
      expect(result.height).toBe(720);
    }
  });
});

describe("runFfprobeJson", () => {
  it("rejects when ffprobe exits non-zero", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "visu-rec-"));
    const badPath = join(tmp, "not-video.txt");
    writeFileSync(badPath, "not a video");

    await expect(runFfprobeJson("ffprobe", badPath)).rejects.toThrow();
  });
});
