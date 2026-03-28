#!/usr/bin/env node
/**
 * Test scene 1: render with duration = (narration WAV length + 20ms), then compare video vs audio length.
 * Usage: node test-scene1-audio-length.mjs [runId] [contractPath]
 * Default runId: 7544b3ba-08a2-4d7a-8a47-5b7ef5c0f5a3
 * Default contract: drone_wars Sprint 14 contract
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const runId = process.argv[2] ?? "7544b3ba-08a2-4d7a-8a47-5b7ef5c0f5a3";
const contractPathArg = process.argv[3];
const repoRoot = path.resolve(import.meta.dirname, "..");
const artifactsDir = path.join(repoRoot, "artifacts", runId);
let defaultContractPath = null;
try {
  const sharedPath = path.join(repoRoot, "config", "shared.json");
  const legacyPath = path.join(repoRoot, "config", "default.json");
  const configPath = fs.existsSync(sharedPath) ? sharedPath : legacyPath;
  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  if (config.contentRoot) {
    defaultContractPath = path.join(
      config.contentRoot,
      "drone_wars_copycat",
      "artifacts",
      "drone-wars-run-001",
      "contract_v1.4_sprint14_test.json"
    );
  }
} catch {
  defaultContractPath = path.join(repoRoot, "tests", "fixtures", "contract_v1.4_sprint14_test.json");
}
const contractPath = contractPathArg
  ? path.resolve(process.cwd(), contractPathArg)
  : (defaultContractPath ?? path.join(repoRoot, "..", "tests", "fixtures", "contract_v1.4_sprint14_test.json"));

const sceneId = "scene_01_hook";
const wavPath = path.join(artifactsDir, "auto_tune_narration", `scene_${sceneId}_narration_auto_tune.wav`);

if (!fs.existsSync(wavPath)) {
  console.error("Narration WAV not found:", wavPath);
  process.exit(1);
}
if (!fs.existsSync(contractPath)) {
  console.error("Contract not found:", contractPath);
  process.exit(1);
}

// Get WAV duration (ms) via ffprobe
function getWavDurationMs(p) {
  const out = execSync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${p}"`,
    { encoding: "utf-8" }
  ).trim();
  const sec = parseFloat(out);
  return Math.round(sec * 1000);
}

// Get video duration (ms) via ffprobe
function getVideoDurationMs(p) {
  const out = execSync(
    `ffprobe -v error -select_streams v:0 -show_entries stream=duration -of default=noprint_wrappers=1:nokey=1 "${p}"`,
    { encoding: "utf-8" }
  ).trim();
  const sec = parseFloat(out);
  return Math.round(sec * 1000);
}

const narrationMs = getWavDurationMs(wavPath);
const durationSec = (narrationMs + 20) / 1000; // 20ms buffer like auto-tune
const durationInFrames = Math.ceil(durationSec * 30);

console.log("\n─── Scene 1 audio-length test ───");
console.log("  Narration WAV :", wavPath);
console.log("  Narration     :", narrationMs, "ms");
console.log("  Target (+20ms):", durationSec.toFixed(3), "s =", durationInFrames, "frames");

const contract = JSON.parse(fs.readFileSync(contractPath, "utf-8"));
const scene = { ...contract.scenes[0], duration_sec: durationSec };

const fontsConfig = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "config/fonts.json"), "utf-8")
);
const gradesConfig = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "config/grades.json"), "utf-8")
);

const outDir = path.join(import.meta.dirname, "out");
const propsFile = path.join(outDir, "_props_scene1_audio_test.json");
const outFile = path.join(outDir, "scene_01_audio_length_test.mp4");
const framesDir = path.join(outDir, "_frames_scene1_test");
fs.mkdirSync(framesDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

const props = { scene, fontsConfig, gradesConfig };
fs.writeFileSync(propsFile, JSON.stringify(props, null, 2));

// Remotion: render frames (SceneComposition uses calculateMetadata from props, so duration comes from scene.duration_sec)
console.log("\n[1/2] Rendering scene 1 frames...");
execSync(
  [
    "npx remotion render",
    "src/index.ts",
    "SceneComposition",
    `--props="${propsFile}"`,
    "--image-format=jpeg",
    "--sequence",
    `--output="${framesDir}"`,
    "--overwrite",
    "--log=warn",
  ].join(" "),
  { stdio: "inherit", cwd: import.meta.dirname }
);

// Stitch with correct frame pattern (element-%04d.jpeg)
const frameList = fs.readdirSync(framesDir).filter((f) => f.endsWith(".jpeg")).sort();
const padWidth = frameList.length > 999 ? 4 : 3;
const pattern = `element-%0${padWidth}d.jpeg`;

console.log("\n[2/2] Stitching to video...");
execSync(
  [
    "/usr/local/bin/ffmpeg",
    "-y",
    "-framerate 30",
    `-i "${framesDir}/${pattern}"`,
    "-vf",
    "scale=in_range=full:out_range=tv",
    "-c:v libx264",
    "-pix_fmt yuv420p",
    "-crf 18",
    "-movflags +faststart",
    `"${outFile}"`,
  ].join(" "),
  { stdio: "inherit" }
);

const videoMs = getVideoDurationMs(outFile);
const diffMs = videoMs - narrationMs;
const ok = Math.abs(diffMs) <= 100; // allow up to 100ms tolerance

console.log("\n─── Result ───");
console.log("  Narration :", narrationMs, "ms");
console.log("  Video     :", videoMs, "ms");
console.log("  Diff      :", diffMs, "ms (video - narration)");
console.log("  Match     :", ok ? "YES (within 100ms)" : "NO");
console.log("  Output    :", outFile);
process.exit(ok ? 0 : 1);
