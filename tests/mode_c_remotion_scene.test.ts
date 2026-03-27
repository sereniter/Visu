/**
 * Mode C remotion scene: router, REMOTION_DISABLED_IN_CONFIG, MODE_C_UNKNOWN_SCENE_TYPE.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runSceneRender } from "../src/engines/scene_render_engine.js";
import { createLogger } from "../src/core/logger.js";
import { getConfig, setConfigForTest } from "../src/core/config.js";
import { MockFFmpegAdapter } from "./mocks/mock_ffmpeg_adapter.js";
import type { ModeCContractV14 } from "../src/validators/scene_schema.js";

const validRemotionSceneContract: ModeCContractV14 = {
  schema_version: "1.4",
  video_id: "vid-1",
  topic: "t",
  language: "en",
  scenes: [
    {
      scene_id: "remotion_s1",
      visual: {
        type: "remotion",
        component: "SceneTitleCard",
        props: {
          title: "Step One",
          language: "en",
          accentColor: "#FF6B35",
          showDurationFrames: 90,
        },
      },
      narration: {
        text_template_key: "test_key",
        language: "en",
        voice_gender: "male",
        speed: 1.0,
      },
    },
  ],
};

describe("Mode C remotion scene", () => {
  let tmp: string;
  let logger: ReturnType<typeof createLogger>;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "visu-modec-remotion-"));
    mkdirSync(join(tmp, "scripts"), { recursive: true });
    mkdirSync(join(tmp, "prompts"), { recursive: true });
    writeFileSync(
      join(tmp, "scripts", "script_templates.json"),
      JSON.stringify({
        test_key: { text: "Hello.", language: "en" },
      }),
      "utf-8",
    );
    writeFileSync(
      join(tmp, "prompts", "prompt_library.json"),
      JSON.stringify({}),
      "utf-8",
    );
    logger = createLogger("test-remotion", join(tmp, "log.ndjson"));
  });

  afterEach(() => {
    setConfigForTest(null);
    logger.close();
  });

  it("throws REMOTION_DISABLED_IN_CONFIG when contract has remotion scene and remotion.enabled is false", async () => {
    const config = getConfig();
    setConfigForTest({
      ...config,
      remotion: {
        ...(config.remotion ?? { templatesRoot: "./remotion-templates", accentColor: "#FF6B35" }),
        enabled: false,
      },
    });

    const outputDir = join(tmp, "out");
    const adapter = new MockFFmpegAdapter();

    await expect(
      runSceneRender({
        contract: validRemotionSceneContract,
        outputDir,
        runId: "run-1",
        ffmpegAdapter: adapter,
        logger,
        governedRoot: tmp,
      }),
    ).rejects.toThrow(/REMOTION_DISABLED_IN_CONFIG/);
  });

  it("throws MODE_C_UNKNOWN_SCENE_TYPE when scene.visual.type is neither governed_image nor remotion", async () => {
    const contractWithUnknownType = {
      ...validRemotionSceneContract,
      scenes: [
        {
          scene_id: "s1",
          visual: { type: "other" as const },
          narration: validRemotionSceneContract.scenes[0].narration,
        },
      ],
    } as unknown as ModeCContractV14;

    const outputDir = join(tmp, "out");
    const adapter = new MockFFmpegAdapter();

    await expect(
      runSceneRender({
        contract: contractWithUnknownType,
        outputDir,
        runId: "run-1",
        ffmpegAdapter: adapter,
        logger,
        governedRoot: tmp,
      }),
    ).rejects.toThrow(/MODE_C_UNKNOWN_SCENE_TYPE/);
  });
});
