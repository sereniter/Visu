import { spawn, type ChildProcess } from "node:child_process";

export interface ScreenCaptureAdapter {
  start(outputPath: string): Promise<void>;
  stop(): Promise<void>;
}

interface ScreenCaptureConfig {
  videoDevice: string;
  audioDevice: string;
  startupWaitMs: number;
}

export class DefaultScreenCaptureAdapter implements ScreenCaptureAdapter {
  private readonly config: ScreenCaptureConfig;
  private proc: ChildProcess | null = null;
  private stderrBuffer = "";

  constructor(config: ScreenCaptureConfig) {
    this.config = config;
  }

  async start(outputPath: string): Promise<void> {
    if (this.proc) {
      throw new Error("SCREEN_CAPTURE_ALREADY_RUNNING: capture is already in progress");
    }

    const inputDevice = `${this.config.videoDevice}:${this.config.audioDevice}`;

    const args = [
      "-f",
      "avfoundation",
      "-capture_cursor",
      "1",
      "-i",
      inputDevice,
      "-r",
      "30",
      "-vcodec",
      "libx264",
      "-crf",
      "18",
      "-preset",
      "medium",
      "-pix_fmt",
      "yuv420p",
      "-acodec",
      "aac",
      "-ar",
      "48000",
      "-ac",
      "2",
      outputPath,
    ];

    const proc = spawn("ffmpeg", args, {
      stdio: ["pipe", "ignore", "pipe"],
    });

    this.proc = proc;
    this.stderrBuffer = "";

    const started = new Promise<void>((resolve, reject) => {
      let frameSeen = false;

      proc.stderr.setEncoding("utf8");
      proc.stderr.on("data", (chunk: string) => {
        this.stderrBuffer += chunk;
        if (this.stderrBuffer.length > 8000) {
          this.stderrBuffer = this.stderrBuffer.slice(-8000);
        }
        if (!frameSeen && /frame=\s*\d+/u.test(chunk)) {
          frameSeen = true;
          resolve();
        }
      });

      proc.on("error", (err) => {
        this.proc = null;
        reject(
          new Error(
            `SCREEN_CAPTURE_FAILED: failed to start ffmpeg: ${err instanceof Error ? err.message : String(
              err,
            )}`,
          ),
        );
      });

      proc.on("exit", (code) => {
        this.proc = null;
        if (!frameSeen) {
          const excerpt = this.stderrBuffer.split("\n").slice(-5).join("\n");
          reject(
            new Error(
              `SCREEN_CAPTURE_FAILED: ffmpeg exited before capture started (code=${code ?? "null"}): ${excerpt}`,
            ),
          );
        }
      });
    });

    // Wait until at least one frame is reported.
    await started;

    // Small configurable buffer to avoid capturing before FFmpeg is fully stable.
    if (this.config.startupWaitMs > 0) {
      await new Promise((r) => setTimeout(r, this.config.startupWaitMs));
    }
  }

  async stop(): Promise<void> {
    const proc = this.proc;
    if (!proc) {
      return;
    }

    // Signal ffmpeg to stop gracefully.
    try {
      proc.stdin?.write("q\n");
    } catch {
      // ignore, we'll rely on exit/timeout handling below.
    }

    const exited = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        try {
          proc.kill("SIGTERM");
        } catch {
          // ignore
        }
        reject(
          new Error(
            "SCREEN_CAPTURE_TIMEOUT: ffmpeg did not exit within 10000ms after stop signal",
          ),
        );
      }, 10000);

      proc.on("exit", (code) => {
        clearTimeout(timeout);
        this.proc = null;
        const exitCode = code ?? 0;
        if (exitCode === 0 || exitCode === 255) {
          resolve();
          return;
        }
        const excerpt = this.stderrBuffer.split("\n").slice(-5).join("\n");
        reject(
          new Error(
            `SCREEN_CAPTURE_FAILED: ffmpeg exited with code ${exitCode}: ${excerpt}`,
          ),
        );
      });
    });

    await exited;
  }
}

