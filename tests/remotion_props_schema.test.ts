import { describe, it, expect } from "vitest";
import { validateRemotionProps } from "../src/validators/remotion_props_schema.js";

describe("remotion_props_schema", () => {
  it("accepts valid AnukramAIIntro props with supported language", () => {
    const result = validateRemotionProps("AnukramAIIntro", {
      title: "Title",
      subtitle: "Subtitle",
      language: "en",
      stepCount: 3,
      accentColor: "#FF6B35",
    });
    expect(result.valid).toBe(true);
  });

  it("rejects AnukramAIIntro props with unsupported language (ta)", () => {
    const result = validateRemotionProps("AnukramAIIntro", {
      title: "Title",
      subtitle: "Subtitle",
      language: "ta",
      stepCount: 3,
      accentColor: "#FF6B35",
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("/language"))).toBe(true);
    }
  });

  it("accepts valid SceneTitleCard props", () => {
    const result = validateRemotionProps("SceneTitleCard", {
      title: "Step 1: Login",
      language: "en",
      accentColor: "#FF6B35",
      showDurationFrames: 90,
    });
    expect(result.valid).toBe(true);
  });

  it("rejects SceneTitleCard when showDurationFrames is out of range", () => {
    const result = validateRemotionProps("SceneTitleCard", {
      title: "Step 1: Login",
      language: "en",
      accentColor: "#FF6B35",
      showDurationFrames: 0,
    });
    expect(result.valid).toBe(false);
  });

  it("accepts valid ProgressOverlay props", () => {
    const result = validateRemotionProps("ProgressOverlay", {
      currentStep: 1,
      totalSteps: 5,
      language: "hi",
      accentColor: "#FF6B35",
    });
    expect(result.valid).toBe(true);
  });

  it("rejects ProgressOverlay when currentStep < 1", () => {
    const result = validateRemotionProps("ProgressOverlay", {
      currentStep: 0,
      totalSteps: 5,
      language: "hi",
      accentColor: "#FF6B35",
    });
    expect(result.valid).toBe(false);
  });
});

