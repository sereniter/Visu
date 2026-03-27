import { Easing, interpolate } from "remotion";
import type { MotionConfig, MotionFocus, OverlayConfig } from "../types";

export const easingMap: Record<string, (t: number) => number> = {
  linear: Easing.linear,
  ease_in: Easing.in(Easing.ease),
  ease_out: Easing.out(Easing.ease),
  ease_in_out: Easing.inOut(Easing.ease),
  bounce: Easing.bounce,
};

export interface FrameTimings {
  S: number;
  E: number;
  FI: number;
  FO: number;
}

export function toFrameTimings(
  overlay: Pick<OverlayConfig, "start_sec" | "duration_sec" | "fade_in_sec" | "fade_out_sec">,
  fps: number,
): FrameTimings {
  const S = Math.round(overlay.start_sec * fps);
  const E = Math.round((overlay.start_sec + overlay.duration_sec) * fps);
  const FI = Math.round((overlay.fade_in_sec ?? 0.3) * fps);
  const FO = Math.round((overlay.fade_out_sec ?? 0.3) * fps);
  return { S, E, FI, FO };
}

export function interpolateOpacity(
  frame: number,
  S: number,
  E: number,
  FI: number,
  FO: number,
): number {
  if (frame < S || frame > E) return 0;

  const fadeInEnd = S + FI;
  const fadeOutStart = E - FO;

  if (frame < fadeInEnd) {
    return interpolate(frame, [S, fadeInEnd], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  }

  if (frame > fadeOutStart) {
    return interpolate(frame, [fadeOutStart, E], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  }

  return 1;
}

export function resolveMotionTransform(
  motion: MotionConfig | null | undefined,
  progress: number,
): { scale: number; translateX: number; translateY: number } {
  if (!motion) return { scale: 1, translateX: 0, translateY: 0 };

  const intensity = motion.intensity ?? 0.15;
  const maxScale = 1 + intensity;

  switch (motion.type) {
    case "zoom_in":
      return { scale: 1 + progress * intensity, translateX: 0, translateY: 0 };
    case "zoom_out":
      return { scale: maxScale - progress * intensity, translateX: 0, translateY: 0 };
    case "pan_left":
      return { scale: maxScale, translateX: -progress * intensity * 1920, translateY: 0 };
    case "pan_right":
      return { scale: maxScale, translateX: progress * intensity * 1920, translateY: 0 };
    case "pan_diagonal_tl":
      return {
        scale: maxScale,
        translateX: -progress * intensity * 960,
        translateY: -progress * intensity * 540,
      };
    case "pan_diagonal_br":
      return {
        scale: maxScale,
        translateX: progress * intensity * 960,
        translateY: progress * intensity * 540,
      };
    default:
      return { scale: 1, translateX: 0, translateY: 0 };
  }
}

export function focusToTransformOrigin(focus: MotionFocus | undefined): string {
  switch (focus) {
    case "left":
      return "left center";
    case "right":
      return "right center";
    case "top":
      return "center top";
    case "bottom":
      return "center bottom";
    case "center":
    default:
      return "center center";
  }
}
