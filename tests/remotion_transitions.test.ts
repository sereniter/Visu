import { describe, expect, it } from "vitest";
import { calculateTotalFrames } from "../remotion-templates/src/TransitionComposition.js";

describe("calculateTotalFrames", () => {
  it("sums scene durations with no transitions", () => {
    const scenes = [
      { duration_sec: 10 },
      { duration_sec: 10 },
      { duration_sec: 10 },
    ];
    const total = calculateTotalFrames(scenes, 30);
    expect(total).toBe(900);
  });

  it("subtracts transition duration for fade transitions", () => {
    const scenes = [
      { duration_sec: 10 },
      { duration_sec: 10, transition: { type: "fade" as const, duration_sec: 0.5 } },
      { duration_sec: 10, transition: { type: "wipe" as const, duration_sec: 0.5 } },
    ];
    const total = calculateTotalFrames(scenes, 30);
    // 3 * 300 = 900, minus 2 * 15 = 30 → 870
    expect(total).toBe(870);
  });

  it("does not subtract for light_leak overlay transitions", () => {
    const scenes = [
      { duration_sec: 10 },
      { duration_sec: 10, transition: { type: "light_leak" as const, duration_sec: 0.5 } },
    ];
    const total = calculateTotalFrames(scenes, 30);
    expect(total).toBe(600);
  });

  it("does not subtract for none transitions", () => {
    const scenes = [
      { duration_sec: 10 },
      { duration_sec: 10, transition: { type: "none" as const, duration_sec: 0.5 } },
    ];
    const total = calculateTotalFrames(scenes, 30);
    expect(total).toBe(600);
  });

  it("ignores first scene transition", () => {
    const scenes = [
      { duration_sec: 10, transition: { type: "fade" as const, duration_sec: 0.5 } },
      { duration_sec: 10 },
    ];
    const total = calculateTotalFrames(scenes, 30);
    expect(total).toBe(600);
  });

  it("defaults transition duration to 0.5s when not specified", () => {
    const scenes = [
      { duration_sec: 10 },
      { duration_sec: 10, transition: { type: "fade" as const } },
    ];
    const total = calculateTotalFrames(scenes, 30);
    // 600 - 15 = 585
    expect(total).toBe(585);
  });

  it("handles single scene", () => {
    const scenes = [{ duration_sec: 5 }];
    const total = calculateTotalFrames(scenes, 30);
    expect(total).toBe(150);
  });

  it("returns minimum of 1 for empty scenes", () => {
    const total = calculateTotalFrames([], 30);
    expect(total).toBe(1);
  });

  it("mixes different transition types correctly", () => {
    const scenes = [
      { duration_sec: 5 },
      { duration_sec: 5, transition: { type: "slide" as const, duration_sec: 0.5 } },
      { duration_sec: 5, transition: { type: "light_leak" as const, duration_sec: 1.0 } },
      { duration_sec: 5, transition: { type: "flip" as const, duration_sec: 0.3 } },
    ];
    const total = calculateTotalFrames(scenes, 30);
    // 4 * 150 = 600
    // slide: -15, light_leak: 0, flip: -9
    // 600 - 15 - 9 = 576
    expect(total).toBe(576);
  });
});
