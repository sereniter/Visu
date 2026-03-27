import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig, interpolate } from "remotion";

export type ParallaxSceneProps = {
  imagePath: string;
  foreground_path: string;
  depth: number;
};

export const ParallaxScene: React.FC<ParallaxSceneProps> = ({
  imagePath,
  foreground_path,
  depth,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const progress = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateRight: "clamp",
  });

  const bgShift = progress * depth * 40;
  const fgShift = progress * depth * 80;

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <Img
        src={imagePath.startsWith("/") || imagePath.startsWith("http") ? imagePath : staticFile(imagePath)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `translateX(${-bgShift}px)`,
        }}
      />
      <Img
        src={foreground_path.startsWith("/") || foreground_path.startsWith("http") ? foreground_path : staticFile(foreground_path)}
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `translateX(${-fgShift}px)`,
        }}
      />
    </AbsoluteFill>
  );
};
