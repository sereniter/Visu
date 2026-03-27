#!/usr/bin/env node
/**
 * Render a single scene from a Sprint 14 contract via Remotion CLI.
 *
 * Usage:  node render-scene.mjs <scene_index> [contract_path]
 *
 * Defaults:
 *   contract_path = ../tests/fixtures/contract_v1.4_sprint14_test.json
 *                   OR the drone_wars_copycat contract in ~/Documents
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const sceneIdx = parseInt(process.argv[2] ?? "0", 10);
const contractPath =
  process.argv[3] ??
  "/Users/play/Documents/recipes/drone_wars_copycat/artifacts/drone-wars-run-001/contract_v1.4_sprint14_test.json";

const contractDir = path.dirname(
  path.resolve(
    "/Users/play/Documents/recipes/drone_wars_copycat",
    "dummy",
  ),
);

const fontsConfig = JSON.parse(
  fs.readFileSync(
    path.resolve(import.meta.dirname, "../config/fonts.json"),
    "utf-8",
  ),
);

const gradesConfig = JSON.parse(
  fs.readFileSync(
    path.resolve(import.meta.dirname, "../config/grades.json"),
    "utf-8",
  ),
);

const contract = JSON.parse(fs.readFileSync(contractPath, "utf-8"));

if (sceneIdx < 0 || sceneIdx >= contract.scenes.length) {
  console.error(
    `Scene index ${sceneIdx} out of range (0..${contract.scenes.length - 1})`,
  );
  process.exit(1);
}

const scene = structuredClone(contract.scenes[sceneIdx]);

// Asset paths stay relative — they are served via public/ symlink.
// e.g. "assets/visuals/scene_01_shahed_swarm.png" maps to
//      remotion-templates/public/assets/visuals/scene_01_shahed_swarm.png (symlink → topic dir)

const fps = 30;
const durationInFrames = Math.ceil(scene.duration_sec * fps);

const props = {
  scene,
  fontsConfig,
  gradesConfig,
};

const outDir = path.resolve(import.meta.dirname, "out");
fs.mkdirSync(outDir, { recursive: true });

const propsFile = path.join(outDir, `_props_scene_${sceneIdx}.json`);
fs.writeFileSync(propsFile, JSON.stringify(props, null, 2));

const outFile = path.join(outDir, `scene_${String(sceneIdx + 1).padStart(2, "0")}_${scene.scene_id}.mp4`);

console.log(`\n─── Rendering scene ${sceneIdx} : ${scene.scene_id} ───`);
console.log(`  Duration  : ${scene.duration_sec}s  (${durationInFrames} frames @ ${fps}fps)`);
console.log(`  Image     : ${scene.visual.asset_path}`);
console.log(`  Motion    : ${scene.visual.motion?.type ?? "none"} (${scene.visual.motion?.easing ?? "linear"})`);
console.log(`  Grain     : ${scene.visual.grain ?? false}`);
console.log(`  Overlays  : ${(scene.overlays ?? []).map((o) => o.type).join(", ") || "none"}`);
console.log(`  Output    : ${outFile}`);
console.log();

const framesDir = path.join(outDir, `_frames_scene_${sceneIdx}`);
fs.mkdirSync(framesDir, { recursive: true });

// Step 1: Render frames as JPEG sequence using Remotion
const renderCmd = [
  "npx remotion render",
  "src/index.ts",
  "SceneComposition",
  `--props="${propsFile}"`,
  `--image-format=jpeg`,
  `--sequence`,
  `--output="${framesDir}"`,
  "--overwrite",
  "--log=verbose",
].join(" ");

console.log(`[1/2] Rendering frames...\n$ ${renderCmd}\n`);

try {
  execSync(renderCmd, { stdio: "inherit", cwd: import.meta.dirname });
} catch (err) {
  console.error(`\n✗ Frame rendering failed (exit ${err.status})`);
  process.exit(err.status ?? 1);
}

// Step 2: Stitch frames to video using system FFmpeg
const stitchCmd = [
  "/usr/local/bin/ffmpeg",
  "-y",
  `-framerate ${fps}`,
  `-i "${framesDir}/element-%03d.jpeg"`,
  "-c:v libx264",
  "-pix_fmt yuv420p",
  "-crf 18",
  "-movflags +faststart",
  `"${outFile}"`,
].join(" ");

console.log(`\n[2/2] Stitching with system FFmpeg...\n$ ${stitchCmd}\n`);

try {
  execSync(stitchCmd, { stdio: "inherit" });
  console.log(`\n✓ Scene ${sceneIdx} rendered: ${outFile}`);
} catch (err) {
  console.error(`\n✗ FFmpeg stitching failed (exit ${err.status})`);
  process.exit(err.status ?? 1);
}
