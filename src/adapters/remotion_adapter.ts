import { spawn, spawnSync, execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { getConfig, getRemotionConfig, getEncodingProfile } from "../core/config.js";
import { ffprobeRemotionOutput, validateRemotionProbe } from "../validators/remotion_output_validator.js";
import { validateRemotionProps } from "../validators/remotion_props_schema.js";

export type RemotionRenderOptions = {
  compositionId: "AnukramAIIntro" | "AnukramAISummary" | "SceneTitleCard" | "ProgressOverlay" | "TransitionComposition" | "SceneComposition";
  props: Record<string, unknown>;
  outputPath: string;
  durationInFrames?: number;
  ffprobePath?: string;
  /** Optional run identifier for logging and artifacts. */
  runId?: string;
  /** When set, Stage 2 muxes this audio into the output (frames + audio in one FFmpeg step). */
  audioPath?: string;
};

/** PNG frame sequence from Remotion (no FFmpeg stitch). Used when alpha must be composited over scene video in Visu. */
export type RemotionPngSequenceResult = {
  framesDir: string;
  framePattern: string;
  fps: number;
};

export type RemotionTransitionRenderParams = {
  contract: { scenes: Array<{ scene_id: string; duration_sec: number; transition?: { type?: string; duration_sec?: number } }> };
  fontsConfig: Record<string, unknown>;
  gradesConfig: Record<string, unknown>;
  outputPath: string;
  cwd: string;
  logger: RemotionLogger;
  runId: string;
  /** Sprint 13 drift fix: total narration length in ms. Composition duration is set to at least this so video ≥ narration. */
  totalNarrationMs?: number;
};

export interface RemotionLogger {
  log: (step: string, options?: { message?: string; payload?: object }) => void;
}

export class RemotionAdapter {
  private readonly templatesRoot: string;
  private readonly logger: RemotionLogger;

  constructor(templatesRoot: string | null | undefined, logger: RemotionLogger) {
    const cfg = templatesRoot ?? getRemotionConfig()?.templatesRoot ?? "./remotion-templates";
    this.templatesRoot = cfg;
    this.logger = logger;
  }

  private assertTemplatesRootExists(): void {
    if (!existsSync(this.templatesRoot)) {
      throw new Error(
        `REMOTION_TEMPLATES_NOT_FOUND: templatesRoot not found at ${this.templatesRoot}`,
      );
    }
  }

  private static computeFileSha256(path: string): string {
    const buf = readFileSync(path);
    return createHash("sha256").update(buf).digest("hex");
  }

  private static hashFileIfExists(filePath: string): string | null {
    if (!existsSync(filePath)) return null;
    try {
      return RemotionAdapter.computeFileSha256(filePath);
    } catch {
      return null;
    }
  }

  private async validateChromiumBinary(): Promise<void> {
    const lockPath = join(this.templatesRoot, "CHROMIUM_BINARY.lock");
    if (!existsSync(lockPath)) {
      throw new Error(
        "REMOTION_CHROMIUM_LOCK_MISSING: CHROMIUM_BINARY.lock not found. Run: node scripts/record_chromium_hash.js",
      );
    }
    const lockContent = readFileSync(lockPath, "utf-8");
    const hashMatch = lockContent.match(/sha256=([a-f0-9]+)/);
    const expectedHash = hashMatch?.[1];
    if (!expectedHash) {
      throw new Error(
        "REMOTION_CHROMIUM_LOCK_MISSING: CHROMIUM_BINARY.lock has invalid format (missing sha256=). Run: node scripts/record_chromium_hash.js",
      );
    }
    const child = spawnSync("node", [
      "-e",
      "const {RenderInternals}=require('@remotion/renderer'); console.log(RenderInternals.getExecutablePath('compositor'))",
    ], {
      cwd: this.templatesRoot,
      encoding: "utf-8",
    });
    if (child.status !== 0 || !child.stdout?.trim()) {
      throw new Error(
        `REMOTION_CHROMIUM_LOCK_MISSING: Could not resolve Chromium path: ${child.stderr ?? child.error?.message ?? "unknown"}`,
      );
    }
    const currentChromiumPath = child.stdout.trim();
    const actualHash = RemotionAdapter.computeFileSha256(currentChromiumPath);
    if (actualHash !== expectedHash) {
      throw new Error(
        `REMOTION_CHROMIUM_DRIFT: Chromium binary hash mismatch. Expected ${expectedHash}, got ${actualHash}. Re-run record_chromium_hash.js and commit.`,
      );
    }
  }

  /**
   * Two-stage render: Remotion renders JPEG frames, system FFmpeg stitches to MP4.
   * This avoids the macOS compositor SIGABRT crash with Remotion's bundled FFmpeg.
   */
  async render(options: RemotionRenderOptions): Promise<string> {
    const { compositionId, props, outputPath, ffprobePath, runId, audioPath } = options;

    this.assertTemplatesRootExists();

    const remotionConfig = getRemotionConfig();
    if (remotionConfig && remotionConfig.enabled === false) {
      throw new Error("REMOTION_DISABLED: remotion.enabled is false in config");
    }

    const bundlerEnv = {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      remotionConfigHash: RemotionAdapter.hashFileIfExists(
        join(this.templatesRoot, "remotion.config.ts"),
      ),
      packageJsonHash: RemotionAdapter.hashFileIfExists(
        join(this.templatesRoot, "package.json"),
      ),
    };
    this.logger.log("remotion_bundler_env", { payload: bundlerEnv });

    mkdirSync(dirname(outputPath), { recursive: true });

    const outputBase = outputPath.replace(/\.[^.]+$/, "");
    const framesDir = resolve(outputBase + "_frames");
    mkdirSync(framesDir, { recursive: true });

    const propsFile = outputBase + "_props.json";
    writeFileSync(propsFile, JSON.stringify(props, null, 2), "utf-8");

    const fps = (props.fps as number) ?? 30;

    // Stage 1: Render JPEG frame sequence via Remotion CLI
    const renderArgs = [
      "npx", "remotion", "render",
      "src/index.ts",
      compositionId,
      `--props=${propsFile}`,
      "--image-format=jpeg",
      "--sequence",
      `--output=${framesDir}`,
      "--overwrite",
      "--log=verbose",
    ].join(" ");

    this.logger.log("remotion_spawn", {
      payload: { templatesRoot: this.templatesRoot, stage: "frames", command: renderArgs },
    });

    const startTime = Date.now();

    try {
      execSync(renderArgs, {
        cwd: this.templatesRoot,
        env: { ...process.env, NODE_ENV: "production" },
        stdio: "pipe",
        maxBuffer: 50 * 1024 * 1024,
      });
    } catch (err: unknown) {
      const e = err as { stderr?: Buffer; status?: number };
      const stderr = e.stderr?.toString().slice(-2000) ?? "";
      this.logger.log("remotion_stderr", {
        payload: { compositionId, data: stderr },
      });
      throw new Error(
        `REMOTION_RENDER_FAILED: Frame rendering failed for ${compositionId} (exit ${e.status}): ${stderr.slice(-500)}`,
      );
    }

    const frameFiles = readdirSync(framesDir).filter((f: string) => f.endsWith(".jpeg")).sort();
    if (frameFiles.length === 0) {
      throw new Error(`REMOTION_RENDER_FAILED: No JPEG frames produced for ${compositionId}`);
    }

    this.logger.log("remotion_frames_complete", {
      payload: { compositionId, frameCount: frameFiles.length },
    });

    // Derive FFmpeg pattern from actual Remotion output (e.g. element-0000.jpeg or element-0.jpeg)
    const first = frameFiles[0] ?? "";
    const match = first.match(/^(.+?)(\d+)(\.jpeg)$/);
    const framePattern = match
      ? `${match[1]}%0${match[2].length}d${match[3]}`
      : "element-%04d.jpeg";

    // Stage 2: Stitch frames to MP4 (and optionally mux audio in one step) using system FFmpeg.
    // JPEG frames are yuvj420p (full range); convert to yuv420p + tv range for validator.
    const ffmpegBin = "/usr/local/bin/ffmpeg";
    const profile = getEncodingProfile();
    const hasAudio = Boolean(audioPath);

    const stitchArgs: string[] = [
      "-y",
      "-framerate", String(fps),
      "-start_number", "0",
      "-i", `${framesDir}/${framePattern}`,
    ];
    if (hasAudio) {
      stitchArgs.push("-i", audioPath!);
    }
    stitchArgs.push(
      "-vf", "scale=in_range=full:out_range=tv",
      "-c:v", profile.video_codec,
      "-preset", profile.preset,
      "-profile:v", profile.profile,
      "-pix_fmt", profile.pix_fmt,
      "-crf", String(profile.crf),
      "-movflags", "+faststart",
    );
    if (hasAudio) {
      stitchArgs.push("-map", "0:v:0", "-map", "1:a:0", "-shortest", "-c:a", profile.audio_codec, "-ar", String(profile.audio_sample_rate));
    }
    stitchArgs.push("-map_metadata", "-1", outputPath);

    this.logger.log("remotion_ffmpeg_stitch", {
      payload: { compositionId, withAudio: hasAudio, command: [ffmpegBin, ...stitchArgs].join(" ") },
    });

    try {
      const stitchResult = spawnSync(ffmpegBin, stitchArgs, {
        stdio: "pipe",
        maxBuffer: 10 * 1024 * 1024,
        encoding: "utf-8",
      });
      if (stitchResult.status !== 0) {
        const stderr = (stitchResult.stderr ?? stitchResult.error?.message ?? "").slice(-500);
        throw new Error(
          `REMOTION_RENDER_FAILED: FFmpeg stitching failed for ${compositionId} (exit ${stitchResult.status}): ${stderr}`,
        );
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message.startsWith("REMOTION_RENDER_FAILED:")) throw err;
      const e = err as { stderr?: Buffer; status?: number };
      throw new Error(
        `REMOTION_RENDER_FAILED: FFmpeg stitching failed for ${compositionId} (exit ${e.status}): ${e.stderr?.toString().slice(-500) ?? ""}`,
      );
    }

    // Clean up frames
    try { rmSync(framesDir, { recursive: true, force: true }); } catch { /* best effort */ }
    try { rmSync(propsFile, { force: true }); } catch { /* best effort */ }

    if (!existsSync(outputPath)) {
      throw new Error(
        `REMOTION_OUTPUT_MISSING: Remotion render completed but output not found at ${outputPath}`,
      );
    }

    const ffprobeBin = ffprobePath ?? "/usr/local/bin/ffprobe";
    const probe = await ffprobeRemotionOutput(ffprobeBin, outputPath);
    validateRemotionProbe(probe, { expectAudio: hasAudio });

    const outputSha256 = RemotionAdapter.computeFileSha256(outputPath);
    const pkgJsonPath = join(this.templatesRoot, "package.json");
    const pkgJson = existsSync(pkgJsonPath)
      ? (JSON.parse(readFileSync(pkgJsonPath, "utf-8")) as {
          dependencies?: Record<string, string>;
        })
      : undefined;
    const remotionVersion = pkgJson?.dependencies?.remotion ?? "unknown";

    const durationMs = Date.now() - startTime;

    this.logger.log("remotion_render_complete", {
      payload: {
        compositionId,
        outputPath,
        outputSha256,
        durationMs,
        remotionVersion,
        frameCount: frameFiles.length,
      },
    });

    if (runId) {
      const config = getConfig();
      const dir = join(config.execution.artifactsDir, runId);
      mkdirSync(dir, { recursive: true });
      const rendersPath = join(dir, "remotion_renders.json");
      const entry = {
        compositionId,
        outputPath,
        outputSha256,
        renderedAt: new Date().toISOString(),
        remotionVersion,
        frameCount: frameFiles.length,
        bundlerEnv,
      };
      let existing: unknown[] = [];
      if (existsSync(rendersPath)) {
        try {
          existing = JSON.parse(readFileSync(rendersPath, "utf-8")) as unknown[];
        } catch {
          existing = [];
        }
      }
      const next = [...existing, entry];
      mkdirSync(dirname(rendersPath), { recursive: true });
      writeFileSync(rendersPath, JSON.stringify(next, null, 2), "utf-8");
    }

    return outputPath;
  }

  /**
   * Render a PNG frame sequence only (no Stage 2 stitch). Use for ProgressOverlay so FFmpeg can composite
   * RGBA frames over scene video without flattening transparency to black.
   */
  async renderPngSequence(options: {
    compositionId: "ProgressOverlay";
    props: Record<string, unknown>;
    /** Base path without extension; creates `${base}_props.json` and `${base}_frames/`. */
    outputBasePath: string;
    durationInFrames: number;
    runId?: string;
  }): Promise<RemotionPngSequenceResult> {
    const { compositionId, props, outputBasePath, durationInFrames, runId } = options;
    this.assertTemplatesRootExists();

    const remotionConfig = getRemotionConfig();
    if (remotionConfig && remotionConfig.enabled === false) {
      throw new Error("REMOTION_DISABLED: remotion.enabled is false in config");
    }

    const bundlerEnv = {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      remotionConfigHash: RemotionAdapter.hashFileIfExists(
        join(this.templatesRoot, "remotion.config.ts"),
      ),
      packageJsonHash: RemotionAdapter.hashFileIfExists(
        join(this.templatesRoot, "package.json"),
      ),
    };
    this.logger.log("remotion_bundler_env", { payload: { ...bundlerEnv, stage: "png_sequence" } });

    const propsFile = outputBasePath + "_props.json";
    const propsForRender = { ...props, durationInFrames };
    writeFileSync(propsFile, JSON.stringify(propsForRender, null, 2), "utf-8");

    const fps = (props.fps as number) ?? 30;
    const framesDir = resolve(outputBasePath + "_frames");
    mkdirSync(framesDir, { recursive: true });

    const renderArgs = [
      "npx", "remotion", "render",
      "src/index.ts",
      compositionId,
      `--props=${propsFile}`,
      "--image-format=png",
      "--sequence",
      `--output=${framesDir}`,
      "--overwrite",
      "--log=verbose",
      ...(durationInFrames > 0 ? [`--frames=0-${durationInFrames - 1}`] : []),
    ].join(" ");

    this.logger.log("remotion_spawn", {
      payload: { templatesRoot: this.templatesRoot, stage: "png_sequence", command: renderArgs },
    });

    try {
      execSync(renderArgs, {
        cwd: this.templatesRoot,
        env: { ...process.env, NODE_ENV: "production" },
        stdio: "pipe",
        maxBuffer: 50 * 1024 * 1024,
      });
    } catch (err: unknown) {
      const e = err as { stderr?: Buffer; status?: number };
      const stderr = e.stderr?.toString().slice(-2000) ?? "";
      this.logger.log("remotion_stderr", {
        payload: { compositionId, data: stderr },
      });
      throw new Error(
        `REMOTION_RENDER_FAILED: PNG sequence render failed for ${compositionId} (exit ${e.status}): ${stderr.slice(-500)}`,
      );
    }

    try {
      rmSync(propsFile, { force: true });
    } catch {
      /* best effort */
    }

    const frameFiles = readdirSync(framesDir).filter((f: string) => f.endsWith(".png")).sort();
    if (frameFiles.length === 0) {
      throw new Error(`REMOTION_RENDER_FAILED: No PNG frames produced for ${compositionId}`);
    }

    const first = frameFiles[0] ?? "";
    const match = first.match(/^(.+?)(\d+)(\.png)$/);
    const framePattern = match
      ? `${match[1]}%0${match[2].length}d${match[3]}`
      : "element-%04d.png";

    this.logger.log("remotion_png_sequence_complete", {
      payload: { compositionId, frameCount: frameFiles.length, runId: runId ?? null },
    });

    return { framesDir, framePattern, fps };
  }

  async renderIntro(params: {
    title: string;
    subtitle: string;
    language: string;
    stepCount: number;
    accentColor?: string;
    outputPath: string;
    durationInFrames?: number;
    ffprobePath?: string;
    runId?: string;
  }): Promise<string> {
    const remotionConfig = getRemotionConfig();
    const accent =
      params.accentColor ?? remotionConfig?.accentColor ?? "#FF6B35";
    return this.render({
      compositionId: "AnukramAIIntro",
      props: {
        title: params.title,
        subtitle: params.subtitle,
        language: params.language,
        stepCount: params.stepCount,
        accentColor: accent,
      },
      outputPath: params.outputPath,
      durationInFrames: params.durationInFrames ?? 150,
      ffprobePath: params.ffprobePath,
      runId: params.runId,
    });
  }

  /** Render a single scene (SceneComposition). When narrationPath is set, frames and audio are muxed in one step (no separate AV merge). */
  async renderSceneComposition(params: {
    scene: { scene_id: string; duration_sec: number; visual: unknown; narration: unknown; overlays?: unknown[]; transition?: unknown; audio?: unknown };
    fontsConfig: Record<string, unknown>;
    gradesConfig: Record<string, unknown>;
    outputPath: string;
    runId?: string;
    /** When set, output is video+audio in one step (stitch frames and mux this audio). */
    narrationPath?: string;
  }): Promise<string> {
    this.assertTemplatesRootExists();
    const fps = 30;
    const durationInFrames = Math.max(1, Math.ceil(params.scene.duration_sec * fps));
    return this.render({
      compositionId: "SceneComposition",
      props: {
        scene: params.scene,
        fontsConfig: params.fontsConfig,
        gradesConfig: params.gradesConfig,
      },
      outputPath: params.outputPath,
      durationInFrames,
      runId: params.runId,
      audioPath: params.narrationPath,
    });
  }

  async renderTransitionComposition(params: RemotionTransitionRenderParams): Promise<{ stitchedPath: string }> {
    const { contract, fontsConfig, gradesConfig, outputPath, logger, runId, totalNarrationMs } = params;

    this.assertTemplatesRootExists();

    const fps = 30;
    const fromScenes = this.calculateTotalFrames(contract.scenes, fps);
    const minFramesForNarration =
      totalNarrationMs != null && totalNarrationMs > 0
        ? Math.ceil((totalNarrationMs / 1000) * fps)
        : 0;
    const totalFrames = Math.max(fromScenes, minFramesForNarration, 1);

    logger.log("remotion_transition_render_start", {
      payload: {
        runId,
        sceneCount: contract.scenes.length,
        totalFrames,
        fps,
        fromScenes,
        minFramesForNarration: minFramesForNarration || null,
      },
    });

    const outputDir = dirname(outputPath);
    mkdirSync(outputDir, { recursive: true });

    const renderResult = await this.render({
      compositionId: "TransitionComposition",
      props: {
        scenes: contract.scenes,
        fontsConfig,
        gradesConfig,
        fps,
      },
      outputPath,
      durationInFrames: totalFrames,
      runId,
    });

    return { stitchedPath: renderResult };
  }

  private calculateTotalFrames(
    scenes: Array<{ duration_sec: number; transition?: { type?: string; duration_sec?: number } }>,
    fps: number,
  ): number {
    let total = 0;
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      if (!scene) continue;
      total += Math.round(scene.duration_sec * fps);
      if (i > 0 && scene.transition) {
        const tType = scene.transition.type ?? "fade";
        if (tType !== "none" && tType !== "light_leak") {
          total -= Math.round((scene.transition.duration_sec ?? 0.5) * fps);
        }
      }
    }
    return Math.max(total, 1);
  }

  async renderSummary(params: {
    title: string;
    subtitle: string;
    language: string;
    completedSteps: string[];
    accentColor?: string;
    outputPath: string;
    durationInFrames?: number;
    ffprobePath?: string;
    runId?: string;
  }): Promise<string> {
    const remotionConfig = getRemotionConfig();
    const accent =
      params.accentColor ?? remotionConfig?.accentColor ?? "#FF6B35";
    return this.render({
      compositionId: "AnukramAISummary",
      props: {
        title: params.title,
        subtitle: params.subtitle,
        language: params.language,
        completedSteps: params.completedSteps,
        accentColor: accent,
      },
      outputPath: params.outputPath,
      durationInFrames: params.durationInFrames ?? 180,
      ffprobePath: params.ffprobePath,
      runId: params.runId,
    });
  }
}

