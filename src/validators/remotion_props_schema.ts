import Ajv from "ajv";
import type { ValidateFunction } from "ajv";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type SupportedCompositionId =
  | "AnukramAIIntro"
  | "AnukramAISummary"
  | "SceneTitleCard"
  | "ProgressOverlay"
  | "TransitionComposition"
  | "SceneComposition";

function loadSchema(): object {
  const path = join(process.cwd(), "schemas", "remotion_props_schema_v1.json");
  return JSON.parse(readFileSync(path, "utf-8")) as object;
}

export function validateRemotionProps(
  compositionId: SupportedCompositionId,
  props: unknown,
): { valid: true } | { valid: false; errors: string[] } {
  const definitionName =
    compositionId === "AnukramAIIntro"
      ? "AnukramAIIntroProps"
      : compositionId === "AnukramAISummary"
        ? "AnukramAISummaryProps"
        : compositionId === "SceneTitleCard"
          ? "SceneTitleCardProps"
          : "ProgressOverlayProps";

  const wrapped = {
    $ref: `#/definitions/${definitionName}`,
  };

  // Ajv does not validate arbitrary data against a definition directly, so we construct a small schema on the fly.
  const localAjv = new (Ajv as unknown as new (opts?: { strict?: boolean; allErrors?: boolean }) => {
    compile: (schema: object) => ValidateFunction;
  })({ strict: true, allErrors: true });

  const schemaWithDefs = {
    ...(loadSchema() as Record<string, unknown>),
    ...wrapped,
  };

  const localValidate = localAjv.compile(schemaWithDefs);
  const ok = localValidate(props);
  if (ok) {
    return { valid: true };
  }
  const errors = (localValidate.errors ?? []).map((e) => `${e.instancePath} ${e.message ?? ""}`.trim());
  return { valid: false, errors };
}

