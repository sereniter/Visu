import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import type { OverlayConfig } from "../types";
import { toFrameTimings, interpolateOpacity } from "../utils/interpolations";

export type GlowHighlightProps = {
  overlay: OverlayConfig;
};

export const GlowHighlight: React.FC<GlowHighlightProps> = ({ overlay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { S, E, FI, FO } = toFrameTimings(overlay, fps);

  const opacity = interpolateOpacity(frame, S, E, FI, FO);

  const filterId = `glow-${overlay.x}-${overlay.y}-${overlay.start_sec}`;
  const baseRadius = overlay.radius ?? 50;
  const pulseR = overlay.pulse
    ? baseRadius +
      Math.sin(
        (frame / fps) * (overlay.pulse_speed ?? 2.0) * Math.PI * 2,
      ) *
        baseRadius *
        0.08
    : baseRadius;

  if (opacity <= 0) return null;

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <svg width="1920" height="1080" viewBox="0 0 1920 1080">
        <defs>
          {overlay.glow && (
            <filter
              id={filterId}
              x="-50%"
              y="-50%"
              width="200%"
              height="200%"
            >
              <feGaussianBlur
                in="SourceGraphic"
                stdDeviation={overlay.glow_radius ?? 20}
                result="blur"
              />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          )}
        </defs>
        <circle
          cx={overlay.x ?? 0}
          cy={overlay.y ?? 0}
          r={pulseR}
          fill="none"
          stroke={`#${overlay.color ?? "ffffff"}`}
          strokeWidth={3}
          filter={overlay.glow ? `url(#${filterId})` : undefined}
          opacity={opacity}
        />
      </svg>
    </AbsoluteFill>
  );
};
