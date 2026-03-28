import { describe, it, expect } from "vitest";
import {
  buildTranscodeArgs,
  buildSceneClipArgs,
  parseFfmpegVersion,
  parseRFrameRate,
  fpsWithinTolerance,
  getKenBurnsArgs,
  getGradeArgs,
} from "../src/adapters/ffmpeg_adapter.js";
import type { GradesConfig } from "../src/engines/visual_style_resolver.js";
import type { EncodingProfile } from "../src/core/config.js";

const profile: EncodingProfile = {
  encoding_profile_version: "v1",
  video_codec: "libx264",
  pix_fmt: "yuv420p",
  profile: "high",
  preset: "medium",
  crf: 18,
  audio_codec: "aac",
  audio_sample_rate: 48000,
};

describe("buildTranscodeArgs", () => {
  it("produces deterministic argument array without music (snapshot)", () => {
    const args = buildTranscodeArgs({
      rawVideoPath: "/path/raw.webm",
      narrationPath: "/path/narration.wav",
      musicPath: null,
      outputPath: "/out/final.mp4",
      profile,
    });
    expect(args).toEqual([
      "-i",
      "/path/raw.webm",
      "-i",
      "/path/narration.wav",
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-map_metadata",
      "-1",
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-profile:v",
      "high",
      "-pix_fmt",
      "yuv420p",
      "-crf",
      "18",
      "-c:a",
      "aac",
      "-ar",
      "48000",
      "-movflags",
      "+faststart",
      "/out/final.mp4",
    ]);
  });

  it("produces deterministic argument array with music (snapshot)", () => {
    const args = buildTranscodeArgs({
      rawVideoPath: "/path/raw.webm",
      narrationPath: "/path/narration.wav",
      musicPath: "/path/music.wav",
      outputPath: "/out/final.mp4",
      profile,
    });
    expect(args[0]).toBe("-i");
    expect(args[1]).toBe("/path/raw.webm");
    expect(args[2]).toBe("-i");
    expect(args[3]).toBe("/path/narration.wav");
    expect(args[4]).toBe("-i");
    expect(args[5]).toBe("/path/music.wav");
    expect(args).toContain("-filter_complex");
    const fcIdx = args.indexOf("-filter_complex");
    expect(args[fcIdx + 1]).toMatch(/\[1:a\]volume=1\[a_narr\];\[2:a\]volume=/);
    expect(args).toContain("-map");
    expect(args).toContain("[mixed_audio]");
    expect(args[args.length - 1]).toBe("/out/final.mp4");
  });

  it("never includes -c:v copy", () => {
    const args = buildTranscodeArgs({
      rawVideoPath: "/a/raw.webm",
      narrationPath: "/a/narration.wav",
      musicPath: null,
      outputPath: "/b/final.mp4",
      profile,
    });
    const copyIdx = args.indexOf("copy");
    expect(copyIdx).toBe(-1);
  });

  it("never maps input audio (0:a) — original audio must not propagate to output", () => {
    const argsNoMusic = buildTranscodeArgs({
      rawVideoPath: "/path/raw.mp4",
      narrationPath: "/path/narration.wav",
      musicPath: null,
      outputPath: "/out/final.mp4",
      profile,
    });
    for (let i = 0; i < argsNoMusic.length; i++) {
      if (argsNoMusic[i] === "-map" && argsNoMusic[i + 1] === "0:a") {
        expect.fail("Transcode args must not include -map 0:a");
      }
    }
    const argsWithMusic = buildTranscodeArgs({
      rawVideoPath: "/path/raw.mp4",
      narrationPath: "/path/narration.wav",
      musicPath: "/path/music.wav",
      outputPath: "/out/final.mp4",
      profile,
    });
    for (let i = 0; i < argsWithMusic.length; i++) {
      if (argsWithMusic[i] === "-map" && argsWithMusic[i + 1] === "0:a") {
        expect.fail("Transcode args must not include -map 0:a");
      }
    }
  });

  it("with music + videoDurationSec uses loop/trim and duration=longest so music continues after narration", () => {
    const args = buildTranscodeArgs({
      rawVideoPath: "/path/raw.mp4",
      narrationPath: "/path/narration.wav",
      musicPath: "/path/music.wav",
      outputPath: "/out/final.mp4",
      profile,
      videoDurationSec: 65.5,
    });
    const fcIdx = args.indexOf("-filter_complex");
    const filter = args[fcIdx + 1];
    expect(filter).toMatch(/aloop=loop=-1/);
    expect(filter).toMatch(/atrim=duration=65\.5/);
    expect(filter).toMatch(/duration=longest/);
    expect(filter).toMatch(/volume=0\.15/);
  });

  it("when musicPath is null, uses direct narration map (no mixing filter)", () => {
    const args = buildTranscodeArgs({
      rawVideoPath: "/path/raw.mp4",
      narrationPath: "/path/narration.wav",
      musicPath: null,
      outputPath: "/out/final.mp4",
      profile,
    });
    expect(args).toContain("1:a:0");
    expect(args.join(" ")).not.toMatch(/amix|mixed_audio/);
  });
});

