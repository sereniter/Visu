/**
 * Scene-driven Mode A (Sprint 11). One contract → intro + N scenes + summary → one final video.
 * Audio-first recording: narration duration drives clip length. Intro/summary use Mode C pattern (PNG + TTS).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Page } from "playwright";
import { copyFile, unlink } from "node:fs/promises";
import type { RunContext } from "../core/run_context.js";
import { validateAvDrift } from "../validators/av_drift_validator.js";
import { getConfig, getEncodingProfile, type EncodingProfile } from "../core/config.js";
import type { FFmpegAdapterInterface } from "../adapters/ffmpeg_adapter.js";
import { runFfmpeg, parseFfmpegVersion } from "../adapters/ffmpeg_adapter.js";
import { getWavDurationMs } from "../core/wav_utils.js";
import { getVoiceConfig, getVoiceModelPaths } from "../core/language_config.js";
import { LocalPiperAdapter } from "../adapters/tts/local_piper_adapter.js";
import {
  validateUIFlowScenesContract,
  resolveUIFlowSceneRemotionOverlays,
  type UIFlowSceneContractV15,
  type UIFlowSceneContractV16,
  type UIFlowSceneStep,
  type UIFlowIntroSummaryScene,
  type UIFlowIntroSummarySceneV16,
  type LocatorDescriptor,
} from "../validators/scene_schema.js";
import { validateLanguageRegistry, validateSceneLanguages } from "../validators/language_registry_validator.js";
import { runTimeline } from "./timeline_engine.js";
import { runWavConcat } from "./wav_concat_engine.js";
import { runAvMerge } from "./av_merge_engine.js";
import { buildTranscodeArgs } from "../adapters/ffmpeg_adapter.js";
import { startSoundsServer } from "../core/sounds_server.js";
import {
  applyTitleCardAndProgress,
  applyZoomToAction,
  addChapterMarkers,
  generateSrt,
  generateThumbnail,
  assembleVideoDescription,
} from "./post_production_helpers.js";
import { RemotionAdapter } from "../adapters/remotion_adapter.js";
import {
  ffprobeRemotionOutput,
  validateRemotionProbe,
} from "../validators/remotion_output_validator.js";
import { writeMediaMetadata } from "./metadata_writer.js";
import { DefaultScreenCaptureAdapter } from "../adapters/screen_capture_adapter.js";

const SCRIPT_TEMPLATES_PATH = "scripts/script_templates.json";
const SCENE_FPS = 30;
// Must match Remotion SceneTitleCard durationInFrames (see remotion-templates/src/Root.tsx).
const TITLE_CARD_FRAMES = 60;

/** Same duration as Remotion SceneTitleCard when using engine defaults. */
export function getUiFlowTitleCardPadDurationSec(): number {
  return TITLE_CARD_FRAMES / SCENE_FPS;
}

/**
 * Builds WAV paths for `runWavConcat`: intro, per-scene speech (+ optional transition + title-card pad when overlays on), summary.
 * With overlays: order at each boundary is transition → pad → scene narration (Option A).
 */
export function buildUiFlowNarrationWavPaths(params: {
  narrationPaths: string[];
  transitionPath: string | null;
  useRemotionOverlays: boolean;
  titleCardPadPath: string | null;
}): string[] {
  const { narrationPaths, transitionPath, useRemotionOverlays, titleCardPadPath } = params;
  const hasTransition = Boolean(transitionPath);

  if (useRemotionOverlays && titleCardPadPath) {
    const out: string[] = [narrationPaths[0]!];
    const sceneCount = narrationPaths.length - 2;
    for (let si = 0; si < sceneCount; si++) {
      if (hasTransition) out.push(transitionPath!);
      out.push(titleCardPadPath);
      out.push(narrationPaths[si + 1]!);
    }
    if (hasTransition) out.push(transitionPath!);
    out.push(narrationPaths[narrationPaths.length - 1]!);
    return out;
  }

  if (hasTransition) {
    const out: string[] = [];
    for (let i = 0; i < narrationPaths.length; i++) {
      out.push(narrationPaths[i]!);
      if (i < narrationPaths.length - 1) out.push(transitionPath!);
    }
    return out;
  }

  return [...narrationPaths];
}

/** Composite RGBA PNG sequence over scene video; optionally keep scene muxed narration (stream 0:a). */
async function compositeProgressOverlayFromPngSequence(params: {
  sceneClipPath: string;
  framesDir: string;
  framePattern: string;
  fps: number;
  outputPath: string;
  ffmpegPath: string;
  muxSceneAudio: boolean;
  profile: EncodingProfile;
}): Promise<void> {
  const overlayInput = join(params.framesDir, params.framePattern);
  const fc =
    `[1:v]format=rgba,scale=1920:1080:flags=bicubic,setpts=PTS-STARTPTS[ovr];` +
    `[0:v][ovr]overlay=0:0:shortest=1[outv]`;
  const args: string[] = [
    "-y",
    "-i", params.sceneClipPath,
    "-framerate", String(params.fps),
    "-start_number", "0",
    "-i", overlayInput,
    "-filter_complex", fc,
    "-map", "[outv]",
  ];
  if (params.muxSceneAudio) {
    args.push(
      "-map", "0:a:0",
      "-c:a", params.profile.audio_codec,
      "-ar", String(params.profile.audio_sample_rate),
    );
  } else {
    args.push("-an");
  }
  args.push(
    "-c:v", params.profile.video_codec,
    "-preset", params.profile.preset,
    "-profile:v", params.profile.profile,
    "-pix_fmt", params.profile.pix_fmt,
    "-crf", String(params.profile.crf),
    "-r", String(params.fps),
    "-map_metadata", "-1",
    "-movflags", "+faststart",
    params.outputPath,
  );
  await runFfmpeg(params.ffmpegPath, args);
}

/**
 * Add a stereo silent AAC track so concat demuxer matches scene clips that carry muxed narration.
 * AAC sample rate / layout must stay aligned with `getEncodingProfile`; change both together if the profile changes.
 */
