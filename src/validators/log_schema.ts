import Ajv from "ajv";
import type { ValidateFunction } from "ajv";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Ajv ESM default export has no construct signature in types; cast for instantiation
const ajv = new (Ajv as unknown as new (opts?: { strict?: boolean; allErrors?: boolean }) => { compile: (schema: object) => ValidateFunction })({ strict: true, allErrors: true });

function loadSchema(name: string): object {
  const path = join(process.cwd(), "schemas", name);
  return JSON.parse(readFileSync(path, "utf-8")) as object;
}

let validateLogEntryFn: ValidateFunction | null = null;

export function getLogEntryValidator(): ValidateFunction {
  if (!validateLogEntryFn) {
    const schema = loadSchema("log_schema_v1.json");
    validateLogEntryFn = ajv.compile(schema);
  }
  return validateLogEntryFn as ValidateFunction;
}

export function validateLogEntry(
  entry: unknown
): { valid: true } | { valid: false; errors: string[] } {
  const validate = getLogEntryValidator();
  const ok = validate(entry);
  if (ok) return { valid: true };
  const errors = (validate.errors ?? []).map(
    (e) => `${e.instancePath} ${e.message ?? ""}`.trim()
  );
  return { valid: false, errors };
}
