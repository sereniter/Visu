import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  staticFile,
} from "remotion";
import { fontFamilyForLanguage, loadFontsForLanguage } from "../fonts";

export type AnukramAIIntroProps = {
  title: string;
  subtitle: string;
  language: "en" | "hi" | "te" | "ta";
  stepCount: number;
  accentColor: string;
  logoPath?: string;
};

export const AnukramAIIntro: React.FC<AnukramAIIntroProps> = ({
  title,
  subtitle,
  language,
  stepCount,
  accentColor,
  logoPath,
}) => {
  loadFontsForLanguage(language);
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const fontFamily = fontFamilyForLanguage(language);
  const durationSec = durationInFrames / fps;

  const logoOpacity = interpolate(frame, [9, 24], [0, 1], {
    extrapolateRight: "clamp",
  });
  const logoY = interpolate(frame, [9, 24], [20, 0], {
    extrapolateRight: "clamp",
  });
  const titleOpacity = interpolate(frame, [30, 45], [0, 1], {
    extrapolateRight: "clamp",
  });
  const subtitleOpacity = interpolate(frame, [45, 54], [0, 1], {
    extrapolateRight: "clamp",
  });
  const metaOpacity = interpolate(frame, [54, 66], [0, 1], {
    extrapolateRight: "clamp",
  });
  const barWidth = interpolate(frame, [24, 30], [0, 100], {
    extrapolateRight: "clamp",
  });
  const totalFade = interpolate(
    frame,
    [durationInFrames - 15, durationInFrames],
    [1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  const approxMinutes = Math.max(1, Math.round(durationSec / 60));

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0f172a",
        opacity: totalFade,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          width: 960,
          padding: 48,
          borderRadius: 24,
          backgroundColor: "#020617",
          boxShadow: "0 25px 50px rgba(15,23,42,0.8)",
          display: "flex",
          flexDirection: "column",
          gap: 32,
        }}
      >
        <div
          style={{
            opacity: logoOpacity,
            transform: `translateY(${logoY}px)`,
            transition: "none",
          }}
        >
          <img
            src={logoPath ?? staticFile("anukramai-logo-white.png")}
            height={80}
            style={{ objectFit: "contain" }}
          />
        </div>

        <div
          style={{
            width: `${barWidth}%`,
            height: 4,
            backgroundColor: accentColor,
          }}
        />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div
            style={{
              opacity: titleOpacity,
              fontFamily,
              color: "white",
              fontSize: 64,
              lineHeight: 1.1,
            }}
          >
            {title}
          </div>

          <div
            style={{
              opacity: subtitleOpacity,
              fontFamily,
              color: "#94a3b8",
              fontSize: 36,
            }}
          >
            {subtitle}
          </div>

          <div
            style={{
              opacity: metaOpacity,
              fontFamily,
              color: "#64748b",
              fontSize: 28,
              marginTop: 8,
            }}
          >
            {stepCount} steps · ~{approxMinutes} minutes
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

