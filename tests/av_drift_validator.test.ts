import { describe, it, expect } from "vitest";
import { validateAvDrift } from "../src/validators/av_drift_validator.js";

describe("validateAvDrift", () => {
  it("passes when narration ≤ video and delta ≤ 200ms", () => {
    const r = validateAvDrift(5000, 4800);
    expect(r.valid).toBe(true);
    expect(r.driftMs).toBe(200);
  });

  it("passes when narration equals video", () => {
    const r = validateAvDrift(3000, 3000);
    expect(r.valid).toBe(true);
    expect(r.driftMs).toBe(0);
  });

  it("fails when narration > video", () => {
    const r = validateAvDrift(3000, 3500);
    expect(r.valid).toBe(false);
    expect(r.driftMs).toBe(500);
    expect(r.error).toMatch(/exceeds video duration/);
  });

  it("fails when delta > 200ms", () => {
    const r = validateAvDrift(5000, 4700);
    expect(r.valid).toBe(false);
    expect(r.driftMs).toBe(300);
    expect(r.error).toMatch(/exceeds maximum 200ms/);
  });

  it("passes when delta exactly 200ms", () => {
    const r = validateAvDrift(5000, 4800);
    expect(r.valid).toBe(true);
    expect(r.driftMs).toBe(200);
  });

  it("Mode B: passes when maxDriftMs is null (no gap cap)", () => {
    const r = validateAvDrift(60000, 32510, { maxDriftMs: null });
    expect(r.valid).toBe(true);
    expect(r.driftMs).toBe(27490);
  });

  it("Mode B: still fails when narration > video", () => {
    const r = validateAvDrift(10000, 15000, { maxDriftMs: null });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/exceeds video duration/);
  });
});
