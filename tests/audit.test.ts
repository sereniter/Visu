/**
 * Unit tests for audit CLI (Sprint 7).
 */

import { describe, it, expect } from "vitest";
import { runAudit } from "../src/cli/audit.js";

describe("runAudit", () => {
  it("returns exitCode 2 when runId is missing or invalid", async () => {
    const { output, exitCode } = await runAudit("");
    expect(exitCode).toBe(2);
    expect(output.status).toBe("FAIL");
    expect(output.mismatches.some((m) => m.field === "runId" || m.field === "media_metadata")).toBe(true);
  });

  it("returns exitCode 2 when runId directory does not exist", async () => {
    const { output, exitCode } = await runAudit("nonexistent-run-id-12345");
    expect(exitCode).toBe(2);
    expect(output.status).toBe("FAIL");
  });

  it("returns output with determinismLevel derived from mode", async () => {
    const { output } = await runAudit("nonexistent");
    expect(["environment-sensitive", "binary-sensitive"]).toContain(output.determinismLevel);
    expect(output.checked).toHaveProperty("ffmpegBinaryFingerprint");
    expect(output.checked).toHaveProperty("finalVideoSha256");
    expect(output.mismatches).toBeInstanceOf(Array);
  });

  it("accepts expectedFfmpegFingerprint option", async () => {
    const { exitCode } = await runAudit("nonexistent", {
      expectedFfmpegFingerprint: "expected-hash",
    });
    expect(exitCode).toBe(2);
  });
});
