import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
} from "remotion";
import type { OverlayConfig, FontsConfig, ResolvedStyle } from "../types";
import { toFrameTimings, interpolateOpacity } from "../utils/interpolations";
import { resolveFontFamily } from "../utils/fontResolver";

export type LowerThirdProps = {
  overlay: OverlayConfig;
  fontsConfig: FontsConfig;
  resolvedStyle: ResolvedStyle;
};

export const LowerThird: React.FC<LowerThirdProps> = ({
  overlay,
  fontsConfig,
  resolvedStyle,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { S, E, FI, FO } = toFrameTimings(overlay, fps);

  const opacity = interpolateOpacity(frame, S, E, FI, FO);

  const slideY =
    overlay.animation === "slide_up"
      ? interpolate(frame, [S, S + FI], [40, 0], {
          easing: Easing.out(Easing.ease),
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 0;

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

  if (opacity <= 0) return null;

  return (
    <AbsoluteFill
      style={{ opacity, transform: `translateY(${slideY}px)`, pointerEvents: "none" }}
    >
      <div
        style={{
          position: "absolute",
          bottom: 120,
          left: 80,
          borderLeft: `4px solid ${color}`,
          paddingLeft: 16,
        }}
      >
        <div
          style={{
            fontFamily,
            fontSize: 52,
            fontWeight: 700,
            color,
            textShadow: resolvedStyle.overlayShadow
              ? "2px 2px 6px rgba(0,0,0,0.85)"
              : "none",
          }}
        >
          {overlay.text}
        </div>
        {overlay.subtext && (
          <div
            style={{
              fontFamily: bodyFont,
              fontSize: 34,
              fontWeight: 400,
              color: `${color}cc`,
              marginTop: 6,
            }}
          >
            {overlay.subtext}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
