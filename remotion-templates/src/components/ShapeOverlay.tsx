import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
} from "remotion";
import { makeTriangle, makeStar, makePie, makeCircle } from "@remotion/shapes";
import { evolvePath } from "@remotion/paths";
import type { OverlayConfig } from "../types";
import { toFrameTimings, interpolateOpacity } from "../utils/interpolations";

export type ShapeOverlayProps = {
  overlay: OverlayConfig;
};

function getShapePath(
  shape: string,
  size: number,
): string {
  switch (shape) {
    case "triangle":
      return makeTriangle({ length: size, direction: "up" }).path;
    case "star":
      return makeStar({ points: 5, innerRadius: size * 0.4, outerRadius: size }).path;
    case "pie":
      return makePie({ radius: size / 2, progress: 1 }).path;
    case "circle":
      return makeCircle({ radius: size / 2 }).path;
    default:
      return makeCircle({ radius: size / 2 }).path;
  }
}

export const ShapeOverlay: React.FC<ShapeOverlayProps> = ({ overlay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { S, E, FI, FO } = toFrameTimings(overlay, fps);

  const opacity = interpolateOpacity(frame, S, E, FI, FO);
  const size = overlay.size ?? 80;
  const color = `#${overlay.color ?? "ff4444"}`;

  const shapePath = getShapePath(overlay.shape ?? "circle", size);

  let strokeDasharray: string | undefined;
  let strokeDashoffset: string | undefined;

  if (overlay.draw_on) {
    const drawDuration = Math.max(FI, Math.round(1.5 * fps));
    const drawProgress = interpolate(frame, [S, S + drawDuration], [0, 1], {
      easing: Easing.out(Easing.ease),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    const evolved = evolvePath(drawProgress, shapePath);
    strokeDasharray = evolved.strokeDasharray;
    strokeDashoffset = String(evolved.strokeDashoffset);
  }

  const x = overlay.x ?? 960;
  const y = overlay.y ?? 540;

  if (opacity <= 0) return null;

  const strokeW = Math.max(4, size * 0.06);

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <svg width="1920" height="1080" viewBox="0 0 1920 1080" opacity={opacity}>
        <defs>
          <filter id={`shape-glow-${x}-${y}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g
          transform={`translate(${x - size / 2}, ${y - size / 2})`}
          filter={`url(#shape-glow-${x}-${y})`}
        >
          <path
            d={shapePath}
            fill={overlay.fill ? color : "none"}
            stroke={color}
            strokeWidth={strokeW}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={strokeDasharray}
            strokeDashoffset={strokeDashoffset}
          />
        </g>
      </svg>
    </AbsoluteFill>
  );
};
