/**
 * Language and voice config resolution from registry (Sprint 8 + patch).
 * Registry v1.1: voices keyed by gender (male/female) per language.
 * Voice is resolved from language + gender; no hardcoded voice IDs in contracts.
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export type VoiceGender = "male" | "female";

export interface VoiceEntry {
  voice: string;
  modelPath: string;
  modelConfig: string;
  modelHash: string;
}

export interface LanguageEntryV11 {
  name: string;
  adapter: string;
  sampleRate: number;
  nativeModelRate: number;
  voices: Partial<Record<VoiceGender, VoiceEntry>>;
}

export interface VoiceConfig {
  voice: string;
  modelPath: string;
  modelConfig: string;
  modelHash: string;
  sampleRate: number;
  nativeModelRate: number;
  adapter: string;
}

export interface LanguageRegistryV11 {
  version: string;
  supported: Record<string, LanguageEntryV11>;
}

const REGISTRY_PATH = "config/languages.json";

let cachedRegistry: LanguageRegistryV11 | null = null;

/** Test only: clear registry cache so the next loadRegistry(cwd) uses the given cwd. */
export function clearRegistryCacheForTest(): void {
  cachedRegistry = null;
}

function loadRegistry(cwd: string = process.cwd()): LanguageRegistryV11 {
  if (cachedRegistry) return cachedRegistry;
  const path = join(cwd, REGISTRY_PATH);
  const raw = JSON.parse(readFileSync(path, "utf-8")) as LanguageRegistryV11;
  cachedRegistry = raw;
  return raw;
}

/**
 * Resolve language entry for registry-level checks (e.g. language exists).
 * Throws if the language is not in the registry.
 */
export function getLanguageConfig(
  languageCode: string,
  cwd: string = process.cwd()
): LanguageEntryV11 {
  const registry = loadRegistry(cwd);
  const entry = registry.supported[languageCode];
  if (!entry) {
    throw new Error(
      `Language "${languageCode}" is not in the registry. Supported: ${Object.keys(registry.supported).join(", ")}`
    );
  }
  return entry;
}

/**
 * Resolve voice config for language + gender. Hard fails if language is not in registry
 * or requested gender is not registered for that language.
 */
export function getVoiceConfig(
  languageCode: string,
  gender: VoiceGender,
  cwd: string = process.cwd()
): VoiceConfig {
  const langEntry = getLanguageConfig(languageCode, cwd);
  const voiceEntry = langEntry.voices[gender];
  if (!voiceEntry) {
    const available = Object.keys(langEntry.voices).join(", ");
    throw new Error(
      `Gender "${gender}" is not registered for language "${languageCode}". Available: ${available}`
    );
  }
  return {
    voice: voiceEntry.voice,
    modelPath: voiceEntry.modelPath,
    modelConfig: voiceEntry.modelConfig,
    modelHash: voiceEntry.modelHash,
    sampleRate: langEntry.sampleRate,
    nativeModelRate: langEntry.nativeModelRate,
    adapter: langEntry.adapter,
  };
}

/**
 * Resolve absolute model path and config path for a language + gender.
 */
export function getVoiceModelPaths(
  languageCode: string,
  gender: VoiceGender,
  cwd: string = process.cwd()
): { modelPath: string; modelConfigPath: string } {
  const config = getVoiceConfig(languageCode, gender, cwd);
  return {
    modelPath: resolve(cwd, config.modelPath),
    modelConfigPath: resolve(cwd, config.modelConfig),
  };
}
