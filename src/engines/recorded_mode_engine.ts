/**
 * Recorded mode engine (Sprint 5). Mode B: external MP4 + script → narration → AV merge → final.mp4.
 * Execution flow: FFmpeg check → RecordedAdapter validate → script validate → TTS → drift (in merge) → AVMerge → metadata.
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import type { RunContext } from "../core/run_context.js";
import { getConfig, getConfigHash, getRemotionConfig } from "../core/config.js";
import type { FFmpegAdapterInterface } from "../adapters/ffmpeg_adapter.js";
import type { ITTSAdapter } from "../core/tts_interface.js";
import {
  validateRecordedVideo,
  type RecordedValidationResult,
} from "../adapters/recorded_adapter.js";
import { validateScript } from "../validators/script_schema.js";
import { runNarration, type NarrationScript } from "./narration_engine.js";
import { runAvMerge } from "./av_merge_engine.js";
import type { EnvironmentSnapshotPayload } from "../validators/environment_snapshot_validator.js";
import { RemotionAdapter } from "../adapters/remotion_adapter.js";
import {
  validateRecordedWrapConfig,
  type RecordedWrapConfigV11,
} from "../validators/recorded_wrap_schema.js";
import { ffprobeRemotionOutput, validateRemotionProbe } from "../validators/remotion_output_validator.js";
import { runFfmpeg } from "../adapters/ffmpeg_adapter.js";

export type ValidateRecordedVideoFn = (
  ffprobePath: string,
  videoPath: string
) => Promise<RecordedValidationResult>;

export interface RecordedModeParams {
  videoPath: string;
  scriptPath: string;
  context: RunContext;
  logger: { log: (step: string, options?: { message?: string; payload?: object }) => void };
  ffmpegAdapter: FFmpegAdapterInterface;
  ttsAdapter: ITTSAdapter;
  /** Optional for tests */
  validateRecordedVideoFn?: ValidateRecordedVideoFn;
  /** Optional Mode B wrapping config (intro/summary). */
  wrapConfig?: unknown;
}

/**
 * Run Mode B: validate recorded video and script, generate narration, run AV merge.
 * Fails hard on validation or drift; no silent correction.
 * On any throw (e.g. TTS failure): logs recorded_failed with status "failed", then rethrows.
 * Partial artifacts (e.g. narration.wav) may remain in outputDir on failure; no cleanup.
 * Foresight: for Mode C, consider sub-stages in error payload (e.g. ffmpeg_check, video_validation, tts, drift_validation, transcode, metadata_write) for finer observability.
 */
