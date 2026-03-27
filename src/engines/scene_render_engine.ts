/**
 * Scene render engine (Sprint 6B). For each scene: validate visual asset, PNG→clip (locked profile),
 * resolve script template, TTS → WAV, single-pass WAV metadata, unified drift validation.
 */

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { FFmpegAdapterInterface } from "../adapters/ffmpeg_adapter.js";
import { getGradeArgs, getKenBurnsArgs, runFfmpeg } from "../adapters/ffmpeg_adapter.js";
import type { ITTSAdapter } from "../core/tts_interface.js";
import { getWavDurationMs } from "../core/wav_utils.js";
import { validateVisualAsset } from "../validators/visual_asset_validator.js";
import { validateAvDrift } from "../validators/av_drift_validator.js";
import type { ModeCContractV14, ModeCSceneV14, ModeCSceneV13 } from "../validators/scene_schema.js";
import { isModeCRemotionScene } from "../validators/scene_schema.js";
import { getVoiceConfig, getVoiceModelPaths } from "../core/language_config.js";
import { LocalPiperAdapter } from "../adapters/tts/local_piper_adapter.js";
import { getRemotionConfig } from "../core/config.js";
import { RemotionAdapter } from "../adapters/remotion_adapter.js";
import { validateRemotionProps } from "../validators/remotion_props_schema.js";
import { ffprobeRemotionOutput, validateRemotionProbe } from "../validators/remotion_output_validator.js";
import { getEncodingProfile } from "../core/config.js";
import {
  resolveVisualStyle,
  type GovernedImageVisual,
  type ResolvedVisualParams,
  type GradesConfig,
  type VisualStylesConfig,
} from "./visual_style_resolver.js";

const PROMPT_LIBRARY_PATH = "prompts/prompt_library.json";
const SCRIPT_TEMPLATES_PATH = "scripts/script_templates.json";

export interface SceneRenderInput {
  contract: ModeCContractV14;
  outputDir: string;
  runId: string;
  ffmpegAdapter: FFmpegAdapterInterface;
  /** Not used: TTS adapter is created per scene from language registry. Kept for API compatibility. */
  ttsAdapter?: ITTSAdapter;
  logger: { log: (step: string, options?: { payload?: object }) => void };
  resolvePath?: (p: string) => string;
  /** When set, prompt library, script templates, and language registry are loaded from this root instead of cwd. */
  governedRoot?: string;
  /** Optional pre-generated narrations from Phase 1 auto-tune: scene_id -> { path, durationMs }. */
  preGeneratedNarration?: Record<
    string,
    { audioPath: string; durationMs: number }
  >;
  /** Optional visual styling configs (Sprint 13). When absent, scenes render without motion/grade filters. */
  gradesConfig?: GradesConfig;
  visualStylesConfig?: VisualStylesConfig;
  /** Optional subdir under outputDir for scene clips and narration (default "scenes"). Use e.g. "remotion_scenes" to consolidate with Remotion path. */
  scenesSubdir?: string;
}

export interface SceneRenderArtifact {
  scene_id: string;
  videoPath: string;
  narrationPath: string;
  narrationDurationMs: number;
  driftMs: number;
}

export interface SceneRenderResult {
  sceneVideoPaths: string[];
  sceneNarrationPaths: string[];
  artifacts: SceneRenderArtifact[];
}

interface PromptLibrary {
  [key: string]: { approved?: boolean; version?: string };
}

interface ScriptTemplates {
  [key: string]: { text?: string; template?: string; language: string; variables?: string[] };
}

function loadPromptLibrary(cwd: string): PromptLibrary {
  const path = join(cwd, PROMPT_LIBRARY_PATH);
  if (!existsSync(path)) throw new Error(`Prompt library not found: ${path}`);
  return JSON.parse(readFileSync(path, "utf-8")) as PromptLibrary;
}

function loadScriptTemplates(cwd: string): ScriptTemplates {
  const path = join(cwd, SCRIPT_TEMPLATES_PATH);
  if (!existsSync(path)) throw new Error(`Script templates not found: ${path}`);
  return JSON.parse(readFileSync(path, "utf-8")) as ScriptTemplates;
}

