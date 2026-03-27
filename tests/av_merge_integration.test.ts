/**
 * Integration test for AV merge. Gated by RUN_MEDIA_INTEGRATION=true.
 * Uses static committed fixtures: raw_fixture.webm, narration_fixture.wav, music_fixture.wav.
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "../src/core/logger.js";
import { LOG_SCHEMA_VERSION, type RunContext } from "../src/core/run_context.js";
import { runAvMerge } from "../src/engines/av_merge_engine.js";
import { FFmpegAdapter } from "../src/adapters/ffmpeg_adapter.js";

const RUN_INTEGRATION = process.env.RUN_MEDIA_INTEGRATION === "true";
const FIXTURES_DIR = join(process.cwd(), "tests", "fixtures");
const RAW_FIXTURE = join(FIXTURES_DIR, "raw_fixture.webm");
const NARRATION_FIXTURE = join(FIXTURES_DIR, "narration_fixture.wav");

describe("av_merge_integration", () => {
  it(
    "produces final.mp4 and media_metadata.json; SHA256 stable across two runs",
    async () => {
      if (!RUN_INTEGRATION) return;
      if (!existsSync(RAW_FIXTURE) || !existsSync(NARRATION_FIXTURE)) {
        console.warn("Skipping: fixtures not found. Add raw_fixture.webm and narration_fixture.wav to tests/fixtures/");
        return;
      }

      const tmpDir1 = join(process.cwd(), "artifacts", "integration-run-1");
      const tmpDir2 = join(process.cwd(), "artifacts", "integration-run-2");
      const logPath1 = join(process.cwd(), "logs", "integration-1.ndjson");
      const logPath2 = join(process.cwd(), "logs", "integration-2.ndjson");

      const context1: RunContext = {
        runId: "integration-1",
        startedAt: new Date().toISOString(),
        environment: { nodeVersion: process.version },
        execution: { mode: "narrate", inputId: "fixture", inputVersion: "1.0" },
        language: "te",
        versions: { logSchema: LOG_SCHEMA_VERSION },
        artifacts: {},
        status: "running",
      };
      const logger1 = createLogger("integration-1", logPath1);
      const adapter = new FFmpegAdapter();

      const result1 = await runAvMerge({
        rawVideoPath: RAW_FIXTURE,
        narrationPath: NARRATION_FIXTURE,
        musicPath: null,
        outputDir: tmpDir1,
        context: context1,
        logger: logger1,
        adapter,
      });

      expect(result1.artifacts.finalVideoPath).toBeDefined();
      expect(existsSync(result1.artifacts.finalVideoPath!)).toBe(true);
      expect(result1.artifacts.metadataPath).toBeDefined();
      const metaPath1 = result1.artifacts.metadataPath!;
      expect(existsSync(metaPath1)).toBe(true);
      const meta1 = JSON.parse(readFileSync(metaPath1, "utf-8"));
      expect(meta1.runId).toBe("integration-1");
      expect(meta1.encodingProfileVersion).toBe("v1");
      expect(meta1.outputSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(meta1.durationMs).toBeGreaterThan(0);
      expect(meta1.driftMs).toBeLessThanOrEqual(200);

      const context2: RunContext = {
        ...context1,
        runId: "integration-2",
      };
      const logger2 = createLogger("integration-2", logPath2);
      const result2 = await runAvMerge({
        rawVideoPath: RAW_FIXTURE,
        narrationPath: NARRATION_FIXTURE,
        musicPath: null,
        outputDir: tmpDir2,
        context: context2,
        logger: logger2,
        adapter,
      });

      const meta2 = JSON.parse(readFileSync(result2.artifacts.metadataPath!, "utf-8"));
      expect(meta2.outputSha256).toBe(meta1.outputSha256);
    },
    { timeout: 60000 }
  );
});
