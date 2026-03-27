import Ajv from "ajv";
import type { ValidateFunction } from "ajv";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ajv = new (Ajv as unknown as new (opts?: { strict?: boolean; allErrors?: boolean }) => {
  compile: (schema: object) => ValidateFunction;
})({ strict: true, allErrors: true });

function loadSchema(name: string): object {
  const path = join(process.cwd(), "schemas", name);
  return JSON.parse(readFileSync(path, "utf-8")) as object;
}

let validateRecordedWrapFn: ValidateFunction | null = null;

export interface RecordedWrapRendererBlock {
  renderer: "png" | "remotion";
  component: "IntroCard" | "SummaryCard";
  props: Record<string, unknown>;
}

export interface RecordedWrapConfigV11 {
  schemaVersion: "1.1";
  wrap?: {
    intro?: RecordedWrapRendererBlock;
    summary?: RecordedWrapRendererBlock;
  };
}

export function getRecordedWrapValidator(): ValidateFunction {
  if (!validateRecordedWrapFn) {
    const schema = loadSchema("recorded_wrap_schema_v1.1.json");
    validateRecordedWrapFn = ajv.compile(schema);
  }
  return validateRecordedWrapFn as ValidateFunction;
}

export function validateRecordedWrapConfig(
  value: unknown,
): { valid: true; data: RecordedWrapConfigV11 } | { valid: false; errors: string[] } {
  const validate = getRecordedWrapValidator();
  const ok = validate(value);
  if (ok) {
    return { valid: true, data: value as RecordedWrapConfigV11 };
  }
  const errors = (validate.errors ?? []).map(
    (e) => `${e.instancePath} ${e.message ?? ""}`.trim(),
  );
  return { valid: false, errors };
}

