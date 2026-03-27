import { describe, expect, it } from "vitest";
import {
  easingMap,
  toFrameTimings,
  interpolateOpacity,
  resolveMotionTransform,
  focusToTransformOrigin,
} from "../remotion-templates/src/utils/interpolations.js";
import {
  parseEqString,
  buildCssGradeFilter,
  parseCurvesString,
} from "../remotion-templates/src/utils/colorGrade.js";
import { seededRandom } from "../remotion-templates/src/components/FilmGrainOverlay.js";

describe("interpolations", () => {
  it("easingMap contains all 5 easing types", () => {
    expect(easingMap.linear).toBeDefined();
    expect(easingMap.ease_in).toBeDefined();
    expect(easingMap.ease_out).toBeDefined();
    expect(easingMap.ease_in_out).toBeDefined();
    expect(easingMap.bounce).toBeDefined();
  });

  it("toFrameTimings converts seconds to frame numbers", () => {
    const result = toFrameTimings(
      { start_sec: 1.0, duration_sec: 3.0, fade_in_sec: 0.5, fade_out_sec: 0.5 },
      30,
    );
    expect(result.S).toBe(30);
    expect(result.E).toBe(120);
    expect(result.FI).toBe(15);
    expect(result.FO).toBe(15);
  });

  it("toFrameTimings defaults fade to 0.3s when not specified", () => {
    const result = toFrameTimings(
      { start_sec: 0, duration_sec: 2.0 },
      30,
    );
    expect(result.FI).toBe(9);
    expect(result.FO).toBe(9);
  });

  it("interpolateOpacity returns 0 before start", () => {
    expect(interpolateOpacity(0, 30, 120, 15, 15)).toBe(0);
  });

  it("interpolateOpacity returns 1 in middle", () => {
    expect(interpolateOpacity(75, 30, 120, 15, 15)).toBe(1);
  });

  it("interpolateOpacity returns 0 after end", () => {
    expect(interpolateOpacity(130, 30, 120, 15, 15)).toBe(0);
  });

  it("interpolateOpacity fades in over FI frames", () => {
    const val = interpolateOpacity(37, 30, 120, 15, 15);
    expect(val).toBeGreaterThan(0);
    expect(val).toBeLessThan(1);
  });

  it("resolveMotionTransform zoom_in scales up with progress", () => {
    const result = resolveMotionTransform(
      { type: "zoom_in", intensity: 0.2 },
      0.5,
    );
    expect(result.scale).toBeCloseTo(1.1);
    expect(result.translateX).toBe(0);
  });

  it("resolveMotionTransform zoom_out scales down with progress", () => {
    const at0 = resolveMotionTransform({ type: "zoom_out", intensity: 0.2 }, 0);
    const at1 = resolveMotionTransform({ type: "zoom_out", intensity: 0.2 }, 1);
    expect(at0.scale).toBeCloseTo(1.2);
    expect(at1.scale).toBeCloseTo(1.0);
  });

  it("resolveMotionTransform pan_left translates X negatively", () => {
    const result = resolveMotionTransform(
      { type: "pan_left", intensity: 0.1 },
      1.0,
    );
    expect(result.translateX).toBeLessThan(0);
  });

  it("resolveMotionTransform returns identity for null motion", () => {
    const result = resolveMotionTransform(null, 0.5);
    expect(result.scale).toBe(1);
    expect(result.translateX).toBe(0);
    expect(result.translateY).toBe(0);
  });

  it("focusToTransformOrigin maps focus values to CSS origins", () => {
    expect(focusToTransformOrigin("center")).toBe("center center");
    expect(focusToTransformOrigin("left")).toBe("left center");
    expect(focusToTransformOrigin("right")).toBe("right center");
    expect(focusToTransformOrigin("top")).toBe("center top");
    expect(focusToTransformOrigin("bottom")).toBe("center bottom");
    expect(focusToTransformOrigin(undefined)).toBe("center center");
  });
});

describe("colorGrade", () => {
  it("parseEqString parses FFmpeg eq string correctly", () => {
    const result = parseEqString("contrast=1.15:brightness=-0.05:saturation=0.85:gamma=0.9");
    expect(result.contrast).toBeCloseTo(1.15);
    expect(result.brightness).toBeCloseTo(-0.05);
    expect(result.saturation).toBeCloseTo(0.85);
    expect(result.gamma).toBeCloseTo(0.9);
  });

  it("buildCssGradeFilter produces CSS filter string", () => {
    const filter = buildCssGradeFilter({
      eq: "contrast=1.30:brightness=-0.07:saturation=0.70",
    });
    expect(filter).toContain("contrast(1.3)");
    expect(filter).toMatch(/brightness\(0\.92999/);
    expect(filter).toContain("saturate(0.7)");
  });

  it("buildCssGradeFilter returns empty string for null eq", () => {
    expect(buildCssGradeFilter({ eq: null })).toBe("");
  });

  it("parseCurvesString parses R/G/B curve tables", () => {
    const result = parseCurvesString(
      "r='0/0 0.5/0.42 1/0.88':g='0/0 0.5/0.44 1/0.90':b='0/0 0.5/0.50 1/0.97'",
    );
    expect(result).not.toBeNull();
    expect(result!.r.table.length).toBe(256);
    expect(result!.g.table.length).toBe(256);
    expect(result!.b.table.length).toBe(256);
    expect(result!.r.table[0]).toBe(0);
    expect(result!.r.table[255]).toBeLessThanOrEqual(255);
  });
});

describe("FilmGrainOverlay determinism", () => {
  it("seededRandom with seed 42 produces consistent values", () => {
    const rng1 = seededRandom(42);
    const rng2 = seededRandom(42);
    const vals1 = Array.from({ length: 100 }, () => rng1());
    const vals2 = Array.from({ length: 100 }, () => rng2());
    expect(vals1).toEqual(vals2);
  });

  it("seededRandom with different seeds produces different values", () => {
    const rng1 = seededRandom(42);
    const rng2 = seededRandom(99);
    const v1 = rng1();
    const v2 = rng2();
    expect(v1).not.toBe(v2);
  });

  it("seededRandom values are in [0, 1) range", () => {
    const rng = seededRandom(42);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
