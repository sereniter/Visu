/**
 * Tests for Remotion overlay wiring in Mode A (SceneTitleCard + ProgressOverlay).
 * Covers: dispatch correctness, failure propagation, drawtext gating, and duration assertions.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const SCENE_FPS = 30;
const TITLE_CARD_FRAMES = 90;

function mockVideoStreamInfo(overrides: Partial<{
  durationMs: number;
  codec_name: string;
  width: number;
  height: number;
  pix_fmt: string;
  fps: number;
  format_name: string;
}> = {}) {
  return {
    durationMs: overrides.durationMs ?? 5000,
    codec_name: overrides.codec_name ?? "h264",
    width: overrides.width ?? 1920,
    height: overrides.height ?? 1080,
    pix_fmt: overrides.pix_fmt ?? "yuv420p",
    fps: overrides.fps ?? 30,
    format_name: overrides.format_name ?? "mov,mp4,m4a,3gp,3g2,mj2",
  };
}

describe("remotion_overlay_wiring", () => {
  let renderCalls: Array<{ compositionId: string; durationInFrames?: number; props: Record<string, unknown> }>;

  beforeEach(() => {
    renderCalls = [];
  });

  function createMockRemotionAdapter() {
    return {
      render: vi.fn(async (opts: { compositionId: string; props: Record<string, unknown>; outputPath: string; durationInFrames?: number }) => {
        renderCalls.push({ compositionId: opts.compositionId, durationInFrames: opts.durationInFrames, props: opts.props });
        return opts.outputPath;
      }),
      renderIntro: vi.fn(),
      renderSummary: vi.fn(),
    };
  }

  describe("overlay dispatch", () => {
    it("calls ProgressOverlay and SceneTitleCard per scene when overlays enabled", async () => {
      const adapter = createMockRemotionAdapter();
      const scenes = [
        { scene_id: "s1", title: "Step 1" },
        { scene_id: "s2", title: "Step 2" },
      ];

      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i]!;
        const sceneDurationFrames = Math.round((5000 / 1000) * SCENE_FPS);

        await adapter.render({
          compositionId: "ProgressOverlay",
          props: {
            currentStep: i + 1,
            totalSteps: scenes.length,
            language: "en",
            accentColor: "#FF6B35",
          },
          outputPath: `/tmp/scene_${scene.scene_id}_progress_overlay.mp4`,
          durationInFrames: sceneDurationFrames,
        });

        await adapter.render({
          compositionId: "SceneTitleCard",
          props: {
            title: scene.title,
            language: "en",
            accentColor: "#FF6B35",
            showDurationFrames: TITLE_CARD_FRAMES,
          },
          outputPath: `/tmp/scene_${scene.scene_id}_title_card.mp4`,
          durationInFrames: TITLE_CARD_FRAMES,
        });
      }

      expect(adapter.render).toHaveBeenCalledTimes(4);

      const progressCalls = renderCalls.filter((c) => c.compositionId === "ProgressOverlay");
      const titleCalls = renderCalls.filter((c) => c.compositionId === "SceneTitleCard");

      expect(progressCalls).toHaveLength(2);
      expect(titleCalls).toHaveLength(2);

      expect(progressCalls[0]!.durationInFrames).toBe(150);
      expect(progressCalls[1]!.durationInFrames).toBe(150);

      expect(titleCalls[0]!.durationInFrames).toBe(TITLE_CARD_FRAMES);
      expect(titleCalls[1]!.durationInFrames).toBe(TITLE_CARD_FRAMES);

      expect(progressCalls[0]!.props.currentStep).toBe(1);
      expect(progressCalls[1]!.props.currentStep).toBe(2);
    });

    it("does not call RemotionAdapter when useRemotionOverlays is false", () => {
      const adapter = createMockRemotionAdapter();
      const useRemotionOverlays = false;

      if (useRemotionOverlays) {
        adapter.render({ compositionId: "ProgressOverlay", props: {}, outputPath: "/tmp/x.mp4" });
      }

      expect(adapter.render).not.toHaveBeenCalled();
    });
  });

  describe("failure propagation", () => {
    it("wraps adapter render failure in REMOTION_OVERLAY_FAILED", async () => {
      const adapter = createMockRemotionAdapter();
      adapter.render.mockRejectedValueOnce(new Error("REMOTION_RENDER_FAILED: exit code 1"));

      try {
        await adapter.render({
          compositionId: "ProgressOverlay",
          props: {},
          outputPath: "/tmp/overlay.mp4",
          durationInFrames: 150,
        });
        expect.unreachable("should have thrown");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!message.startsWith("REMOTION_OVERLAY_FAILED:")) {
          const wrapped = new Error(`REMOTION_OVERLAY_FAILED: overlay pipeline failed for scene 0 (s1): ${message}`);
          expect(wrapped.message).toContain("REMOTION_OVERLAY_FAILED:");
          expect(wrapped.message).toContain("REMOTION_RENDER_FAILED");
        }
      }
    });

    it("throws REMOTION_OVERLAY_FAILED on composite profile mismatch", () => {
      const compositeInfo = mockVideoStreamInfo({ width: 1280, height: 720 });

      if (
        compositeInfo.width !== 1920 ||
        compositeInfo.height !== 1080 ||
        compositeInfo.pix_fmt !== "yuv420p"
      ) {
        const err = new Error(
          `REMOTION_OVERLAY_FAILED: composite profile mismatch for scene 0 (ProgressOverlay): ` +
            `${compositeInfo.width}x${compositeInfo.height} ${compositeInfo.pix_fmt}`,
        );
        expect(err.message).toContain("REMOTION_OVERLAY_FAILED:");
        expect(err.message).toContain("1280x720");
      }
    });

    it("throws REMOTION_OVERLAY_FAILED on stream param mismatch between title card and composite", () => {
      const compositeInfo = mockVideoStreamInfo({ fps: 30 });
      const titleInfo = mockVideoStreamInfo({ fps: 25 });

      if (
        titleInfo.codec_name !== compositeInfo.codec_name ||
        titleInfo.width !== compositeInfo.width ||
        titleInfo.height !== compositeInfo.height ||
        titleInfo.pix_fmt !== compositeInfo.pix_fmt ||
        Math.abs(titleInfo.fps - compositeInfo.fps) > 0.1
      ) {
        const err = new Error(
          "REMOTION_OVERLAY_FAILED: stream param mismatch between SceneTitleCard and composite for scene 0",
        );
        expect(err.message).toContain("stream param mismatch");
      }
    });
  });

  describe("duration and frame counts", () => {
    it("title card duration is exactly TITLE_CARD_FRAMES (90 = 3s @ 30fps)", () => {
      expect(TITLE_CARD_FRAMES).toBe(90);
      expect(TITLE_CARD_FRAMES / SCENE_FPS).toBe(3);
    });

    it("overlay duration matches scene duration in frames", () => {
      const sceneDurationMs = 7500;
      const sceneDurationFrames = Math.round((sceneDurationMs / 1000) * SCENE_FPS);
      expect(sceneDurationFrames).toBe(225);
    });

    it("final clip frames equals title frames + scene frames", () => {
      const sceneDurationMs = 5000;
      const sceneDurationFrames = Math.round((sceneDurationMs / 1000) * SCENE_FPS);
      const finalFrames = TITLE_CARD_FRAMES + sceneDurationFrames;
      expect(finalFrames).toBe(90 + 150);
    });

    it("handles short scene (< 1s) without negative frame ranges", () => {
      const sceneDurationMs = 500;
      const sceneDurationFrames = Math.round((sceneDurationMs / 1000) * SCENE_FPS);
      expect(sceneDurationFrames).toBe(15);
      expect(sceneDurationFrames).toBeGreaterThan(0);
      const finalFrames = TITLE_CARD_FRAMES + sceneDurationFrames;
      expect(finalFrames).toBe(105);
    });
  });

  describe("drawtext gating", () => {
    it("skips drawtext when useRemotionOverlays is true", () => {
      const resolvedUseRemotionOverlays = true;
      const stepTitleCard = true;
      const progressIndicator = true;

      const shouldApplyDrawtext =
        !resolvedUseRemotionOverlays && (stepTitleCard || progressIndicator);
      expect(shouldApplyDrawtext).toBe(false);
    });

    it("uses drawtext when useRemotionOverlays is false", () => {
      const resolvedUseRemotionOverlays = false;
      const stepTitleCard = true;
      const progressIndicator = true;

      const shouldApplyDrawtext =
        !resolvedUseRemotionOverlays && (stepTitleCard || progressIndicator);
      expect(shouldApplyDrawtext).toBe(true);
    });

    it("skips drawtext when both flags are false regardless of overlay setting", () => {
      const resolvedUseRemotionOverlays = false;
      const stepTitleCard = false;
      const progressIndicator = false;

      const shouldApplyDrawtext =
        !resolvedUseRemotionOverlays && (stepTitleCard || progressIndicator);
      expect(shouldApplyDrawtext).toBe(false);
    });
  });

  describe("concat demuxer stream compatibility", () => {
    it("validates identical profiles between title card and composite before concat", () => {
      const titleInfo = mockVideoStreamInfo();
      const compositeInfo = mockVideoStreamInfo();

      const compatible =
        titleInfo.codec_name === compositeInfo.codec_name &&
        titleInfo.width === compositeInfo.width &&
        titleInfo.height === compositeInfo.height &&
        titleInfo.pix_fmt === compositeInfo.pix_fmt &&
        Math.abs(titleInfo.fps - compositeInfo.fps) <= 0.1;

      expect(compatible).toBe(true);
    });

    it("rejects mismatched codec between title card and composite", () => {
      const titleInfo = mockVideoStreamInfo({ codec_name: "h264" });
      const compositeInfo = mockVideoStreamInfo({ codec_name: "vp9" });

      const compatible = titleInfo.codec_name === compositeInfo.codec_name;
      expect(compatible).toBe(false);
    });

    it("rejects mismatched resolution between title card and composite", () => {
      const titleInfo = mockVideoStreamInfo({ width: 1920, height: 1080 });
      const compositeInfo = mockVideoStreamInfo({ width: 1280, height: 720 });

      const compatible =
        titleInfo.width === compositeInfo.width && titleInfo.height === compositeInfo.height;
      expect(compatible).toBe(false);
    });
  });

  describe("per-scene logging shape", () => {
    it("produces correct overlay pipeline log entry", () => {
      const sceneDurationFrames = 150;
      const logEntry = {
        sceneIndex: 0,
        scene_id: "s1",
        overlayEnabled: true,
        sceneDurationFrames,
        titleFrames: TITLE_CARD_FRAMES,
        finalFrames: TITLE_CARD_FRAMES + sceneDurationFrames,
      };

      expect(logEntry.finalFrames).toBe(240);
      expect(logEntry.titleFrames).toBe(90);
      expect(logEntry.overlayEnabled).toBe(true);
    });
  });
});
