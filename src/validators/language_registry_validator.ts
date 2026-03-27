/**
 * Language registry validator (Sprint 8 + patch). Validates registry v1.1 against schema,
 * verifies model files exist and modelHash matches. Validates scene languages and voice_gender.
 */

import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import Ajv from "ajv";
import type { ValidateFunction } from "ajv";
import { getVoiceConfig, type LanguageEntryV11 } from "../core/language_config.js";

const ajv = new (Ajv as unknown as new (opts?: { strict?: boolean; allErrors?: boolean }) => {
  compile: (schema: object) => ValidateFunction;
})({ strict: true, allErrors: true });

const REGISTRY_PATH = "config/languages.json";
const SCHEMA_PATH = "schemas/language_registry_schema_v1.1.json";

function loadSchema(): object {
  const path = join(process.cwd(), SCHEMA_PATH);
  return JSON.parse(readFileSync(path, "utf-8")) as object;
}

let validateRegistryFn: ValidateFunction | null = null;

function getRegistryValidator(): ValidateFunction {
  if (!validateRegistryFn) {
    validateRegistryFn = ajv.compile(loadSchema());
  }
  return validateRegistryFn as ValidateFunction;
}

export interface LanguageRegistryData {
  version: string;
  supported: Record<string, LanguageEntryV11>;
}

export function validateLanguageRegistry(
  cwd: string = process.cwd()
): { valid: true; data: LanguageRegistryData } | { valid: false; errors: string[] } {
  const registryPath = join(cwd, REGISTRY_PATH);
  if (!existsSync(registryPath)) {
    return { valid: false, errors: [`Language registry not found: ${registryPath}`] };
  }
  const raw = JSON.parse(readFileSync(registryPath, "utf-8")) as unknown;
  const validate = getRegistryValidator();
  const ok = validate(raw);
  if (!ok) {
    const errors = (validate.errors ?? []).map(
      (e) => `${e.instancePath} ${e.message ?? ""}`.trim()
    );
    return { valid: false, errors };
  }
  return { valid: true, data: raw as LanguageRegistryData };
}

/**
 * Compute SHA256 of model file. Throws if file does not exist.
 */
export function computeModelHash(
  modelPath: string,
  cwd: string = process.cwd()
): string {
  const absPath = modelPath.startsWith("/") || (modelPath.length > 1 && modelPath[1] === ":")
    ? modelPath
    : resolve(cwd, modelPath);
  if (!existsSync(absPath)) {
    throw new Error(`Model file not found at ${absPath}. See ENVIRONMENT.md and models/piper/MODELS.md.`);
  }
  const buf = readFileSync(absPath);
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * Verify model file exists and SHA256 matches expected modelHash.
 * Throws on mismatch or missing file.
 */
export function verifyModelHash(
  modelPath: string,
  expectedHash: string,
  cwd: string = process.cwd()
): void {
  const actualHash = computeModelHash(modelPath, cwd);
  if (actualHash !== expectedHash) {
    const absPath = modelPath.startsWith("/") || (modelPath.length > 1 && modelPath[1] === ":")
      ? modelPath
      : resolve(cwd, modelPath);
    throw new Error(
      `Model hash mismatch for ${absPath}. Expected ${expectedHash}, got ${actualHash}. Update config/languages.json modelHash or use the correct model file.`
    );
  }
}

export interface SceneNarrationV13 {
  text_template_key: string;
  language: string;
  voice_gender: "male" | "female";
  speed: number;
}

export interface SceneV13ForValidation {
  scene_id: string;
  narration: SceneNarrationV13;
}

/**
 * Validate all scene languages: voice_gender exists in voices for narration.language,
 * model file exists, modelHash match. Call after contract validation. Throws on first failure.
 */
export function validateSceneLanguages(
  scenes: SceneV13ForValidation[],
  cwd: string = process.cwd()
): void {
  for (const scene of scenes) {
    const voiceConfig = getVoiceConfig(
      scene.narration.language,
      scene.narration.voice_gender,
      cwd
    );
    verifyModelHash(voiceConfig.modelPath, voiceConfig.modelHash, cwd);
  }
}
