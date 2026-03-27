import React from "react";
import {
  AbsoluteFill,
  Img,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
} from "remotion";
import type { MotionConfig } from "../types";
import {
  easingMap,
  resolveMotionTransform,
  focusToTransformOrigin,
} from "../utils/interpolations";

export type KenBurnsProps = {
  imagePath: string;
  motion: MotionConfig | null;
  durationSec: number;
};

export const KenBurnsScene: React.FC<KenBurnsProps> = ({
  imagePath,
  motion,
  durationSec,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const totalFrames = Math.round(durationSec * fps);

  let progress: number;
  if (!motion) {
    progress = 0;
  } else if (motion.easing === "spring") {
    progress = spring({
      frame,
      fps,
      config: { stiffness: 80, damping: 20 },
      durationInFrames: totalFrames,
    });
  } else {
    const easingFn = easingMap[motion.easing ?? "linear"] ?? Easing.linear;
    progress = interpolate(frame, [0, totalFrames], [0, 1], {
      easing: easingFn,
      extrapolateRight: "clamp",
    });
  }

  const { scale, translateX, translateY } = resolveMotionTransform(
    motion,
    progress,
  );
  const transformOrigin = focusToTransformOrigin(motion?.focus ?? "center");

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <Img
        src={imagePath.startsWith("/") || imagePath.startsWith("http") ? imagePath : staticFile(imagePath)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${scale}) translate(${translateX}px, ${translateY}px)`,
          transformOrigin,
        }}
      />
    </AbsoluteFill>
  );
};
