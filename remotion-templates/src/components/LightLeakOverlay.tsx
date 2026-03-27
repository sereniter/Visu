import React, { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";

export type LightLeakOverlayProps = {
  seed?: number;
  hueShift?: number;
};

/**
 * CSS-based light leak fallback that works with all Remotion 4.x versions.
 * Reveals during first half, retracts during second half — matching @remotion/light-leaks behavior.
 */
export const LightLeakOverlay: React.FC<LightLeakOverlayProps> = ({
  seed = 0,
  hueShift = 0,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const mid = durationInFrames / 2;

  const opacity = interpolate(
    frame,
    [0, mid * 0.6, mid, mid * 1.4, durationInFrames],
    [0, 0.85, 1, 0.85, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const hue = hueShift + (seed * 37) % 360;

  const gradient = useMemo(
    () =>
      `radial-gradient(ellipse at ${50 + (seed % 30)}% ${40 + (seed % 20)}%, ` +
      `hsla(${hue}, 90%, 65%, 0.7) 0%, ` +
      `hsla(${(hue + 30) % 360}, 80%, 55%, 0.4) 40%, ` +
      `transparent 75%)`,
    [seed, hue],
  );

  return (
    <AbsoluteFill
      style={{
        background: gradient,
        opacity,
        mixBlendMode: "screen",
        pointerEvents: "none",
      }}
    />
  );
};
