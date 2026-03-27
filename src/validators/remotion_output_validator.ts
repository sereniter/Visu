import { spawn } from "node:child_process";

export interface RemotionProbeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  pix_fmt?: string;
  r_frame_rate?: string;
  time_base?: string;
  profile?: string;
  color_space?: string;
  color_range?: string;
}

export interface RemotionProbeResult {
  streams: RemotionProbeStream[];
}

export function validateRemotionProbe(
  probe: RemotionProbeResult,
  options?: { expectAudio?: boolean },
): void {
  const video = probe.streams.find((s) => s.codec_type === "video");
  if (!video) {
    throw new Error("REMOTION_OUTPUT_PROFILE_MISMATCH: no video stream found");
  }

  const failures: Array<{ field: string; expected: unknown; actual: unknown }> = [];

  const checks: Array<{ field: string; expected: unknown; actual: unknown }> = [
    { field: "codec_name", expected: "h264", actual: video.codec_name },
    { field: "profile", expected: "High", actual: video.profile },
    { field: "width", expected: 1920, actual: video.width },
    { field: "height", expected: 1080, actual: video.height },
    { field: "pix_fmt", expected: "yuv420p", actual: video.pix_fmt },
    { field: "r_frame_rate", expected: "30/1", actual: video.r_frame_rate },
    {
      field: "color_range",
      expected: "tv",
      actual: video.color_range ?? "tv",
    },
  ];

  for (const check of checks) {
    if (String(check.actual) !== String(check.expected)) {
      failures.push(check);
    }
  }

  const audioStreams = probe.streams.filter((s) => s.codec_type === "audio").length;
  const expectedAudio = options?.expectAudio === true ? 1 : 0;
  if (audioStreams !== expectedAudio) {
    failures.push({ field: "audio_streams", expected: expectedAudio, actual: audioStreams });
  }

  if (failures.length > 0) {
    throw new Error(
      `REMOTION_OUTPUT_PROFILE_MISMATCH: ${JSON.stringify(
        failures,
      )}`,
    );
  }
}

export function ffprobeRemotionOutput(
  ffprobePath: string,
  outputPath: string,
): Promise<RemotionProbeResult> {
  return new Promise((resolve, reject) => {
    const args = [
      "-v",
      "error",
      "-show_streams",
      "-of",
      "json",
      outputPath,
    ];
    const proc = spawn(ffprobePath, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    proc.stdout?.on("data", (chunk: Buffer) => {
      out += chunk.toString();
    });
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe exited ${code}`));
        return;
      }
      try {
        const json = JSON.parse(out) as RemotionProbeResult;
        resolve(json);
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
    proc.on("error", (err) => {
      reject(err);
    });
  });
}

