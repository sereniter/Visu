import { describe, it, expect } from "vitest";
import {
  validateSceneContract,
  validateUIFlowScenesContract,
} from "../src/validators/scene_schema.js";

describe("scene_schema", () => {
  const validContractV14 = {
    schema_version: "1.4",
    video_id: "vid-1",
    topic: "login_flow",
    language: "en",
    scenes: [
      {
        scene_id: "s1",
        duration_sec: 5,
        visual: {
          type: "governed_image",
          asset_path: "assets/visuals/intro_12345_1.0.png",
          prompt_key: "invoice_dashboard_intro",
          seed: 12345,
          model_version: "1.0",
        },
        narration: {
          text_template_key: "intro_invoice_creation",
          language: "te",
          voice_gender: "male",
          speed: 1.0,
        },
      },
    ],
  };

  const validContractV13 = {
    schema_version: "1.3" as const,
    video_id: "vid-1",
    scenes: validContractV14.scenes,
  };

  it("rejects v1.3 contract with migration message", () => {
    const result = validateSceneContract(validContractV13);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("v1.3 is not supported") && e.includes("Migrate to v1.4"))).toBe(true);
    }
  });

  it("accepts valid v1.4 contract", () => {
    const result = validateSceneContract(validContractV14);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.video_id).toBe("vid-1");
      expect(result.data.topic).toBe("login_flow");
      expect(result.data.language).toBe("en");
      expect(result.data.scenes).toHaveLength(1);
      expect(result.data.scenes[0].visual.type).toBe("governed_image");
      expect(result.data.scenes[0].narration.language).toBe("te");
      expect(result.data.scenes[0].narration.voice_gender).toBe("male");
    }
  });

  it("accepts valid v1.4 contract with one remotion scene (SceneTitleCard, no duration_sec)", () => {
    const contractWithRemotion = {
      schema_version: "1.4",
      video_id: "vid-1",
      topic: "login_flow",
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
            text_template_key: "intro_invoice_creation",
            language: "te",
            voice_gender: "male",
            speed: 1.0,
          },
        },
      ],
    };
    const result = validateSceneContract(contractWithRemotion);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.scenes).toHaveLength(1);
      expect(result.data.scenes[0].visual.type).toBe("remotion");
      expect((result.data.scenes[0].visual as { component: string }).component).toBe("SceneTitleCard");
      expect("duration_sec" in result.data.scenes[0]).toBe(false);
    }
  });

  it("rejects schema v1.2 with migration message", () => {
    const result = validateSceneContract({
      schema_version: "1.2",
      video_id: "vid-1",
      scenes: [
        {
          scene_id: "s1",
          duration_sec: 5,
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
            voice: "te_IN-venkatesh-medium",
            speed: 1.0,
          },
        },
      ],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("v1.2 is not supported") && e.includes("Migrate to v1.3"))).toBe(true);
    }
  });

  it("rejects schema v1.1 with migration message", () => {
    const result = validateSceneContract({
      schema_version: "1.1",
      video_id: "vid-1",
      scenes: [
        {
          scene_id: "s1",
          duration_sec: 5,
          visual: {
            type: "governed_image",
            asset_path: "x.png",
            prompt_key: "k",
            seed: 1,
            model_version: "1.0",
          },
          narration: {
            text_template_key: "t",
            voice: "v",
            speed: 1.0,
          },
        },
      ],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("v1.1 is not supported") && e.includes("Migrate to v1.2"))).toBe(true);
    }
  });

  it("rejects schema v1.0 with migration message", () => {
    const result = validateSceneContract({
      schema_version: "1.0",
      video_id: "vid-1",
      scenes: [
        {
          scene_id: "s1",
          video_path: "scene1.mp4",
          narration_path: "scene1_narration.wav",
          duration_sec: 5,
        },
      ],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("v1.0 is not supported") && e.includes("Migrate to v1.1"))).toBe(true);
    }
  });

  it("rejects missing narration.voice_gender in v1.4", () => {
    const result = validateSceneContract({
      schema_version: "1.4",
      video_id: "vid-1",
      topic: "t",
      language: "en",
      scenes: [
        {
          scene_id: "s1",
          duration_sec: 5,
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
            speed: 1.0,
          },
        },
      ],
    });
    expect(result.valid).toBe(false);
  });

  it("rejects missing required field (scenes)", () => {
    const result = validateSceneContract({
      schema_version: "1.4",
      video_id: "vid-1",
      topic: "t",
      language: "en",
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects missing field in scene (narration)", () => {
    const result = validateSceneContract({
      schema_version: "1.2",
      video_id: "vid-1",
      scenes: [
        {
          scene_id: "s1",
          duration_sec: 5,
          visual: {
            type: "governed_image",
            asset_path: "x.png",
            prompt_key: "k",
            seed: 1,
            model_version: "1.0",
          },
        },
      ],
    });
    expect(result.valid).toBe(false);
  });

  it("rejects visual.type not governed_image", () => {
    const scene = validContractV14.scenes[0] as { visual: { type: string } };
    const result = validateSceneContract({
      ...validContractV14,
      scenes: [{ ...scene, visual: { ...scene.visual, type: "other" } }],
    });
    expect(result.valid).toBe(false);
  });

  it("rejects additionalProperties at root", () => {
    const result = validateSceneContract({
      ...validContractV14,
      extra: "not allowed",
    });
    expect(result.valid).toBe(false);
  });

  it("rejects empty scenes array", () => {
    const result = validateSceneContract({
      schema_version: "1.4",
      video_id: "vid-1",
      topic: "t",
      language: "en",
      scenes: [],
    });
    expect(result.valid).toBe(false);
  });

  it("rejects duration_sec <= 0", () => {
    const result = validateSceneContract({
      ...validContractV14,
      scenes: [
        {
          ...(validContractV14.scenes[0] as object),
          duration_sec: 0,
        },
      ],
    });
    expect(result.valid).toBe(false);
  });

  it("rejects missing topic in v1.4", () => {
    const result = validateSceneContract({
      schema_version: "1.4",
      video_id: "vid-1",
      language: "en",
      scenes: validContractV14.scenes,
    });
    expect(result.valid).toBe(false);
  });

  it("rejects topic with path separator in v1.4", () => {
    const result = validateSceneContract({
      ...validContractV14,
      topic: "topic/sub",
    });
    expect(result.valid).toBe(false);
  });

  describe("v1.5 (ui_flow_scenes)", () => {
    const validV15 = {
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
          voice_gender: "female",
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
          voice_gender: "female",
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
            voice_gender: "female",
            speed: 1.0,
          },
          buffer_sec: 2,
          music: "music/bg_track.mp3",
          steps: [
            { action: "navigate", url: "/login" },
            { action: "fill", selector: "input[name='email']", value: "demo@anukramai.com" },
            { action: "click", selector: "button[type='submit']" },
            { action: "wait", selector: ".dashboard" },
            { action: "done" },
          ],
        },
      ],
    };

    it("accepts valid v1.5 contract with mode ui_flow_scenes", () => {
      const result = validateUIFlowScenesContract(validV15);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.data.video_id).toBe("billing_flow_en");
        expect(result.data.mode).toBe("ui_flow_scenes");
        expect(result.data.baseUrl).toBe("https://app.anukramai.com");
        expect(result.data.scenes).toHaveLength(1);
        expect(result.data.scenes[0].steps[0].action).toBe("navigate");
        expect(result.data.scenes[0].steps[0].url).toBe("/login");
      }
    });

    it("accepts v1.6 ui_flow_scenes contract (renderer + useRemotionOverlays optional)", () => {
      const v16 = {
        ...validV15,
        schema_version: "1.6" as const,
        intro: {
          ...validV15.intro,
          renderer: "png" as const,
        },
        summary: {
          ...validV15.summary,
          renderer: "png" as const,
        },
        post_production: {
          ...validV15.post_production,
          useRemotionOverlays: true,
        },
      };

      const result = validateUIFlowScenesContract(v16);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.data.schema_version).toBe("1.6");
        expect(result.data.mode).toBe("ui_flow_scenes");
      }
    });

    it("rejects when mode is not ui_flow_scenes", () => {
      const result = validateUIFlowScenesContract({
        ...validV15,
        mode: "generative",
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.includes("ui_flow_scenes"))).toBe(true);
      }
    });

    it("rejects when schema_version is not 1.5", () => {
      const result = validateUIFlowScenesContract({
        ...validV15,
        schema_version: "1.4",
      });
      expect(result.valid).toBe(false);
    });

    it("rejects missing baseUrl", () => {
      const { baseUrl: _b, ...rest } = validV15 as { baseUrl: string; [k: string]: unknown };
      void _b;
      const result = validateUIFlowScenesContract(rest);
      expect(result.valid).toBe(false);
    });

    it("rejects missing intro", () => {
      const { intro: _i, ...rest } = validV15 as { intro: unknown; [k: string]: unknown };
      void _i;
      const result = validateUIFlowScenesContract(rest);
      expect(result.valid).toBe(false);
    });
  });
});
