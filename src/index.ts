#!/usr/bin/env node

import { execSync, spawnSync } from "node:child_process";
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { validateSceneContract, validateUIFlowScenesContract } from "./validators/scene_schema.js";
import minimist from "minimist";
import { LOG_SCHEMA_VERSION } from "./core/run_context.js";
import { createRunId, createLogger } from "./core/logger.js";
import { getConfig, getConfigHash, setActiveConfigMode } from "./core/config.js";
import { writeRunMetadata } from "./core/run_metadata.js";
import { validateFlow } from "./validators/flow_schema.js";
import { validateFlowTermination } from "./validators/flow_termination.js";
import { runFlow, type ValidatedFlow } from "./engines/flow_executor.js";
import { UIFlowAdapter } from "./adapters/ui_flow_adapter.js";
import { timestampIso } from "./core/logger.js";
import { validateScript } from "./validators/script_schema.js";
import { runNarration, type NarrationScript } from "./engines/narration_engine.js";
import { LocalPiperAdapter } from "./adapters/tts/local_piper_adapter.js";
import { FFmpegAdapter } from "./adapters/ffmpeg_adapter.js";
import { runRecordedMode as runRecordedModeEngine } from "./engines/recorded_mode_engine.js";
import { runModeC, autoTuneDurations } from "./engines/mode_c_engine.js";
import { runUIFlowSceneEngine } from "./engines/ui_flow_scene_engine.js";
import { createHash } from "node:crypto";
import { runAudit } from "./cli/audit.js";
import { runReplay } from "./cli/replay.js";
import { runUpload } from "./cli/upload.js";
import { runMigrateContract } from "./cli/migrate_contract.js";
import { runParseRecording } from "./cli/parse_recording.js";
import { validateContentRoot, validateOutputRoot, validateTopicDir } from "./validators/config_validator.js";
import { resolveContentPath, resolveOutputPath } from "./core/path_resolver.js";
import { copyOutputToRepository } from "./engines/metadata_writer.js";
import { runWavConcat } from "./engines/wav_concat_engine.js";
import { runAvMerge } from "./engines/av_merge_engine.js";
import { getWavDurationMs } from "./core/wav_utils.js";
import { computeModelHash } from "./validators/language_registry_validator.js";
import { getVoiceConfig } from "./core/language_config.js";

function getPlaywrightVersion(): string {
  try {
    const pkgPath = join(process.cwd(), "node_modules", "playwright", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version?: string };
    return pkg.version ?? "";
  } catch {
    return "";
  }
}

