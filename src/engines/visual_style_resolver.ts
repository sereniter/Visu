import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type MotionType =
  | "zoom_in"
  | "zoom_out"
  | "pan_left"
  | "pan_right"
  | "pan_diagonal_tl"
  | "pan_diagonal_br";

export type MotionFocus = "center" | "left" | "right" | "top" | "bottom";

export interface MotionParams {
  type: MotionType;
  focus?: MotionFocus;
  intensity?: number;
}

export interface GovernedImageVisual {
  type: "governed_image";
  asset_path: string;
  prompt_key: string;
  seed: number;
  model_version: string;
  visual_style?: string;
  motion?: MotionParams;
  grade?: string;
}

export interface GradePresetConfig {
  eq?: string | null;
  curves?: string | null;
  vignette?: string | null;
  grain?: string | null;
}

export interface GradesConfig {
  schema_version: string;
  grades: Record<string, GradePresetConfig>;
}

export interface VisualStyleEntry {
  grade: string;
  motion: MotionParams;
  overlay_font_color: string;
  overlay_shadow: boolean;
}

export interface VisualStylesConfig {
  schema_version: string;
  styles: Record<string, VisualStyleEntry>;
}

export interface ResolvedVisualParams {
  motion: MotionParams | null;
  grade: string | null;
  overlayFontColor: string;
  overlayShadow: boolean;
}

export function resolveVisualStyle(
  sceneVisual: GovernedImageVisual,
  stylesConfig: VisualStylesConfig,
): ResolvedVisualParams {
  const defaultFontColor = "ffffff";
  const defaultShadow = false;

  const styleName = sceneVisual.visual_style;
  if (!styleName) {
    return {
      motion: sceneVisual.motion ?? null,
      grade: sceneVisual.grade ?? null,
      overlayFontColor: defaultFontColor,
      overlayShadow: defaultShadow,
    };
  }

  const style = stylesConfig.styles[styleName];
  if (!style) {
    throw new Error(`STYLE_UNKNOWN: visual_style "${styleName}" not found in visual_styles config`);
  }

  const motion = sceneVisual.motion ?? style.motion ?? null;
  const grade = sceneVisual.grade ?? style.grade ?? null;

  return {
    motion,
    grade,
    overlayFontColor: style.overlay_font_color || defaultFontColor,
    overlayShadow: Boolean(style.overlay_shadow),
  };
}

export function loadGradesConfig(
  cwd: string,
): { config: GradesConfig; hash: string } {
  const path = join(cwd, "config", "grades.json");
  const raw = readFileSync(path, "utf-8");
  const config = JSON.parse(raw) as GradesConfig;
  const hash = createHash("sha256").update(raw, "utf8").digest("hex");
  return { config, hash };
}

export function loadStylesConfig(
  cwd: string,
): { config: VisualStylesConfig; hash: string } {
  const path = join(cwd, "config", "visual_styles.json");
  const raw = readFileSync(path, "utf-8");
  const config = JSON.parse(raw) as VisualStylesConfig;
  const hash = createHash("sha256").update(raw, "utf8").digest("hex");
  return { config, hash };
}

