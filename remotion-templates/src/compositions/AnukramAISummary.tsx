import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  staticFile,
} from "remotion";
import { fontFamilyForLanguage, loadFontsForLanguage } from "../fonts";

export type AnukramAISummaryProps = {
  title: string;
  subtitle: string;
  language: "en" | "hi" | "te" | "ta";
  completedSteps: string[];
  accentColor: string;
  logoPath?: string;
};

export const AnukramAISummary: React.FC<AnukramAISummaryProps> = ({
  title,
  subtitle,
  language,
  completedSteps,
  accentColor,
  logoPath,
}) => {
  loadFontsForLanguage(language);
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const fontFamily = fontFamilyForLanguage(language);

  const listRevealPerStepFrames = 12;
  const closingLineStart = completedSteps.length * listRevealPerStepFrames + 20;

  const containerOpacity = interpolate(frame, [0, 12], [0, 1], {
    extrapolateRight: "clamp",
  });

  const closingOpacity = interpolate(
    frame,
    [closingLineStart, closingLineStart + 12],
    [0, 1],
    {
      extrapolateRight: "clamp",
    },
  );

  const totalFade = interpolate(
    frame,
    [durationInFrames - 15, durationInFrames],
    [1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

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
          opacity: containerOpacity,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div
              style={{
                fontFamily,
                color: "white",
                fontSize: 40,
              }}
            >
              {title}
            </div>
            <div
              style={{
                fontFamily,
                color: "#94a3b8",
                fontSize: 28,
              }}
            >
              {subtitle}
            </div>
          </div>
          <img
            src={logoPath ?? staticFile("anukramai-logo-white.png")}
            height={64}
            style={{ objectFit: "contain" }}
          />
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {completedSteps.map((step, index) => {
            const start = index * listRevealPerStepFrames + 10;
            const opacity = interpolate(frame, [start, start + 10], [0, 1], {
              extrapolateRight: "clamp",
            });
            const translateX = interpolate(
              frame,
              [start, start + 10],
              [-20, 0],
              { extrapolateRight: "clamp" },
            );

            return (
              <div
                key={step}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  opacity,
                  transform: `translateX(${translateX}px)`,
                }}
              >
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "9999px",
                    backgroundColor: accentColor,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#0f172a",
                    fontSize: 16,
                    fontWeight: 700,
                    fontFamily,
                  }}
                >
                  ✓
                </div>
                <div
                  style={{
                    fontFamily,
                    color: "#e2e8f0",
                    fontSize: 24,
                  }}
                >
                  {step}
                </div>
              </div>
            );
          })}
        </div>

        <div
          style={{
            marginTop: 12,
            fontFamily,
            color: "#cbd5f5",
            fontSize: 28,
            opacity: closingOpacity,
          }}
        >
          You&apos;re ready to start.
        </div>
      </div>
    </AbsoluteFill>
  );
};

