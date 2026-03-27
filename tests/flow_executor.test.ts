import { describe, it, expect } from "vitest";
import { runFlow } from "../src/engines/flow_executor.js";
import type { RunContext } from "../src/core/run_context.js";
import { LOG_SCHEMA_VERSION } from "../src/core/run_context.js";
import { MockUIFlowAdapter } from "./mocks/mock_ui_adapter.js";

function createContext(runId: string): RunContext {
  return {
    runId,
    startedAt: new Date().toISOString(),
    environment: { nodeVersion: process.version },
    execution: { mode: "ui_flow", inputId: "test", inputVersion: "1.0" },
    language: "te",
    versions: { logSchema: LOG_SCHEMA_VERSION },
    artifacts: {},
    status: "running",
  };
}

function createLogger(): { log: (step: string, opts?: { message?: string; payload?: object }) => void; entries: { step: string; payload?: object }[] } {
  const entries: { step: string; payload?: object }[] = [];
  return {
    entries,
    log(step: string, opts?: { message?: string; payload?: object }) {
      entries.push({ step, payload: opts?.payload });
    },
  };
}

describe("flow_executor", () => {
  it("successful run sets status completed and rawVideoPath", async () => {
    const context = createContext("run-1");
    const logger = createLogger();
    const adapter = new MockUIFlowAdapter();
    const flow = {
      flow_id: "f1",
      version: "1.0",
      steps: [
        { step_id: "s1", action: "navigate" as const, url: "https://example.com" },
        { step_id: "s2", action: "done" as const },
      ],
    };
    const result = await runFlow({ flow, context, logger, adapter });
    expect(result.status).toBe("completed");
    expect(result.artifacts.rawVideoPath).toBe("artifacts/run-1/raw.webm");
    expect(logger.entries.map((e) => e.step)).toContain("step_started");
    expect(logger.entries.map((e) => e.step)).toContain("step_completed");
    expect(logger.entries.map((e) => e.step)).toContain("flow_completed");
  });

  it("rawVideoPath exists after completed run", async () => {
    const context = createContext("run-2");
    const logger = createLogger();
    const adapter = new MockUIFlowAdapter({ closeReturnPath: "/custom/path/raw.webm" });
    const flow = {
      flow_id: "f1",
      version: "1.0",
      steps: [{ step_id: "s1", action: "done" as const }],
    };
    const result = await runFlow({ flow, context, logger, adapter });
    expect(result.status).toBe("completed");
    expect(result.artifacts.rawVideoPath).toBe("/custom/path/raw.webm");
  });

  it("failure stops execution and sets status failed", async () => {
    const context = createContext("run-3");
    const logger = createLogger();
    const adapter = new MockUIFlowAdapter({ failOnStepId: "s2" });
    const flow = {
      flow_id: "f1",
      version: "1.0",
      steps: [
        { step_id: "s1", action: "navigate" as const, url: "https://example.com" },
        { step_id: "s2", action: "click" as const, selector: "#btn" },
        { step_id: "s3", action: "done" as const },
      ],
    };
    const result = await runFlow({ flow, context, logger, adapter });
    expect(result.status).toBe("failed");
    expect(result.error?.message).toBe("mock failure");
    expect(logger.entries.map((e) => e.step)).toContain("step_failed");
    expect(adapter.getStepsExecuted()).toEqual(["s1", "s2"]);
    expect(adapter.getStepsExecuted()).not.toContain("s3");
  });
});
