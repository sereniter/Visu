/**
 * Unit tests for environment snapshot validator (Sprint 7).
 */

import { describe, it, expect } from "vitest";
import {
  validateEnvironmentSnapshot,
  type EnvironmentSnapshotPayload,
} from "../src/validators/environment_snapshot_validator.js";

const validSnapshot: EnvironmentSnapshotPayload = {
  ffmpegVersionFull: "ffmpeg version 6.1.1",
  ffmpegBuildConf: "--enable-libx264",
  ffmpegBinaryFingerprint: "abc123",
  nodeVersion: "v20.10.0",
  piperVersion: "1.2.0",
  piperBinaryFingerprint: "def456",
  piperModelHash: "model789",
  configHash: "confhash",
  capturedAt: "2026-02-22T12:00:00.000Z",
};

describe("validateEnvironmentSnapshot", () => {
  it("accepts valid snapshot", () => {
    const result = validateEnvironmentSnapshot(validSnapshot);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.nodeVersion).toBe("v20.10.0");
      expect(result.data.piperVersion).toBe("1.2.0");
    }
  });

  it("accepts null piperVersion", () => {
    const withNull = { ...validSnapshot, piperVersion: null };
    const result = validateEnvironmentSnapshot(withNull);
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.data.piperVersion).toBeNull();
  });

  it("rejects missing required field", () => {
    const missing = { ...validSnapshot };
    delete (missing as Record<string, unknown>).configHash;
    const result = validateEnvironmentSnapshot(missing);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects additional properties when strict", () => {
    const withExtra = { ...validSnapshot, extra: "not allowed" };
    const result = validateEnvironmentSnapshot(withExtra);
    expect(result.valid).toBe(false);
  });
});
