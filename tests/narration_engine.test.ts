import { describe, it, expect } from "vitest";
import { runNarration, type NarrationScript } from "../src/engines/narration_engine.js";
import { createLogger } from "../src/core/logger.js";
import { LOG_SCHEMA_VERSION, type RunContext } from "../src/core/run_context.js";
import { MockTTSAdapter } from "./mocks/mock_tts_adapter.js";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";

describe("runNarration", () => {
  it("calls adapter and updates context", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "visu-log-"));
    const logPath = join(tmp, "log.ndjson");
    const logger = createLogger("run-1", logPath);

    const script: NarrationScript = {
      version: "1.0",
      language: "te",
      text: "Test narration",
    };

    const context: RunContext = {
      runId: "run-1",
      startedAt: new Date().toISOString(),
      environment: { nodeVersion: process.version },
      execution: { mode: "narrate", inputId: "test", inputVersion: "1.0" },
      language: "te",
      versions: { logSchema: LOG_SCHEMA_VERSION },
      artifacts: {},
      status: "running",
    };

    const adapter = new MockTTSAdapter();
    const { context: updated, result } = await runNarration({
      script,
      context,
      logger,
      adapter,
      scriptFileHash: "file-hash",
    });

    expect(updated.artifacts.audioPath).toBeDefined();
    expect(updated.status).toBe("completed");
    expect(result.scriptHash).toBeDefined();
    expect(result.scriptFileHash).toBe("file-hash");
  });
});

