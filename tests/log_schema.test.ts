import { describe, it, expect } from "vitest";
import { validateLogEntry } from "../src/validators/log_schema.js";

describe("log_schema_v1", () => {
  it("accepts valid log entry", () => {
    const result = validateLogEntry({
      runId: "run-1",
      timestamp: "2026-02-19T00:00:00.000Z",
      step: "init",
    });
    expect(result.valid).toBe(true);
  });

  it("accepts entry with level, message, payload", () => {
    const result = validateLogEntry({
      runId: "run-1",
      timestamp: "2026-02-19T00:00:00.000Z",
      step: "step1",
      level: "info",
      message: "done",
      payload: { key: "value" },
    });
    expect(result.valid).toBe(true);
  });

  it("rejects entry missing required runId", () => {
    const result = validateLogEntry({
      timestamp: "2026-02-19T00:00:00.000Z",
      step: "init",
    });
    expect(result.valid).toBe(false);
    expect(Array.isArray((result as { errors: string[] }).errors)).toBe(true);
  });

  it("rejects entry with additional properties", () => {
    const result = validateLogEntry({
      runId: "run-1",
      timestamp: "2026-02-19T00:00:00.000Z",
      step: "init",
      extra: "forbidden",
    });
    expect(result.valid).toBe(false);
  });
});