async function muxSilentStereoAudio(params: {
  videoPath: string;
  outputPath: string;
  ffmpegPath: string;
  durationMs: number;
  profile: EncodingProfile;
}): Promise<void> {
  const sec = Math.max(0.001, params.durationMs / 1000);
  const durStr = sec.toFixed(3);
  await runFfmpeg(params.ffmpegPath, [
    "-y",
    "-i", params.videoPath,
    "-f", "lavfi",
    "-i", `anullsrc=channel_layout=stereo:sample_rate=${params.profile.audio_sample_rate}`,
    "-filter_complex", `[1:a]atrim=duration=${durStr},asetpts=PTS-STARTPTS[aout]`,
    "-map", "0:v:0",
    "-map", "[aout]",
    "-c:v", "copy",
    "-c:a", params.profile.audio_codec,
    "-ar", String(params.profile.audio_sample_rate),
    "-movflags", "+faststart",
    "-map_metadata", "-1",
    params.outputPath,
  ]);
}

async function generateTitleCardSilenceWav(params: {
  outputPath: string;
  ffmpegPath: string;
  durationSec: number;
  profile: EncodingProfile;
}): Promise<void> {
  const sr = params.profile.audio_sample_rate;
  // Mono to match Piper/TTS narration WAVs; runWavConcat requires identical channel count across inputs.
  await runFfmpeg(params.ffmpegPath, [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `anullsrc=channel_layout=mono:sample_rate=${sr}`,
    "-t",
    String(params.durationSec),
    "-acodec",
    "pcm_s16le",
    params.outputPath,
  ]);
}

/** If clip has no audio, mux silent AAC (profile-aligned) for timeline concat; otherwise return the same path. */
export async function normalizeTimelineSegmentVideoForConcat(params: {
  videoPath: string;
  outputPath: string;
  adapter: FFmpegAdapterInterface;
  profile: EncodingProfile;
}): Promise<string> {
  const probe = await ffprobeRemotionOutput(params.adapter.getFfprobePath(), params.videoPath);
  const hasAudio = probe.streams.some((s) => s.codec_type === "audio");
  if (hasAudio) return params.videoPath;
  const durationMs = (await params.adapter.getVideoStreamInfo(params.videoPath)).durationMs;
  await muxSilentStereoAudio({
    videoPath: params.videoPath,
    outputPath: params.outputPath,
    ffmpegPath: params.adapter.getFfmpegPath(),
    durationMs,
    profile: params.profile,
  });
  return params.outputPath;
}

async function concatDemuxer(params: {
  clipPaths: string[];
  outputPath: string;
  ffmpegPath: string;
  outputDir: string;
  listFileName: string;
}): Promise<void> {
  const { clipPaths, outputPath, ffmpegPath, outputDir, listFileName } = params;
  const listPath = join(outputDir, listFileName);
  const listContent = clipPaths.map((p) => `file '${p}'`).join("\n");
  writeFileSync(listPath, listContent, "utf-8");
  await runFfmpeg(ffmpegPath, [
    "-f", "concat",
    "-safe", "0",
    "-i", listPath,
    "-c", "copy",
    "-movflags", "+faststart",
    outputPath,
  ]);
}

interface ScriptTemplates {
  [key: string]: { text?: string; template?: string; language: string; variables?: string[] };
}

/** Load script templates from flow dir (contentRoot/topic); fall back to cwd/scripts when missing. */
function loadScriptTemplates(baseDir: string): ScriptTemplates {
  const flowPath = join(baseDir, SCRIPT_TEMPLATES_PATH);
  const fallbackPath = join(process.cwd(), SCRIPT_TEMPLATES_PATH);
  const path = existsSync(flowPath) ? flowPath : fallbackPath;
  if (!existsSync(path)) throw new Error(`Script templates not found: ${flowPath} or ${fallbackPath}`);
  return JSON.parse(readFileSync(path, "utf-8")) as ScriptTemplates;
}

function resolveTemplateText(templates: ScriptTemplates, key: string, language: string): string {
  const entry = templates[key];
  if (!entry) throw new Error(`Script template key not found: ${key}`);
  if (entry.language !== language) {
    throw new Error(`Script template ${key} language "${entry.language}" does not match "${language}".`);
  }
  const text = (entry.text ?? entry.template ?? "").trim();
  if (!text) throw new Error(`Script template ${key} resolved to empty text`);
  return text;
}

/** Render one PNG + TTS clip (intro or summary). Returns video path and narration path. */
async function renderPngTtsClip(params: {
  scene: UIFlowIntroSummaryScene;
  outputDir: string;
  sceneLabel: string;
  resolvePath: (p: string) => string;
  baseDir: string;
  runId: string;
  adapter: FFmpegAdapterInterface;
  logger: { log: (step: string, options?: { payload?: object }) => void };
}): Promise<{ videoPath: string; narrationPath: string }> {
  const { scene, outputDir, sceneLabel, resolvePath, baseDir, runId, adapter, logger } = params;
  const templates = loadScriptTemplates(baseDir);
  const text = resolveTemplateText(templates, scene.narration.text_template_key, scene.narration.language);
  const voiceConfig = getVoiceConfig(scene.narration.language, scene.narration.voice_gender, process.cwd());
  const { modelPath, modelConfigPath } = getVoiceModelPaths(
    scene.narration.language,
    scene.narration.voice_gender,
    process.cwd()
  );
  const tts = new LocalPiperAdapter({ modelPath, modelConfigPath });
  const narrationPath = join(outputDir, `${sceneLabel}_narration.wav`);
  const ttsResponse = await tts.synthesize({
    text,
    runId,
    voice: voiceConfig.voice,
    speechRate: scene.narration.speed,
    sampleRate: 48000,
    outputFormat: "wav",
    outputDir,
    outputPath: narrationPath,
  });
  const narrationDurationMs = getWavDurationMs(ttsResponse.audioPath);
  const durationSec = narrationDurationMs / 1000 + scene.buffer_sec;
  const absAsset = resolvePath(scene.asset_path);
  if (!existsSync(absAsset)) throw new Error(`Intro/summary asset not found: ${absAsset}`);
  const videoPath = join(outputDir, `${sceneLabel}.mp4`);
  const clipArgs = adapter.getSceneClipArgs({
    assetPath: absAsset,
    durationSec,
    outputPath: videoPath,
  });
  await runFfmpeg(adapter.getFfmpegPath(), clipArgs);
  logger.log("ui_flow_scene_png_tts_done", { payload: { sceneLabel, narrationDurationMs } });
  return { videoPath, narrationPath: ttsResponse.audioPath };
}

