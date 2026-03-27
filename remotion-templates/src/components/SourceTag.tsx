import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import type { OverlayConfig, FontsConfig, ResolvedStyle } from "../types";
import { toFrameTimings, interpolateOpacity } from "../utils/interpolations";
import { resolveFontFamily } from "../utils/fontResolver";

export type SourceTagProps = {
  overlay: OverlayConfig;
  fontsConfig: FontsConfig;
  resolvedStyle: ResolvedStyle;
};

export const SourceTag: React.FC<SourceTagProps> = ({
  overlay,
  fontsConfig,
  resolvedStyle,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { S, E, FI, FO } = toFrameTimings(overlay, fps);

  const opacity = interpolateOpacity(frame, S, E, FI, FO);

  const fontFamily = resolveFontFamily(
    fontsConfig,
    resolvedStyle.style,
    overlay.language,
    "body",
  );
  const color = `#${resolvedStyle.overlayFontColor}`;

  if (opacity <= 0) return null;

  return (
    <AbsoluteFill style={{ opacity, pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          bottom: 40,
          right: 40,
          fontFamily,
          fontSize: 22,
          fontWeight: 400,
          color: `${color}aa`,
          textShadow: "1px 1px 3px rgba(0,0,0,0.7)",
        }}
      >
        {overlay.text}
      </div>
    </AbsoluteFill>
  );
};
