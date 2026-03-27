import Ajv from "ajv";
import type { ValidateFunction } from "ajv";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ajv = new (Ajv as unknown as new (opts?: { strict?: boolean; allErrors?: boolean }) => {
  compile: (schema: object) => ValidateFunction;
})({ strict: true, allErrors: true });

function loadSchema(): object {
  const path = join(process.cwd(), "schemas", "media_metadata_schema_v1.json");
  return JSON.parse(readFileSync(path, "utf-8")) as object;
}

let validateMediaMetadataFn: ValidateFunction | null = null;

export function getMediaMetadataValidator(): ValidateFunction {
  if (!validateMediaMetadataFn) {
    validateMediaMetadataFn = ajv.compile(loadSchema());
  }
  return validateMediaMetadataFn as ValidateFunction;
}

/** Locked for observability: Mode A = ui_flow, Mode B = recorded, Mode C (future) = generative. */
export type MediaMetadataMode = "ui_flow" | "recorded" | "generative";

export interface MediaMetadataPayload {
  runId: string;
  mode: MediaMetadataMode;
  encodingProfileVersion: string;
  ffmpegVersion: string;
  /** Sprint 7: SHA256(ffmpeg -version + -buildconf) for determinism audit. */
  ffmpegBinaryFingerprint: string;
  sourceVideoPath: string;
  narrationPath: string;
  musicPath: string | null;
  musicLufs: number | null;
  durationMs: number;
  driftMs: number;
  crf: number;
  audioSampleRate: number;
  duckingDb: number;
  outputPath: string;
  outputSha256: string;
  generatedAt: string;
  /** Optional: source video resolution (e.g. Mode B) for debugging mismatches. */
  sourceWidth?: number;
  sourceHeight?: number;
  /** Mode C: number of scenes. */
  sceneCount?: number;
  /** Mode C: max per-scene drift (ms). */
  maxDriftMs?: number;
  /** Mode C: average per-scene drift (ms). */
  avgDriftMs?: number;
  /** Sprint 8: primary language of the run (ISO 639-1). */
  language?: string;
  /** Sprint 8 patch: primary voice gender (male/female). */
  voiceGender?: "male" | "female";
  /** Sprint 8: primary voice id for the run. */
  voiceId?: string;
  /** Sprint 8: path to Piper model used (primary scene). */
  piperModelPath?: string;
  /** Sprint 8: SHA256 of Piper model file. */
  piperModelHash?: string;
  /** Mode C only: summary-only per-scene (no visual binary, full prompt, template, or timeline). */
  scenes?: MediaMetadataSceneSummary[];
}

export interface MediaMetadataSceneSummary {
  scene_id: string;
  promptKey: string;
  seed: number;
  modelVersion: string;
  assetHash: string;
  narrationDurationMs: number;
  driftMs: number;
  /** Sprint 8: per-scene language (ISO 639-1). */
  language?: string;
  /** Sprint 8 patch: per-scene voice gender. */
  voiceGender?: "male" | "female";
}

export function validateMediaMetadata(
  data: unknown
): { valid: true; data: MediaMetadataPayload } | { valid: false; errors: string[] } {
  const validate = getMediaMetadataValidator();
  const ok = validate(data);
  if (ok) return { valid: true, data: data as MediaMetadataPayload };
  const errors = (validate.errors ?? []).map(
    (e) => `${e.instancePath} ${e.message ?? ""}`.trim()
  );
  return { valid: false, errors };
}