async function main(): Promise<void> {
  const argv = minimist(process.argv.slice(2));
  const cmd = argv._[0] as string | undefined;

  if (cmd === "audit") {
    const runId = argv.runId as string | undefined;
    if (!runId) {
      console.error("visu audit requires --runId <id>");
      process.exit(2);
    }
    const result = await runAudit(runId, {
      expectedFfmpegFingerprint: argv["expected-ffmpeg-fingerprint"] as string | undefined,
    });
    console.log(JSON.stringify(result.output, null, 2));
    process.exit(result.exitCode);
  }

  if (cmd === "replay") {
    const runId = argv.runId as string | undefined;
    if (!runId) {
      console.error("visu replay requires --runId <id>");
      process.exit(2);
    }
    const report = await runReplay(runId);
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.audit.status === "PASS" ? 0 : report.artifactsExist ? 1 : 2);
  }

  if (cmd === "resume") {
    const runId = argv["run-id"] as string | undefined;
    const contractPath = argv.contract as string | undefined;
    if (!runId || !contractPath) {
      console.error("visu resume requires --run-id <id> and --contract <path>");
      process.exit(2);
    }
    setActiveConfigMode("c");
    const config = getConfig();
    const outputDir = join(process.cwd(), config.execution.artifactsDir, runId);
    const stitchedPath = join(outputDir, "stitched_video.mp4");
    const compliantPath = join(outputDir, "stitched_video_compliant.mp4");
    if (!existsSync(stitchedPath)) {
      console.error(`resume: stitched_video.mp4 not found at ${stitchedPath}`);
      process.exit(1);
    }
    const contractPathAbs = resolveContentPath(contractPath);
    const contractJson = JSON.parse(readFileSync(contractPathAbs, "utf-8")) as unknown;
    const contractResult = validateSceneContract(contractJson);
    if (!contractResult.valid) {
      console.error("resume: contract validation failed:", (contractResult as { errors: string[] }).errors.join("; "));
      process.exit(1);
    }
    const contract = contractResult.data;
    const autoTuneDir = join(outputDir, "auto_tune_narration");
    const wavPaths = contract.scenes.map(
      (s: { scene_id: string }) => join(autoTuneDir, `scene_${s.scene_id}_narration_auto_tune.wav`)
    );
    const missing = wavPaths.filter((p: string) => !existsSync(p));
    if (missing.length > 0) {
      console.error("resume: missing WAVs:", missing.join(", "));
      process.exit(1);
    }
    const logsDir = join(process.cwd(), "logs");
    mkdirSync(logsDir, { recursive: true });
    const logPath = join(logsDir, `visu-resume-${runId}.log`);
    const logger = createLogger(runId, logPath);
    const adapter = new FFmpegAdapter();
    const ffmpegBin = adapter.getFfmpegPath();
    logger.log("resume_reencode_start", { payload: { stitchedPath, compliantPath } });
    const reencode = spawnSync(ffmpegBin, [
      "-y", "-i", stitchedPath,
      "-vf", "scale=in_range=full:out_range=tv",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "medium",
      "-an", "-movflags", "+faststart",
      compliantPath,
    ], { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 });
    if (reencode.status !== 0) {
      logger.log("resume_reencode_failed", { payload: { error: reencode.stderr?.slice(-1000) } });
      console.error("resume: re-encode failed:", reencode.stderr?.slice(-500));
      process.exit(1);
    }
    logger.log("resume_reencode_done", { payload: { compliantPath } });
    const narrationConcatPath = join(outputDir, "narration_concat.wav");
    await runWavConcat({
      wavPaths,
      outputPath: narrationConcatPath,
      ffmpegPath: ffmpegBin,
    });
    logger.log("resume_narration_concat_done", { payload: { narrationConcatPath } });
    const wavDurations = wavPaths.map((p: string) => getWavDurationMs(p));
    const firstScene = contract.scenes[0];
    if (!firstScene) throw new Error("Contract has no scenes");
    const primaryVoiceConfig = getVoiceConfig(firstScene.narration.language, firstScene.narration.voice_gender, process.cwd());
    const piperModelHash = computeModelHash(primaryVoiceConfig.modelPath, process.cwd());
    const sceneSummaries = contract.scenes.map(
      (scene: { scene_id: string; narration: { language: string; voice_gender: "male" | "female" } }, i: number) => ({
        scene_id: scene.scene_id,
        promptKey: "remotion",
        seed: 0,
        modelVersion: "remotion",
        assetHash: "-",
        narrationDurationMs: wavDurations[i] ?? 0,
        driftMs: 0,
        language: scene.narration.language,
        voiceGender: scene.narration.voice_gender,
      })
    );
    const context: import("./core/run_context.js").RunContext = {
      runId,
      startedAt: timestampIso(),
      environment: { nodeVersion: process.version },
      execution: { mode: "generative", inputId: contractPath, inputVersion: "1.0" },
      language: contract.language,
      versions: { logSchema: LOG_SCHEMA_VERSION },
      artifacts: {},
      status: "running",
    };
    const ffmpegInfo = await adapter.getVersionBuildconfAndFingerprint();
    const envSnapshot = {
      ffmpegVersionFull: ffmpegInfo.versionFull,
      ffmpegBuildConf: ffmpegInfo.buildconf,
      ffmpegBinaryFingerprint: ffmpegInfo.fingerprint,
      nodeVersion: process.version,
      piperVersion: null,
      piperBinaryFingerprint: "",
      piperModelHash,
      configHash: getConfigHash(),
      capturedAt: new Date().toISOString(),
    };
    await runAvMerge({
      rawVideoPath: compliantPath,
      narrationPath: narrationConcatPath,
      musicPath: null,
      outputDir,
      context,
      logger,
      adapter,
      mode: "generative",
      sceneCount: contract.scenes.length,
      maxDriftMs: 0,
      avgDriftMs: 0,
      language: firstScene.narration.language,
      voiceGender: firstScene.narration.voice_gender,
      voiceId: primaryVoiceConfig.voice,
      piperModelPath: primaryVoiceConfig.modelPath,
      piperModelHash,
      scenes: sceneSummaries,
      envSnapshot,
    });
    logger.log("resume_complete", { payload: { finalVideoPath: join(outputDir, "final.mp4") } });
    logger.close();
    console.log("resume done. Output:", join(outputDir, "final.mp4"));
    process.exitCode = 0;
    return;
  }

  if (cmd === "add-audio") {
    const runId = argv["run-id"] as string | undefined;
    const contractPath = argv.contract as string | undefined;
    if (!runId || !contractPath) {
      console.error("visu add-audio requires --run-id <id> and --contract <path>");
      process.exit(2);
    }
    const config = getConfig();
    const outputDir = join(process.cwd(), config.execution.artifactsDir, runId);
    const stitchedPath = join(outputDir, "stitched_video.mp4");
    if (!existsSync(stitchedPath)) {
      console.error(`add-audio: stitched_video.mp4 not found at ${stitchedPath}`);
      process.exit(1);
    }
    const contractPathAbs = resolveContentPath(contractPath);
    const contractJson = JSON.parse(readFileSync(contractPathAbs, "utf-8")) as unknown;
    const contractResult = validateSceneContract(contractJson);
    if (!contractResult.valid) {
      console.error("add-audio: contract validation failed:", (contractResult as { errors: string[] }).errors.join("; "));
      process.exit(1);
    }
    const contract = contractResult.data;
    const autoTuneDir = join(outputDir, "auto_tune_narration");
    const wavPaths = contract.scenes.map(
      (s: { scene_id: string }) => join(autoTuneDir, `scene_${s.scene_id}_narration_auto_tune.wav`)
    );
    const missing = wavPaths.filter((p: string) => !existsSync(p));
    if (missing.length > 0) {
      console.error("add-audio: missing WAVs:", missing.join(", "));
      process.exit(1);
    }
    const logsDir = join(process.cwd(), "logs");
    mkdirSync(logsDir, { recursive: true });
    const logPath = join(logsDir, `visu-add-audio-${runId}.log`);
    const logger = createLogger(runId, logPath);
    const adapter = new FFmpegAdapter();
    const narrationConcatPath = join(outputDir, "narration_concat.wav");
    await runWavConcat({
      wavPaths,
      outputPath: narrationConcatPath,
      ffmpegPath: adapter.getFfmpegPath(),
    });
    logger.log("add_audio_narration_concat_done", { payload: { narrationConcatPath } });
    const wavDurations = wavPaths.map((p: string) => getWavDurationMs(p));
    const firstScene = contract.scenes[0];
    if (!firstScene) throw new Error("Contract has no scenes");
    const primaryVoiceConfig = getVoiceConfig(firstScene.narration.language, firstScene.narration.voice_gender, process.cwd());
    const piperModelHash = computeModelHash(primaryVoiceConfig.modelPath, process.cwd());
    const sceneSummaries = contract.scenes.map(
      (scene: { scene_id: string; narration: { language: string; voice_gender: "male" | "female" } }, i: number) => ({
        scene_id: scene.scene_id,
        promptKey: "remotion",
        seed: 0,
        modelVersion: "remotion",
        assetHash: "-",
        narrationDurationMs: wavDurations[i] ?? 0,
        driftMs: 0,
        language: scene.narration.language,
        voiceGender: scene.narration.voice_gender,
      })
    );
    const context: import("./core/run_context.js").RunContext = {
      runId,
      startedAt: timestampIso(),
      environment: { nodeVersion: process.version },
      execution: { mode: "generative", inputId: contractPath, inputVersion: "1.0" },
      language: contract.language,
      versions: { logSchema: LOG_SCHEMA_VERSION },
      artifacts: {},
      status: "running",
    };
    const ffmpegInfo = await adapter.getVersionBuildconfAndFingerprint();
    const envSnapshot = {
      ffmpegVersionFull: ffmpegInfo.versionFull,
      ffmpegBuildConf: ffmpegInfo.buildconf,
      ffmpegBinaryFingerprint: ffmpegInfo.fingerprint,
      nodeVersion: process.version,
      piperVersion: null,
      piperBinaryFingerprint: "",
      piperModelHash,
      configHash: getConfigHash(),
      capturedAt: new Date().toISOString(),
    };
    await runAvMerge({
      rawVideoPath: stitchedPath,
      narrationPath: narrationConcatPath,
      musicPath: null,
      outputDir,
      context,
      logger,
      adapter,
      mode: "generative",
      sceneCount: contract.scenes.length,
      maxDriftMs: 0,
      avgDriftMs: 0,
      language: firstScene.narration.language,
      voiceGender: firstScene.narration.voice_gender,
      voiceId: primaryVoiceConfig.voice,
      piperModelPath: primaryVoiceConfig.modelPath,
      piperModelHash,
      scenes: sceneSummaries,
      envSnapshot,
    });
    logger.log("add_audio_complete", { payload: { finalVideoPath: join(outputDir, "final.mp4") } });
    logger.close();
    console.log("add-audio done. Output:", join(outputDir, "final.mp4"));
    process.exitCode = 0;
    return;
  }

  if (cmd === "upload") {
    const runId = argv.runId as string | undefined;
    if (!runId) {
      console.error("visu upload requires --runId <id>");
      process.exit(2);
    }
    const result = await runUpload(runId, {
      title: argv.title as string | undefined,
      visibility: argv.visibility as "public" | "unlisted" | "private" | undefined,
    });
    process.exit(result.exitCode);
  }

  if (cmd === "migrate-contract") {
    const inputPath = argv.input as string | undefined;
    const outputPath = argv.output as string | undefined;
    if (!inputPath || !outputPath) {
      console.error("visu migrate-contract requires --input <path> and --output <path>");
      process.exit(2);
    }
    try {
      const result = runMigrateContract(inputPath, outputPath);
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.status === "warning" ? 0 : 0);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(message);
      process.exit(1);
    }
  }

  if (cmd === "parse-recording") {
    const inputPath = argv.input as string | undefined;
    const templateMapPath = argv["template-map"] as string | undefined;
    const outputPath = argv.output as string | undefined;
    const topic = argv.topic as string | undefined;
    const language = argv.language as string | undefined;
    const voiceGender = argv["voice-gender"] as "male" | "female" | undefined;
    const music = argv.music as string | undefined;
    const baseUrl = argv["base-url"] as string | undefined;
    if (!inputPath || !templateMapPath || !outputPath || !topic || !language || !voiceGender || !music || !baseUrl) {
      console.error(
        "visu parse-recording requires --input, --template-map, --output, --topic, --language, --voice-gender, --music, --base-url"
      );
      process.exit(2);
    }
    try {
      runParseRecording({
        inputPath: resolve(process.cwd(), inputPath),
        templateMapPath: resolve(process.cwd(), templateMapPath),
        outputPath: resolve(process.cwd(), outputPath),
        topic,
        language,
        voiceGender,
        music,
        baseUrl,
        introTemplateKey: argv["intro-template-key"] as string | undefined,
        summaryTemplateKey: argv["summary-template-key"] as string | undefined,
        introAssetPath: argv["intro-asset"] as string | undefined,
        summaryAssetPath: argv["summary-asset"] as string | undefined,
      });
      console.log(`Wrote v1.5 contract to ${outputPath}`);
      process.exit(0);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(message);
      process.exit(1);
    }
  }

  const mode = argv.mode as string | undefined;
  const flowPath = argv.flow as string | undefined;
  const scriptPath = argv.script as string | undefined;
  const videoPath = argv.video as string | undefined;
  const contractPath = argv.contract as string | undefined;

  const runId = createRunId();
  const logsDir = join(process.cwd(), "logs");
  mkdirSync(logsDir, { recursive: true });
  const logPath = join(logsDir, `visu-${runId}.log`);
  const logger = createLogger(runId, logPath);

  logger.log("cli_start", {
    message: "VISU Engine started",
    payload: { schemaVersion: LOG_SCHEMA_VERSION },
  });

  if (mode === "ui_flow") {
    if (!flowPath) {
      logger.log("cli_error", { message: "Missing --flow path", payload: { args: argv } });
      logger.close();
      process.exitCode = 1;
      return;
    }
    setActiveConfigMode("a");
    await runUIFlowMode(runId, flowPath, logger);
    return;
  }

  if (mode === "narrate") {
    if (!scriptPath) {
      logger.log("cli_error", { message: "Missing --script path", payload: { args: argv } });
      logger.close();
      process.exitCode = 1;
      return;
    }
    setActiveConfigMode(null);
    await runNarrateMode(runId, scriptPath, logger);
    return;
  }

  if (mode === "recorded") {
    const topic = argv.topic as string | undefined;
    const wrapPath = argv["wrap-contract"] as string | undefined;
    if (!topic || !videoPath || !scriptPath) {
      logger.log("cli_error", {
        message: "Mode recorded requires --topic, --video and --script",
        payload: { args: argv },
      });
      logger.close();
      process.exitCode = 1;
      return;
    }
    validateContentRoot();
    validateOutputRoot();
    validateTopicDir(topic);
    setActiveConfigMode("b");
    const videoPathResolved = resolveContentPath(join(topic, videoPath));
    const scriptPathResolved = resolveContentPath(join(topic, "scripts", scriptPath));
    const wrapPathResolved = wrapPath ? resolveContentPath(join(topic, wrapPath)) : undefined;
    await runRecordedModeCLI(runId, videoPathResolved, scriptPathResolved, wrapPathResolved, logger, {
      topic,
      "strict-determinism": argv["strict-determinism"],
      "expected-ffmpeg-fingerprint": argv["expected-ffmpeg-fingerprint"],
    });
    return;
  }

  if (mode === "generative") {
    if (!contractPath) {
      const message = "Mode generative (Mode C) requires --contract path";
      logger.log("cli_error", {
        message,
        payload: { args: argv },
      });
      console.error(message);
      logger.close();
      process.exitCode = 1;
      return;
    }

    try {
      validateContentRoot();
      validateOutputRoot();
      setActiveConfigMode("c");
      await runModeCCLI(runId, contractPath, logger, {
        "strict-determinism": argv["strict-determinism"],
        "expected-ffmpeg-fingerprint": argv["expected-ffmpeg-fingerprint"],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.log("cli_error", {
        message: "Mode C run failed",
        payload: { error: message },
      });
      console.error(`Mode C (generative) failed: ${message}`);
      process.exitCode = 1;
    }
    return;
  }

  if (mode === "ui_flow_scenes") {
    if (!contractPath) {
      logger.log("cli_error", {
        message: "Mode ui_flow_scenes requires --contract path",
        payload: { args: argv },
      });
      logger.close();
      process.exitCode = 1;
      return;
    }
    validateContentRoot();
    validateOutputRoot();
    setActiveConfigMode("a");
    await runUIFlowScenesCLI(runId, contractPath, logger, {
      "strict-determinism": argv["strict-determinism"],
      "expected-ffmpeg-fingerprint": argv["expected-ffmpeg-fingerprint"],
    });
    return;
  }

  const args = process.argv.slice(2);
  if (args.length > 0) {
    logger.log("cli_args", { payload: { args } });
  }
  logger.log("cli_end", { message: "VISU Engine initialized" });
  logger.close();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

async function runUIFlowMode(
  runId: string,
  flowPath: string,
  logger: ReturnType<typeof createLogger>
): Promise<void> {
  let flowJson: unknown;
  try {
    const absPath = join(process.cwd(), flowPath);
    flowJson = JSON.parse(readFileSync(absPath, "utf-8"));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.log("cli_error", { message: "Failed to load flow", payload: { path: flowPath, error: message } });
    logger.close();
    process.exitCode = 1;
    return;
  }

  const schemaResult = validateFlow(flowJson);
  if (!schemaResult.valid) {
    logger.log("validation_error", {
      message: "Flow schema validation failed",
      payload: { errors: (schemaResult as { errors: string[] }).errors },
    });
    logger.close();
    process.exitCode = 1;
    return;
  }

  const termResult = validateFlowTermination(flowJson);
  if (!termResult.valid) {
    logger.log("validation_error", {
      message: "Flow termination rule violated",
      payload: { errors: (termResult as { errors: string[] }).errors },
    });
    logger.close();
    process.exitCode = 1;
    return;
  }

  const flow = flowJson as ValidatedFlow;
  const context: import("./core/run_context.js").RunContext = {
    runId,
    startedAt: timestampIso(),
    environment: { nodeVersion: process.version, playwrightVersion: getPlaywrightVersion() },
    execution: {
      mode: "ui_flow",
      inputId: flow.flow_id,
      inputVersion: flow.version,
    },
    language: "te",
    versions: { logSchema: LOG_SCHEMA_VERSION },
    artifacts: {},
    status: "running",
  };

  const adapter = new UIFlowAdapter();
  await adapter.launch();
  const result = await runFlow({ flow, context, logger, adapter });

  const config = getConfig();
  writeRunMetadata(config.execution.artifactsDir, runId, {
    flowId: flow.flow_id,
    flowVersion: flow.version,
    playwrightVersion: result.environment.playwrightVersion ?? "",
    nodeVersion: result.environment.nodeVersion,
    configHash: getConfigHash(),
    videoPath: result.artifacts.rawVideoPath ?? "",
    generatedAt: result.startedAt,
  });

  logger.log("cli_end", {
    message: "Flow execution finished",
    payload: { status: result.status, rawVideoPath: result.artifacts.rawVideoPath },
  });
  logger.close();
  process.exitCode = result.status === "completed" ? 0 : 1;
}

async function runNarrateMode(
  runId: string,
  scriptPath: string,
  logger: ReturnType<typeof createLogger>
): Promise<void> {
  let scriptJson: unknown;
  let scriptFileHash: string | undefined;
  try {
    const absPath = join(process.cwd(), scriptPath);
    const raw = readFileSync(absPath, "utf-8");
    scriptFileHash = createHash("sha256").update(raw, "utf8").digest("hex");
    scriptJson = JSON.parse(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.log("cli_error", {
      message: "Failed to load script",
      payload: { path: scriptPath, error: message },
    });
    logger.close();
    process.exitCode = 1;
    return;
  }

  const schemaResult = validateScript(scriptJson);
  if (!schemaResult.valid) {
    logger.log("validation_error", {
      message: "Script schema validation failed",
      payload: { errors: (schemaResult as { errors: string[] }).errors },
    });
    logger.close();
    process.exitCode = 1;
    return;
  }

  const script = scriptJson as NarrationScript;

  const context: import("./core/run_context.js").RunContext = {
    runId,
    startedAt: timestampIso(),
    environment: { nodeVersion: process.version },
    execution: {
      mode: "narrate",
      inputId: scriptPath,
      inputVersion: script.version,
    },
    language: "te",
    versions: { logSchema: LOG_SCHEMA_VERSION },
    artifacts: {},
    status: "running",
  };

  const adapter = new LocalPiperAdapter();
  const { context: updatedContext } = await runNarration({
    script,
    context,
    logger,
    adapter,
    scriptFileHash,
  });

  logger.log("cli_end", {
    message: "Narration execution finished",
    payload: {
      status: updatedContext.status,
      audioPath: updatedContext.artifacts.audioPath,
    },
  });
  logger.close();
  process.exitCode = updatedContext.status === "completed" ? 0 : 1;
}

async function runRecordedModeCLI(
  runId: string,
  videoPath: string,
  scriptPath: string,
  wrapPath: string | undefined,
  logger: ReturnType<typeof createLogger>,
  argv: {
    topic: string;
    "strict-determinism"?: boolean;
    "expected-ffmpeg-fingerprint"?: string;
  }
): Promise<void> {
  const context: import("./core/run_context.js").RunContext = {
    runId,
    startedAt: timestampIso(),
    environment: { nodeVersion: process.version },
    execution: {
      mode: "recorded",
      inputId: scriptPath,
      inputVersion: "1.0",
    },
    language: "te",
    versions: { logSchema: LOG_SCHEMA_VERSION },
    artifacts: {},
    status: "running",
  };

  const ffmpegAdapter = new FFmpegAdapter();
  const ttsAdapter = new LocalPiperAdapter();

  try {
    let wrapConfig: unknown = undefined;
    if (wrapPath) {
      wrapConfig = JSON.parse(readFileSync(wrapPath, "utf-8")) as unknown;
    }
    const result = await runRecordedModeEngine({
      videoPath,
      scriptPath,
      context,
      logger,
      ffmpegAdapter,
      ttsAdapter,
      wrapConfig,
    });
    logger.log("cli_end", {
      message: "Recorded mode finished",
      payload: {
        status: result.status,
        finalVideoPath: result.artifacts.finalVideoPath,
        metadataPath: result.artifacts.metadataPath,
      },
    });
    if (result.status === "completed" && argv["strict-determinism"]) {
      const auditResult = await runAudit(runId, {
        expectedFfmpegFingerprint: argv["expected-ffmpeg-fingerprint"],
      });
      if (auditResult.exitCode !== 0) {
        logger.log("cli_error", {
          message: "Strict determinism check failed",
          payload: { mismatches: auditResult.output.mismatches },
        });
        process.exitCode = auditResult.exitCode;
        return;
      }
    }
    if (result.status === "completed" && result.artifacts.finalVideoPath && result.artifacts.metadataPath) {
      const metadata = JSON.parse(
        readFileSync(result.artifacts.metadataPath, "utf-8")
      ) as import("./validators/media_metadata_schema.js").MediaMetadataPayload;
      const scriptJson = JSON.parse(readFileSync(scriptPath, "utf-8")) as { language?: string };
      const language = scriptJson.language ?? "en";
      copyOutputToRepository({
        finalVideoPath: result.artifacts.finalVideoPath,
        metadataPath: result.artifacts.metadataPath,
        metadata,
        topic: argv.topic,
        language,
        logger,
      });
    }
    process.exitCode = result.status === "completed" ? 0 : 1;
    if (result.status === "completed") {
      const config = getConfig();
      const lang = (JSON.parse(readFileSync(scriptPath, "utf-8")) as { language?: string }).language ?? "en";
      const outDir = join(config.outputRoot, argv.topic, lang);
      console.log(`Recorded mode completed. RunId: ${runId}. Artifacts: ${config.execution.artifactsDir}/${runId}. Output: ${outDir}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.log("cli_error", { message: "Recorded mode failed", payload: { error: message } });
    console.error("Recorded mode failed:", message);
    process.exitCode = 1;
  } finally {
    logger.close();
  }
}

async function runUIFlowScenesCLI(
  runId: string,
  contractPath: string,
  logger: ReturnType<typeof createLogger>,
  argv: { "strict-determinism"?: boolean; "expected-ffmpeg-fingerprint"?: string }
): Promise<void> {
  const contractPathAbs = resolveContentPath(contractPath);
  const contractJson = JSON.parse(readFileSync(contractPathAbs, "utf-8")) as unknown;
  const contractResult = validateUIFlowScenesContract(contractJson);
  if (!contractResult.valid) {
    logger.log("validation_error", {
      message: "Scene contract (v1.5) validation failed",
      payload: { errors: (contractResult as { errors: string[] }).errors },
    });
    logger.close();
    const errors = (contractResult as { errors: string[] }).errors;
    console.error("Scene contract (v1.5) validation failed:", errors.join("; "));
    process.exitCode = 1;
    return;
  }
  const contract = contractResult.data;
  const topic = contract.topic;
  const language = contract.language;
  validateTopicDir(topic);

  const context: import("./core/run_context.js").RunContext = {
    runId,
    startedAt: timestampIso(),
    environment: { nodeVersion: process.version },
    execution: {
      mode: "ui_flow_scenes",
      inputId: contractPath,
      inputVersion: "1.5",
    },
    language,
    versions: { logSchema: LOG_SCHEMA_VERSION },
    artifacts: {},
    status: "running",
  };

  const ffmpegAdapter = new FFmpegAdapter();
  try {
    const result = await runUIFlowSceneEngine({
      contractPath: contractPathAbs,
      context,
      logger,
      adapter: ffmpegAdapter,
    });
    logger.log("cli_end", {
      message: "Scene-driven Mode A finished",
      payload: {
        status: result.status,
        finalVideoPath: result.artifacts.finalVideoPath,
        metadataPath: result.artifacts.metadataPath,
      },
    });
    if (result.status === "completed" && argv["strict-determinism"]) {
      const auditResult = await runAudit(runId, {
        expectedFfmpegFingerprint: argv["expected-ffmpeg-fingerprint"],
      });
      if (auditResult.exitCode !== 0) {
        logger.log("cli_error", {
          message: "Strict determinism check failed",
          payload: { mismatches: auditResult.output.mismatches },
        });
        process.exitCode = auditResult.exitCode;
        return;
      }
    }
    if (result.status === "completed" && result.artifacts.finalVideoPath && result.artifacts.metadataPath) {
      const metadata = JSON.parse(
        readFileSync(result.artifacts.metadataPath, "utf-8")
      ) as import("./validators/media_metadata_schema.js").MediaMetadataPayload;
      const runOutputDir = dirname(result.artifacts.finalVideoPath);
      const extraFiles: { sourcePath: string; destFileName: string }[] = [];
      const subtitlesPath = join(runOutputDir, "subtitles.srt");
      const thumbnailPath = join(runOutputDir, "thumbnail.png");
      if (existsSync(subtitlesPath)) extraFiles.push({ sourcePath: subtitlesPath, destFileName: "subtitles.srt" });
      if (existsSync(thumbnailPath)) extraFiles.push({ sourcePath: thumbnailPath, destFileName: "thumbnail.png" });
      copyOutputToRepository({
        finalVideoPath: result.artifacts.finalVideoPath,
        metadataPath: result.artifacts.metadataPath,
        metadata,
        topic,
        language,
        logger,
        extraFiles: extraFiles.length ? extraFiles : undefined,
      });
      const config = getConfig();
      const outDir = join(config.outputRoot, topic, language);
      console.log(
        `Scene-driven Mode A completed. RunId: ${runId}. Artifacts: ${config.execution.artifactsDir}/${runId}. Output: ${outDir}`
      );
    }
    process.exitCode = result.status === "completed" ? 0 : 1;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.log("cli_error", { message: "Scene-driven Mode A failed", payload: { error: message } });
    console.error("Scene-driven Mode A failed:", message);
    process.exitCode = 1;
  } finally {
    logger.close();
  }
}

async function runModeCCLI(
  runId: string,
  contractPath: string,
  logger: ReturnType<typeof createLogger>,
  argv: {
    "strict-determinism"?: boolean;
    "expected-ffmpeg-fingerprint"?: string;
  }
): Promise<void> {
  const contractPathAbs = resolveContentPath(contractPath);
  const contractJson = JSON.parse(readFileSync(contractPathAbs, "utf-8")) as unknown;
  const contractResult = validateSceneContract(contractJson);
  if (!contractResult.valid) {
    const errors = (contractResult as { errors: string[] }).errors;
    logger.log("validation_error", {
      message: "Contract validation failed",
      payload: { errors },
    });
    // Also surface a concise summary to the terminal.
    const summary = errors.slice(0, 5).join("; ");
    console.error(`Mode C (generative) contract validation failed: ${summary}`);
    logger.close();
    process.exitCode = 1;
    return;
  }
  const contract = contractResult.data;
  const topic = contract.topic;
  const language = contract.language;
  validateContentRoot();
  validateOutputRoot();
  validateTopicDir(topic);

  const context: import("./core/run_context.js").RunContext = {
    runId,
    startedAt: timestampIso(),
    environment: { nodeVersion: process.version },
    execution: {
      mode: "generative",
      inputId: contractPath,
      inputVersion: "1.0",
    },
    language,
    versions: { logSchema: LOG_SCHEMA_VERSION },
    artifacts: {},
    status: "running",
  };

  const config = getConfig();
  const governedRoot = join(config.contentRoot, topic);

  const ffmpegAdapter = new FFmpegAdapter();
  try {
    const registryCwd = process.cwd();
    // Mode C (generative) always runs auto-tune: TTS per scene, then tune contract duration_sec from narration.
    const ttsAdapter = new LocalPiperAdapter();
    const { contract: tunedContract, preGeneratedNarration } = await autoTuneDurations(contract, {
      governedRoot,
      registryCwd,
      logger,
      adapter: ttsAdapter,
      runId,
    });

    const result = await runModeC({
      contractJson: tunedContract,
      preGeneratedNarration,
      governedRoot,
      context,
      logger,
      adapter: ffmpegAdapter,
    });
    logger.log("cli_end", {
      message: "Mode C (generative) finished",
      payload: {
        status: result.status,
        finalVideoPath: result.artifacts.finalVideoPath,
        metadataPath: result.artifacts.metadataPath,
      },
    });
    if (result.status === "completed" && argv["strict-determinism"]) {
      const auditResult = await runAudit(runId, {
        expectedFfmpegFingerprint: argv["expected-ffmpeg-fingerprint"],
      });
      if (auditResult.exitCode !== 0) {
        logger.log("cli_error", {
          message: "Strict determinism check failed",
          payload: { mismatches: auditResult.output.mismatches },
        });
        process.exitCode = auditResult.exitCode;
        return;
      }
    }
    if (result.status === "completed" && result.artifacts.finalVideoPath && result.artifacts.metadataPath) {
      const metadata = JSON.parse(
        readFileSync(result.artifacts.metadataPath, "utf-8")
      ) as import("./validators/media_metadata_schema.js").MediaMetadataPayload;
      const outDir = resolveOutputPath(topic, language);
      logger.log("output_copy_start", { payload: { destinationDir: outDir } });
      copyOutputToRepository({
        finalVideoPath: result.artifacts.finalVideoPath,
        metadataPath: result.artifacts.metadataPath,
        metadata,
        topic,
        language,
        logger,
      });
      console.log(`Mode C (generative) completed. RunId: ${runId}. Output: ${outDir}`);
    }
    process.exitCode = result.status === "completed" ? 0 : 1;
    if (result.status !== "completed") {
      console.error(`Mode C (generative) failed. Status: ${result.status}. Check logs/visu-${runId}.log`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.log("cli_error", { message: "Mode C failed", payload: { error: message } });
    console.error(`Mode C (generative) failed: ${message}`);
    process.exitCode = 1;
  } finally {
    logger.close();
  }
}

