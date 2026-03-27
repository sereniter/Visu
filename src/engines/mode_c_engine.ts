/**
 * Mode C engine (Sprint 6B). Full execution with Remotion only: contract v1.1 →
 * narration per scene → per-scene SceneComposition (frames + audio in one step) → concat → metadata.
 *
 * Flow order (the only path for Mode C):
 * 1. For each scene: render SceneComposition (duration = tuned scene.duration_sec) with narration → scene_i_av/final.mp4 (video+audio).
 * 2. Concat all scene MP4s → final.mp4.
 * 3. Write media_metadata.json and environment_snapshot.json.
 *
 * Requires config.rendering.renderer === "remotion" (default); throws MODE_C_REMOTION_ONLY otherwise.
 */

import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync } from "node:fs";
import { join, resolve } from "node:path";
import type { RunContext } from "../core/run_context.js";
import {
  getConfig,
  getConfigHash,
  getEncodingProfile,
  getRemotionConfig,
} from "../core/config.js";
import type { FFmpegAdapterInterface } from "../adapters/ffmpeg_adapter.js";
import {
  validateSceneContract,
  type ModeCContractV14,
  isModeCRemotionScene,
} from "../validators/scene_schema.js";
import {
  validateLanguageRegistry,
  validateSceneLanguages,
  computeModelHash,
} from "../validators/language_registry_validator.js";
import { getVoiceConfig, getVoiceModelPaths } from "../core/language_config.js";
import { runSceneRender } from "./scene_render_engine.js";
import { RemotionAdapter } from "../adapters/remotion_adapter.js";
import type { MediaMetadataSceneSummary } from "../validators/media_metadata_schema.js";
import type { EnvironmentSnapshotPayload } from "../validators/environment_snapshot_validator.js";
import { runFfmpeg } from "../adapters/ffmpeg_adapter.js";
import { writeMediaMetadata, writeEnvironmentSnapshot } from "./metadata_writer.js";
import type { ITTSAdapter } from "../core/tts_interface.js";
import { LocalPiperAdapter } from "../adapters/tts/local_piper_adapter.js";
import { loadGradesConfig, loadStylesConfig } from "./visual_style_resolver.js";

type Logger = {
  log: (step: string, options?: { message?: string; payload?: object }) => void;
};

interface ModeCParamsBase {
  /** When set, prompt library, script templates, and asset_path are resolved relative to this root. */
  governedRoot?: string;
  context: RunContext;
  logger: Logger;
  adapter: FFmpegAdapterInterface;
}

export interface ModeCParamsFromPath extends ModeCParamsBase {
  contractPath: string;
  contractJson?: never;
}

export interface ModeCParamsFromContract extends ModeCParamsBase {
  contractJson: ModeCContractV14;
  preGeneratedNarration?: Record<string, { audioPath: string; durationMs: number }>;
  contractPath?: never;
}

export type ModeCParams = ModeCParamsFromPath | ModeCParamsFromContract;


function getProvenancePath(assetPath: string): string {
  return assetPath.replace(/\.png$/i, "") + ".provenance.json";
}

function buildSceneSummaries(
  contract: ModeCContractV14,
  artifacts: { scene_id: string; narrationDurationMs: number; driftMs: number }[],
  resolvePath: (p: string) => string
): MediaMetadataSceneSummary[] {
  return contract.scenes.map((scene, i) => {
    const artifact = artifacts[i];
    if (!artifact) throw new Error(`Missing artifact for scene ${scene.scene_id}`);
    if (isModeCRemotionScene(scene)) {
      return {
        scene_id: scene.scene_id,
        promptKey: "remotion",
        seed: 0,
        modelVersion: "remotion",
        assetHash: "-",
        narrationDurationMs: artifact.narrationDurationMs,
        driftMs: artifact.driftMs,
        language: scene.narration.language,
        voiceGender: scene.narration.voice_gender,
      };
    }
    const absAsset = resolvePath(scene.visual.asset_path);
    const sidecarPath = getProvenancePath(absAsset);
    const sidecar = JSON.parse(readFileSync(sidecarPath, "utf-8")) as { output_hash: string };
    return {
      scene_id: scene.scene_id,
      promptKey: scene.visual.prompt_key,
      seed: scene.visual.seed,
      modelVersion: scene.visual.model_version,
      assetHash: sidecar.output_hash,
      narrationDurationMs: artifact.narrationDurationMs,
      driftMs: artifact.driftMs,
      language: scene.narration.language,
      voiceGender: scene.narration.voice_gender,
    };
  });
}

