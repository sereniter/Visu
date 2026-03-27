import React from "react";
import { Audio, Sequence, useVideoConfig } from "remotion";
import type { SceneAudio } from "../types";

export type AudioLayerProps = {
  audio: SceneAudio;
  durationSec: number;
};

export const AudioLayer: React.FC<AudioLayerProps> = ({ audio }) => {
  const { fps } = useVideoConfig();

  return (
    <>
      {audio.ambient_path && (
        <Audio
          src={audio.ambient_path}
          volume={audio.ambient_volume ?? 0.12}
          loop
        />
      )}
      {(audio.sfx ?? []).map((sfx, i) => (
        <Sequence key={i} from={Math.round(sfx.start_sec * fps)} layout="none">
          <Audio src={sfx.path} volume={sfx.volume ?? 0.4} />
        </Sequence>
      ))}
    </>
  );
};
