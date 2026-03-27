import React, { useEffect, useRef } from "react";
import { AbsoluteFill } from "remotion";

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

export type FilmGrainOverlayProps = {
  opacity?: number;
  seed?: number;
};

export const FilmGrainOverlay: React.FC<FilmGrainOverlayProps> = ({
  opacity = 0.08,
  seed = 42,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = 1920;
    const h = 1080;
    canvas.width = w;
    canvas.height = h;

    const imageData = ctx.createImageData(w, h);
    const data = imageData.data;
    const rng = seededRandom(seed);

    for (let i = 0; i < data.length; i += 4) {
      const v = Math.round(rng() * 255);
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);
  }, [seed]);

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: "100%",
          mixBlendMode: "overlay",
          opacity,
        }}
      />
    </AbsoluteFill>
  );
};

export { seededRandom };
