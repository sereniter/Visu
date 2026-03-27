import React from "react";
import {
  TransitionSeries,
  linearTiming,
  springTiming,
} from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { flip } from "@remotion/transitions/flip";
import { clockWipe } from "@remotion/transitions/clock-wipe";
import type { TransitionCompositionProps, SceneTransition } from "./types";
import { SceneComposition } from "./SceneComposition";
import { LightLeakOverlay } from "./components/LightLeakOverlay";

type TransitionTiming = ReturnType<typeof linearTiming>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function presentationFor(transition: SceneTransition): any {
  switch (transition.type) {
    case "fade":
      return fade();
    case "slide":
      return slide({ direction: transition.direction ?? "from-left" });
    case "wipe":
      return wipe({ direction: transition.direction ?? "from-left" });
    case "flip":
      return flip();
    case "clockWipe":
      return clockWipe({ width: 1920, height: 1080 });
    case "iris":
      return fade();
    case "light_leak":
      return fade();
    case "none":
    default:
      return fade();
  }
}

function timingFor(
  transition: SceneTransition,
  fps: number,
): TransitionTiming {
  const durationInFrames = Math.round(
    (transition.duration_sec ?? 0.5) * fps,
  );

  if (transition.timing === "spring") {
    return springTiming({
      config: { damping: 200 },
      durationInFrames,
    });
  }
  return linearTiming({ durationInFrames });
}

export function calculateTotalFrames(
  scenes: { duration_sec: number; transition?: SceneTransition }[],
  fps: number,
): number {
  let total = 0;
  for (let i = 0; i < scenes.length; i++) {
    total += Math.round(scenes[i]!.duration_sec * fps);
    if (i > 0) {
      const t = scenes[i]!.transition;
      if (t && t.type !== "none" && t.type !== "light_leak") {
        total -= Math.round((t.duration_sec ?? 0.5) * fps);
      }
    }
  }
  return Math.max(total, 1);
}

export const TransitionComposition: React.FC<TransitionCompositionProps> = ({
  scenes,
  fontsConfig,
  gradesConfig,
  fps,
}) => {
  return (
    <TransitionSeries>
      {scenes.map((scene, i) => (
        <React.Fragment key={scene.scene_id}>
          {i > 0 &&
            scene.transition &&
            scene.transition.type !== "none" &&
            scene.transition.type !== "light_leak" && (
              <TransitionSeries.Transition
                presentation={presentationFor(scene.transition)}
                timing={timingFor(scene.transition, fps)}
              />
            )}

          {i > 0 && scene.transition?.type === "light_leak" && (
            <TransitionSeries.Overlay
              durationInFrames={Math.round(
                (scene.transition.duration_sec ?? 0.5) * fps,
              )}
            >
              <LightLeakOverlay />
            </TransitionSeries.Overlay>
          )}

          <TransitionSeries.Sequence
            durationInFrames={Math.round(scene.duration_sec * fps)}
          >
            <SceneComposition
              scene={scene}
              fontsConfig={fontsConfig}
              gradesConfig={gradesConfig}
            />
          </TransitionSeries.Sequence>
        </React.Fragment>
      ))}
    </TransitionSeries>
  );
};

export { presentationFor, timingFor };
