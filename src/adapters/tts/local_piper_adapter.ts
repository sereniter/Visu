import { spawn, execSync } from "node:child_process";
import { readFileSync, existsSync, unlinkSync, renameSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import { getConfig, getTTSConfig } from "../../core/config.js";
import type { ITTSAdapter, TTSRequest, TTSResponse } from "../../core/tts_interface.js";
import { getWavDurationMs, getWavFormat } from "../../core/wav_utils.js";
import { runFfmpeg } from "../ffmpeg_adapter.js";

/** Pipeline requires 48 kHz for WAV concat uniformity (Sprint 3 / 6B). */
const PIPELINE_SAMPLE_RATE = 48000;

export interface LocalPiperAdapterOptions {
  /** Absolute path to Piper .onnx model. When omitted, uses config/shared.json tts.modelPath. */
  modelPath?: string;
  /** Absolute path to Piper .onnx.json config. When omitted, uses config/shared.json tts.modelConfigPath. */
  modelConfigPath?: string;
}

export class LocalPiperAdapter implements ITTSAdapter {
  private initialized = false;
  private modelHash: string | null = null;
  private engineVersion: string | null = null;
  private readonly options: LocalPiperAdapterOptions;

  constructor(options: LocalPiperAdapterOptions = {}) {
    this.options = options;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    const modelPath = this.options.modelPath
      ? resolve(this.options.modelPath)
      : resolve(process.cwd(), getTTSConfig().modelPath);
    const modelConfigPath = this.options.modelConfigPath
      ? resolve(this.options.modelConfigPath)
      : resolve(process.cwd(), getTTSConfig().modelConfigPath);

    if (!existsSync(modelPath)) {
      throw new Error(`Piper model file not found at ${modelPath}. See ENVIRONMENT.md.`);
    }
    if (!existsSync(modelConfigPath)) {
      throw new Error(`Piper model config file not found at ${modelConfigPath}. See ENVIRONMENT.md.`);
    }

    // Compute model hash once for determinism metadata
    const modelBuf = readFileSync(modelPath);
    this.modelHash = createHash("sha256").update(modelBuf).digest("hex");

    // Capture Piper version once
    this.engineVersion = await this.detectPiperVersion().catch(() => null);

    this.initialized = true;
  }

  private getPiperCommand(): string {
    const path = getTTSConfig().piperPath;
    return path ?? "piper";
  }

  private detectPiperVersion(): Promise<string | null> {
    return new Promise((resolveVersion) => {
      const proc = spawn(this.getPiperCommand(), ["--version"]);
      let out = "";

      proc.stdout.on("data", (chunk) => {
        out += chunk.toString();
      });
      proc.stderr.on("data", () => {});
      proc.on("error", () => resolveVersion(null));
      proc.on("close", (code) => {
        if (code === 0) resolveVersion(out.trim() || null);
        else resolveVersion(null);
      });
    });
  }

  /**
   * Sprint 7: Piper version (best-effort), binary SHA256 fingerprint, model hash.
   * Call after ensureInitialized (e.g. after first synthesize). Version is null when --version fails.
   */
  async getPiperFingerprints(): Promise<{
    piperVersion: string | null;
    piperBinaryFingerprint: string;
    piperModelHash: string;
  }> {
    await this.ensureInitialized();
    let piperBinaryFingerprint = "";
    const cmd = this.getPiperCommand();
    try {
      const binPath =
        cmd === "piper" || !existsSync(cmd)
          ? String(execSync("which piper", { encoding: "utf-8" })).trim()
          : resolve(cmd);
      if (binPath && existsSync(binPath)) {
        const buf = readFileSync(binPath);
        piperBinaryFingerprint = createHash("sha256").update(buf).digest("hex");
      }
    } catch {
      // which failed or path not found; leave fingerprint empty
    }
    return {
      piperVersion: this.engineVersion ?? null,
      piperBinaryFingerprint,
      piperModelHash: this.modelHash ?? "",
    };
  }

  async synthesize(request: TTSRequest): Promise<TTSResponse> {
    await this.ensureInitialized();

    const cfg = getConfig();
    const modelPath = this.options.modelPath
      ? resolve(this.options.modelPath)
      : resolve(process.cwd(), getTTSConfig().modelPath);
    const modelConfigPath = this.options.modelConfigPath
      ? resolve(this.options.modelConfigPath)
      : resolve(process.cwd(), getTTSConfig().modelConfigPath);

    const baseDir = resolve(process.cwd(), cfg.execution.artifactsDir, request.runId);
    mkdirSync(baseDir, { recursive: true });
    const outputPath = request.outputPath
      ? resolve(process.cwd(), request.outputPath)
      : join(baseDir, "narration.wav");
    if (request.outputPath) {
      mkdirSync(dirname(outputPath), { recursive: true });
    }

    const lengthScale = 1 / request.speechRate;

    const args = [
      "--model",
      modelPath,
      "--config",
      modelConfigPath,
      "--output_file",
      outputPath,
      "--length_scale",
      String(lengthScale),
    ];

    const start = Date.now();
    const proc = spawn(this.getPiperCommand(), args, {
      env: { ...process.env, OMP_NUM_THREADS: "1" },
    });

    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    proc.stdin.write(request.text);
    proc.stdin.end();

    const exitCode: number = await new Promise((resolveCode, reject) => {
      proc.on("error", (err) => reject(err));
      proc.on("close", (code) => resolveCode(code ?? 0));
    });

    const end = Date.now();
    if (exitCode !== 0) {
      throw new Error(
        `Piper synthesis failed with code ${exitCode}: ${stderr || "no stderr"}`
      );
    }

    const nativeFormat = getWavFormat(outputPath);
    if (nativeFormat.sampleRate !== PIPELINE_SAMPLE_RATE) {
      const resampledPath = `${outputPath}.${PIPELINE_SAMPLE_RATE}.wav`;
      await runFfmpeg("ffmpeg", [
        "-i",
        outputPath,
        "-ar",
        String(PIPELINE_SAMPLE_RATE),
        "-y",
        resampledPath,
      ]);
      unlinkSync(outputPath);
      renameSync(resampledPath, outputPath);
    }

    const durationMs = getWavDurationMs(outputPath);
    const synthesisDurationMs = end - start;

    return {
      audioPath: outputPath,
      durationMs,
      provider: "local_piper",
      voiceId: request.voice,
      modelHash: this.modelHash ?? "",
      engineVersion: this.engineVersion ?? undefined,
      synthesisDurationMs,
    };
  }
}

