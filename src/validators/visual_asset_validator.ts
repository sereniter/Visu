/**
 * Visual asset validator (Sprint 6B). Validates governed PNG assets for Mode C:
 * PNG exists, provenance sidecar exists, output_hash matches PNG SHA256, actual dimensions 1920x1080.
 */

import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { ImageDimensions } from "../adapters/ffmpeg_adapter.js";
import { probeImageDimensions } from "../adapters/ffmpeg_adapter.js";

const REQUIRED_WIDTH = 1920;
const REQUIRED_HEIGHT = 1080;

export interface ProvenanceSidecar {
  prompt_key: string;
  prompt_text_hash: string;
  model: string;
  model_version: string;
  model_file_hash: string;
  seed: number;
  sampler: string;
  steps: number;
  resolution: string;
  torch_version: string;
  diffusers_version: string;
  generated_at: string;
  output_hash: string;
}

function getProvenancePath(assetPath: string): string {
  const base = assetPath.replace(/\.png$/i, "");
  return `${base}.provenance.json`;
}

function computeFileSha256(filePath: string): string {
  const buf = readFileSync(filePath);
  return createHash("sha256").update(buf).digest("hex");
}

export interface VisualAssetValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates a governed visual asset: file existence, provenance sidecar, hash match, dimensions 1920x1080.
 * Uses ffprobe for actual image dimensions; hard stop on any failure.
 */
export async function validateVisualAsset(
  assetPath: string,
  ffprobePath: string,
  resolvePath: (p: string) => string = (p) => join(process.cwd(), p)
): Promise<VisualAssetValidationResult> {
  const absAsset = resolvePath(assetPath);
  if (!existsSync(absAsset)) {
    return { valid: false, error: `PNG not found: ${assetPath}` };
  }
  const sidecarPath = getProvenancePath(absAsset);
  if (!existsSync(sidecarPath)) {
    return { valid: false, error: `Provenance sidecar not found: ${sidecarPath}` };
  }
  let sidecar: ProvenanceSidecar;
  try {
    sidecar = JSON.parse(readFileSync(sidecarPath, "utf-8")) as ProvenanceSidecar;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { valid: false, error: `Invalid provenance JSON: ${message}` };
  }
  const actualHash = computeFileSha256(absAsset);
  if (actualHash !== sidecar.output_hash) {
    return { valid: false, error: `Provenance output_hash does not match PNG SHA256 for ${assetPath}` };
  }
  let dimensions: ImageDimensions;
  try {
    dimensions = await probeImageDimensions(ffprobePath, absAsset);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { valid: false, error: `Failed to probe PNG dimensions: ${message}` };
  }
  if (dimensions.width !== REQUIRED_WIDTH || dimensions.height !== REQUIRED_HEIGHT) {
    return {
      valid: false,
      error: `PNG dimensions ${dimensions.width}x${dimensions.height} do not match required ${REQUIRED_WIDTH}x${REQUIRED_HEIGHT} for ${assetPath}`,
    };
  }
  return { valid: true };
}
