#!/usr/bin/env node
/**
 * Stitch all 8 scene MP4s into one complete video with xfade transitions.
 * Reads transition specs from the Sprint 14 contract.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const outDir = path.resolve(import.meta.dirname, "out");
const contractPath =
  "/Users/play/Documents/recipes/drone_wars_copycat/artifacts/drone-wars-run-001/contract_v1.4_sprint14_test.json";
const contract = JSON.parse(fs.readFileSync(contractPath, "utf-8"));

const sceneFiles = [
  "scene_01_scene_01_hook.mp4",
  "scene_02_scene_02_shahed_origin.mp4",
  "scene_03_scene_03_russia_copies.mp4",
  "scene_04_scene_04_april2024_attack.mp4",
  "scene_05_scene_05_economics.mp4",
  "scene_06_scene_06_us_reverse_engineers.mp4",
  "scene_07_scene_07_operation_epic_fury.mp4",
  "scene_08_scene_08_multiverse_conclusion.mp4",
];

function probeSeconds(file) {
  const raw = execSync(
    `/usr/local/bin/ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${file}"`,
  ).toString().trim();
  return parseFloat(raw);
}

const durations = sceneFiles.map((f) => probeSeconds(path.join(outDir, f)));

function mapTransition(t) {
  if (!t) return { xfade: "fade", dur: 0.5 };
  const dur = t.duration_sec ?? 0.5;
  switch (t.type) {
    case "fade":
      return { xfade: "fade", dur };
    case "slide": {
      const dir = t.direction ?? "from-left";
      const map = {
        "from-left": "slideleft",
        "from-right": "slideright",
        "from-top": "slideup",
        "from-bottom": "slidedown",
      };
      return { xfade: map[dir] ?? "slideleft", dur };
    }
    case "wipe": {
      const dir = t.direction ?? "from-left";
      const map = {
        "from-left": "wipeleft",
        "from-right": "wiperight",
        "from-top": "wipeup",
        "from-bottom": "wipedown",
      };
      return { xfade: map[dir] ?? "wipeleft", dur };
    }
    case "flip":
      return { xfade: "fade", dur };
    case "clockWipe":
      return { xfade: "circleopen", dur };
    case "light_leak":
      return { xfade: "fade", dur };
    case "none":
    default:
      return { xfade: "fade", dur: 0 };
  }
}

const transitions = [];
for (let i = 1; i < contract.scenes.length; i++) {
  transitions.push(mapTransition(contract.scenes[i].transition));
}

console.log("Scene durations:");
durations.forEach((d, i) => console.log(`  [${i + 1}] ${d.toFixed(3)}s`));
console.log("\nTransitions:");
transitions.forEach((t, i) =>
  console.log(`  ${i + 1}→${i + 2}: ${t.xfade} (${t.dur}s)`),
);

const inputs = sceneFiles
  .map((f) => `-i "${path.join(outDir, f)}"`)
  .join(" ");

let filterParts = [];
let offset = 0;

for (let i = 0; i < transitions.length; i++) {
  const t = transitions[i];
  const prevLabel = i === 0 ? "[0:v]" : `[v${i}]`;
  const nextLabel = `[${i + 1}:v]`;
  const outLabel = i === transitions.length - 1 ? "[vout]" : `[v${i + 1}]`;

  offset += durations[i] - t.dur;

  filterParts.push(
    `${prevLabel}${nextLabel}xfade=transition=${t.xfade}:duration=${t.dur}:offset=${offset.toFixed(6)}${outLabel}`,
  );
}

const filterComplex = filterParts.join(";\n");

const totalDur =
  durations.reduce((a, b) => a + b, 0) -
  transitions.reduce((a, t) => a + t.dur, 0);

console.log(`\nTotal duration: ~${totalDur.toFixed(1)}s`);
console.log(`Filter chain: ${transitions.length} xfade stages\n`);

const outFile = path.join(outDir, "drone_wars_copycat_sprint14_FULL.mp4");

const cmd = [
  "/usr/local/bin/ffmpeg -y",
  inputs,
  `-filter_complex "${filterComplex}"`,
  '-map "[vout]"',
  "-c:v libx264 -pix_fmt yuv420p -crf 18 -preset medium -movflags +faststart",
  `"${outFile}"`,
].join(" \\\n  ");

console.log(`$ ${cmd}\n`);

try {
  execSync(cmd, { stdio: "inherit", maxBuffer: 50 * 1024 * 1024 });
  const sz = (fs.statSync(outFile).size / 1024 / 1024).toFixed(1);
  console.log(`\n✓ Full video: ${outFile} (${sz} MB)`);
} catch (err) {
  console.error(`\n✗ Stitching failed (exit ${err.status})`);
  process.exit(err.status ?? 1);
}