export async function runRecordedMode(params: RecordedModeParams): Promise<RunContext> {
  const { videoPath, scriptPath, context, logger, ffmpegAdapter, ttsAdapter } = params;
  const config = getConfig();
  const outputDir = join(process.cwd(), config.execution.artifactsDir, context.runId);

  try {
    // Step 1 — FFmpeg presence & version check (≥ 6.0) — done inside runAvMerge
    // Step 2 — Validate input video (RecordedAdapter)
    const doValidate = params.validateRecordedVideoFn ?? validateRecordedVideo;
    const videoValidation = await doValidate(ffmpegAdapter.getFfprobePath(), videoPath);
    if (!videoValidation.valid) {
      throw new Error(`Input video validation failed: ${videoValidation.error}`);
    }
    logger.log("recorded_video_validated", {
      payload: {
        durationMs: videoValidation.durationMs,
        videoCodec: videoValidation.videoCodec,
        width: videoValidation.width,
        height: videoValidation.height,
      },
    });

    // Step 2a — Normalize recorded input to locked profile for deterministic concat.
    const normalizedVideoPath = join(outputDir, "recorded_normalized.mp4");
    mkdirSync(outputDir, { recursive: true });
    await runFfmpeg(ffmpegAdapter.getFfmpegPath(), [
      "-f",
      "lavfi",
      "-i",
      "color=c=black:s=1920x1080:d=1",
      "-c:v",
      "libx264",
      "-crf",
      "18",
      "-preset",
      "medium",
      "-profile:v",
      "high",
      "-pix_fmt",
      "yuv420p",
      "-r",
      "30",
      "-g",
      "60",
      "-c:a",
      "aac",
      "-map_metadata",
      "-1",
      "-movflags",
      "+faststart",
      normalizedVideoPath,
    ]);

    // Step 3 — Validate script
    let scriptJson: unknown;
    try {
      scriptJson = JSON.parse(readFileSync(scriptPath, "utf-8"));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to load script: ${message}`);
    }
    // #region agent log
    const scriptKey = basename(scriptPath, ".json");
    const rootKeys = scriptJson && typeof scriptJson === "object" && !Array.isArray(scriptJson)
      ? Object.keys(scriptJson as object)
      : [];
    fetch("http://127.0.0.1:7545/ingest/878685b1-7b26-4536-8999-d93a23c738cb", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "3b8e33" },
      body: JSON.stringify({
        sessionId: "3b8e33",
        location: "recorded_mode_engine.ts:script-load",
        message: "script load",
        data: {
          scriptPath,
          scriptKey,
          rootKeys,
          rootHasVersion: rootKeys.includes("version"),
          rootHasLanguage: rootKeys.includes("language"),
          rootHasText: rootKeys.includes("text"),
          rootHasTemplate: rootKeys.includes("template"),
        },
        timestamp: Date.now(),
        hypothesisId: "H1-H4",
      }),
    }).catch(() => {});
    // #endregion
    // If file is script_templates-style (keyed object), extract the script entry
    if (scriptJson && typeof scriptJson === "object" && !Array.isArray(scriptJson)) {
      const root = scriptJson as Record<string, unknown>;
      const looksLikeScript = (o: object) =>
        "version" in o && "language" in o && ("text" in o || "template" in o);
      const rootLooksLikeScript = looksLikeScript(root);
      // #region agent log
      fetch("http://127.0.0.1:7545/ingest/878685b1-7b26-4536-8999-d93a23c738cb", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "3b8e33" },
        body: JSON.stringify({
          sessionId: "3b8e33",
          location: "recorded_mode_engine.ts:looksLikeScript",
          message: "root looksLikeScript",
          data: { rootLooksLikeScript, scriptKeyInRoot: scriptKey in root },
          timestamp: Date.now(),
          hypothesisId: "H2",
        }),
      }).catch(() => {});
      // #endregion
      if (!rootLooksLikeScript) {
        let entry: unknown = scriptKey in root ? root[scriptKey] : undefined;
        if (!entry || typeof entry !== "object") {
          for (const k of Object.keys(root)) {
            const v = root[k];
            if (v && typeof v === "object" && looksLikeScript(v as object)) {
              entry = v;
              break;
            }
          }
        }
        // #region agent log
        const entryKeys = entry && typeof entry === "object" && !Array.isArray(entry)
          ? Object.keys(entry as object)
          : [];
        fetch("http://127.0.0.1:7545/ingest/878685b1-7b26-4536-8999-d93a23c738cb", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "3b8e33" },
          body: JSON.stringify({
            sessionId: "3b8e33",
            location: "recorded_mode_engine.ts:extract-entry",
            message: "extraction result",
            data: {
              hasEntry: !!entry,
              entryType: entry === null ? "null" : typeof entry,
              entryKeys,
              entryHasVersion: entryKeys.includes("version"),
              willReplace: entry && typeof entry === "object",
            },
            timestamp: Date.now(),
            hypothesisId: "H3-H5",
          }),
        }).catch(() => {});
        // #endregion
        if (entry && typeof entry === "object") {
          scriptJson = entry;
        }
      }
      // Scene-style script: has text_template_key + language but no version — resolve from script_templates
      if (
        scriptJson &&
        typeof scriptJson === "object" &&
        !Array.isArray(scriptJson) &&
        !("version" in (scriptJson as object)) &&
        "text_template_key" in (scriptJson as object) &&
        "language" in (scriptJson as object)
      ) {
        const scene = scriptJson as Record<string, unknown>;
        const templateKey = String(scene.text_template_key || scriptKey);
        const lang = String(scene.language);
        const scriptDir = dirname(scriptPath);
        const flowTemplatesPath = join(scriptDir, "script_templates.json");
        const fallbackTemplatesPath = join(process.cwd(), "scripts", "script_templates.json");
        const templatesPath = existsSync(flowTemplatesPath) ? flowTemplatesPath : fallbackTemplatesPath;
        if (existsSync(templatesPath)) {
          const templates = JSON.parse(readFileSync(templatesPath, "utf-8")) as Record<
            string,
            { text?: string; template?: string; language?: string }
          >;
          const entry = templates[templateKey] ?? templates[scriptKey];
          const text = entry?.text ?? entry?.template;
          if (text && String(entry?.language) === lang) {
            scriptJson = { version: "1.0", language: lang, text: String(text).trim() };
          }
        }
      }
    }
    // #region agent log
    const finalKeys = scriptJson && typeof scriptJson === "object" && !Array.isArray(scriptJson)
      ? Object.keys(scriptJson as object)
      : [];
    fetch("http://127.0.0.1:7545/ingest/878685b1-7b26-4536-8999-d93a23c738cb", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "3b8e33" },
      body: JSON.stringify({
        sessionId: "3b8e33",
        location: "recorded_mode_engine.ts:before-validate",
        message: "object sent to validateScript",
        data: { finalKeys, finalHasVersion: finalKeys.includes("version"), finalKeyCount: finalKeys.length },
        timestamp: Date.now(),
        hypothesisId: "all",
      }),
    }).catch(() => {});
    // #endregion
    const scriptResult = validateScript(scriptJson);
    if (!scriptResult.valid) {
      const errors = (scriptResult as { errors: string[] }).errors;
      throw new Error(`Script validation failed: ${errors.join("; ")}`);
    }
    const raw = scriptJson as NarrationScript & { template?: string };
    const narrationText = raw.text ?? raw.template;
    if (!narrationText || String(narrationText).trim() === "") {
      throw new Error("Script must have non-empty 'text' or 'template'");
    }
    const script: NarrationScript = {
      version: raw.version,
      language: raw.language,
      text: String(narrationText).trim(),
    };

    // Step 4 — Generate narration.wav (TTS; may throw)
    const { context: afterNarration } = await runNarration({
      script,
      context: { ...context, status: "running" },
      logger,
      adapter: ttsAdapter,
    });
    const narrationPath = afterNarration.artifacts.audioPath;
    if (!narrationPath) {
      throw new Error("Narration engine did not set audioPath");
    }
    logger.log("recorded_narration_generated", { payload: { narrationPath } });

    // Sprint 7: environment snapshot for determinism audit
    const ffmpegInfo = await ffmpegAdapter.getVersionBuildconfAndFingerprint();
    const piperFingerprints =
      "getPiperFingerprints" in ttsAdapter && typeof (ttsAdapter as { getPiperFingerprints?: () => Promise<{ piperVersion: string | null; piperBinaryFingerprint: string; piperModelHash: string }> }).getPiperFingerprints === "function"
        ? await (ttsAdapter as { getPiperFingerprints: () => Promise<{ piperVersion: string | null; piperBinaryFingerprint: string; piperModelHash: string }> }).getPiperFingerprints()
        : null;
    const envSnapshot: EnvironmentSnapshotPayload = {
      ffmpegVersionFull: ffmpegInfo.versionFull,
      ffmpegBuildConf: ffmpegInfo.buildconf,
      ffmpegBinaryFingerprint: ffmpegInfo.fingerprint,
      nodeVersion: process.version,
      piperVersion: piperFingerprints?.piperVersion ?? null,
      piperBinaryFingerprint: piperFingerprints?.piperBinaryFingerprint ?? "",
      piperModelHash: piperFingerprints?.piperModelHash ?? "",
      configHash: getConfigHash(),
      capturedAt: new Date().toISOString(),
    };

    // Steps 5–10 — AV merge (durations, drift, transcode, SHA256, metadata)
    const defaultMusic = getConfig().execution.defaultBackgroundMusicPath;
    const musicPath =
      (typeof defaultMusic === "string" && defaultMusic.length > 0 && existsSync(defaultMusic))
        ? defaultMusic
        : null;
    const result = await runAvMerge({
      rawVideoPath: normalizedVideoPath,
      narrationPath,
      musicPath,
      outputDir,
      context: afterNarration,
      logger,
      adapter: ffmpegAdapter,
      mode: "recorded",
      sourceWidth: videoValidation.width,
      sourceHeight: videoValidation.height,
      envSnapshot,
    });

    let finalContext = result;

    // Optional Step 6 — Remotion intro/summary wrapping around merged recorded segment.
    const wrapValidation =
      params.wrapConfig != null ? validateRecordedWrapConfig(params.wrapConfig) : null;
    let wrap: RecordedWrapConfigV11 | null = null;
    if (wrapValidation && !wrapValidation.valid) {
      logger.log("validation_error", {
        message: "Recorded wrap schema validation failed",
        payload: { errors: wrapValidation.errors },
      });
      throw new Error(
        `RECORDED_WRAP_VALIDATION_FAILED: ${wrapValidation.errors.join("; ")}`,
      );
    }
    if (wrapValidation && wrapValidation.valid) {
      wrap = wrapValidation.data;
    }

    const hasWrapIntro = wrap?.wrap?.intro != null;
    const hasWrapSummary = wrap?.wrap?.summary != null;

    const introRenderer =
      wrap?.wrap?.intro?.renderer === "remotion" ? "remotion" : "png";
    const summaryRenderer =
      wrap?.wrap?.summary?.renderer === "remotion" ? "remotion" : "png";

    logger.log("recorded_renderer_selection", {
      payload: {
        introRenderer,
        summaryRenderer,
        wrapConfigured: !!wrap,
        normalized: true,
      },
    });

    const remotionConfig = getRemotionConfig();

    if (
      ((hasWrapIntro && introRenderer === "remotion") ||
        (hasWrapSummary && summaryRenderer === "remotion")) &&
      (remotionConfig?.enabled === false)
    ) {
      throw new Error(
        "REMOTION_DISABLED_IN_CONFIG: remotion.enabled is false but Mode B wrap requests remotion",
      );
    }

    if (wrap && (hasWrapIntro || hasWrapSummary)) {
      const remotionAdapter = new RemotionAdapter(
        remotionConfig?.templatesRoot,
        logger,
      );

      const mergedPath = finalContext.artifacts.finalVideoPath;
      if (!mergedPath) {
        throw new Error(
          "RECORDED_WRAP_FAILED: merged video path missing after runAvMerge",
        );
      }

      const clips: string[] = [];

      const ffmpegPath = ffmpegAdapter.getFfmpegPath();
      const ffprobePath = ffmpegAdapter.getFfprobePath();

      // Render intro (video-only) if requested.
      if (hasWrapIntro && introRenderer === "remotion") {
        const intro = wrap.wrap!.intro!;
        if (intro.component !== "IntroCard") {
          throw new Error(
            "REMOTION_WRAP_COMPONENT_NOT_ALLOWED: Mode B intro must use component IntroCard",
          );
        }
        const introOut = join(outputDir, "wrap_intro_remotion.mp4");
        // Validate profile after render.
        const probe = await ffprobeRemotionOutput(ffprobePath, introOut).catch(
          async () => {
            // Render then probe; RemotionAdapter will throw if render fails.
            await remotionAdapter.renderIntro({
              title: String(intro.props.title ?? basename(mergedPath)),
              subtitle: String(intro.props.subtitle ?? ""),
              language: String(intro.props.language ?? "en"),
              stepCount: Number(intro.props.stepCount ?? 1),
              accentColor: String(
                intro.props.accentColor ?? remotionConfig?.accentColor ?? "#FF6B35",
              ),
              outputPath: introOut,
            });
            return ffprobeRemotionOutput(ffprobePath, introOut);
          },
        );
        validateRemotionProbe(probe);
        clips.push(introOut);
      }

      clips.push(mergedPath);

      // Render summary (video-only) if requested.
      if (hasWrapSummary && summaryRenderer === "remotion") {
        const summary = wrap.wrap!.summary!;
        if (summary.component !== "SummaryCard") {
          throw new Error(
            "REMOTION_WRAP_COMPONENT_NOT_ALLOWED: Mode B summary must use component SummaryCard",
          );
        }
        const summaryOut = join(outputDir, "wrap_summary_remotion.mp4");
        const probe = await ffprobeRemotionOutput(ffprobePath, summaryOut).catch(
          async () => {
            await remotionAdapter.renderSummary({
              title: String(summary.props.title ?? basename(mergedPath)),
              subtitle: String(summary.props.subtitle ?? ""),
              language: String(summary.props.language ?? "en"),
              completedSteps: Array.isArray(summary.props.completedSteps)
                ? (summary.props.completedSteps as string[])
                : [],
              accentColor: String(
                summary.props.accentColor ?? remotionConfig?.accentColor ?? "#FF6B35",
              ),
              outputPath: summaryOut,
            });
            return ffprobeRemotionOutput(ffprobePath, summaryOut);
          },
        );
        validateRemotionProbe(probe);
        clips.push(summaryOut);
      }

      if (clips.length > 1) {
        // Validate stream compatibility across all clips.
        const infos = await Promise.all(
          clips.map((p) => ffmpegAdapter.getVideoStreamInfo(p)),
        );
        const base = infos[0]!;
        for (let i = 0; i < infos.length; i++) {
          const info = infos[i]!;
          if (
            info.codec_name !== base.codec_name ||
            info.width !== base.width ||
            info.height !== base.height ||
            info.pix_fmt !== base.pix_fmt ||
            Math.abs(info.fps - base.fps) > 0.1
          ) {
            throw new Error(
              `REMOTION_WRAP_PROFILE_MISMATCH: stream profile mismatch at index ${i} (${info.width}x${info.height} ${info.pix_fmt} @ ${info.fps}fps)`,
            );
          }
        }

        const listPath = join(outputDir, "recorded_wrap_concat.txt");
        const listContent = clips.map((p) => `file '${p}'`).join("\n");
        writeFileSync(listPath, listContent, "utf-8");

        const wrappedPath = join(outputDir, "final_wrapped.mp4");
        try {
          await runFfmpeg(ffmpegPath, [
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            listPath,
            "-c",
            "copy",
            "-movflags",
            "+faststart",
            wrappedPath,
          ]);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          throw new Error(
            `REMOTION_WRAP_CONCAT_FAILED: concat demuxer failed: ${message}`,
          );
        }

        finalContext = {
          ...finalContext,
          artifacts: {
            ...finalContext.artifacts,
            finalVideoPath: wrappedPath,
          },
        };
      }
    }

    logger.log("recorded_complete", {
      payload: {
        finalVideoPath: finalContext.artifacts.finalVideoPath,
        metadataPath: finalContext.artifacts.metadataPath,
      },
    });

    return finalContext;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.log("recorded_failed", {
      payload: {
        status: "failed",
        stage: "recorded_mode",
        error: message,
      },
    });
    throw err;
  }
}
