import React from "react";
import { Composition } from "remotion";
import { AnukramAIIntro } from "./compositions/AnukramAIIntro";
import { AnukramAISummary } from "./compositions/AnukramAISummary";
import { SceneTitleCard } from "./compositions/SceneTitleCard";
import { ProgressOverlay } from "./compositions/ProgressOverlay";
import { TransitionComposition } from "./TransitionComposition";
import { SceneComposition } from "./SceneComposition";
import type { TransitionCompositionProps, SceneCompositionProps } from "./types";

// Remotion Composition generic expects Record<string, unknown> but our typed components
// have stricter props. These wrappers satisfy the constraint while preserving runtime behavior.
const TransitionCompositionWrapper = TransitionComposition as unknown as React.FC<Record<string, unknown>>;
const SceneCompositionWrapper = SceneComposition as unknown as React.FC<Record<string, unknown>>;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="AnukramAIIntro"
        component={AnukramAIIntro}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          title: "Tutorial Title",
          subtitle: "AnukramAI Tutorial",
          language: "en",
          stepCount: 5,
          accentColor: "#FF6B35",
        }}
      />
      <Composition
        id="AnukramAISummary"
        component={AnukramAISummary}
        durationInFrames={180}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          title: "Tutorial Complete",
          subtitle: "AnukramAI Tutorial",
          language: "en",
          completedSteps: ["Logged in", "Navigated to billing"],
          accentColor: "#FF6B35",
        }}
      />
      <Composition
        id="SceneTitleCard"
        component={SceneTitleCard}
        durationInFrames={60}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          title: "Step 1: Login",
          language: "en",
          accentColor: "#FF6B35",
          showDurationFrames: 60,
        }}
      />
      <Composition
        id="ProgressOverlay"
        component={ProgressOverlay}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
        calculateMetadata={async ({ props }) => {
          const p = props as { durationInFrames?: number };
          const fps = 30;
          const raw =
            typeof p.durationInFrames === "number" &&
            Number.isFinite(p.durationInFrames) &&
            p.durationInFrames > 0
              ? Math.ceil(p.durationInFrames)
              : 300;
          const durationInFrames = Math.min(Math.max(raw, 1), 3600 * fps);
          return { durationInFrames, fps };
        }}
        defaultProps={{
          currentStep: 1,
          totalSteps: 5,
          language: "en",
          accentColor: "#FF6B35",
        }}
      />
      <Composition
        id="TransitionComposition"
        component={TransitionCompositionWrapper}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
        calculateMetadata={async ({ props }: { props: Record<string, unknown> }) => {
          const p = props as unknown as TransitionCompositionProps;
          const fps = p.fps || 30;
          let total = 0;
          for (const s of p.scenes) {
            total += Math.ceil(s.duration_sec * fps);
          }
          for (let i = 1; i < p.scenes.length; i++) {
            const t = p.scenes[i].transition;
            if (t?.duration_sec) total -= Math.round(t.duration_sec * fps);
          }
          return { durationInFrames: Math.max(total, 1), fps };
        }}
        defaultProps={{
          scenes: [],
          fontsConfig: {
            schema_version: "1.0",
            google_fonts: true,
            styles: {},
            languages: {},
          },
          gradesConfig: { schema_version: "1.0", grades: {} },
          fps: 30,
        } satisfies TransitionCompositionProps}
      />
      <Composition
        id="SceneComposition"
        component={SceneCompositionWrapper}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
        calculateMetadata={async ({ props }: { props: Record<string, unknown> }) => {
          const p = props as unknown as SceneCompositionProps;
          const dur = Math.ceil((p.scene?.duration_sec ?? 5) * 30);
          return { durationInFrames: Math.max(dur, 1) };
        }}
        defaultProps={{
          scene: {
            scene_id: "preview",
            duration_sec: 5,
            visual: {
              type: "governed_image",
              asset_path: "",
              prompt_key: "",
              seed: 0,
              model_version: "",
            },
            narration: {
              text_template_key: "",
              language: "en",
              voice_gender: "male",
              speed: 1,
            },
          },
          fontsConfig: {
            schema_version: "1.0",
            google_fonts: true,
            styles: {},
            languages: {},
          },
          gradesConfig: { schema_version: "1.0", grades: {} },
        } satisfies SceneCompositionProps}
      />
    </>
  );
};

