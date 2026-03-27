/**
 * Contract migration tool (Sprint 8 patch). Migrates scene contracts between schema versions.
 * e.g. visu migrate-contract --input contract_v1.2.json --output contract_v1.3.json
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  getSceneContractValidatorV13,
  getSceneContractValidatorV16,
} from "../validators/scene_schema.js";
import type { VoiceGender } from "../core/language_config.js";

export interface MigrateResult {
  status: "ok" | "warning";
  fromVersion: string;
  toVersion: string;
  scenesModified: number;
  warnings: string[];
}

function buildVoiceToGenderMap(cwd: string): Map<string, { language: string; gender: VoiceGender }> {
  const registryPath = join(cwd, "config", "languages.json");
  const raw = JSON.parse(readFileSync(registryPath, "utf-8")) as {
    supported: Record<string, { voices?: Partial<Record<VoiceGender, { voice: string }>> }>;
  };
  const map = new Map<string, { language: string; gender: VoiceGender }>();
  for (const [lang, entry] of Object.entries(raw.supported ?? {})) {
    if (!entry?.voices) continue;
    for (const [gender, voiceEntry] of Object.entries(entry.voices)) {
      if (voiceEntry?.voice) {
        map.set(voiceEntry.voice, { language: lang, gender: gender as VoiceGender });
      }
    }
  }
  return map;
}

function migrateV12ToV13(
  inputPath: string,
  outputPath: string,
  cwd: string
): MigrateResult {
  const raw = JSON.parse(readFileSync(inputPath, "utf-8")) as {
    schema_version?: string;
    video_id?: string;
    scenes?: Array<{
      scene_id?: string;
      duration_sec?: number;
      visual?: object;
      narration?: { text_template_key?: string; language?: string; voice?: string; speed?: number };
    }>;
  };
  if (raw.schema_version !== "1.2") {
    throw new Error(`Expected schema_version 1.2, got ${raw.schema_version}. Use chained migration for other versions.`);
  }
  const voiceToGender = buildVoiceToGenderMap(cwd);
  const warnings: string[] = [];
  const scenes = (raw.scenes ?? []).map((scene) => {
    const narration = scene.narration;
    if (!narration) return scene;
    const voice = narration.voice;
    const language = narration.language ?? "te";
    const resolved = voice ? voiceToGender.get(voice) : null;
    let voice_gender: VoiceGender = "female";
    if (resolved && resolved.language === language) {
      voice_gender = resolved.gender;
    } else if (voice) {
      warnings.push(
        `scene ${scene.scene_id ?? "?"}: voice "${voice}" could not be resolved to gender for language "${language}"; defaulting to female — review manually`
      );
    }
    const restNarration = { ...narration };
    delete (restNarration as { voice?: string }).voice;
    return {
      ...scene,
      narration: { ...restNarration, language, voice_gender, speed: narration.speed ?? 1 },
    };
  });
  const output = {
    schema_version: "1.3",
    video_id: raw.video_id,
    scenes,
  };
  if (existsSync(outputPath)) {
    throw new Error(`Output file already exists: ${outputPath}. Refusing to overwrite.`);
  }
  writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf-8");
  const validateV13 = getSceneContractValidatorV13();
  if (!validateV13(output)) {
    const errors = (validateV13.errors ?? []).map((e) => `${e.instancePath} ${e.message ?? ""}`.trim());
    throw new Error(`Migrated contract failed v1.3 validation: ${errors.join("; ")}`);
  }
  return {
    status: warnings.length > 0 ? "warning" : "ok",
    fromVersion: "1.2",
    toVersion: "1.3",
    scenesModified: scenes.length,
    warnings,
  };
}

function migrateV13ToV14(
  inputPath: string,
  outputPath: string
): MigrateResult {
  const raw = JSON.parse(readFileSync(inputPath, "utf-8")) as {
    schema_version?: string;
    video_id?: string;
    scenes?: Array<{ scene_id?: string; narration?: { language?: string } }>;
  };
  if (raw.schema_version !== "1.3") {
    throw new Error(`Expected schema_version 1.3, got ${raw.schema_version}.`);
  }
  const firstScene = raw.scenes?.[0];
  const language = firstScene?.narration?.language ?? "";
  const output = {
    schema_version: "1.4",
    video_id: raw.video_id,
    topic: "",
    language,
    scenes: raw.scenes,
  };
  const warnings: string[] = [
    "topic field set to empty string — must be populated before running",
  ];
  if (existsSync(outputPath)) {
    throw new Error(`Output file already exists: ${outputPath}. Refusing to overwrite.`);
  }
  writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf-8");
  // Do not full-validate: topic is empty by design and would fail minLength/pattern
  return {
    status: "warning",
    fromVersion: "1.3",
    toVersion: "1.4",
    scenesModified: raw.scenes?.length ?? 0,
    warnings,
  };
}

function migrateV15ToV16(
  inputPath: string,
  outputPath: string
): MigrateResult {
  const raw = JSON.parse(readFileSync(inputPath, "utf-8")) as {
    schema_version?: string;
    mode?: string;
  };
  if (raw.schema_version !== "1.5" || raw.mode !== "ui_flow_scenes") {
    throw new Error(
      `Expected schema_version 1.5 with mode "ui_flow_scenes" for v1.5 → v1.6 migration, got schema_version=${raw.schema_version}, mode=${raw.mode}.`
    );
  }

  const output = {
    ...(raw as Record<string, unknown>),
    schema_version: "1.6",
  };

  if (existsSync(outputPath)) {
    throw new Error(`Output file already exists: ${outputPath}. Refusing to overwrite.`);
  }

  writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf-8");

  const validateV16 = getSceneContractValidatorV16();
  if (!validateV16(output)) {
    const errors = (validateV16.errors ?? []).map((e) => `${e.instancePath} ${e.message ?? ""}`.trim());
    throw new Error(`Migrated contract failed v1.6 validation: ${errors.join("; ")}`);
  }

  return {
    status: "ok",
    fromVersion: "1.5",
    toVersion: "1.6",
    scenesModified: 0,
    warnings: [],
  };
}

export function runMigrateContract(
  inputPath: string,
  outputPath: string,
  cwd: string = process.cwd()
): MigrateResult {
  const absInput = resolve(cwd, inputPath);
  const absOutput = resolve(cwd, outputPath);
  if (!existsSync(absInput)) {
    throw new Error(`Input file not found: ${absInput}`);
  }
  const raw = JSON.parse(readFileSync(absInput, "utf-8")) as { schema_version?: string };
  const fromVersion = raw.schema_version ?? "?";
  if (fromVersion === "1.2") {
    return migrateV12ToV13(absInput, absOutput, cwd);
  }
  if (fromVersion === "1.0" || fromVersion === "1.1") {
    throw new Error(
      `Chained migration from ${fromVersion} to 1.3 not yet implemented. Migrate 1.0→1.1→1.2→1.3 manually or run migrate-contract twice (e.g. 1.2→1.3 only).`
    );
  }
  if (fromVersion === "1.3") {
    return migrateV13ToV14(absInput, absOutput);
  }
  if (fromVersion === "1.4") {
    throw new Error("Contract is already schema_version 1.4. No migration needed.");
  }
  if (fromVersion === "1.5") {
    return migrateV15ToV16(absInput, absOutput);
  }
  throw new Error(`Unsupported schema_version: ${fromVersion}`);
}
