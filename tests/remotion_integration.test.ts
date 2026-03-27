import { describe, expect, it } from "vitest";
import type {
  ModeCSceneTransition,
  ModeCSceneAudio,
  ModeCOverlay,
} from "../src/validators/scene_schema.js";

describe("Sprint 14 schema types", () => {
  it("ModeCSceneTransition type accepts valid transition", () => {
    const t: ModeCSceneTransition = {
      type: "fade",
      duration_sec: 0.5,
      timing: "spring",
    };
    expect(t.type).toBe("fade");
    expect(t.duration_sec).toBe(0.5);
    expect(t.timing).toBe("spring");
  });

  it("ModeCSceneTransition accepts all transition types", () => {
    const types: ModeCSceneTransition["type"][] = [
      "fade",
      "slide",
      "wipe",
      "flip",
      "clockWipe",
      "iris",
      "light_leak",
      "none",
    ];
    for (const type of types) {
      const t: ModeCSceneTransition = { type };
      expect(t.type).toBe(type);
    }
  });

  it("ModeCSceneAudio type accepts valid audio config", () => {
    const a: ModeCSceneAudio = {
      ambient_path: "assets/music/war_tension_loop.wav",
      ambient_volume: 0.12,
      sfx: [
        { path: "assets/sfx/whoosh.wav", start_sec: 1.0, volume: 0.4 },
      ],
    };
    expect(a.ambient_path).toBeDefined();
    expect(a.sfx).toHaveLength(1);
    expect(a.sfx![0]!.start_sec).toBe(1.0);
  });

  it("ModeCOverlay supports new shape type", () => {
    const o: ModeCOverlay = {
      type: "shape",
      shape: "triangle",
      x: 960,
      y: 200,
      size: 80,
      color: "ff4444",
      fill: false,
      draw_on: true,
      start_sec: 2.0,
      duration_sec: 4.0,
      fade_in_sec: 0.5,
    };
    expect(o.type).toBe("shape");
    expect(o.shape).toBe("triangle");
    expect(o.draw_on).toBe(true);
  });

  it("ModeCOverlay supports animation field for lower_third", () => {
    const o: ModeCOverlay = {
      type: "lower_third",
      text: "Battle of Kursk",
      animation: "slide_up",
      start_sec: 0,
      duration_sec: 4,
    };
    expect(o.animation).toBe("slide_up");
  });

  it("ModeCOverlay supports count_up field for stat_badge", () => {
    const o: ModeCOverlay = {
      type: "stat_badge",
      text: "$20,000",
      count_up: true,
      start_sec: 0,
      duration_sec: 3,
    };
    expect(o.count_up).toBe(true);
  });

  it("ModeCOverlay supports glow fields for highlight_circle", () => {
    const o: ModeCOverlay = {
      type: "highlight_circle",
      x: 500,
      y: 300,
      radius: 60,
      glow: true,
      glow_radius: 30,
      start_sec: 0,
      duration_sec: 3,
    };
    expect(o.glow).toBe(true);
    expect(o.glow_radius).toBe(30);
  });
});

describe("Schema validation with new fields (env-gated)", () => {
  it.skipIf(!process.env.RUN_REMOTION_INTEGRATION)(
    "validates a v1.4 contract with Sprint 14 fields",
    async () => {
      const { validateSceneContract } = await import(
        "../src/validators/scene_schema.js"
      );
      const contract = {
        schema_version: "1.4",
        video_id: "sprint14_test",
        topic: "test_topic",
        language: "en",
        scenes: [
          {
            scene_id: "s01",
            duration_sec: 8.0,
            visual: {
              type: "governed_image",
              asset_path: "assets/visuals/scene_01.png",
              prompt_key: "pk_01",
              seed: 42,
              model_version: "sdxl-1.0",
              visual_style: "war_documentary",
              motion: {
                type: "zoom_in",
                focus: "center",
                intensity: 0.07,
                easing: "ease_out",
                motion_blur: true,
              },
              grain: true,
            },
            narration: {
              text_template_key: "intro_hook",
              language: "en",
              voice_gender: "male",
              speed: 1.0,
            },
            overlays: [
              {
                type: "lower_third",
                text: "Battle of Kursk",
                subtext: "1943",
                animation: "slide_up",
                start_sec: 1.0,
                duration_sec: 4.0,
                fade_in_sec: 0.3,
                fade_out_sec: 0.3,
              },
            ],
            transition: {
              type: "wipe",
              duration_sec: 0.4,
              timing: "spring",
              direction: "from-left",
            },
            audio: {
              ambient_path: "assets/music/tension.wav",
              ambient_volume: 0.12,
              sfx: [
                { path: "assets/sfx/whoosh.wav", start_sec: 0, volume: 0.3 },
              ],
            },
          },
        ],
      };

      const result = validateSceneContract(contract);
      expect(result.valid).toBe(true);
    },
  );
});