interface ScriptTemplateEntry {
  text?: string;
  template?: string;
  language: string;
  variables?: string[];
}

type ScriptTemplates = Record<string, ScriptTemplateEntry>;

function loadScriptTemplatesForAutoTune(baseDir: string): ScriptTemplates {
  const path = join(baseDir, "scripts", "script_templates.json");
  if (!existsSync(path)) {
    throw new Error(`Script templates not found for auto-tune: ${path}`);
  }
  const raw = JSON.parse(readFileSync(path, "utf-8")) as unknown;

  // Flatten common shapes: either a flat map or an object with a "templates" map.
  const templates: ScriptTemplates = {};
  if (raw && typeof raw === "object") {
    const root = raw as Record<string, unknown>;
    if (root.templates && typeof root.templates === "object") {
      const nested = root.templates as Record<string, ScriptTemplateEntry>;
      for (const [key, value] of Object.entries(nested)) {
        templates[key] = value;
      }
    }
    for (const [key, value] of Object.entries(root)) {
      if (key === "templates") continue;
      if (value && typeof value === "object" && "language" in (value as Record<string, unknown>)) {
        const entry = value as ScriptTemplateEntry;
        templates[key] = entry;
      }
    }
  }

  return templates;
}

function resolveTemplateForAutoTune(
  templates: ScriptTemplates,
  key: string,
  expectedLanguage: string
): string {
  const entry = templates[key];
  if (!entry) {
    throw new Error(`Script template key not found: ${key}`);
  }
  if (entry.language !== expectedLanguage) {
    throw new Error(
      `Script template ${key} language "${entry.language}" does not match scene narration.language "${expectedLanguage}".`
    );
  }
  const text = (entry.text ?? entry.template ?? "").trim();
  if (!text) {
    throw new Error(`Script template ${key} resolved to empty text`);
  }
  return text;
}

export async function autoTuneDurations(
  contract: ModeCContractV14,
  opts: {
    governedRoot?: string;
    registryCwd: string;
    logger: Logger;
    adapter: ITTSAdapter;
    runId: string;
  }
): Promise<{
  contract: ModeCContractV14;
  preGeneratedNarration: Record<string, { audioPath: string; durationMs: number }>;
}> {
  const { governedRoot, logger, adapter, runId } = opts;
  const baseDir = governedRoot ?? process.cwd();
  const tunedContract: ModeCContractV14 = JSON.parse(JSON.stringify(contract)) as ModeCContractV14;
  const scriptTemplates = loadScriptTemplatesForAutoTune(baseDir);

  const config = getConfig();
  const autoTuneOutputDir = join(
    process.cwd(),
    config.execution.artifactsDir,
    runId,
    "auto_tune_narration"
  );

  const scenesInfo: {
    scene_id: string;
    narrationDurationMs: number;
    tunedDurationSec: number;
  }[] = [];

  const preGeneratedNarration: Record<
    string,
    { audioPath: string; durationMs: number }
  > = {};

  for (const scene of tunedContract.scenes) {
    if (isModeCRemotionScene(scene)) continue;

    const text = resolveTemplateForAutoTune(
      scriptTemplates,
      scene.narration.text_template_key,
      scene.narration.language
    );

    const voiceConfig = getVoiceConfig(
      scene.narration.language,
      scene.narration.voice_gender,
      opts.registryCwd
    );
    const { modelPath, modelConfigPath } = getVoiceModelPaths(
      scene.narration.language,
      scene.narration.voice_gender,
      opts.registryCwd
    );
    const sceneTtsAdapter = new LocalPiperAdapter({ modelPath, modelConfigPath });

    const audioPath = join(
      autoTuneOutputDir,
      `scene_${scene.scene_id}_narration_auto_tune.wav`
    );
    const response = await sceneTtsAdapter.synthesize({
      text,
      runId,
      voice: voiceConfig.voice,
      speechRate: scene.narration.speed,
      sampleRate: 48000,
      outputFormat: "wav",
      outputDir: autoTuneOutputDir,
      outputPath: audioPath,
    });

    const narrationDurationMs = response.durationMs;
    const tunedDurationSec = (narrationDurationMs + 20) / 1000;
    const rounded = Number(tunedDurationSec.toFixed(3));

    // eslint-disable-next-line no-param-reassign
    (scene as { duration_sec: number }).duration_sec = rounded;

    scenesInfo.push({
      scene_id: scene.scene_id,
      narrationDurationMs,
      tunedDurationSec: rounded,
    });

    preGeneratedNarration[scene.scene_id] = {
      audioPath: response.audioPath,
      durationMs: narrationDurationMs,
    };
  }

  logger.log("auto_tune_phase1_complete", {
    payload: { scenes: scenesInfo },
  });

  return { contract: tunedContract, preGeneratedNarration };
}

