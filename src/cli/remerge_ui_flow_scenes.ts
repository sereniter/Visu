/**
 * Re-run AV merge only from an existing ui_flow_scenes artifact directory
 * (e.g. after pipeline fixes: no zoom, add BGM) without re-recording.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getConfig } from "../core/config.js";
import { LOG_SCHEMA_VERSION } from "../core/run_context.js";
import type { RunContext } from "../core/run_context.js";
import { resolveUIFlowScenesBackgroundMusicPath } from "../core/ui_flow_scenes_music.js";
import { resolveContentPath } from "../core/path_resolver.js";
import { validateTopicDir } from "../validators/config_validator.js";
import { validateUIFlowScenesContract } from "../validators/scene_schema.js";
import { FFmpegAdapter } from "../adapters/ffmpeg_adapter.js";
import { runAvMerge } from "../engines/av_merge_engine.js";
import { getVoiceConfig } from "../core/language_config.js";
import { copyOutputToRepository } from "../engines/metadata_writer.js";
import { timestampIso } from "../core/logger.js";

export interface RemergeUIFlowScenesParams {
  runId: string;
  contractRelativePath: string;
  logger: { log: (step: string, options?: { payload?: object }) => void; close: () => void };
  /** Default: stitched_video.mp4 in the run dir (not stitched_zoomed). */
  videoBasename?: string;
}

export async function remergeUIFlowScenesFromArtifacts(params: RemergeUIFlowScenesParams): Promise<{
  exitCode: 0 | 1;
  message: string;
}> {
  const { runId, contractRelativePath, logger, videoBasename = "stitched_video.mp4" } = params;
  const config = getConfig();
  const outputDir = join(process.cwd(), config.execution.artifactsDir, runId);
  const contractPathAbs = resolveContentPath(contractRelativePath);
  const contractJson = JSON.parse(readFileSync(contractPathAbs, "utf-8")) as unknown;
  const contractResult = validateUIFlowScenesContract(contractJson);
  if (!contractResult.valid) {
    const errors = (contractResult as { errors: string[] }).errors.join("; ");
    return { exitCode: 1, message: `Contract validation failed: ${errors}` };
  }
  const contract = contractResult.data;
  validateTopicDir(contract.topic);

  const baseDir = join(config.contentRoot, contract.topic);
  const stitchedPath = join(outputDir, videoBasename);
  const narrationPath = join(outputDir, "narration_concat.wav");
  if (!existsSync(stitchedPath)) {
    return { exitCode: 1, message: `Missing video for remerge: ${stitchedPath}` };
  }
  if (!existsSync(narrationPath)) {
    return { exitCode: 1, message: `Missing narration_concat.wav: ${narrationPath}` };
  }

  const musicPath = resolveUIFlowScenesBackgroundMusicPath(
    contract,
    baseDir,
    config.execution.defaultBackgroundMusicPath
  );

  const firstScene = contract.scenes[0];
  const primaryVoiceConfig = firstScene
    ? getVoiceConfig(firstScene.narration.language, firstScene.narration.voice_gender, process.cwd())
    : getVoiceConfig(contract.intro.narration.language, contract.intro.narration.voice_gender, process.cwd());

  const context: RunContext = {
    runId,
    startedAt: timestampIso(),
    environment: { nodeVersion: process.version },
    execution: {
      mode: "ui_flow_scenes",
      inputId: contractRelativePath,
      inputVersion: contract.schema_version,
    },
    language: contract.language,
    versions: { logSchema: LOG_SCHEMA_VERSION },
    artifacts: {},
    status: "running",
  };

  const adapter = new FFmpegAdapter();
  logger.log("remerge_ui_flow_scenes_start", {
    payload: { outputDir, stitchedPath, narrationPath, musicPath, videoBasename },
  });

  try {
    const avMergeContext = await runAvMerge({
      rawVideoPath: stitchedPath,
      narrationPath,
      musicPath,
      outputDir,
      context,
      logger,
      adapter,
      mode: "ui_flow",
      sceneCount: 1 + contract.scenes.length + 1,
      language: contract.language,
      voiceGender: contract.intro.narration.voice_gender,
      voiceId: primaryVoiceConfig.voice,
      piperModelPath: primaryVoiceConfig.modelPath,
      piperModelHash: primaryVoiceConfig.modelHash,
    });

    const finalVideoPath = avMergeContext.artifacts.finalVideoPath;
    const metadataPath = avMergeContext.artifacts.metadataPath;
    if (!finalVideoPath || !metadataPath) {
      return { exitCode: 1, message: "AV merge did not produce final.mp4 or metadata" };
    }

    const metadata = JSON.parse(readFileSync(metadataPath, "utf-8")) as import("../validators/media_metadata_schema.js").MediaMetadataPayload;
    const runOutputDir = dirname(finalVideoPath);
    const extraFiles: { sourcePath: string; destFileName: string }[] = [];
    const subtitlesPath = join(runOutputDir, "subtitles.srt");
    const thumbnailPath = join(runOutputDir, "thumbnail.png");
    if (existsSync(subtitlesPath)) extraFiles.push({ sourcePath: subtitlesPath, destFileName: "subtitles.srt" });
    if (existsSync(thumbnailPath)) extraFiles.push({ sourcePath: thumbnailPath, destFileName: "thumbnail.png" });
    copyOutputToRepository({
      finalVideoPath,
      metadataPath,
      metadata,
      topic: contract.topic,
      language: contract.language,
      logger,
      extraFiles: extraFiles.length ? extraFiles : undefined,
    });

    return {
      exitCode: 0,
      message: `Remerged final.mp4 in ${outputDir} (video=${videoBasename}, music=${musicPath ?? "none"}). Output repo: ${join(config.outputRoot, contract.topic, contract.language)}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { exitCode: 1, message };
  }
}
