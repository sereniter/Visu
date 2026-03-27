import Ajv from "ajv";
import type { ValidateFunction } from "ajv";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ajv = new (Ajv as unknown as new (opts?: { strict?: boolean; allErrors?: boolean }) => { compile: (schema: object) => ValidateFunction })({ strict: true, allErrors: true });

function loadSchema(name: string): object {
  const path = join(process.cwd(), "schemas", name);
  return JSON.parse(readFileSync(path, "utf-8")) as object;
}

let validateFlowFn: ValidateFunction | null = null;

export function getFlowValidator(): ValidateFunction {
  if (!validateFlowFn) {
    const schema = loadSchema("flow_schema_v1.json");
    validateFlowFn = ajv.compile(schema);
  }
  return validateFlowFn as ValidateFunction;
}

export function validateFlow(flow: unknown): { valid: true } | { valid: false; errors: string[] } {
  const validate = getFlowValidator();
  const ok = validate(flow);
  if (ok) return { valid: true };
  const errors = (validate.errors ?? []).map(
    (e) => `${e.instancePath} ${e.message ?? ""}`.trim()
  );
  return { valid: false, errors };
}
