import { describe, it, expect, beforeAll } from "vitest";
import { runFlow } from "../src/engines/flow_executor.js";
import { UIFlowAdapter } from "../src/adapters/ui_flow_adapter.js";
import { createRunId, createLogger, timestampIso } from "../src/core/logger.js";
import { LOG_SCHEMA_VERSION } from "../src/core/run_context.js";
import type { RunContext } from "../src/core/run_context.js";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

const RUN_INTEGRATION = process.env.RUN_INTEGRATION === "true";

describe("ui_flow_smoke", () => {
  beforeAll(() => {
    try {
      mkdirSync(join(process.cwd(), "logs"), { recursive: true });
    } catch {
      // ignore
    }
  });

  it.skipIf(!RUN_INTEGRATION)(
    "runs real Playwright flow and produces rawVideoPath at artifacts/{runId}/raw.webm",
    async () => {
      const runId = createRunId();
      const logPath = join(process.cwd(), "logs", `visu-smoke-${runId}.log`);
      const logger = createLogger(runId, logPath);
      const context: RunContext = {
        runId,
        startedAt: timestampIso(),
        environment: { nodeVersion: process.version },
        execution: { mode: "ui_flow", inputId: "smoke", inputVersion: "1.0" },
        language: "te",
        versions: { logSchema: LOG_SCHEMA_VERSION },
        artifacts: {},
        status: "running",
      };
      const flow = {
        flow_id: "smoke",
        version: "1.0",
        steps: [
          { step_id: "s1", action: "navigate" as const, url: "https://example.com" },
          { step_id: "s2", action: "wait" as const, timeout_ms: 500 },
          { step_id: "s3", action: "done" as const },
        ],
      };
      const adapter = new UIFlowAdapter();
      await adapter.launch();
      const result = await runFlow({ flow, context, logger, adapter });
      logger.close();
      expect(result.status).toBe("completed");
      expect(result.artifacts.rawVideoPath).toBeDefined();
      expect(result.artifacts.rawVideoPath).toContain(runId);
      expect(result.artifacts.rawVideoPath).toMatch(/raw\.webm$/);
    },
    30000
  );
});