/** Build init scripts for recording enhancements (cursor, click sound). When soundsBaseUrl is set, play click.wav from URL; else synthetic beep. */
function buildRecordingEnhancementScripts(
  enhancements: UIFlowSceneContractV15["recording_enhancements"],
  soundsBaseUrl: string | null
): string[] {
  const scripts: string[] = [];
  if (enhancements.cursorHighlight) {
    scripts.push(`
      (function() {
        var cursor = document.createElement('div');
        cursor.style.cssText = 'position:fixed;width:24px;height:24px;border-radius:50%;background:rgba(255,107,53,0.4);border:2px solid ${enhancements.highlightColor};pointer-events:none;transform:translate(-50%,-50%);z-index:99999;transition:all 0.1s ease;';
        document.body.appendChild(cursor);
        document.addEventListener('mousemove', function(e) {
          cursor.style.left = e.clientX + 'px';
          cursor.style.top = e.clientY + 'px';
        });
      })();
    `);
  }
  if (enhancements.clickSound) {
    if (soundsBaseUrl) {
      scripts.push(`
        (function() {
          var url = ${JSON.stringify(soundsBaseUrl + "/click.wav")};
          document.addEventListener('click', function() {
            try {
              var a = new Audio(url);
              a.volume = 0.5;
              a.play().catch(function(){});
            } catch (e) {}
          });
        })();
      `);
    } else {
      scripts.push(`
        (function() {
          try {
            var ctx = new (window.AudioContext || window.webkitAudioContext)();
            document.addEventListener('click', function() {
              var osc = ctx.createOscillator();
              var gain = ctx.createGain();
              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.frequency.value = 800;
              gain.gain.setValueAtTime(0.2, ctx.currentTime);
              gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
              osc.start(ctx.currentTime);
              osc.stop(ctx.currentTime + 0.08);
            });
          } catch (e) {}
        })();
      `);
    }
  }
  return scripts;
}

