import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  validateLanguageRegistry,
  validateSceneLanguages,
  verifyModelHash,
  computeModelHash,
} from "../src/validators/language_registry_validator.js";

const CWD = process.cwd();
const FIXTURE_TE_MALE_ONLY = join(CWD, "tests", "fixtures", "language_config_te_male_only");

describe("language_registry_validator", () => {
  it("validates language registry from repo root", () => {
    const result = validateLanguageRegistry(CWD);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.version).toBe("1.1");
      expect(result.data.supported).toHaveProperty("en");
      expect(result.data.supported).toHaveProperty("hi");
      expect(result.data.supported).toHaveProperty("te");
      expect(result.data.supported.te.voices).toBeDefined();
      expect(result.data.supported.te.voices?.male?.voice).toBe("te_IN-venkatesh-medium");
      expect(result.data.supported.te.sampleRate).toBe(48000);
    }
  });

  it("returns errors when registry path does not exist", () => {
    const result = validateLanguageRegistry(join(CWD, "nonexistent_dir"));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("not found"))).toBe(true);
    }
  });

  it("computeModelHash throws when model file does not exist", () => {
    expect(() =>
      computeModelHash("models/piper/nonexistent.onnx", CWD)
    ).toThrow(/Model file not found/);
  });

  it("verifyModelHash throws on hash mismatch", () => {
    const fakePath = join(CWD, "package.json");
    if (!existsSync(fakePath)) return;
    expect(() =>
      verifyModelHash(fakePath, "0".repeat(64), CWD)
    ).toThrow(/Model hash mismatch/);
  });

  it("validateSceneLanguages throws when gender not registered for language", () => {
    const scenes = [
      {
        scene_id: "s1",
        narration: {
          text_template_key: "t",
          language: "te",
          voice_gender: "female" as const,
          speed: 1,
        },
      },
    ];
    expect(() => validateSceneLanguages(scenes, FIXTURE_TE_MALE_ONLY)).toThrow(
      /Gender "female" is not registered for language "te"/
    );
  });
});
