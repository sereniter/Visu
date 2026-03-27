#!/usr/bin/env node

/**
 * tune_mode_c_durations.mjs
 *
 * Utility script to auto-tune Mode C (generative) scene durations based on
 * actual TTS narration durations recorded in a VISU log file.
 *
 * Usage:
 *   node tools/tune_mode_c_durations.mjs \
 *     --contract /abs/path/to/contract_v1.4.json \
 *     --log /abs/path/to/visu-<runId>.log \
 *     --output /abs/path/to/contract_v1.4_tuned.json
 *
 * For each scene, this script:
 *   - Finds the latest `scene_render_scene_done` entry for that scene_id
 *   - Reads `narrationDurationMs`
 *   - Sets `duration_sec` = (narrationMs + 100 ms) / 1000
 *     (gives ~100 ms positive drift buffer, under the 200 ms limit)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : undefined;
  };
  const contractPath = get("--contract");
  const logPath = get("--log");
  const outputPath = get("--output");

  if (!contractPath || !logPath) {
    console.error(
      "Usage: node tools/tune_mode_c_durations.mjs --contract <path> --log <path> [--output <path>]",
    );
    process.exit(2);
  }

  return { contractPath, logPath, outputPath };
}

function loadContract(path) {
  const raw = readFileSync(path, "utf-8");
  const json = JSON.parse(raw);
  if (!json || json.schema_version !== "1.4" || !Array.isArray(json.scenes)) {
    throw new Error("Expected a Mode C v1.4 contract with a scenes array.");
  }
  return json;
}

function loadNarrationDurationsFromLog(path) {
  const text = readFileSync(path, "utf-8");
  const lines = text.split(/\r?\n/);
  const durations = new Map(); // scene_id -> narrationDurationMs

  for (const line of lines) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.step !== "scene_render_scene_done") continue;
    const payload = entry.payload || {};
    if (!payload.scene_id || typeof payload.narrationDurationMs !== "number") continue;
    durations.set(payload.scene_id, payload.narrationDurationMs);
  }

  return durations;
}

function tuneContractDurations(contract, durations) {
  let updatedCount = 0;

  for (const scene of contract.scenes) {
    const sceneId = scene.scene_id;
    if (!sceneId) continue;
    const narrationMs = durations.get(sceneId);
    if (typeof narrationMs !== "number") continue;

    const oldDurationSec = scene.duration_sec;
    // Add 100 ms buffer so drift is ~100 ms and under the 200 ms limit.
    const newDurationSec = (narrationMs + 100) / 1000;

    scene.duration_sec = Number(newDurationSec.toFixed(3));
    updatedCount += 1;

    // eslint-disable-next-line no-console
    console.log(
      `Scene ${sceneId}: duration_sec ${oldDurationSec} -> ${scene.duration_sec} (narration ${narrationMs} ms)`,
    );
  }

  return updatedCount;
}

function main() {
  const { contractPath, logPath, outputPath } = parseArgs();

  const contract = loadContract(contractPath);
  const durations = loadNarrationDurationsFromLog(logPath);

  if (durations.size === 0) {
    console.error(
      `No scene_render_scene_done entries found in log: ${basename(logPath)}. ` +
        "Run Mode C at least once before tuning.",
    );
    process.exit(1);
  }

  const updated = tuneContractDurations(contract, durations);

  if (updated === 0) {
    console.error(
      "No scenes were updated. Check that scene_ids in the contract match those in the log.",
    );
    process.exit(1);
  }

  const outPath =
    outputPath ||
    contractPath.replace(/(\.json)?$/, (m) => (m ? "_tuned.json" : "_tuned.json"));

  writeFileSync(outPath, JSON.stringify(contract, null, 2), "utf-8");

  // eslint-disable-next-line no-console
  console.log(`Wrote tuned contract with updated durations to: ${outPath}`);
}

main();