/** Execute one scene: TTS → run steps on shared page → mix audio → merge. */
async function executeSceneRecording(params: {
  contract: UIFlowSceneContractV15 | UIFlowSceneContractV16;
  scene: UIFlowSceneContractV15["scenes"][0];
  outputDir: string;
  baseDir: string;
  runId: string;
  adapter: FFmpegAdapterInterface;
  logger: { log: (step: string, options?: { payload?: object }) => void };
  page: Page;
  screenCapture: DefaultScreenCaptureAdapter;
  soundsBaseUrl?: string | null;
}): Promise<{ videoPath: string; narrationPath: string; clickTimestampsMs: number[] }> {
  const { contract, scene, outputDir, baseDir, runId, adapter, logger, page, screenCapture, soundsBaseUrl } =
    params;
  const templates = loadScriptTemplates(baseDir);
  const text = resolveTemplateText(templates, scene.narration.text_template_key, scene.narration.language);
  const voiceConfig = getVoiceConfig(scene.narration.language, scene.narration.voice_gender, process.cwd());
  const { modelPath, modelConfigPath } = getVoiceModelPaths(
    scene.narration.language,
    scene.narration.voice_gender,
    process.cwd()
  );
  const tts = new LocalPiperAdapter({ modelPath, modelConfigPath });
  const narrationPath = join(outputDir, `scene_${scene.scene_id}_narration.wav`);
  logger.log("ui_flow_scene_tts_start", {
    payload: { scene_id: scene.scene_id },
  });
  const ttsResponse = await tts.synthesize({
    text,
    runId,
    voice: voiceConfig.voice,
    speechRate: scene.narration.speed,
    sampleRate: 48000,
    outputFormat: "wav",
    outputDir,
    outputPath: narrationPath,
  });
  logger.log("ui_flow_scene_tts_done", {
    payload: { scene_id: scene.scene_id, narrationDurationMs: getWavDurationMs(ttsResponse.audioPath) },
  });
  const narrationDurationMs = getWavDurationMs(ttsResponse.audioPath);
  const recordingDurationMs = narrationDurationMs + scene.buffer_sec * 1000;
  const config = getConfig();
  const enhancements = contract.recording_enhancements;

  const baseUrl = contract.baseUrl.replace(/\/$/, "");
  const clickTimestampsMs: number[] = [];
  const startTime = Date.now();

  const playSound = async (wavName: string): Promise<void> => {
    if (!soundsBaseUrl || !enhancements.ambientSounds) return;
    await page
      .evaluate(
        (url) => {
          try {
            const a = new (window as unknown as { Audio: new (u: string) => { play: () => Promise<unknown>; volume: number } }).Audio(url);
            (a as { volume: number }).volume = 0.4;
            a.play().catch(() => {});
          } catch {
            // ignore
          }
        },
        `${soundsBaseUrl}/${wavName}`
      )
      .catch(() => {});
  };

  const resolveLocator = (
    step: UIFlowSceneStep,
  ): import("playwright").Locator => {
    const loc: LocatorDescriptor | undefined = (step as UIFlowSceneStep & {
      locator?: LocatorDescriptor;
    }).locator;

    if (!loc) {
      if (!step.selector) {
        throw new Error(
          `UIFlowSceneStep is missing both locator and selector for action ${step.action}`,
        );
      }
      return page.locator(step.selector);
    }

    let base: import("playwright").Locator;

    switch (loc.type) {
      case "getByRole":
        base = page.getByRole(loc.role as any, loc.options);
        break;
      case "getByText":
        base = page.getByText(loc.text, loc.options);
        break;
      case "getByLabel":
        base = page.getByLabel(loc.text);
        break;
      case "getByPlaceholder":
        base = page.getByPlaceholder(loc.text);
        break;
      case "locator":
      default: {
        base = page.locator(loc.selector);
        if (loc.filter?.hasText) {
          base = base.filter({ hasText: loc.filter.hasText });
        }
        break;
      }
    }

    if (loc.nth !== undefined) {
      base = base.nth(loc.nth);
    }

    return base;
  };

  const runStep = async (step: UIFlowSceneStep): Promise<void> => {
    switch (step.action) {
      case "navigate": {
        const url = step.url?.startsWith("/") ? baseUrl + step.url : step.url ?? baseUrl;
        await page.goto(url, { waitUntil: "load", timeout: config.execution.actionTimeoutMs });
        await playSound("page_load.wav");
        return;
      }
      case "click": {
        const locator = resolveLocator(step);
        if (enhancements.clickHighlight) {
          await locator.evaluate((el, color) => {
            (el as HTMLElement).style.outline = `3px solid ${color}`;
            (el as HTMLElement).style.boxShadow = `0 0 12px ${color}80`;
            (el as HTMLElement).style.transition = "all 0.2s ease";
          }, enhancements.highlightColor);
          await page.waitForTimeout(enhancements.highlightDurationMs);
        }
        clickTimestampsMs.push(Date.now() - startTime);
        await locator.click({ timeout: config.execution.actionTimeoutMs });
        return;
      }
      case "fill": {
        const locator = resolveLocator(step);
        await locator.fill(step.value ?? "", { timeout: config.execution.actionTimeoutMs });
        await playSound("keyboard.wav");
        return;
      }
      case "wait": {
        if (step.selector === "networkidle") {
          await page.waitForLoadState("networkidle", { timeout: config.execution.actionTimeoutMs });
        } else if (step.selector) {
          await page.waitForSelector(step.selector, { timeout: config.execution.actionTimeoutMs });
        }
        return;
      }
      case "wait_ms": {
        const ms = step.value !== undefined ? Number(step.value) : 0;
        if (!Number.isFinite(ms) || ms < 0) {
          throw new Error(`wait_ms step must have non-negative numeric value, got "${step.value ?? "undefined"}"`);
        }
        await page.waitForTimeout(ms);
        return;
      }
      case "scroll": {
        if (step.selector) {
          await page
            .locator(step.selector)
            .evaluate((el) => (el as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center", inline: "center" }));
        } else {
          await page.evaluate(() => {
            window.scrollBy(0, window.innerHeight * 0.8);
          });
        }
        return;
      }
      case "screenshot":
        return;
      case "done":
        return;
      default:
        throw new Error(`Unknown step action: ${(step as UIFlowSceneStep).action}`);
    }
  };

  const sceneRawPath = join(outputDir, `scene_${scene.scene_id}_raw.mp4`);
  try {
    logger.log("ui_flow_scene_capture_start", {
      payload: { scene_id: scene.scene_id, output: sceneRawPath },
    });
    await screenCapture.start(sceneRawPath);

    logger.log("ui_flow_scene_steps_start", { payload: { scene_id: scene.scene_id, stepCount: scene.steps.length } });
    for (let i = 0; i < scene.steps.length; i++) {
      const step = scene.steps[i]!;
      if (step.action === "done") {
        logger.log("ui_flow_scene_step_done_reached", { payload: { scene_id: scene.scene_id, index: i } });
        break;
      }
      logger.log("ui_flow_scene_step_start", {
        payload: {
          scene_id: scene.scene_id,
          index: i,
          action: step.action,
          selector: step.selector,
          url: step.url,
          hasValue: typeof step.value === "string",
        },
      });
      await runStep(step);
      logger.log("ui_flow_scene_step_end", {
        payload: {
          scene_id: scene.scene_id,
          index: i,
          action: step.action,
        },
      });
    }

  } finally {
    try {
      await screenCapture.stop();
      logger.log("ui_flow_scene_capture_stop", {
        payload: { scene_id: scene.scene_id, output: sceneRawPath },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.log("scene_capture_stop_failed", {
        payload: { scene_id: scene.scene_id, error: message },
      });
      throw err;
    }
  }

  const sceneMp4Path = sceneRawPath;
  const ffmpegPath = adapter.getFfmpegPath();

  // For Mode A, keep scene audio as pure narration; background music
  // is applied once at the final AV merge stage to the stitched video.
  const sceneAudioPath = join(outputDir, `scene_${scene.scene_id}_audio.wav`);
  await copyFile(ttsResponse.audioPath, sceneAudioPath);

  const sceneFinalPath = join(outputDir, `scene_${scene.scene_id}_final.mp4`);
  const profile = getEncodingProfile();
  const transcodeArgs = buildTranscodeArgs({
    rawVideoPath: sceneMp4Path,
    narrationPath: sceneAudioPath,
    musicPath: null,
    outputPath: sceneFinalPath,
    profile,
  });
  await runFfmpeg(ffmpegPath, transcodeArgs);

  logger.log("ui_flow_scene_record_done", {
    payload: { scene_id: scene.scene_id, narrationDurationMs, clickCount: clickTimestampsMs.length },
  });

  return {
    videoPath: sceneFinalPath,
    narrationPath: ttsResponse.audioPath,
    clickTimestampsMs,
  };
}

export interface UIFlowSceneEngineParams {
  contractPath: string;
  context: RunContext;
  logger: { log: (step: string, options?: { message?: string; payload?: object }) => void };
  adapter: FFmpegAdapterInterface;
}

export interface UIFlowSceneEngineResult {
  status: "completed" | "failed";
  artifacts: {
    finalVideoPath?: string;
    metadataPath?: string;
  };
}

/**
 * Run scene-driven Mode A: validate v1.5 → intro (PNG+TTS) → per-scene record → summary (PNG+TTS) →
 * timeline concat → WAV concat (with transition sounds if enabled) → AV merge → metadata & copy.
 */
export async function runUIFlowSceneEngine(params: UIFlowSceneEngineParams): Promise<UIFlowSceneEngineResult> {
  const { contractPath, context, logger, adapter } = params;
  const config = getConfig();
  const topic = (JSON.parse(readFileSync(contractPath, "utf-8")) as { topic?: string }).topic;
  if (!topic) throw new Error("Contract must have topic");
  const baseDir = join(config.contentRoot, topic);
  const outputDir = join(process.cwd(), config.execution.artifactsDir, context.runId);
  mkdirSync(outputDir, { recursive: true });
  const resolvePath = (p: string) => resolve(baseDir, p);

  try {
    const contractJson = JSON.parse(readFileSync(contractPath, "utf-8")) as unknown;
    const contractResult = validateUIFlowScenesContract(contractJson);
    if (!contractResult.valid) {
      throw new Error(`Contract validation failed: ${(contractResult as { errors: string[] }).errors.join("; ")}`);
    }
    const contract = contractResult.data as UIFlowSceneContractV15 | UIFlowSceneContractV16;
    logger.log("ui_flow_scenes_contract_valid", {
      payload: {
        video_id: contract.video_id,
        sceneCount: contract.scenes.length,
        schemaVersion: contract.schema_version,
      },
    });

    const remotionConfig = config.remotion ?? { enabled: false };
    const contractSchemaIsV16 = (contract as UIFlowSceneContractV16).schema_version === "1.6";

    let remotionAdapter: RemotionAdapter | null = null;
    if (remotionConfig.enabled) {
      remotionAdapter = new RemotionAdapter(remotionConfig.templatesRoot, logger);
    }

    const resolvedUseRemotionOverlays = resolveUIFlowSceneRemotionOverlays({
      contract,
      remotionEnabled: remotionConfig.enabled === true,
      configUseRemotionOverlays: config.remotion?.useRemotionOverlays,
    });
    if (resolvedUseRemotionOverlays && !remotionAdapter) {
      throw new Error(
        "REMOTION_REQUIRED: Remotion overlays are enabled (contract or config) but remotion.enabled is false in config.",
      );
    }

    const introRenderer: "png" | "remotion" =
      contractSchemaIsV16 && (contract as UIFlowSceneContractV16).intro.renderer === "remotion"
        ? "remotion"
        : "png";
    const summaryRenderer: "png" | "remotion" =
      contractSchemaIsV16 && (contract as UIFlowSceneContractV16).summary.renderer === "remotion"
        ? "remotion"
        : "png";

    logger.log("ui_flow_scenes_renderer_selection", {
      payload: {
        introRenderer,
        summaryRenderer,
        useRemotionOverlays: resolvedUseRemotionOverlays,
      },
    });

    const registryResult = validateLanguageRegistry(process.cwd());
    if (!registryResult.valid) {
      throw new Error(`Language registry validation failed: ${(registryResult as { errors: string[] }).errors.join("; ")}`);
    }
    const allScenesForLang = [
      { scene_id: contract.intro.scene_id, narration: contract.intro.narration },
      ...contract.scenes.map((s) => ({ scene_id: s.scene_id, narration: s.narration })),
      { scene_id: contract.summary.scene_id, narration: contract.summary.narration },
    ];
    validateSceneLanguages(allScenesForLang, process.cwd());

    const ffmpegInfo = await adapter.getVersionBuildconfAndFingerprint();
    const version = parseFfmpegVersion(ffmpegInfo.versionFull);
    const major = parseInt(version.split(".")[0] ?? "0", 10);
    if (major < 6) throw new Error(`FFmpeg version ${version} is below minimum 6.0`);
    logger.log("ui_flow_scenes_ffmpeg_ok", { payload: { version } });

    const introBase = await renderPngTtsClip({
      scene: contract.intro,
      outputDir,
      sceneLabel: "intro",
      resolvePath,
      baseDir,
      runId: context.runId,
      adapter,
      logger,
    });

    const introResult = await (async () => {
      if (introRenderer === "remotion") {
        if (!remotionConfig.enabled || !remotionAdapter) {
          throw new Error(
            'REMOTION_DISABLED_IN_CONFIG: remotion.enabled is false but intro.renderer is "remotion"',
          );
        }
        const outPath = join(outputDir, "intro_remotion.mp4");
        const language = contract.intro.narration.language;
        const accent = config.remotion?.accentColor ?? "#FF6B35";
        await remotionAdapter.renderIntro({
          title: contract.video_id,
          subtitle: contract.topic,
          language,
          stepCount: contract.scenes.length,
          accentColor: accent,
          outputPath: outPath,
        });
        return {
          videoPath: outPath,
          narrationPath: introBase.narrationPath,
        };
      }
      return introBase;
    })();

    const timelineScenes: import("./timeline_engine.js").TimelineSceneInput[] = [
      {
        video_path: introResult.videoPath,
        narration_path: introResult.narrationPath,
        scene_id: "intro",
        skip_drift: true,
      },
    ];
    const recordedClickTimestampsMs: number[][] = [];

    const soundsDir = join(process.cwd(), "assets", "sounds");
    const useSoundsServer =
      (contract.recording_enhancements.clickSound || contract.recording_enhancements.ambientSounds) &&
      existsSync(soundsDir);
    const soundsServer = useSoundsServer ? await startSoundsServer(soundsDir) : null;
    const soundsBaseUrl = soundsServer?.baseUrl ?? null;

    // Shared browser/page for all scenes.
    const browser = await chromium.launch({
      headless: config.browser.headless,
      args: [
        // Prefer true fullscreen so screen capture is mostly browser content.
        "--start-fullscreen",
      ],
    });
    const contextPw = await browser.newContext({
      viewport: { width: config.execution.viewport.width, height: config.execution.viewport.height },
      locale: config.browser.locale,
    });
    contextPw.setDefaultTimeout(config.execution.actionTimeoutMs);
    const page = await contextPw.newPage();

    // Inject recording enhancements once for the whole run.
    for (const script of buildRecordingEnhancementScripts(
      contract.recording_enhancements,
      soundsBaseUrl ?? null,
    )) {
      await page.addInitScript(script);
    }

    const screenCapture = new DefaultScreenCaptureAdapter({
      videoDevice: config.screenCapture?.videoDevice ?? "0",
      audioDevice: config.screenCapture?.audioDevice ?? "0",
      startupWaitMs: config.screenCapture?.startupWaitMs ?? 500,
    });

    try {
      for (let i = 0; i < contract.scenes.length; i++) {
        const scene = contract.scenes[i]!;
        const result = await executeSceneRecording({
          contract,
          scene,
          outputDir,
          baseDir,
          runId: context.runId,
          adapter,
          logger,
          page,
          screenCapture,
          soundsBaseUrl,
        });
        recordedClickTimestampsMs.push(result.clickTimestampsMs);

        let sceneVideoForTimeline = result.videoPath;

        if (resolvedUseRemotionOverlays && remotionAdapter) {
          try {
            const sceneInfo = await adapter.getVideoStreamInfo(result.videoPath);
            const sceneDurationFrames = Math.max(1, Math.round((sceneInfo.durationMs / 1000) * SCENE_FPS));
            const accentColor = config.remotion?.accentColor ?? "#FF6B35";
            const profile = getEncodingProfile();

            const sceneProbe = await ffprobeRemotionOutput(adapter.getFfprobePath(), result.videoPath);
            const muxSceneAudio = sceneProbe.streams.some((s) => s.codec_type === "audio");

            const seqBase = join(outputDir, `scene_${scene.scene_id}_progress_overlay`);
            const { framesDir, framePattern, fps: overlayFps } = await remotionAdapter.renderPngSequence({
              compositionId: "ProgressOverlay",
              props: {
                currentStep: i + 1,
                totalSteps: contract.scenes.length,
                language: contract.language,
                accentColor,
                durationInFrames: sceneDurationFrames,
              },
              outputBasePath: seqBase,
              durationInFrames: sceneDurationFrames,
              runId: context.runId,
            });

            const sceneWithOverlayPath = join(outputDir, `scene_${scene.scene_id}_with_overlay.mp4`);
            await compositeProgressOverlayFromPngSequence({
              sceneClipPath: result.videoPath,
              framesDir,
              framePattern,
              fps: overlayFps,
              outputPath: sceneWithOverlayPath,
              ffmpegPath: adapter.getFfmpegPath(),
              muxSceneAudio,
              profile,
            });

            const compositeInfo = await adapter.getVideoStreamInfo(sceneWithOverlayPath);
            const compositeProbe = await ffprobeRemotionOutput(
              adapter.getFfprobePath(),
              sceneWithOverlayPath,
            );
            validateRemotionProbe(compositeProbe, { expectAudio: muxSceneAudio });
            if (
              compositeInfo.width !== 1920 ||
              compositeInfo.height !== 1080 ||
              compositeInfo.pix_fmt !== "yuv420p"
            ) {
              throw new Error(
                `REMOTION_OVERLAY_FAILED: composite profile mismatch for scene ${i} (ProgressOverlay): ` +
                  `${compositeInfo.width}x${compositeInfo.height} ${compositeInfo.pix_fmt}`,
              );
            }

            const titleCardPath = join(outputDir, `scene_${scene.scene_id}_title_card.mp4`);
            await remotionAdapter.render({
              compositionId: "SceneTitleCard",
              props: {
                title: scene.title,
                language: contract.language,
                accentColor,
                showDurationFrames: TITLE_CARD_FRAMES,
              },
              outputPath: titleCardPath,
              durationInFrames: TITLE_CARD_FRAMES,
            });

            const titleInfo = await adapter.getVideoStreamInfo(titleCardPath);
            if (
              titleInfo.codec_name !== compositeInfo.codec_name ||
              titleInfo.width !== compositeInfo.width ||
              titleInfo.height !== compositeInfo.height ||
              titleInfo.pix_fmt !== compositeInfo.pix_fmt ||
              Math.abs(titleInfo.fps - compositeInfo.fps) > 0.1
            ) {
              throw new Error(
                `REMOTION_OVERLAY_FAILED: stream param mismatch between SceneTitleCard and composite for scene ${i}`,
              );
            }

            const titleWithAudioPath = join(outputDir, `scene_${scene.scene_id}_title_card_aac.mp4`);
            await muxSilentStereoAudio({
              videoPath: titleCardPath,
              outputPath: titleWithAudioPath,
              ffmpegPath: adapter.getFfmpegPath(),
              durationMs: titleInfo.durationMs,
              profile,
            });

            const finalSceneClipPath = join(outputDir, `scene_${scene.scene_id}_overlay_final.mp4`);
            await concatDemuxer({
              clipPaths: [titleWithAudioPath, sceneWithOverlayPath],
              outputPath: finalSceneClipPath,
              ffmpegPath: adapter.getFfmpegPath(),
              outputDir,
              listFileName: `scene_${scene.scene_id}_concat_list.txt`,
            });

            sceneVideoForTimeline = finalSceneClipPath;

            logger.log("ui_flow_scene_overlay_pipeline", {
              payload: {
                sceneIndex: i,
                scene_id: scene.scene_id,
                overlayEnabled: true,
                sceneDurationFrames,
                titleFrames: TITLE_CARD_FRAMES,
                finalFrames: TITLE_CARD_FRAMES + sceneDurationFrames,
              },
            });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (message.startsWith("REMOTION_OVERLAY_FAILED:")) {
              throw err;
            }
            throw new Error(
              `REMOTION_OVERLAY_FAILED: overlay pipeline failed for scene ${i} (${scene.scene_id}): ${message}`,
            );
          }
        }

        timelineScenes.push({
          video_path: sceneVideoForTimeline,
          narration_path: result.narrationPath,
          scene_id: scene.scene_id,
          skip_drift: true,
        });
      }
    } finally {
      try {
        await contextPw.close();
      } catch {
        // ignore
      }
      try {
        await browser.close();
      } catch {
        // ignore
      }
      if (soundsServer) await soundsServer.close();
    }

    const summaryBase = await renderPngTtsClip({
      scene: contract.summary,
      outputDir,
      sceneLabel: "summary",
      resolvePath,
      baseDir,
      runId: context.runId,
      adapter,
      logger,
    });

    const summaryResult = await (async () => {
      if (summaryRenderer === "remotion") {
        if (!remotionConfig.enabled || !remotionAdapter) {
          throw new Error(
            'REMOTION_DISABLED_IN_CONFIG: remotion.enabled is false but summary.renderer is "remotion"',
          );
        }
        const outPath = join(outputDir, "summary_remotion.mp4");
        const language = contract.summary.narration.language;
        const accent = remotionConfig.accentColor ?? "#FF6B35";
        await remotionAdapter.renderSummary({
          title: contract.video_id,
          subtitle: contract.topic,
          language,
          completedSteps: contract.scenes.map((s) => s.title),
          accentColor: accent,
          outputPath: outPath,
        });
        return {
          videoPath: outPath,
          narrationPath: summaryBase.narrationPath,
        };
      }
      return summaryBase;
    })();
    timelineScenes.push({
      video_path: summaryResult.videoPath,
      narration_path: summaryResult.narrationPath,
      scene_id: "summary",
      skip_drift: true,
    });

    const encodingProfile = getEncodingProfile();
    const scenesForTimeline = await (async () => {
      const out: typeof timelineScenes = [];
      for (let idx = 0; idx < timelineScenes.length; idx++) {
        const s = timelineScenes[idx]!;
        const sid = s.scene_id ?? `segment_${idx}`;
        const safeId = sid.replace(/[^a-zA-Z0-9_-]/g, "_");
        const outNorm = join(outputDir, `${idx}_${safeId}_timeline_norm.mp4`);
        const video_path = await normalizeTimelineSegmentVideoForConcat({
          videoPath: s.video_path,
          outputPath: outNorm,
          adapter,
          profile: encodingProfile,
        });
        out.push({ ...s, video_path });
      }
      return out;
    })();

    const timelineResult = await runTimeline({
      scenes: scenesForTimeline,
      outputDir,
      adapter,
      logger,
    });
    logger.log("ui_flow_scenes_timeline_done", {
      payload: { stitchedVideoPath: timelineResult.stitchedVideoPath, totalDurationMs: timelineResult.totalDurationMs },
    });

    const segmentDurationsMs = timelineResult.sceneProbes.map((p) => p.videoDurationMs);
    const segmentTitles: string[] = [
      "Introduction",
      ...contract.scenes.map((s) => s.title),
      "Summary",
    ];
    const segmentsForPost = segmentTitles.map((title, i) => ({
      title,
      durationMs: segmentDurationsMs[i] ?? 0,
    }));

    let rawVideoPath = timelineResult.stitchedVideoPath;
    if (!resolvedUseRemotionOverlays && (contract.post_production.stepTitleCard || contract.post_production.progressIndicator)) {
      const enhancedPath = join(outputDir, "stitched_enhanced.mp4");
      await applyTitleCardAndProgress({
        inputPath: timelineResult.stitchedVideoPath,
        outputPath: enhancedPath,
        segments: segmentsForPost,
        stepTitleCard: contract.post_production.stepTitleCard,
        progressIndicator: contract.post_production.progressIndicator,
        ffmpegPath: adapter.getFfmpegPath(),
      });
      rawVideoPath = enhancedPath;
    }
    if (contract.recording_enhancements.zoomToAction && recordedClickTimestampsMs.some((a) => a.length > 0)) {
      const segmentDurationsMs = timelineResult.sceneProbes.map((p) => p.videoDurationMs);
      const globalClickTimesSec: number[] = [];
      for (let i = 0; i < recordedClickTimestampsMs.length; i++) {
        const segmentStartMs = segmentDurationsMs.slice(0, i + 1).reduce((s, d) => s + d, 0);
        for (const clickMs of recordedClickTimestampsMs[i]!) {
          globalClickTimesSec.push((segmentStartMs + clickMs) / 1000);
        }
      }
      const zoomPath = join(outputDir, "stitched_zoomed.mp4");
      await applyZoomToAction({
        inputPath: rawVideoPath,
        outputPath: zoomPath,
        globalClickTimesSec,
        zoomLevel: contract.recording_enhancements.zoomLevel,
        zoomDurationSec: 0.5,
        width: config.execution.viewport.width,
        height: config.execution.viewport.height,
        ffmpegPath: adapter.getFfmpegPath(),
      });
      rawVideoPath = zoomPath;
    }

    const narrationPaths = timelineScenes.map((s) => s.narration_path);
    const transitionPath = join(process.cwd(), "assets", "sounds", "transition.wav");
    const transitionFile =
      contract.post_production.transitionSound && existsSync(transitionPath) ? transitionPath : null;

    let titleCardPadPath: string | null = null;
    if (resolvedUseRemotionOverlays) {
      titleCardPadPath = join(outputDir, "title_card_pad.wav");
      await generateTitleCardSilenceWav({
        outputPath: titleCardPadPath,
        ffmpegPath: adapter.getFfmpegPath(),
        durationSec: getUiFlowTitleCardPadDurationSec(),
        profile: encodingProfile,
      });
    }

    const wavPaths = buildUiFlowNarrationWavPaths({
      narrationPaths,
      transitionPath: transitionFile,
      useRemotionOverlays: resolvedUseRemotionOverlays,
      titleCardPadPath,
    });
    const narrationConcatPath = join(outputDir, "narration_concat.wav");
    await runWavConcat({
      wavPaths,
      outputPath: narrationConcatPath,
      ffmpegPath: adapter.getFfmpegPath(),
    });

    const stitchedProbeMs = (await adapter.getVideoStreamInfo(timelineResult.stitchedVideoPath)).durationMs;
    const narrationConcatMs = getWavDurationMs(narrationConcatPath);
    const driftGate = validateAvDrift(stitchedProbeMs, narrationConcatMs, { maxDriftMs: null });
    if (!driftGate.valid) {
      if (process.env.VISU_UI_FLOW_SCENES_DRIFT_SOFT === "1") {
        logger.log("ui_flow_scenes_drift_soft", {
          payload: {
            error: driftGate.error,
            videoDurationMs: stitchedProbeMs,
            narrationDurationMs: narrationConcatMs,
          },
        });
      } else {
        throw new Error(`UI_FLOW_SCENES_AV_DRIFT: ${driftGate.error ?? "narration longer than stitched video"}`);
      }
    }

    const firstScene = contract.scenes[0];
    const primaryVoiceConfig = firstScene
      ? getVoiceConfig(firstScene.narration.language, firstScene.narration.voice_gender, process.cwd())
      : getVoiceConfig(contract.intro.narration.language, contract.intro.narration.voice_gender, process.cwd());
    const bgMusicPath = config.execution.defaultBackgroundMusicPath ?? null;

    const avMergeContext = await runAvMerge({
      rawVideoPath,
      narrationPath: narrationConcatPath,
      musicPath: bgMusicPath,
      outputDir,
      context,
      logger,
      adapter,
      mode: "ui_flow",
      sceneCount: timelineScenes.length,
      language: contract.language,
      voiceGender: contract.intro.narration.voice_gender,
      voiceId: primaryVoiceConfig.voice,
      piperModelPath: primaryVoiceConfig.modelPath,
      piperModelHash: primaryVoiceConfig.modelHash,
    });

    if (avMergeContext.artifacts.finalVideoPath) {
      const finalVideoPath = avMergeContext.artifacts.finalVideoPath;
      const ffmpegPath = adapter.getFfmpegPath();
      const templates = loadScriptTemplates(baseDir);

      if (contract.post_production.chapterMarkers) {
        const withChaptersPath = join(outputDir, "final_with_chapters.mp4");
        await addChapterMarkers({
          inputPath: finalVideoPath,
          outputPath: withChaptersPath,
          segments: segmentsForPost,
          ffmpegPath,
        });
        if (existsSync(withChaptersPath)) {
          const { rename } = await import("node:fs/promises");
          await rename(withChaptersPath, finalVideoPath);
        }
      }

      if (contract.post_production.subtitleTrack) {
        const introText = resolveTemplateText(
          templates,
          contract.intro.narration.text_template_key,
          contract.intro.narration.language
        );
        const sceneTexts = contract.scenes.map((s) =>
          resolveTemplateText(templates, s.narration.text_template_key, s.narration.language)
        );
        const summaryText = resolveTemplateText(
          templates,
          contract.summary.narration.text_template_key,
          contract.summary.narration.language
        );
        const srtSegments: { title: string; durationMs: number; text: string }[] = [
          { title: "Introduction", durationMs: segmentDurationsMs[0] ?? 0, text: introText },
          ...contract.scenes.map((s, i) => ({
            title: s.title,
            durationMs: segmentDurationsMs[i + 1] ?? 0,
            text: sceneTexts[i] ?? "",
          })),
          {
            title: "Summary",
            durationMs: segmentDurationsMs[segmentDurationsMs.length - 1] ?? 0,
            text: summaryText,
          },
        ];
        generateSrt({
          segments: srtSegments,
          outputPath: join(outputDir, "subtitles.srt"),
        });
      }

      if (contract.post_production.thumbnail) {
        await generateThumbnail({
          videoPath: finalVideoPath,
          outputPath: join(outputDir, "thumbnail.png"),
          title: contract.video_id,
          ffmpegPath,
        });
      }

      if (contract.post_production.videoDescription) {
        const introText = resolveTemplateText(
          templates,
          contract.intro.narration.text_template_key,
          contract.intro.narration.language
        );
        const sceneTexts = contract.scenes.map((s) =>
          resolveTemplateText(templates, s.narration.text_template_key, s.narration.language)
        );
        const summaryText = resolveTemplateText(
          templates,
          contract.summary.narration.text_template_key,
          contract.summary.narration.language
        );
        const description = assembleVideoDescription({
          introText,
          sceneTitles: contract.scenes.map((s) => s.title),
          sceneTexts,
          summaryText,
        });
        const uploadMetaPath = join(outputDir, "upload_metadata.json");
        const uploadPayload = {
          title: contract.video_id,
          description,
          generatedAt: new Date().toISOString(),
        };
        const { writeFileSync } = await import("node:fs");
        writeFileSync(uploadMetaPath, JSON.stringify(uploadPayload, null, 2), "utf-8");
      }

      // Recompute media metadata SHA256 now that all post-production modifications
      // to finalVideoPath are complete. This ensures metadata.outputSha256 matches
      // the final bytes that will be copied to outputRoot.
      const metaPath = avMergeContext.artifacts.metadataPath;
      if (metaPath) {
        try {
          const existingMeta = JSON.parse(
            readFileSync(metaPath, "utf-8"),
          ) as import("../validators/media_metadata_schema.js").MediaMetadataPayload;
          const { outputSha256: _oldSha, duckingDb: _duck, outputPath: _out, ...rest } = existingMeta;
          const { metadataHash } = writeMediaMetadata(finalVideoPath, metaPath, rest as any);
          logger.log("ui_flow_scenes_metadata_rewritten", {
            payload: { metadataPath: metaPath, metadataHash },
          });
        } catch {
          // If metadata rewrite fails, fall back to original metadata; copy step
          // will still verify the destination matches the recorded SHA.
        }
      }
      logger.log("ui_flow_scenes_complete", {
        payload: { finalVideoPath, metadataPath: metaPath },
      });
      return {
        status: "completed",
        artifacts: {
          finalVideoPath,
          metadataPath: metaPath,
        },
      };
    }

    return { status: "failed", artifacts: {} };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.log("ui_flow_scenes_failed", { payload: { error: message } });
    throw err;
  }
}