describe("parseFfmpegVersion", () => {
  it("extracts version from stderr", () => {
    const stderr = "ffmpeg version 6.1.1 Copyright (c) 2024...";
    expect(parseFfmpegVersion(stderr)).toBe("6.1.1");
  });

  it("extracts version from stdout-only builds (same line format)", () => {
    const stdout = "ffmpeg version 7.0-static Copyright (c) 2000-2024...";
    expect(parseFfmpegVersion(stdout)).toBe("7.0");
  });

  it("parse input is stdout || stderr, not both concatenated", () => {
    const onlyStdout = "ffmpeg version 5.2\n";
    const onlyStderr = "";
    expect(parseFfmpegVersion(onlyStdout.trim() || onlyStderr.trim())).toBe("5.2");
    const stderrBanner = "ffmpeg version 6.0-extra\n";
    expect(parseFfmpegVersion("".trim() || stderrBanner.trim())).toBe("6.0");
  });

  it("returns empty string when no match", () => {
    expect(parseFfmpegVersion("invalid")).toBe("");
    expect(parseFfmpegVersion("")).toBe("");
  });
});

describe("parseRFrameRate", () => {
  it("parses 30000/1001 to ~29.97", () => {
    expect(parseRFrameRate("30000/1001")).toBeCloseTo(29.97, 2);
  });

  it("parses 30/1 to 30", () => {
    expect(parseRFrameRate("30/1")).toBe(30);
  });

  it("throws on invalid format", () => {
    expect(() => parseRFrameRate("30")).toThrow(/Invalid r_frame_rate/);
  });
});

describe("fpsWithinTolerance", () => {
  it("29.97 vs 30.0 passes (within ±0.1)", () => {
    expect(fpsWithinTolerance(29.97, 30)).toBe(true);
  });

  it("24 vs 30 fails", () => {
    expect(fpsWithinTolerance(24, 30)).toBe(false);
  });
});

describe("buildSceneClipArgs", () => {
  it("produces deterministic scene clip argument array (locked profile, no audio)", () => {
    const args = buildSceneClipArgs({
      assetPath: "/path/image.png",
      durationSec: 8,
      outputPath: "/out/scene_s1.mp4",
      profile,
    });
    expect(args).toEqual([
      "-loop", "1",
      "-i", "/path/image.png",
      "-t", "8",
      "-r", "30",
      "-c:v", "libx264",
      "-preset", "medium",
      "-profile:v", "high",
      "-pix_fmt", "yuv420p",
      "-crf", "18",
      "/out/scene_s1.mp4",
    ]);
  });
});

describe("getKenBurnsArgs", () => {
  it("returns empty string when motion is null", () => {
    const result = getKenBurnsArgs(null, 5, 30);
    expect(result).toBe("");
  });

  it("clamps intensity > 0.35", () => {
    const result = getKenBurnsArgs(
      { type: "zoom_in", focus: "center", intensity: 0.5 },
      5,
      30,
    );
    expect(result).toContain("1+0.350");
  });

  it("clamps intensity < 0.05", () => {
    const result = getKenBurnsArgs(
      { type: "zoom_in", focus: "center", intensity: 0.01 },
      5,
      30,
    );
    expect(result).toContain("1+0.050");
  });

  it("uses left focus x expression", () => {
    const result = getKenBurnsArgs(
      { type: "zoom_in", focus: "left", intensity: 0.20 },
      10,
      30,
    );
    expect(result).toContain("x='0'");
  });

  it("computes consistent step for different durations", () => {
    const a = getKenBurnsArgs(
      { type: "zoom_in", focus: "center", intensity: 0.20 },
      5,
      30,
    );
    const b = getKenBurnsArgs(
      { type: "zoom_in", focus: "center", intensity: 0.20 },
      18,
      30,
    );
    const stepA = parseFloat(a.match(/zoom\+([0-9.]+)/)?.[1] ?? "0");
    const stepB = parseFloat(b.match(/zoom\+([0-9.]+)/)?.[1] ?? "0");
    expect(stepA * (5 * 30)).toBeCloseTo(stepB * (18 * 30), 5);
  });
});

describe("getGradeArgs", () => {
  const gradesConfig: GradesConfig = {
    schema_version: "1.0",
    grades: {
      cinematic_dark: {
        eq: "contrast=1.15",
        curves: "r='0/0 1/1'",
        vignette: "angle=PI/5:mode=backward",
        grain: "noise=alls=10:allf=t",
      },
      news_neutral: {
        eq: "contrast=1.08",
        curves: null,
        vignette: null,
        grain: null,
      },
    },
  };

  it("returns empty string when gradeName is null", () => {
    expect(getGradeArgs(null, gradesConfig)).toBe("");
  });

  it("throws on unknown grade", () => {
    expect(() => getGradeArgs("unknown", gradesConfig)).toThrow(/GRADE_UNKNOWN/);
  });

  it("assembles grade filters in correct order", () => {
    const result = getGradeArgs("cinematic_dark", gradesConfig);
    expect(result.startsWith("eq=")).toBe(true);
    expect(result).toContain("curves=");
    expect(result).toContain("vignette=");
    expect(result).toContain("noise=alls=10:allf=t");
  });

  it("omits null segments", () => {
    const result = getGradeArgs("news_neutral", gradesConfig);
    expect(result).toContain("eq=contrast=1.08");
    expect(result).not.toContain("curves=");
    expect(result).not.toContain("vignette=");
    expect(result).not.toContain("noise=");
  });
});
