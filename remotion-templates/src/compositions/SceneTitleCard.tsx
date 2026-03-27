import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { fontFamilyForLanguage, loadFontsForLanguage } from "../fonts";

export type SceneTitleCardProps = {
  title: string;
  language: string;
  accentColor: string;
  showDurationFrames: number;
};

export const SceneTitleCard: React.FC<SceneTitleCardProps> = ({
  title,
  language,
  accentColor,
  showDurationFrames,
}) => {
  loadFontsForLanguage(language);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fontFamily = fontFamilyForLanguage(language);

  const enterFrames = Math.round(0.3 * fps);
  const exitStart = showDurationFrames - Math.round(0.3 * fps);

  const slideX = interpolate(frame, [0, enterFrames], [-60, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = interpolate(
    frame,
    [0, enterFrames, exitStart, showDurationFrames],
    [0, 1, 1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-start",
        alignItems: "flex-start",
        padding: 40,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          transform: `translateX(${slideX}px)`,
          opacity,
          backgroundColor: "rgba(15,23,42,0.9)",
          borderRadius: 9999,
          padding: "12px 28px",
          border: `1px solid ${accentColor}`,
          boxShadow: "0 12px 30px rgba(15,23,42,0.8)",
          fontFamily,
          color: "#e2e8f0",
          fontSize: 28,
          maxWidth: "70%",
        }}
      >
        {title}
      </div>
    </AbsoluteFill>
  );
};

