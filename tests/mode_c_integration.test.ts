/**
 * Integration test for Mode C (generative). Gated by RUN_MODE_C_INTEGRATION=true.
 * Uses governed fixtures under tests/fixtures/mode_c_governed/: contract v1.3, prompt library,
 * script templates, governed PNGs + provenance. Verifies: scene clips, stitched_video.mp4,
 * final.mp4, media_metadata.json valid (language, voiceId, per-scene language). No SHA256
 * equality assertion (Piper is functionally deterministic, not bit-identical — Sprint 8).
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "../src/core/logger.js";
import { LOG_SCHEMA_VERSION, type RunContext } from "../src/core/run_context.js";
import { runModeC } from "../src/engines/mode_c_engine.js";
import { FFmpegAdapter } from "../src/adapters/ffmpeg_adapter.js";
import { validateMediaMetadata } from "../src/validators/media_metadata_schema.js";

const RUN_INTEGRATION = process.env.RUN_MODE_C_INTEGRATION === "true";
const FIXTURES_DIR = join(process.cwd(), "tests", "fixtures");
const GOVERNED_DIR = join(FIXTURES_DIR, "mode_c_governed");
const CONTRACT_PATH = join(GOVERNED_DIR, "contract_v1.3_fixture.json");
const PROMPT_LIBRARY = join(GOVERNED_DIR, "prompts", "prompt_library.json");
const SCRIPT_TEMPLATES = join(GOVERNED_DIR, "scripts", "script_templates.json");
const ASSETS = join(GOVERNED_DIR, "assets", "visuals");

function governedFixturesPresent(): boolean {
  if (
    !existsSync(CONTRACT_PATH) ||
    !existsSync(PROMPT_LIBRARY) ||
    !existsSync(SCRIPT_TEMPLATES)
  ) {
    return false;
  }
  const png1 = join(ASSETS, "test_scene_intro_12345_1.0.png");
  const prov1 = join(ASSETS, "test_scene_intro_12345_1.0.provenance.json");
  const png2 = join(ASSETS, "test_scene_intro_54321_1.0.png");
  const prov2 = join(ASSETS, "test_scene_intro_54321_1.0.provenance.json");
  return (
    existsSync(png1) && existsSync(prov1) && existsSync(png2) && existsSync(prov2)
  );
}

describe("mode_c_integration", () => {
  it(
    "produces stitched_video.mp4 and final.mp4; metadata valid; language/voiceId/per-scene language",
    async () => {
      if (!RUN_INTEGRATION) return;
      if (!governedFixturesPresent()) {
        console.warn(
          "Skipping: Mode C governed fixtures not found under tests/fixtures/mode_c_governed/ (see ENVIRONMENT.md)."
        );
        return;
      }

      const artifactsDir = join(process.cwd(), "artifacts");
      const runId1 = "mode-c-integration-1";
      mkdirSync(artifactsDir, { recursive: true });
      const logPath1 = join(process.cwd(), "logs", `${runId1}.ndjson`);

      const context1: RunContext = {
        runId: runId1,
        startedAt: new Date().toISOString(),
        environment: { nodeVersion: process.version },
        execution: { mode: "generative", inputId: CONTRACT_PATH, inputVersion: "1.3" },
        language: "te",
        versions: { logSchema: LOG_SCHEMA_VERSION },
        artifacts: {},
        status: "running",
      };
      const logger1 = createLogger(runId1, logPath1);
      const ffmpegAdapter = new FFmpegAdapter();

      const result1 = await runModeC({
        contractPath: CONTRACT_PATH,
        governedRoot: GOVERNED_DIR,
        context: context1,
        logger: logger1,
        adapter: ffmpegAdapter,
      });
      logger1.close();

      expect(result1.status).toBe("completed");
      const outDir1 = join(artifactsDir, runId1);
      const stitchedPath1 = join(outDir1, "stitched_video.mp4");
      const finalPath1 = join(outDir1, "final.mp4");
      const metadataPath1 = join(outDir1, "media_metadata.json");
      expect(existsSync(stitchedPath1)).toBe(true);
      expect(existsSync(finalPath1)).toBe(true);
      expect(existsSync(metadataPath1)).toBe(true);

      const metadata1 = JSON.parse(readFileSync(metadataPath1, "utf-8"));
      const metaResult = validateMediaMetadata(metadata1);
      expect(metaResult.valid).toBe(true);
      if (metaResult.valid) {
        expect(metaResult.data.mode).toBe("generative");
        expect(metaResult.data.sceneCount).toBe(1);
        expect(metaResult.data.maxDriftMs).toBeDefined();
        expect(metaResult.data.avgDriftMs).toBeDefined();
        expect(metaResult.data.sourceVideoPath).toContain("stitched_video.mp4");
        expect(metaResult.data.language).toBe("te");
        expect(metaResult.data.voiceGender).toBe("male");
    expect(metaResult.data.voiceId).toBe("te_IN-venkatesh-medium");
        expect(metaResult.data.piperModelPath).toBeDefined();
        expect(metaResult.data.piperModelHash).toBeDefined();
        expect(metaResult.data.scenes?.[0]?.language).toBe("te");
    expect(metaResult.data.scenes?.[0]?.voiceGender).toBe("male");
      }
    },
    { timeout: 120000 }
  );
});
