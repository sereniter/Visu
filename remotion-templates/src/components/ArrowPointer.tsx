import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
} from "remotion";
import type { OverlayConfig } from "../types";
import { toFrameTimings, interpolateOpacity } from "../utils/interpolations";

export type ArrowPointerProps = {
  overlay: OverlayConfig;
};

export const ArrowPointer: React.FC<ArrowPointerProps> = ({ overlay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { S, E, FI, FO } = toFrameTimings(overlay, fps);

  const opacity = interpolateOpacity(frame, S, E, FI, FO);

  const x1 = overlay.x1 ?? 0;
  const y1 = overlay.y1 ?? 0;
  const x2 = overlay.x2 ?? 100;
  const y2 = overlay.y2 ?? 100;

  const drawDuration = Math.max(FI, Math.round(1.5 * fps));
  const drawProgress = interpolate(frame, [S, S + drawDuration], [0, 1], {
    easing: Easing.out(Easing.ease),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const cx = x1 + (x2 - x1) * drawProgress;
  const cy = y1 + (y2 - y1) * drawProgress;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const lineLen = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);

  const headLen = Math.max(24, lineLen * 0.08);
  const showHead = drawProgress > 0.85;
  const headOpacity = showHead
    ? interpolate(drawProgress, [0.85, 1], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;
  const ax1 = cx - headLen * Math.cos(angle - Math.PI / 6);
  const ay1 = cy - headLen * Math.sin(angle - Math.PI / 6);
  const ax2 = cx - headLen * Math.cos(angle + Math.PI / 6);
  const ay2 = cy - headLen * Math.sin(angle + Math.PI / 6);

  const color = `#${overlay.color ?? "ff4444"}`;
  const strokeW = Math.max(5, lineLen * 0.012);

  if (opacity <= 0) return null;

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <svg width="1920" height="1080" viewBox="0 0 1920 1080" opacity={opacity}>
        <defs>
          <filter id="arrow-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g filter="url(#arrow-glow)">
          <line
            x1={x1}
            y1={y1}
            x2={cx}
            y2={cy}
            stroke={color}
            strokeWidth={strokeW}
            strokeLinecap="round"
          />
          {showHead && (
            <polygon
              points={`${cx},${cy} ${ax1},${ay1} ${ax2},${ay2}`}
              fill={color}
              opacity={headOpacity}
            />
          )}
        </g>
      </svg>
    </AbsoluteFill>
  );
};
