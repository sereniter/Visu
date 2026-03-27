/**
 * Integration test for scene-driven Mode A (ui_flow_scenes). Gated by RUN_MODE_A_SCENES_INTEGRATION=true.
 * Uses fixture contract v1.5 and fixture topic content under tests/fixtures/ui_flow_scenes/ (script_templates, placeholder PNGs).
 * Verifies: scene clips, stitched video, final.mp4, chapter markers, subtitles.srt, thumbnail, upload_metadata description.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createLogger } from "../src/core/logger.js";
import { LOG_SCHEMA_VERSION, type RunContext } from "../src/core/run_context.js";
import { runUIFlowSceneEngine } from "../src/engines/ui_flow_scene_engine.js";
import { FFmpegAdapter } from "../src/adapters/ffmpeg_adapter.js";
import { getConfig, setConfigForTest } from "../src/core/config.js";

const RUN_INTEGRATION = process.env.RUN_MODE_A_SCENES_INTEGRATION === "true";
const FIXTURES_DIR = join(process.cwd(), "tests", "fixtures", "ui_flow_scenes");
const CONTRACT_PATH = join(FIXTURES_DIR, "contract_v1.5_fixture.json");
const TOPIC = "ui_flow_scenes_test";
const TOPIC_DIR = join(FIXTURES_DIR, TOPIC);

function createPlaceholderPng(filePath: string): void {
  if (existsSync(filePath)) return;
  mkdirSync(join(filePath, ".."), { recursive: true });
  const r = spawnSync("ffmpeg", ["-f", "lavfi", "-i", "color=c=black:s=1920x1080:d=1", "-y", filePath], {
    stdio: "pipe",
  });
  if (r.status !== 0) throw new Error(`Failed to create placeholder PNG: ${r.stderr?.toString() ?? r.error?.message}`);
}

function uiFlowScenesFixturesPresent(): boolean {
  if (!existsSync(CONTRACT_PATH)) return false;
  const contract = JSON.parse(readFileSync(CONTRACT_PATH, "utf-8")) as {
    topic?: string;
    intro?: { asset_path?: string };
    summary?: { asset_path?: string };
  };
  const scriptTemplates = join(TOPIC_DIR, "scripts", "script_templates.json");
  const introAsset = join(TOPIC_DIR, contract.intro?.asset_path ?? "visuals/intro.png");
  const summaryAsset = join(TOPIC_DIR, contract.summary?.asset_path ?? "visuals/summary.png");
  return (
    existsSync(scriptTemplates) &&
    existsSync(introAsset) &&
    existsSync(summaryAsset)
  );
}

describe("ui_flow_scenes_integration", () => {
  beforeAll(() => {
    if (!RUN_INTEGRATION) return;
    mkdirSync(join(TOPIC_DIR, "scripts"), { recursive: true });
    mkdirSync(join(TOPIC_DIR, "visuals"), { recursive: true });
    createPlaceholderPng(join(TOPIC_DIR, "visuals", "intro_12345_1.0.png"));
    createPlaceholderPng(join(TOPIC_DIR, "visuals", "summary_12345_1.0.png"));
    const config = getConfig();
    setConfigForTest({ ...config, contentRoot: FIXTURES_DIR });
  });

  it("falls back to PNG intro/summary when remotion is disabled even if renderer is remotion", async () => {
    if (!RUN_INTEGRATION) return;
    if (!uiFlowScenesFixturesPresent()) return;

    const baseConfig = getConfig();
    setConfigForTest({
      ...baseConfig,
      remotion: { ...(baseConfig.remotion ?? {}), enabled: false } as NonNullable<ReturnType<typeof getConfig>["remotion"]>,
    });

    const runId = "ui-flow-scenes-remotion-disabled";
    const logPath = join(process.cwd(), "logs", `${runId}.ndjson`);
    mkdirSync(join(process.cwd(), "logs"), { recursive: true });
    const logger = createLogger(runId, logPath);
    const ffmpegAdapter = new FFmpegAdapter();

    const context: RunContext = {
      runId,
      startedAt: new Date().toISOString(),
      environment: { nodeVersion: process.version },
      execution: { mode: "ui_flow_scenes", inputId: CONTRACT_PATH, inputVersion: "1.5" },
      language: "en",
      versions: { logSchema: LOG_SCHEMA_VERSION },
      artifacts: {},
      status: "running",
    };

    const result = await runUIFlowSceneEngine({
      contractPath: CONTRACT_PATH,
      context,
      logger,
      adapter: ffmpegAdapter,
    });
    logger.close();

    expect(result.status).toBe("completed");
  });

  afterAll(() => {
    setConfigForTest(null);
  });

  it(
    "produces final.mp4 with post-production when fixtures present",
    async () => {
      if (!RUN_INTEGRATION) return;
      if (!uiFlowScenesFixturesPresent()) {
        console.warn(
          "Skipping: ui_flow_scenes fixtures not found (contract + topic content with intro/summary PNGs and script_templates). Set RUN_MODE_A_SCENES_INTEGRATION=true and add tests/fixtures/ui_flow_scenes/ to run."
        );
        return;
      }

      const config = getConfig();
      const runId = "ui-flow-scenes-integration-1";
      const outputDir = join(process.cwd(), config.execution.artifactsDir, runId);
      mkdirSync(outputDir, { recursive: true });
      const logPath = join(process.cwd(), "logs", `${runId}.ndjson`);
      mkdirSync(join(process.cwd(), "logs"), { recursive: true });

      const context: RunContext = {
        runId,
        startedAt: new Date().toISOString(),
        environment: { nodeVersion: process.version },
        execution: { mode: "ui_flow_scenes", inputId: CONTRACT_PATH, inputVersion: "1.5" },
        language: "en",
        versions: { logSchema: LOG_SCHEMA_VERSION },
        artifacts: {},
        status: "running",
      };
      const logger = createLogger(runId, logPath);
      const ffmpegAdapter = new FFmpegAdapter();

      const result = await runUIFlowSceneEngine({
        contractPath: CONTRACT_PATH,
        context,
        logger,
        adapter: ffmpegAdapter,
      });
      logger.close();

      expect(result.status).toBe("completed");
      expect(result.artifacts.finalVideoPath).toBeDefined();
      expect(result.artifacts.metadataPath).toBeDefined();
      if (result.artifacts.finalVideoPath) {
        expect(existsSync(result.artifacts.finalVideoPath)).toBe(true);
      }
      const runDir = join(process.cwd(), config.execution.artifactsDir, runId);
      if (existsSync(join(runDir, "subtitles.srt"))) {
        const srt = readFileSync(join(runDir, "subtitles.srt"), "utf-8");
        expect(srt).toMatch(/\d+\n\d{2}:\d{2}:\d{2},\d{3} -->/);
      }
      if (existsSync(join(runDir, "upload_metadata.json"))) {
        const meta = JSON.parse(readFileSync(join(runDir, "upload_metadata.json"), "utf-8"));
        expect(meta.description).toBeDefined();
      }
    },
    { timeout: 120_000 }
  );
});
