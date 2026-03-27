import { describe, it, expect } from "vitest";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { runMigrateContract } from "../src/cli/migrate_contract.js";
import {
  getSceneContractValidatorV13,
  getSceneContractValidatorV16,
} from "../src/validators/scene_schema.js";

describe("migrate_contract", () => {
  const FIXTURE_V12 = join(process.cwd(), "tests", "fixtures", "migration", "contract_v1.2_input.json");

  it("v1.2 → v1.3 produces valid v1.3 contract", () => {
    if (!existsSync(FIXTURE_V12)) return;
    const tmp = mkdtempSync(join(tmpdir(), "visu-migrate-"));
    const outputPath = join(tmp, "contract_v1.3.json");

    const result = runMigrateContract(FIXTURE_V12, outputPath);

    expect(result.fromVersion).toBe("1.2");
    expect(result.toVersion).toBe("1.3");
    expect(result.scenesModified).toBe(1);
    expect(result.status).toBe("ok");
    expect(result.warnings).toHaveLength(0);

    const output = JSON.parse(readFileSync(outputPath, "utf-8"));
    expect(output.schema_version).toBe("1.3");
    expect(output.scenes[0].narration.voice_gender).toBe("male");
    expect(output.scenes[0].narration.voice).toBeUndefined();

    const validateV13 = getSceneContractValidatorV13();
    expect(validateV13(output)).toBe(true);
  });

  it("fails when output file already exists", () => {
    if (!existsSync(FIXTURE_V12)) return;
    const tmp = mkdtempSync(join(tmpdir(), "visu-migrate-"));
    const outputPath = join(tmp, "existing.json");
    writeFileSync(outputPath, "{}", "utf-8");

    expect(() => runMigrateContract(FIXTURE_V12, outputPath)).toThrow(
      /Output file already exists|Refusing to overwrite/
    );
  });

  it("v1.3 → v1.4 sets topic empty and language from first scene, flags warning", () => {
    const tmp = mkdtempSync(join(tmpdir(), "visu-migrate-"));
    const inputPath = join(tmp, "v1.3.json");
    const outputPath = join(tmp, "v1.4.json");
    writeFileSync(
      inputPath,
      JSON.stringify({
        schema_version: "1.3",
        video_id: "v",
        scenes: [
          {
            scene_id: "s1",
            duration_sec: 1,
            visual: {
              type: "governed_image",
              asset_path: "x.png",
              prompt_key: "k",
              seed: 1,
              model_version: "1.0",
            },
            narration: {
              text_template_key: "t",
              language: "te",
              voice_gender: "male",
              speed: 1,
            },
          },
        ],
      }),
      "utf-8"
    );

    const result = runMigrateContract(inputPath, outputPath);

    expect(result.fromVersion).toBe("1.3");
    expect(result.toVersion).toBe("1.4");
    expect(result.status).toBe("warning");
    expect(result.warnings.some((w) => w.includes("topic") && w.includes("empty"))).toBe(true);

    const output = JSON.parse(readFileSync(outputPath, "utf-8"));
    expect(output.schema_version).toBe("1.4");
    expect(output.topic).toBe("");
    expect(output.language).toBe("te");
    expect(output.scenes).toHaveLength(1);
    // Migrated output has empty topic by design; full validation would fail until topic is set
  });

  it("fails when input is already v1.4", () => {
    const tmp = mkdtempSync(join(tmpdir(), "visu-migrate-"));
    const inputPath = join(tmp, "v1.4.json");
    writeFileSync(
      inputPath,
      JSON.stringify({
        schema_version: "1.4",
        video_id: "v",
        topic: "test_topic",
        language: "en",
        scenes: [
          {
            scene_id: "s1",
            duration_sec: 1,
            visual: {
              type: "governed_image",
              asset_path: "x.png",
              prompt_key: "k",
              seed: 1,
              model_version: "1.0",
            },
            narration: {
              text_template_key: "t",
              language: "en",
              voice_gender: "male",
              speed: 1,
            },
          },
        ],
      }),
      "utf-8"
    );
    const outputPath = join(tmp, "out.json");

    expect(() => runMigrateContract(inputPath, outputPath)).toThrow(
      /already schema_version 1\.4|No migration needed/
    );
  });

  it("v1.5 (ui_flow_scenes) → v1.6 bumps schema_version only and validates against v1.6 schema", () => {
    const tmp = mkdtempSync(join(tmpdir(), "visu-migrate-"));
    const inputPath = join(tmp, "v1.5_ui_flow_scenes.json");
    const outputPath = join(tmp, "v1.6_ui_flow_scenes.json");

    const v15 = {
      schema_version: "1.5",
      video_id: "billing_flow_en",
      topic: "billing_flow",
      language: "en",
      mode: "ui_flow_scenes",
      baseUrl: "https://app.anukramai.com",
      intro: {
        scene_id: "s0_intro",
        asset_path: "visuals/billing_intro_12345_1.0.png",
        prompt_key: "billing_intro",
        seed: 12345,
        model_version: "1.0",
        narration: {
          text_template_key: "billing_intro_en",
          language: "en",
          voice_gender: "female" as const,
          speed: 1.0,
        },
        buffer_sec: 1,
        music: "music/bg_track.mp3",
      },
      summary: {
        scene_id: "s_summary",
        asset_path: "visuals/billing_summary_12345_1.0.png",
        prompt_key: "billing_summary",
        seed: 12345,
        model_version: "1.0",
        narration: {
          text_template_key: "billing_summary_en",
          language: "en",
          voice_gender: "female" as const,
          speed: 1.0,
        },
        buffer_sec: 1,
        music: "music/bg_track.mp3",
      },
      recording_enhancements: {
        clickSound: true,
        clickHighlight: true,
        highlightColor: "#FF6B35",
        highlightDurationMs: 600,
        cursorHighlight: true,
        ambientSounds: true,
        zoomToAction: true,
        zoomLevel: 0.18,
      },
      post_production: {
        stepTitleCard: true,
        progressIndicator: true,
        transitionSound: true,
        chapterMarkers: true,
        subtitleTrack: true,
        thumbnail: true,
        videoDescription: true,
      },
      scenes: [
        {
          scene_id: "s1_login",
          title: "Step 1: Login",
          narration: {
            text_template_key: "billing_login_en",
            language: "en",
            voice_gender: "female" as const,
            speed: 1.0,
          },
          buffer_sec: 2,
          music: "music/bg_track.mp3",
          steps: [
            { action: "navigate", url: "/login" },
            { action: "click", selector: "#login" },
            { action: "done" },
          ],
        },
      ],
    };

    writeFileSync(inputPath, JSON.stringify(v15, null, 2), "utf-8");

    const result = runMigrateContract(inputPath, outputPath);

    expect(result.fromVersion).toBe("1.5");
    expect(result.toVersion).toBe("1.6");
    expect(result.status).toBe("ok");

    const output = JSON.parse(readFileSync(outputPath, "utf-8"));
    expect(output.schema_version).toBe("1.6");
    expect(output.mode).toBe("ui_flow_scenes");
    expect(output.video_id).toBe(v15.video_id);
    expect(output.post_production.useRemotionOverlays).toBeUndefined();

    const validateV16 = getSceneContractValidatorV16();
    expect(validateV16(output)).toBe(true);
  });
});
