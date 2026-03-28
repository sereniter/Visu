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
    /** Mode A (ui_flow_scenes): refuse clone-tail extension when narration exceeds merge video by more than this (ms). */
    maxNarrationVideoExcessMs?: number;
    /** Mode A: extra tail after steps so raw capture ≥ narration + buffer_sec + this (ms). */
    sceneRecordingTailBufferMs?: number;
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

/** Mode A (ui_flow, ui_flow_scenes), Mode B (recorded), or Mode C (generative). */
export type ConfigMode = "a" | "b" | "c";

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

/** Deep merge overlay into base (overlay wins). */
function deepMerge(base: Record<string, unknown>, overlay: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(overlay)) {
    if (v === undefined) continue;
    if (isPlainObject(v) && isPlainObject(out[k])) {
      out[k] = deepMerge(out[k] as Record<string, unknown>, v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function resolveConfigDir(): string {
  const fromCwd = join(process.cwd(), "config");
  if (existsSync(fromCwd)) return fromCwd;
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "config");
}

/**
 * When set, `getConfig()` merges `config/mode_{a|b|c}.json` onto `config/shared.json`.
 * CLI sets this before running an engine; utilities (audit, narrate) leave it null (shared only).
 */
let activeMode: ConfigMode | null = null;

export function setActiveConfigMode(mode: ConfigMode | null): void {
  activeMode = mode;
  cached = null;
}

export function getActiveConfigMode(): ConfigMode | null {
  return activeMode;
}

function normalizeConfigPaths(raw: Config, configDir: string): Config {
  let execution = { ...raw.execution };
  if (
    execution.defaultBackgroundMusicPath &&
    !execution.defaultBackgroundMusicPath.startsWith("/")
  ) {
    execution = {
      ...execution,
      defaultBackgroundMusicPath: resolve(configDir, execution.defaultBackgroundMusicPath),
    };
  }

  return {
    ...raw,
    contentRoot: raw.contentRoot.startsWith("/") ? raw.contentRoot : resolve(configDir, raw.contentRoot),
    outputRoot: raw.outputRoot.startsWith("/") ? raw.outputRoot : resolve(configDir, raw.outputRoot),
    execution,
  };
}

function loadConfig(): Config {
  const configDir = resolveConfigDir();

  const sharedPath = join(configDir, "shared.json");
  const legacyPath = join(configDir, "default.json");

  let baseRecord: Record<string, unknown>;
  let applyModeOverlay: boolean;

  if (existsSync(sharedPath)) {
    baseRecord = JSON.parse(readFileSync(sharedPath, "utf-8")) as Record<string, unknown>;
    applyModeOverlay = true;
  } else if (existsSync(legacyPath)) {
    baseRecord = JSON.parse(readFileSync(legacyPath, "utf-8")) as Record<string, unknown>;
    applyModeOverlay = false;
  } else {
    throw new Error(
      `Visu config not found: expected ${sharedPath} (preferred) or legacy ${legacyPath}`,
    );
  }

  let merged = baseRecord;
  if (applyModeOverlay && activeMode !== null) {
    const modePath = join(configDir, `mode_${activeMode}.json`);
    if (existsSync(modePath)) {
      const overlay = JSON.parse(readFileSync(modePath, "utf-8")) as Record<string, unknown>;
      merged = deepMerge(baseRecord, overlay);
    }
  }

  const raw = merged as unknown as Config;
  return normalizeConfigPaths(raw, configDir);
}

let cached: Config | null = null;

export function getConfig(): Config {
  if (!cached) cached = loadConfig();
  return cached;
}

/** Test only: override config cache. Call with null to reset reload from disk and clear {@link setActiveConfigMode}. */
export function setConfigForTest(config: Config | null): void {
  cached = config;
  if (config === null) {
    activeMode = null;
  }
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
      useRemotionOverlays?: boolean;
    }
  | null {
  const cfg = getConfig();
  if (!cfg.remotion) {
    return null;
  }
  return cfg.remotion;
}
