import { writeFileSync } from "node:fs";
import type {
  FFmpegAdapterInterface,
  VideoStreamInfo,
  ImageDimensions,
} from "../../src/adapters/ffmpeg_adapter.js";
import type { EncodingProfile } from "../../src/core/config.js";

export class MockFFmpegAdapter implements FFmpegAdapterInterface {
  public version = "6.1.1";
  public videoDurationMs = 5000;
  public transcodeCalls: string[][] = [];
  /** Override for Mode C / timeline tests. */
  public videoStreamInfo: VideoStreamInfo = {
    durationMs: 5000,
    codec_name: "h264",
    width: 1920,
    height: 1080,
    pix_fmt: "yuv420p",
    fps: 30,
    format_name: "mov,mp4,m4a,3gp,3g2,mj2",
  };

  async checkVersion(): Promise<{ version: string }> {
    return { version: this.version };
  }

  async getVersionBuildconfAndFingerprint(): Promise<{
    versionFull: string;
    buildconf: string;
    fingerprint: string;
  }> {
    return {
      versionFull: `ffmpeg version ${this.version}`,
      buildconf: "--enable-libx264",
      fingerprint: "mock-ffmpeg-fingerprint-sha256",
    };
  }

  getFfmpegPath(): string {
    return "ffmpeg";
  }

  getFfprobePath(): string {
    return "ffprobe";
  }

  async getVideoDurationMs(videoPath: string): Promise<number> {
    void videoPath;
    return this.videoDurationMs;
  }

  async getVideoStreamInfo(videoPath: string): Promise<VideoStreamInfo> {
    void videoPath;
    return this.videoStreamInfo;
  }

  async getImageDimensions(imagePath: string): Promise<ImageDimensions> {
    void imagePath;
    return { width: 1920, height: 1080 };
  }

  getSceneClipArgs(params: {
    assetPath: string;
    durationSec: number;
    outputPath: string;
  }): string[] {
    return [
      "-loop", "1", "-i", params.assetPath,
      "-t", String(params.durationSec),
      "-r", "30", "-c:v", "libx264",
      "-preset", "medium", "-profile:v", "high",
      "-pix_fmt", "yuv420p", "-crf", "18",
      params.outputPath,
    ];
  }

  getTranscodeArgs(params: {
    rawVideoPath: string;
    narrationPath: string;
    musicPath: string | null;
    outputPath: string;
    profile: EncodingProfile;
    videoDurationSec?: number;
  }): string[] {
    return [
      "-i",
      params.rawVideoPath,
      "-i",
      params.narrationPath,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "libx264",
      params.outputPath,
    ];
  }

  async runTranscode(args: string[]): Promise<void> {
    this.transcodeCalls.push([...args]);
    const outputPath = args[args.length - 1];
    if (outputPath && typeof outputPath === "string") {
      writeFileSync(outputPath, "mock final mp4 content", "utf-8");
    }
  }
}
