import { describe, it, expect } from "vitest";
import { join } from "node:path";
import {
  getLanguageConfig,
  getVoiceConfig,
  getVoiceModelPaths,
  clearRegistryCacheForTest,
} from "../src/core/language_config.js";

const CWD = process.cwd();
const FIXTURE_TE_MALE_ONLY = join(CWD, "tests", "fixtures", "language_config_te_male_only");

describe("language_config", () => {
  it("getLanguageConfig returns language entry with voices", () => {
    const entry = getLanguageConfig("te", CWD);
    expect(entry.name).toBe("Telugu");
    expect(entry.sampleRate).toBe(48000);
    expect(entry.voices).toBeDefined();
    expect(entry.voices.male?.voice).toBe("te_IN-venkatesh-medium");
  });

  it("getVoiceConfig returns correct config for valid language + gender", () => {
    const config = getVoiceConfig("te", "male", CWD);
    expect(config.voice).toBe("te_IN-venkatesh-medium");
    expect(config.modelPath).toContain("te_IN-venkatesh-medium.onnx");
    expect(config.sampleRate).toBe(48000);
  });

  it("getVoiceConfig throws when gender not registered for language", () => {
    clearRegistryCacheForTest();
    expect(() => getVoiceConfig("te", "female", FIXTURE_TE_MALE_ONLY)).toThrow(
      /Gender "female" is not registered for language "te"/
    );
  });

  it("getVoiceConfig throws when language not in registry", () => {
    expect(() => getVoiceConfig("xx", "male", CWD)).toThrow(
      /Language "xx" is not in the registry/
    );
  });

  it("getVoiceModelPaths returns absolute paths", () => {
    const paths = getVoiceModelPaths("te", "male", CWD);
    expect(paths.modelPath).toMatch(/\.onnx$/);
    expect(paths.modelConfigPath).toMatch(/\.onnx\.json$/);
  });
});
