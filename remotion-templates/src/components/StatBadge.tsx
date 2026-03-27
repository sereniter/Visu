import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
} from "remotion";
import type { OverlayConfig, FontsConfig, ResolvedStyle } from "../types";
import { toFrameTimings, interpolateOpacity } from "../utils/interpolations";
import { resolveFontFamily } from "../utils/fontResolver";

export type StatBadgeProps = {
  overlay: OverlayConfig;
  fontsConfig: FontsConfig;
  resolvedStyle: ResolvedStyle;
};

function animateValue(
  text: string,
  progress: number,
  countUp: boolean,
): string {
  if (!countUp) return text;
  const match = text.match(/^([^0-9]*)([0-9,]+)(.*)$/);
  if (!match) return text;
  const [, prefix, numStr, suffix] = match;
  const target = parseInt(numStr!.replace(/,/g, ""), 10);
  const current = Math.round(progress * target);
  return (prefix ?? "") + current.toLocaleString() + (suffix ?? "");
}

export const StatBadge: React.FC<StatBadgeProps> = ({
  overlay,
  fontsConfig,
  resolvedStyle,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { S, E, FI, FO } = toFrameTimings(overlay, fps);

  const opacity = interpolateOpacity(frame, S, E, FI, FO);

  const countUpProgress = overlay.count_up
    ? spring({
        frame: frame - S,
        fps,
        config: { damping: 200 },
        durationInFrames: FI > 0 ? FI : Math.round(1.5 * fps),
      })
    : 1;

  const displayText = animateValue(
    overlay.text ?? "",
    countUpProgress,
    overlay.count_up ?? false,
  );

  const fontFamily = resolveFontFamily(
    fontsConfig,
    resolvedStyle.style,
    overlay.language,
    "heading",
  );
  const bodyFont = resolveFontFamily(
    fontsConfig,
    resolvedStyle.style,
    overlay.language,
    "body",
  );
  const color = `#${resolvedStyle.overlayFontColor}`;

  const positionStyle = resolvePositionStyle(overlay.position ?? "bottom_left");

  if (opacity <= 0) return null;

  return (
    <AbsoluteFill style={{ opacity, pointerEvents: "none" }}>
      <div style={{ position: "absolute", ...positionStyle }}>
        <div
          style={{
            fontFamily,
            fontSize: 64,
            fontWeight: 700,
            color,
            textShadow: resolvedStyle.overlayShadow
              ? "2px 2px 6px rgba(0,0,0,0.85)"
              : "none",
          }}
        >
          {displayText}
        </div>
        {overlay.label && (
          <div
            style={{
              fontFamily: bodyFont,
              fontSize: 28,
              fontWeight: 400,
              color: `${color}cc`,
              marginTop: 4,
            }}
          >
            {overlay.label}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

function resolvePositionStyle(
  position: string,
): React.CSSProperties {
  switch (position) {
    case "bottom_right":
      return { bottom: 120, right: 80 };
    case "top_left":
      return { top: 80, left: 80 };
    case "top_right":
      return { top: 80, right: 80 };
    case "bottom_left":
    default:
      return { bottom: 120, left: 80 };
  }
}
