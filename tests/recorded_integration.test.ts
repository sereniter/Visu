/**
 * Integration test for Mode B (recorded). Gated by RUN_RECORDED_INTEGRATION=true.
 * Uses static committed fixtures: recorded_fixture.mp4 (≤10s, ≤5MB), script_fixture.json.
 * Verifies: final.mp4 exists, drift ≤200ms, SHA256 identical across two runs, media_metadata.json valid.
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "../src/core/logger.js";
import { LOG_SCHEMA_VERSION, type RunContext } from "../src/core/run_context.js";
import { runRecordedMode } from "../src/engines/recorded_mode_engine.js";
import { FFmpegAdapter } from "../src/adapters/ffmpeg_adapter.js";
import { LocalPiperAdapter } from "../src/adapters/tts/local_piper_adapter.js";
import { validateMediaMetadata } from "../src/validators/media_metadata_schema.js";

const RUN_INTEGRATION = process.env.RUN_RECORDED_INTEGRATION === "true";
const FIXTURES_DIR = join(process.cwd(), "tests", "fixtures");
const RECORDED_FIXTURE = join(FIXTURES_DIR, "recorded_fixture.mp4");
const SCRIPT_FIXTURE = join(FIXTURES_DIR, "script_fixture.json");

describe("recorded_integration", () => {
  it(
    "produces final.mp4 and media_metadata.json; drift ≤200ms; SHA256 stable across two runs",
    async () => {
      if (!RUN_INTEGRATION) return;
      if (!existsSync(RECORDED_FIXTURE) || !existsSync(SCRIPT_FIXTURE)) {
        console.warn(
          "Skipping: fixtures not found. Add recorded_fixture.mp4 (≤10s, ≤5MB) and script_fixture.json to tests/fixtures/"
        );
        return;
      }

      const artifactsDir = join(process.cwd(), "artifacts");
      const runId1 = "recorded-integration-1";
      const runId2 = "recorded-integration-2";
      mkdirSync(artifactsDir, { recursive: true });
      const logPath1 = join(process.cwd(), "logs", `${runId1}.ndjson`);
      const logPath2 = join(process.cwd(), "logs", `${runId2}.ndjson`);

      const context1: RunContext = {
        runId: runId1,
        startedAt: new Date().toISOString(),
        environment: { nodeVersion: process.version },
        execution: { mode: "recorded", inputId: SCRIPT_FIXTURE, inputVersion: "1.0" },
        language: "te",
        versions: { logSchema: LOG_SCHEMA_VERSION },
        artifacts: {},
        status: "running",
      };
      const logger1 = createLogger(runId1, logPath1);
      const ffmpegAdapter = new FFmpegAdapter();
      const ttsAdapter = new LocalPiperAdapter();

      const result1 = await runRecordedMode({
        videoPath: RECORDED_FIXTURE,
        scriptPath: SCRIPT_FIXTURE,
        context: context1,
        logger: logger1,
        ffmpegAdapter,
        ttsAdapter,
      });

      expect(result1.status).toBe("completed");
      expect(result1.artifacts.finalVideoPath).toBeDefined();
      expect(existsSync(result1.artifacts.finalVideoPath!)).toBe(true);
      expect(result1.artifacts.metadataPath).toBeDefined();
      const metaPath1 = result1.artifacts.metadataPath!;
      expect(existsSync(metaPath1)).toBe(true);
      const meta1 = JSON.parse(readFileSync(metaPath1, "utf-8"));
      expect(meta1.runId).toBe(runId1);
      expect(meta1.mode).toBe("recorded");
      expect(meta1.sourceVideoPath).toBeDefined();
      expect(meta1.outputSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(meta1.durationMs).toBeGreaterThan(0);
      expect(meta1.driftMs).toBeLessThanOrEqual(200);
      const metaValidation1 = validateMediaMetadata(meta1);
      expect(metaValidation1.valid).toBe(true);

      const context2: RunContext = {
        ...context1,
        runId: runId2,
      };
      const logger2 = createLogger(runId2, logPath2);
      const result2 = await runRecordedMode({
        videoPath: RECORDED_FIXTURE,
        scriptPath: SCRIPT_FIXTURE,
        context: context2,
        logger: logger2,
        ffmpegAdapter: new FFmpegAdapter(),
        ttsAdapter: new LocalPiperAdapter(),
      });

      const meta2 = JSON.parse(readFileSync(result2.artifacts.metadataPath!, "utf-8"));
      expect(meta2.outputSha256).toBe(meta1.outputSha256);
    },
    { timeout: 120000 }
  );
});