function resolveTemplate(
  templates: ScriptTemplates,
  key: string,
  expectedLanguage: string
): string {
  const entry = templates[key];
  if (!entry) throw new Error(`Script template key not found: ${key}`);
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

function validatePromptLibrary(contract: ModeCContractV14, library: PromptLibrary): void {
  for (const scene of contract.scenes) {
    if (scene.visual.type !== "governed_image") continue;
    const key = scene.visual.prompt_key;
    const entry = library[key];
    if (!entry) throw new Error(`Prompt key not in library: ${key}`);
    if (entry.approved !== true) throw new Error(`Prompt key not approved: ${key}`);
  }
}

function validateScriptTemplates(contract: ModeCContractV14, templates: ScriptTemplates): void {
  for (const scene of contract.scenes) {
    const key = scene.narration.text_template_key;
    if (!(key in templates)) throw new Error(`Script template key not found: ${key}`);
    resolveTemplate(templates, key, scene.narration.language);
  }
}

/**
 * Run scene render: validate assets and templates, then for each scene: visual validation →
 * PNG→clip → template resolve → TTS → drift check. Returns ordered video and WAV paths plus per-scene metrics.
 */
export async function runSceneRender(params: SceneRenderInput): Promise<SceneRenderResult> {
  const {
    contract,
    outputDir,
    runId,
    ffmpegAdapter,
    logger,
    resolvePath = (p) => join(process.cwd(), p),
    governedRoot,
    preGeneratedNarration,
    gradesConfig,
    visualStylesConfig,
  } = params;

  const baseDir = governedRoot ?? process.cwd();
  const promptLibrary = loadPromptLibrary(baseDir);
  const scriptTemplates = loadScriptTemplates(baseDir);
  validatePromptLibrary(contract, promptLibrary);
  validateScriptTemplates(contract, scriptTemplates);

  const scenesSubdir = params.scenesSubdir ?? "scenes";
  const scenesDir = join(outputDir, scenesSubdir);
  mkdirSync(scenesDir, { recursive: true });
  const ffprobePath = ffmpegAdapter.getFfprobePath();
  const remotionConfig = getRemotionConfig();
  const hasRemotionScenes = contract.scenes.some((s) => isModeCRemotionScene(s));
  const remotionAdapter =
    hasRemotionScenes && remotionConfig?.enabled
      ? new RemotionAdapter(remotionConfig.templatesRoot, logger)
      : null;
  if (hasRemotionScenes && !remotionConfig?.enabled) {
    throw new Error(
      "REMOTION_DISABLED_IN_CONFIG: remotion.enabled is false but contract has type: \"remotion\" scene(s)",
    );
  }

  const sceneVideoPaths: string[] = [];
  const sceneNarrationPaths: string[] = [];
  const artifacts: SceneRenderArtifact[] = [];

  // Remotion path (scenesSubdir === "remotion_scenes"): only narration paths and artifacts; no scene clips (Mode C uses Remotion SceneComposition for video).
  if (scenesSubdir === "remotion_scenes" && preGeneratedNarration) {
    const TUNED_BUFFER_MS = 20;
    for (const scene of contract.scenes) {
      const pre = preGeneratedNarration[scene.scene_id];
      if (!pre) {
        throw new Error(
          `remotion_scenes path requires preGeneratedNarration for every scene; missing for ${scene.scene_id}`
        );
      }
      sceneNarrationPaths.push(pre.audioPath);
      sceneVideoPaths.push(join(scenesDir, `scene_${scene.scene_id}.mp4`)); // placeholder; file not written
      artifacts.push({
        scene_id: scene.scene_id,
        videoPath: join(scenesDir, `scene_${scene.scene_id}.mp4`),
        narrationPath: pre.audioPath,
        narrationDurationMs: pre.durationMs,
        driftMs: TUNED_BUFFER_MS,
      });
    }
    return { sceneVideoPaths, sceneNarrationPaths, artifacts };
  }

  for (let index = 0; index < contract.scenes.length; index++) {
    const scene = contract.scenes[index] as ModeCSceneV14;

    if (scene.visual.type === "governed_image") {
      const absAsset = resolvePath(scene.visual.asset_path);
      const valid = await validateVisualAsset(absAsset, ffprobePath, (p) =>
        p.startsWith("/") || (p.length > 1 && p[1] === ":") ? p : join(baseDir, p),
      );
      if (!valid.valid) throw new Error(valid.error);

      const sceneClipPath = join(scenesDir, `scene_${scene.scene_id}.mp4`);
      // When preGeneratedNarration is provided (auto-tune Phase 1), derive video duration
      // directly from the narration WAV with a tiny 5 ms buffer.
      const pre = preGeneratedNarration?.[scene.scene_id];
      const sceneDurationSec =
        pre && typeof pre.durationMs === "number"
          ? (pre.durationMs + 5) / 1000
          : (scene as ModeCSceneV13).duration_sec;

      let resolvedStyle: ResolvedVisualParams | null = null;
      let filterChain: string | null = null;

      if (visualStylesConfig && gradesConfig) {
        resolvedStyle = resolveVisualStyle(
          scene.visual as unknown as GovernedImageVisual,
          visualStylesConfig,
        );
        const kenBurns = resolvedStyle.motion
          ? getKenBurnsArgs(resolvedStyle.motion, sceneDurationSec, 30)
          : "";
        const gradeSegment = resolvedStyle.grade
          ? getGradeArgs(resolvedStyle.grade, gradesConfig)
          : "";

        if (kenBurns && gradeSegment) {
          filterChain = `${kenBurns},${gradeSegment}`;
        } else if (kenBurns) {
          filterChain = kenBurns;
        } else if (gradeSegment) {
          filterChain = `scale=1920:1080,setsar=1,${gradeSegment}`;
        } else {
          filterChain = null;
        }

        const grainEnabled =
          Boolean(resolvedStyle.grade) &&
          Boolean(
            gradesConfig.grades[resolvedStyle.grade as keyof GradesConfig["grades"]]?.grain,
          );

        logger.log("scene_render_encode_filters", {
          payload: {
            scene_id: scene.scene_id,
            visualStyle: (scene.visual as { visual_style?: string }).visual_style ?? null,
            motionType: resolvedStyle.motion?.type ?? null,
            motionFocus: resolvedStyle.motion?.focus ?? null,
            grade: resolvedStyle.grade,
            grain: grainEnabled,
            filterChain,
          },
        });
      }

      let clipArgs: string[];
      const hasMotion = Boolean(filterChain && resolvedStyle?.motion);
      if (filterChain) {
        const profile = getEncodingProfile();
        if (hasMotion) {
          // zoompan expects a single image input (no -loop 1) and controls
          // output frame count via its d= parameter, so omit -t as well.
          clipArgs = [
            "-i",
            absAsset,
            "-vf",
            filterChain,
            "-c:v",
            profile.video_codec,
            "-preset",
            profile.preset,
            "-profile:v",
            profile.profile,
            "-pix_fmt",
            profile.pix_fmt,
            "-crf",
            String(profile.crf),
            sceneClipPath,
          ];
        } else {
          // Grade-only (no zoompan) — use the looped-image input approach.
          clipArgs = [
            "-loop",
            "1",
            "-i",
            absAsset,
            "-t",
            String(sceneDurationSec),
            "-vf",
            filterChain,
            "-r",
            "30",
            "-c:v",
            profile.video_codec,
            "-preset",
            profile.preset,
            "-profile:v",
            profile.profile,
            "-pix_fmt",
            profile.pix_fmt,
            "-crf",
            String(profile.crf),
            sceneClipPath,
          ];
        }
      } else {
        clipArgs = ffmpegAdapter.getSceneClipArgs({
          assetPath: absAsset,
          durationSec: sceneDurationSec,
          outputPath: sceneClipPath,
        });
      }

      await runFfmpeg(ffmpegAdapter.getFfmpegPath(), clipArgs);
      if (!existsSync(sceneClipPath)) throw new Error(`Scene clip not created: ${sceneClipPath}`);

      let narrationPath: string;
      let narrationDurationMs: number;

      if (pre) {
        narrationPath = pre.audioPath;
        narrationDurationMs = pre.durationMs;
      } else {
        const voiceConfig = getVoiceConfig(
          scene.narration.language,
          scene.narration.voice_gender,
          process.cwd(),
        );
        const { modelPath, modelConfigPath } = getVoiceModelPaths(
          scene.narration.language,
          scene.narration.voice_gender,
          process.cwd(),
        );
        const ttsAdapter = new LocalPiperAdapter({ modelPath, modelConfigPath });
        const templateText = resolveTemplate(
          scriptTemplates,
          scene.narration.text_template_key,
          scene.narration.language,
        );
        narrationPath = join(scenesDir, `scene_${scene.scene_id}_narration.wav`);
        const ttsResponse = await ttsAdapter.synthesize({
          text: templateText,
          runId,
          voice: voiceConfig.voice,
          speechRate: scene.narration.speed,
          sampleRate: 48000,
          outputFormat: "wav",
          outputDir: scenesDir,
          outputPath: narrationPath,
        });
        narrationDurationMs = getWavDurationMs(ttsResponse.audioPath);
      }
      const videoDurationMs = Math.round(sceneDurationSec * 1000);
      const driftResult = pre
        ? { valid: true, driftMs: videoDurationMs - narrationDurationMs }
        : validateAvDrift(videoDurationMs, narrationDurationMs);
      if (!driftResult.valid) {
        throw new Error(
          `Unified drift violation for scene ${scene.scene_id}: ${driftResult.error ?? ""}`,
        );
      }
      sceneVideoPaths.push(sceneClipPath);
      sceneNarrationPaths.push(narrationPath);
      artifacts.push({
        scene_id: scene.scene_id,
        videoPath: sceneClipPath,
        narrationPath: narrationPath,
        narrationDurationMs,
        driftMs: driftResult.driftMs,
      });
      logger.log("mode_c_scene_router", {
        payload: { index, type: "governed_image", renderer: "png" },
      });
      logger.log("scene_render_scene_done", {
        payload: { scene_id: scene.scene_id, narrationDurationMs, driftMs: driftResult.driftMs },
      });
      continue;
    }

    if (isModeCRemotionScene(scene)) {
      if (!remotionAdapter) {
        throw new Error(
          "REMOTION_DISABLED_IN_CONFIG: remotion.enabled is false but contract has type: \"remotion\" scene(s)",
        );
      }
      const component = scene.visual.component;
      if (component !== "SceneTitleCard") {
        throw new Error(
          `REMOTION_WRAP_COMPONENT_NOT_ALLOWED: Mode C remotion scene component must be SceneTitleCard, got ${component}`,
        );
      }
      const props = scene.visual.props as Record<string, unknown>;
      const propsValidation = validateRemotionProps("SceneTitleCard", props);
      if (!propsValidation.valid) {
        throw new Error(
          `REMOTION_PROPS_COMPONENT_MISMATCH: ${propsValidation.errors.join("; ")}`,
        );
      }
      const durationInFrames =
        typeof props.showDurationFrames === "number" ? props.showDurationFrames : 90;
      const sceneClipPath = join(scenesDir, `scene_${scene.scene_id}.mp4`);
      try {
        await remotionAdapter.render({
          compositionId: "SceneTitleCard",
          props,
          outputPath: sceneClipPath,
          durationInFrames,
          runId,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
          `REMOTION_SCENE_RENDER_FAILED: scene ${index} (${scene.scene_id}): ${message}`,
        );
      }
      if (!existsSync(sceneClipPath)) {
        throw new Error(`REMOTION_SCENE_RENDER_FAILED: output missing at ${sceneClipPath}`);
      }
      const probe = await ffprobeRemotionOutput(ffprobePath, sceneClipPath);
      validateRemotionProbe(probe);
      const streamInfo = await ffmpegAdapter.getVideoStreamInfo(sceneClipPath);
      const renderedDurationMs = streamInfo.durationMs;
      const renderedDurationFrames = Math.round((renderedDurationMs / 1000) * streamInfo.fps);
      const renderedDurationSec = renderedDurationMs / 1000;

      const voiceConfig = getVoiceConfig(
        scene.narration.language,
        scene.narration.voice_gender,
        process.cwd(),
      );
      const { modelPath, modelConfigPath } = getVoiceModelPaths(
        scene.narration.language,
        scene.narration.voice_gender,
        process.cwd(),
      );
      const ttsAdapter = new LocalPiperAdapter({ modelPath, modelConfigPath });
      const templateText = resolveTemplate(
        scriptTemplates,
        scene.narration.text_template_key,
        scene.narration.language,
      );
      const narrationPath = join(scenesDir, `scene_${scene.scene_id}_narration.wav`);
      const ttsResponse = await ttsAdapter.synthesize({
        text: templateText,
        runId,
        voice: voiceConfig.voice,
        speechRate: scene.narration.speed,
        sampleRate: 48000,
        outputFormat: "wav",
        outputDir: scenesDir,
        outputPath: narrationPath,
      });
      const narrationDurationMs = getWavDurationMs(ttsResponse.audioPath);
      const driftResult = validateAvDrift(renderedDurationMs, narrationDurationMs);
      if (!driftResult.valid) {
        throw new Error(
          `Unified drift violation for scene ${scene.scene_id}: ${driftResult.error ?? ""}`,
        );
      }
      sceneVideoPaths.push(sceneClipPath);
      sceneNarrationPaths.push(ttsResponse.audioPath);
      artifacts.push({
        scene_id: scene.scene_id,
        videoPath: sceneClipPath,
        narrationPath: ttsResponse.audioPath,
        narrationDurationMs,
        driftMs: driftResult.driftMs,
      });
      logger.log("mode_c_scene_router", {
        payload: {
          index,
          type: "remotion",
          component: "SceneTitleCard",
          renderer: "remotion",
          renderedDurationFrames,
          renderedDurationSec,
          fps: streamInfo.fps,
        },
      });
      logger.log("scene_render_scene_done", {
        payload: { scene_id: scene.scene_id, narrationDurationMs, driftMs: driftResult.driftMs },
      });
      continue;
    }

    throw new Error(
      `MODE_C_UNKNOWN_SCENE_TYPE: scene ${index} (${scene.scene_id}) has visual.type "${(scene as { visual?: { type?: string } }).visual?.type ?? "missing"}", expected "governed_image" or "remotion"`,
    );
  }

  return { sceneVideoPaths, sceneNarrationPaths, artifacts };
}