/**
 * Run Mode C: FFmpeg check → contract v1.1 → prompt/script validation → scene render (visuals, PNG→clip, TTS, drift) →
 * timeline concat → WAV concat → AVMerge → metadata (with scene array). Hard stop on any failure.
 */
export async function runModeC(params: ModeCParams): Promise<RunContext> {
  const { governedRoot, context, logger, adapter } = params;
  const config = getConfig();
  const outputDir = join(process.cwd(), config.execution.artifactsDir, context.runId);
  const resolvePath = governedRoot
    ? (p: string) => resolve(governedRoot, p)
    : (p: string) => resolve(process.cwd(), p);

  try {
    const gradesLoaded = loadGradesConfig(process.cwd());
    const stylesLoaded = loadStylesConfig(process.cwd());

    logger.log("mode_c_start", {
      payload: {
        runId: context.runId,
        gradesHash: gradesLoaded.hash,
        stylesHash: stylesLoaded.hash,
      },
    });
    let contract: ModeCContractV14;

    let preGeneratedNarration: Record<
      string,
      { audioPath: string; durationMs: number }
    > | undefined;

    if ("contractJson" in params && params.contractJson) {
      contract = params.contractJson;
      if ("preGeneratedNarration" in params) {
        preGeneratedNarration = params.preGeneratedNarration;
      }
      logger.log("mode_c_contract_valid", {
        payload: { video_id: contract.video_id, sceneCount: contract.scenes.length },
      });
    } else if ("contractPath" in params && params.contractPath) {
      const contractPathAbs = params.contractPath.startsWith("/")
        ? params.contractPath
        : resolve(process.cwd(), params.contractPath);
      const contractJson = JSON.parse(readFileSync(contractPathAbs, "utf-8")) as unknown;
      const contractResult = validateSceneContract(contractJson);
      if (!contractResult.valid) {
        throw new Error(
          `Contract validation failed: ${(contractResult as { errors: string[] }).errors.join("; ")}`
        );
      }
      contract = contractResult.data;
      logger.log("mode_c_contract_valid", {
        payload: { video_id: contract.video_id, sceneCount: contract.scenes.length },
      });
    } else {
      throw new Error("Mode C requires either contractPath or contractJson.");
    }

    const registryCwd = process.cwd();
    const registryResult = validateLanguageRegistry(registryCwd);
    if (!registryResult.valid) {
      throw new Error(
        `Language registry validation failed: ${(registryResult as { errors: string[] }).errors.join("; ")}`
      );
    }
    validateSceneLanguages(contract.scenes, registryCwd);
    const modelHashesPerRun = contract.scenes.map((scene) => {
      const voiceConfig = getVoiceConfig(
        scene.narration.language,
        scene.narration.voice_gender,
        registryCwd
      );
      return {
        scene_id: scene.scene_id,
        language: scene.narration.language,
        voice_gender: scene.narration.voice_gender,
        modelPath: voiceConfig.modelPath,
        modelHash: voiceConfig.modelHash,
      };
    });
    logger.log("mode_c_language_valid", {
      payload: { modelHashes: modelHashesPerRun },
    });

    const renderer = config.rendering?.renderer ?? "remotion";
    if (renderer !== "remotion") {
      throw new Error(
        "MODE_C_REMOTION_ONLY: Mode C only supports rendering.renderer === \"remotion\". Set config.rendering.renderer to \"remotion\" or omit it."
      );
    }

    const fontsConfigPath = join(process.cwd(), "config", "fonts.json");
    const fontsConfig = existsSync(fontsConfigPath)
      ? (JSON.parse(readFileSync(fontsConfigPath, "utf-8")) as Record<string, unknown>)
      : {};

    {
      logger.log("mode_c_remotion_render_start", {
        payload: { sceneCount: contract.scenes.length, renderer: "remotion" },
      });

      const remotionConfig = getRemotionConfig();
      const templatesRootRel = remotionConfig?.templatesRoot ?? "./remotion-templates";
      const remotionTemplatesRoot = resolve(process.cwd(), templatesRootRel);
      const remotionAdapter = new RemotionAdapter(
        remotionConfig?.templatesRoot ?? "./remotion-templates",
        logger,
      );

      // So Remotion staticFile("assets/visuals/...") resolves, sync recipe assets into Remotion public.
      const recipeVisuals = join(governedRoot ?? process.cwd(), "assets", "visuals");
      const remotionPublicVisuals = join(remotionTemplatesRoot, "public", "assets", "visuals");
      if (existsSync(recipeVisuals)) {
        mkdirSync(remotionPublicVisuals, { recursive: true });
        cpSync(recipeVisuals, remotionPublicVisuals, { recursive: true, force: true });
        logger.log("mode_c_remotion_visuals_synced", {
          payload: { from: recipeVisuals, to: remotionPublicVisuals },
        });
      }

      // Flow order: 1) narration per scene, 2) per-scene Remotion render (frames + audio in one step) → scene_i_av/final.mp4, 3) concat → final.mp4, 4) metadata.
      const remotionScenesDir = join(outputDir, "remotion_scenes");
      const sceneResult = await runSceneRender({
        contract,
        outputDir,
        runId: context.runId,
        ffmpegAdapter: adapter,
        logger,
        resolvePath,
        governedRoot,
        preGeneratedNarration,
        gradesConfig: gradesLoaded.config,
        visualStylesConfig: stylesLoaded.config,
        scenesSubdir: "remotion_scenes",
      });

      const sceneAvDirs: string[] = [];
      for (let i = 0; i < contract.scenes.length; i++) {
        const scene = contract.scenes[i];
        if (!scene) throw new Error(`Missing scene at index ${i}`);
        const narrationPath = sceneResult.sceneNarrationPaths[i];
        if (!narrationPath) throw new Error(`Missing narration path for scene ${i}`);
        const sceneAvDir = join(remotionScenesDir, `scene_${i}_av`);
        mkdirSync(sceneAvDir, { recursive: true });
        sceneAvDirs.push(sceneAvDir);
        const sceneFinalPath = join(sceneAvDir, "final.mp4");
        logger.log("mode_c_remotion_scene_render", {
          payload: { sceneIndex: i, scene_id: scene.scene_id, outputPath: sceneFinalPath, withAudio: true },
        });
        await remotionAdapter.renderSceneComposition({
          scene: scene as Parameters<RemotionAdapter["renderSceneComposition"]>[0]["scene"],
          fontsConfig,
          gradesConfig: gradesLoaded.config as unknown as Record<string, unknown>,
          outputPath: sceneFinalPath,
          runId: context.runId,
          narrationPath,
        });
      }

      const concatListPath = join(remotionScenesDir, "concat_list.txt");
      const concatListLines = sceneAvDirs.map((d) => `file '${join(d, "final.mp4")}'`);
      writeFileSync(concatListPath, concatListLines.join("\n"), "utf-8");
      const finalPath = join(outputDir, "final.mp4");
      await runFfmpeg(adapter.getFfmpegPath(), [
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        concatListPath,
        "-c",
        "copy",
        finalPath,
      ]);
      logger.log("mode_c_remotion_concat_done", { payload: { finalPath } });

      const sceneSummaries = buildSceneSummaries(contract, sceneResult.artifacts, resolvePath);
      const firstScene = contract.scenes[0];
      if (!firstScene) throw new Error("Contract has no scenes");
      const primaryVoiceConfig = getVoiceConfig(
        firstScene.narration.language,
        firstScene.narration.voice_gender,
        registryCwd,
      );
      const piperModelHash = computeModelHash(primaryVoiceConfig.modelPath, registryCwd);
      const ffmpegInfo = await adapter.getVersionBuildconfAndFingerprint();
      let piperBinaryFingerprint = "";
      try {
        const which = String(execSync("which piper", { encoding: "utf-8" })).trim();
        if (which && existsSync(which)) {
          const buf = readFileSync(which);
          piperBinaryFingerprint = createHash("sha256").update(buf).digest("hex");
        }
      } catch {
        // piper not found
      }
      const envSnapshot: EnvironmentSnapshotPayload = {
        ffmpegVersionFull: ffmpegInfo.versionFull,
        ffmpegBuildConf: ffmpegInfo.buildconf,
        ffmpegBinaryFingerprint: ffmpegInfo.fingerprint,
        nodeVersion: process.version,
        piperVersion: null,
        piperBinaryFingerprint,
        piperModelHash,
        configHash: getConfigHash(),
        capturedAt: new Date().toISOString(),
      };

      const encodingProfile = getEncodingProfile();
      const durationMs = await adapter.getVideoDurationMs(finalPath);
      const metadataPath = join(outputDir, "media_metadata.json");
      writeMediaMetadata(finalPath, metadataPath, {
        runId: context.runId,
        mode: "generative",
        encodingProfileVersion: encodingProfile.encoding_profile_version,
        ffmpegVersion: ffmpegInfo.versionFull.split(/\s/)[0] ?? "",
        ffmpegBinaryFingerprint: ffmpegInfo.fingerprint,
        sourceVideoPath: finalPath,
        narrationPath: "",
        musicPath: null,
        musicLufs: null,
        durationMs,
        driftMs: 0,
        crf: encodingProfile.crf,
        audioSampleRate: encodingProfile.audio_sample_rate,
        sceneCount: contract.scenes.length,
        maxDriftMs: 0,
        avgDriftMs: 0,
        language: firstScene.narration.language,
        voiceGender: firstScene.narration.voice_gender,
        voiceId: primaryVoiceConfig.voice,
        piperModelPath: primaryVoiceConfig.modelPath,
        piperModelHash,
        scenes: sceneSummaries,
        generatedAt: new Date().toISOString(),
      });
      writeEnvironmentSnapshot(join(outputDir, "environment_snapshot.json"), envSnapshot);

      logger.log("mode_c_complete", {
        payload: {
          finalVideoPath: finalPath,
          metadataPath,
          renderer: "remotion",
          flow: "per_scene_av_then_concat",
        },
      });

      return {
        ...context,
        status: "completed",
        artifacts: {
          ...context.artifacts,
          finalVideoPath: finalPath,
          metadataPath,
          rawVideoPath: finalPath,
        },
      };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.log("mode_c_failed", {
      payload: { status: "failed", stage: "mode_c", error: message },
    });
    throw err;
  }
}
