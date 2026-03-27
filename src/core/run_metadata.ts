import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface RunMetadataPayload {
  flowId: string;
  flowVersion: string;
  playwrightVersion: string;
  nodeVersion: string;
  configHash: string;
  videoPath: string;
  generatedAt: string;
}

export function writeRunMetadata(
  artifactsDir: string,
  runId: string,
  payload: RunMetadataPayload
): string {
  const outDir = join(process.cwd(), artifactsDir, runId);
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, "metadata.json");
  writeFileSync(path, JSON.stringify(payload, null, 2), "utf-8");
  return path;
}
