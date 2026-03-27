/**
 * Environment snapshot validator (Sprint 7). Validates against environment_snapshot_schema_v1.json.
 */

import Ajv from "ajv";
import type { ValidateFunction } from "ajv";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ajv = new (Ajv as unknown as new (opts?: { strict?: boolean; allErrors?: boolean }) => {
  compile: (schema: object) => ValidateFunction;
})({ strict: true, allErrors: true });

function loadSchema(): object {
  const path = join(process.cwd(), "schemas", "environment_snapshot_schema_v1.json");
  return JSON.parse(readFileSync(path, "utf-8")) as object;
}

let validateFn: ValidateFunction | null = null;

export function getEnvironmentSnapshotValidator(): ValidateFunction {
  if (!validateFn) {
    validateFn = ajv.compile(loadSchema());
  }
  return validateFn as ValidateFunction;
}

export interface EnvironmentSnapshotPayload {
  ffmpegVersionFull: string;
  ffmpegBuildConf: string;
  ffmpegBinaryFingerprint: string;
  nodeVersion: string;
  piperVersion: string | null;
  piperBinaryFingerprint: string;
  piperModelHash: string;
  configHash: string;
  capturedAt: string;
}

export function validateEnvironmentSnapshot(
  data: unknown
): { valid: true; data: EnvironmentSnapshotPayload } | { valid: false; errors: string[] } {
  const validate = getEnvironmentSnapshotValidator();
  const ok = validate(data);
  if (ok) return { valid: true, data: data as EnvironmentSnapshotPayload };
  const errors = (validate.errors ?? []).map(
    (e) => `${e.instancePath} ${e.message ?? ""}`.trim()
  );
  return { valid: false, errors };
}
