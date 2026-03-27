import React from "react";
import { AbsoluteFill } from "remotion";
import type {
  SceneCompositionProps,
  OverlayConfig,
  FontsConfig,
  ResolvedStyle,
} from "./types";
import { KenBurnsScene } from "./components/KenBurnsScene";
import { GradedScene } from "./components/GradedScene";
import { FilmGrainOverlay } from "./components/FilmGrainOverlay";
import { MotionBlurWrapper } from "./components/MotionBlurWrapper";
import { ParallaxScene } from "./components/ParallaxScene";
import { AudioLayer } from "./components/AudioLayer";
import { LowerThird } from "./components/LowerThird";
import { StatBadge } from "./components/StatBadge";
import { SourceTag } from "./components/SourceTag";
import { GlowHighlight } from "./components/GlowHighlight";
import { ArrowPointer } from "./components/ArrowPointer";
import { ShapeOverlay } from "./components/ShapeOverlay";

function resolveStyleFromScene(
  scene: SceneCompositionProps["scene"],
): ResolvedStyle {
  return {
    style: scene.visual.visual_style ?? "",
    motion: scene.visual.motion ?? null,
    grade: scene.visual.grade ?? null,
    overlayFontColor: "ffffff",
    overlayShadow: true,
  };
}

const textOverlayTypes = new Set(["lower_third", "stat_badge", "source_tag"]);
const graphicOverlayTypes = new Set([
  "highlight_circle",
  "arrow_pointer",
  "shape",
]);

function TextOverlayRouter({
  overlay,
  fontsConfig,
  resolvedStyle,
}: {
  overlay: OverlayConfig;
  fontsConfig: FontsConfig;
  resolvedStyle: ResolvedStyle;
}) {
  switch (overlay.type) {
    case "lower_third":
      return (
        <LowerThird
          overlay={overlay}
          fontsConfig={fontsConfig}
          resolvedStyle={resolvedStyle}
        />
      );
    case "stat_badge":
      return (
        <StatBadge
          overlay={overlay}
          fontsConfig={fontsConfig}
          resolvedStyle={resolvedStyle}
        />
      );
    case "source_tag":
      return (
        <SourceTag
          overlay={overlay}
          fontsConfig={fontsConfig}
          resolvedStyle={resolvedStyle}
        />
      );
    default:
      return null;
  }
}

function GraphicOverlayRouter({ overlay }: { overlay: OverlayConfig }) {
  switch (overlay.type) {
    case "highlight_circle":
      return <GlowHighlight overlay={overlay} />;
    case "arrow_pointer":
      return <ArrowPointer overlay={overlay} />;
    case "shape":
      return <ShapeOverlay overlay={overlay} />;
    default:
      return null;
  }
}

export const SceneComposition: React.FC<SceneCompositionProps> = ({
  scene,
  fontsConfig,
  gradesConfig,
}) => {
  const resolvedStyle = resolveStyleFromScene(scene);

  const overlaysList = scene.overlays ?? [];

  return (
    <AbsoluteFill>
      <GradedScene grade={resolvedStyle.grade} gradesConfig={gradesConfig}>
        <MotionBlurWrapper
          enabled={scene.visual.motion?.motion_blur ?? false}
        >
          {scene.visual.parallax ? (
            <ParallaxScene
              imagePath={scene.visual.asset_path}
              foreground_path={scene.visual.parallax.foreground_path}
              depth={scene.visual.parallax.depth}
            />
          ) : (
            <KenBurnsScene
              imagePath={scene.visual.asset_path}
              motion={resolvedStyle.motion}
              durationSec={scene.duration_sec}
            />
          )}
        </MotionBlurWrapper>
      </GradedScene>

      {(scene.visual.grain ?? false) && <FilmGrainOverlay opacity={0.08} />}

      {scene.audio && (
        <AudioLayer audio={scene.audio} durationSec={scene.duration_sec} />
      )}

      {/* Overlays on top: explicit z-index so they are not hidden behind background in render */}
      <AbsoluteFill style={{ zIndex: 10, pointerEvents: "none" }}>
        {overlaysList
          .filter((o) => textOverlayTypes.has(o.type))
          .map((o) => (
            <TextOverlayRouter
              key={`${o.type}-${o.start_sec}`}
              overlay={o}
              fontsConfig={fontsConfig}
              resolvedStyle={resolvedStyle}
            />
          ))}
        {overlaysList
          .filter((o) => graphicOverlayTypes.has(o.type))
          .map((o) => (
            <GraphicOverlayRouter
              key={`${o.type}-${o.start_sec}`}
              overlay={o}
            />
          ))}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
