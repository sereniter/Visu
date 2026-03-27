import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { fontFamilyForLanguage, loadFontsForLanguage } from "../fonts";

export type ProgressOverlayProps = {
  currentStep: number;
  totalSteps: number;
  language: string;
  accentColor: string;
};

export const ProgressOverlay: React.FC<ProgressOverlayProps> = ({
  currentStep,
  totalSteps,
  language,
  accentColor,
}) => {
  loadFontsForLanguage(language);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fontFamily = fontFamilyForLanguage(language);

  const cycleFrames = Math.max(1, Math.round(0.6 * fps));
  const pulse = (frame % cycleFrames) / cycleFrames;
  const scale = 0.95 + pulse * 0.05;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "flex-end",
        padding: 32,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          transform: `scale(${scale})`,
          transformOrigin: "bottom right",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 4,
          }}
        >
          {Array.from({ length: totalSteps }).map((_, index) => {
            const active = index + 1 <= currentStep;
            return (
              <div
                // eslint-disable-next-line react/no-array-index-key
                key={index}
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "9999px",
                  backgroundColor: active ? accentColor : "#1e293b",
                  opacity: active ? 1 : 0.4,
                }}
              />
            );
          })}
        </div>
        <div
          style={{
            fontFamily,
            color: "#e2e8f0",
            fontSize: 20,
            backgroundColor: "rgba(15,23,42,0.9)",
            borderRadius: 9999,
            padding: "6px 14px",
          }}
        >
          Step {currentStep} of {totalSteps}
        </div>
      </div>
    </AbsoluteFill>
  );
};

