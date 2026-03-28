import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EncodingProfile } from "../src/core/config.js";
import {
  buildUiFlowNarrationWavPaths,
  getUiFlowTitleCardPadDurationSec,
  normalizeTimelineSegmentVideoForConcat,
} from "../src/engines/ui_flow_scene_engine.ts";
import { validateAvDrift } from "../src/validators/av_drift_validator.js";
import * as remotionProbe from "../src/validators/remotion_output_validator.js";
import * as ffmpegAdapter from "../src/adapters/ffmpeg_adapter.js";

const testProfile: EncodingProfile = {
  encoding_profile_version: "v1",
  video_codec: "libx264",
  pix_fmt: "yuv420p",
  profile: "high",
  preset: "medium",
  crf: 18,
  audio_codec: "aac",
  audio_sample_rate: 48000,
};

describe("buildUiFlowNarrationWavPaths", () => {
  const intro = "/n/intro.wav";
  const s1 = "/n/s1.wav";
  const s2 = "/n/s2.wav";
  const summary = "/n/sum.wav";
  const narr = [intro, s1, s2, summary];
  const trans = "/sounds/transition.wav";
  const pad = "/out/title_card_pad.wav";

  it("overlays on + transition: Option A order per scene boundary", () => {
    const w = buildUiFlowNarrationWavPaths({
      narrationPaths: narr,
      transitionPath: trans,
      useRemotionOverlays: true,
      titleCardPadPath: pad,
    });
    expect(w).toEqual([intro, trans, pad, s1, trans, pad, s2, trans, summary]);
  });

  it("overlays on without transition: pad before each scene speech only", () => {
    const w = buildUiFlowNarrationWavPaths({
      narrationPaths: narr,
      transitionPath: null,
      useRemotionOverlays: true,
      titleCardPadPath: pad,
    });
    expect(w).toEqual([intro, pad, s1, pad, s2, summary]);
  });

  it("overlays off + transition: legacy interleave", () => {
    const w = buildUiFlowNarrationWavPaths({
      narrationPaths: narr,
      transitionPath: trans,
      useRemotionOverlays: false,
      titleCardPadPath: null,
    });
    expect(w).toEqual([intro, trans, s1, trans, s2, trans, summary]);
  });

  it("overlays off + no transition: raw narrations", () => {
    expect(
      buildUiFlowNarrationWavPaths({
        narrationPaths: narr,
        transitionPath: null,
        useRemotionOverlays: false,
        titleCardPadPath: null,
      }),
    ).toEqual(narr);
  });
});

describe("getUiFlowTitleCardPadDurationSec", () => {
  it("matches TITLE_CARD_FRAMES / SCENE_FPS (2s at 30fps)", () => {
    expect(getUiFlowTitleCardPadDurationSec()).toBe(2);
  });
});

describe("validateAvDrift (Mode A post-concat shape)", () => {
  it("fails when narration exceeds stitched duration", () => {
    const r = validateAvDrift(10_000, 10_001, { maxDriftMs: null });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/exceeds video/);
  });

  it("passes when narration equals video with maxDriftMs null (no 200ms cap)", () => {
    expect(validateAvDrift(10_000, 10_000, { maxDriftMs: null }).valid).toBe(true);
  });

  it("allows large positive drift when maxDriftMs is null", () => {
    expect(validateAvDrift(15_000, 10_000, { maxDriftMs: null }).valid).toBe(true);
  });
});

describe("normalizeTimelineSegmentVideoForConcat", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns original path when an audio stream is present", async () => {
    vi.spyOn(remotionProbe, "ffprobeRemotionOutput").mockResolvedValue({
      streams: [{ codec_type: "video" }, { codec_type: "audio" }],
    });
    const getVideoStreamInfo = vi.fn();
    const adapter = {
      getFfprobePath: () => "/ffprobe",
      getFfmpegPath: () => "/ffmpeg",
      getVideoStreamInfo,
    };
    const out = await normalizeTimelineSegmentVideoForConcat({
      videoPath: "/final/clip.mp4",
      outputPath: "/out/0_intro_timeline_norm.mp4",
      adapter: adapter as import("../src/adapters/ffmpeg_adapter.js").FFmpegAdapterInterface,
      profile: testProfile,
    });
    expect(out).toBe("/final/clip.mp4");
    expect(getVideoStreamInfo).not.toHaveBeenCalled();
    expect(remotionProbe.ffprobeRemotionOutput).toHaveBeenCalledWith("/ffprobe", "/final/clip.mp4");
  });

  it("muxes when ffprobe shows video only", async () => {
    vi.spyOn(remotionProbe, "ffprobeRemotionOutput").mockResolvedValue({
      streams: [{ codec_type: "video" }],
    });
    const runFfmpeg = vi.spyOn(ffmpegAdapter, "runFfmpeg").mockResolvedValue(undefined);
    const adapter = {
      getFfprobePath: () => "/ffprobe",
      getFfmpegPath: () => "/ffmpeg",
      getVideoStreamInfo: vi.fn().mockResolvedValue({ durationMs: 5000 }),
    };
    const outPath = "/out/0_intro_timeline_norm.mp4";
    const out = await normalizeTimelineSegmentVideoForConcat({
      videoPath: "/segment/intro.mp4",
      outputPath: outPath,
      adapter: adapter as import("../src/adapters/ffmpeg_adapter.js").FFmpegAdapterInterface,
      profile: testProfile,
    });
    expect(out).toBe(outPath);
    expect(runFfmpeg).toHaveBeenCalled();
    expect(remotionProbe.ffprobeRemotionOutput).toHaveBeenCalledWith("/ffprobe", "/segment/intro.mp4");
  });
});
