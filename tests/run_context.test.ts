import { describe, it, expect } from "vitest";
import type { RunContext } from "@core/run_context.js";
import { LOG_SCHEMA_VERSION } from "@core/run_context.js";

describe("RunContext", () => {
  it("interface compiles and can be used as a type", () => {
    const ctx: RunContext = {
      runId: "test-run-1",
      startedAt: "2026-02-19T00:00:00.000Z",
      environment: {
        nodeVersion: "20.0.0",
      },
      execution: {
        mode: "ui_flow",
        inputId: "flow-1",
        inputVersion: "1.0",
      },
      language: "te",
      versions: {
        logSchema: LOG_SCHEMA_VERSION,
      },
      artifacts: {},
      status: "initialized",
    };
    expect(ctx.runId).toBe("test-run-1");
    expect(ctx.status).toBe("initialized");
  });
});
