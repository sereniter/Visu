import { describe, expect, it } from "vitest";
import {
  type RemotionProbeResult,
  validateRemotionProbe,
} from "../src/validators/remotion_output_validator.js";

describe("validateRemotionProbe", () => {
  it("accepts a probe matching the locked encoding profile", () => {
    const probe: RemotionProbeResult = {
      streams: [
        {
          codec_type: "video",
          codec_name: "h264",
          width: 1920,
          height: 1080,
          pix_fmt: "yuv420p",
          r_frame_rate: "30/1",
          time_base: "1/30",
          profile: "High",
          color_space: "bt709",
          color_range: "tv",
        },
      ],
    };

    expect(() => validateRemotionProbe(probe)).not.toThrow();
  });

  it("rejects when codec, resolution, or pix_fmt do not match", () => {
    const probe: RemotionProbeResult = {
      streams: [
        {
          codec_type: "video",
          codec_name: "vp9",
          width: 1280,
          height: 720,
          pix_fmt: "yuv444p",
          r_frame_rate: "60/1",
          time_base: "1/60",
        },
      ],
    };

    expect(() => validateRemotionProbe(probe)).toThrowError(
      /REMOTION_OUTPUT_PROFILE_MISMATCH/,
    );
  });

  it("rejects when audio streams are present", () => {
    const probe: RemotionProbeResult = {
      streams: [
        {
          codec_type: "video",
          codec_name: "h264",
          width: 1920,
          height: 1080,
          pix_fmt: "yuv420p",
          r_frame_rate: "30/1",
          time_base: "1/30",
          profile: "High",
          color_space: "bt709",
          color_range: "tv",
        },
        {
          codec_type: "audio",
          codec_name: "aac",
        },
      ],
    };

    expect(() => validateRemotionProbe(probe)).toThrowError(
      /REMOTION_OUTPUT_PROFILE_MISMATCH/,
    );
  });

});

