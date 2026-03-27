/** Log schema version (matches schemas/log_schema_v1.json). Set on RunContext.versions.logSchema. */
export const LOG_SCHEMA_VERSION = "1.0";

export interface RunContext {
  runId: string;
  startedAt: string;

  environment: {
    nodeVersion: string;
    playwrightVersion?: string;
    ffmpegVersion?: string;
  };

  execution: {
    mode: "ui_flow" | "recorded" | "generative" | "narrate" | "ui_flow_scenes";
    inputId: string;
    inputVersion: string;
  };

  language: string;

  versions: {
    flowSchema?: string;
    sceneSchema?: string;
    logSchema: string;
    promptLibraryVersion?: string;
  };

  artifacts: {
    rawVideoPath?: string;
    narrationPath?: string;
    audioPath?: string;
    finalVideoPath?: string;
    metadataPath?: string;
  };

  status: "initialized" | "running" | "failed" | "completed";

  error?: {
    stage: string;
    message: string;
    stack?: string;
  };
}
