import React from "react";
import { AbsoluteFill, OffthreadVideo } from "remotion";

export type VideoSceneProps = {
  videoPath: string;
  volume?: number;
};

export const VideoScene: React.FC<VideoSceneProps> = ({
  videoPath,
  volume = 1,
}) => {
  return (
    <AbsoluteFill>
      <OffthreadVideo
        src={videoPath}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
        volume={volume}
      />
    </AbsoluteFill>
  );
};
