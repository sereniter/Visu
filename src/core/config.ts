import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface Config {
  /** Absolute path to content repository (recipes). Must exist at startup. */
  contentRoot: string;
  /** Absolute path to output repository (menu_item). Must exist at startup. */
  outputRoot: string;
  execution: {
    actionTimeoutMs: number;
    videoDir: string;
    artifactsDir: string;
    viewport: { width: number; height: number };
    /** Optional default background music (WAV) for Mode B when script has no "music" field. Absolute path. */
    defaultBackgroundMusicPath?: string;
  };
  browser: {
    headless: boolean;
    locale: string;
  };
  screenCapture?: {
    videoDevice: string;
    audioDevice: string;
    startupWaitMs: number;
  };
  tts: {
    provider: string;
    defaultVoice: string;
    speechRate: number;
    sampleRate: number;
    outputFormat: "wav";
    modelPath: string;
    modelConfigPath: string;
    /** Optional path to Piper binary; if set, used instead of "piper" on PATH. */
    piperPath?: string;
  };
  encoding: {
    encoding_profile_version: string;
    video_codec: string;
    pix_fmt: string;
    profile: string;
    preset: string;
    crf: number;
    audio_codec: string;
    audio_sample_rate: number;
  };
  rendering?: {
    renderer: "remotion" | "ffmpeg";
  };
  remotion?: {
    templatesRoot: string;
    accentColor: string;
    enabled: boolean;
    useRemotionOverlays?: boolean;
  };
}

function loadConfig(): Config {
  const fromCwd = join(process.cwd(), "config", "default.json");
  const configPath = existsSync(fromCwd)
    ? fromCwd
    : join(dirname(fileURLToPath(import.meta.url)), "..", "..", "config", "default.json");
  const raw = JSON.parse(readFileSync(configPath, "utf-8")) as Config;
  const configDir = dirname(configPath);
  return {
    ...raw,
    contentRoot: raw.contentRoot.startsWith("/") ? raw.contentRoot : resolve(configDir, raw.contentRoot),
    outputRoot: raw.outputRoot.startsWith("/") ? raw.outputRoot : resolve(configDir, raw.outputRoot),
  };
}

let cached: Config | null = null;

export function getConfig(): Config {
  if (!cached) cached = loadConfig();
  return cached;
}

/** Test only: override config cache. Call with null to reset. */
export function setConfigForTest(config: Config | null): void {
  cached = config;
}

/** Timeout for each action; never hardcode 10000 in code. */
export function getActionTimeoutMs(): number {
  return getConfig().execution.actionTimeoutMs;
}

/** Stable hash of config for metadata and reproducibility. */
export function getConfigHash(): string {
  return createHash("sha256").update(JSON.stringify(getConfig()), "utf8").digest("hex");
}

export function getTTSConfig(): Config["tts"] {
  return getConfig().tts;
}

export interface EncodingProfile {
  encoding_profile_version: string;
  video_codec: string;
  pix_fmt: string;
  profile: string;
  preset: string;
  crf: number;
  audio_codec: string;
  audio_sample_rate: number;
}

export function getEncodingProfile(): EncodingProfile {
  return getConfig().encoding;
}

export function getRemotionConfig():
  | {
      templatesRoot: string;
      accentColor: string;
      enabled: boolean;
    }
  | null {
  const cfg = getConfig();
  if (!cfg.remotion) {
    return null;
  }
  return cfg.remotion;
}
