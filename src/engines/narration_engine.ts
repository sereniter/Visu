import type { RunContext } from "../core/run_context.js";
import type { ITTSAdapter, TTSResponse } from "../core/tts_interface.js";
import { getTTSConfig, getConfig } from "../core/config.js";
import { createHash } from "node:crypto";
import { join } from "node:path";

type Logger = {
  log: (step: string, options?: { message?: string; payload?: object }) => void;
};

export interface NarrationScript {
  version: string;
  language: string;
  text: string;
}

export interface NarrationResult extends TTSResponse {
  scriptHash: string;
  scriptFileHash?: string;
}

export async function runNarration(params: {
  script: NarrationScript;
  context: RunContext;
  logger: Logger;
  adapter: ITTSAdapter;
  scriptFileHash?: string;
}): Promise<{ context: RunContext; result: NarrationResult }> {
  const { script, context, logger, adapter, scriptFileHash } = params;
  const ttsConfig = getTTSConfig();
  const config = getConfig();

  const scriptHash = createHash("sha256").update(script.text, "utf8").digest("hex");

  logger.log("narration_start", {
    payload: {
      language: script.language,
      scriptHash,
      scriptFileHash,
      provider: ttsConfig.provider,
      voiceId: ttsConfig.defaultVoice,
      sampleRate: ttsConfig.sampleRate,
    },
  });

  const outputDir = join(
    process.cwd(),
    config.execution.artifactsDir,
    context.runId
  );

  const request = {
    text: script.text,
    runId: context.runId,
    voice: ttsConfig.defaultVoice,
    speechRate: ttsConfig.speechRate,
    sampleRate: ttsConfig.sampleRate,
    outputFormat: "wav" as const,
    outputDir,
  };

  const ttsResponse = await adapter.synthesize(request);

  context.artifacts.audioPath = ttsResponse.audioPath;
  context.status = "completed";

  logger.log("narration_completed", {
    payload: {
      scriptHash,
      tts_provider: ttsResponse.provider,
      tts_engine_version: ttsResponse.engineVersion,
      voice_id: ttsResponse.voiceId,
      speech_rate: request.speechRate,
      duration_ms: ttsResponse.durationMs,
      audio_path: ttsResponse.audioPath,
      model_hash: ttsResponse.modelHash,
      synthesis_duration_ms: ttsResponse.synthesisDurationMs,
      experiment_enabled: false,
      variant_id: 1,
      seed: "sprint3_fixed",
    },
  });

  const result: NarrationResult = {
    ...ttsResponse,
    scriptHash,
    scriptFileHash,
  };

  return { context, result };
}


