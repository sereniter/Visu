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

const SCHEMA_V1_0_REJECT_MESSAGE =
  "Contract schema v1.0 is not supported. Migrate to v1.1.";
const SCHEMA_V1_1_REJECT_MESSAGE =
  "Contract schema v1.1 is not supported. Migrate to v1.2.";
const SCHEMA_V1_2_REJECT_MESSAGE =
  "Contract schema v1.2 is not supported. Migrate to v1.3.";
const SCHEMA_V1_3_REJECT_MESSAGE =
  "Contract schema v1.3 is not supported. Migrate to v1.4.";

let validateSceneContractV13Fn: ValidateFunction | null = null;
let validateSceneContractV14Fn: ValidateFunction | null = null;
let validateSceneContractV15Fn: ValidateFunction | null = null;
let validateSceneContractV16Fn: ValidateFunction | null = null;

export function getSceneContractValidatorV13(): ValidateFunction {
  if (!validateSceneContractV13Fn) {
    const schema = loadSchema("scene_schema_v1.3.json");
    validateSceneContractV13Fn = ajv.compile(schema);
  }
  return validateSceneContractV13Fn as ValidateFunction;
}

export function getSceneContractValidatorV14(): ValidateFunction {
  if (!validateSceneContractV14Fn) {
    const schema = loadSchema("scene_schema_v1.4.json");
    validateSceneContractV14Fn = ajv.compile(schema);
  }
  return validateSceneContractV14Fn as ValidateFunction;
}

export function getSceneContractValidatorV15(): ValidateFunction {
  if (!validateSceneContractV15Fn) {
    const schema = loadSchema("scene_schema_v1.5.json");
    validateSceneContractV15Fn = ajv.compile(schema);
  }
  return validateSceneContractV15Fn as ValidateFunction;
}

export function getSceneContractValidatorV16(): ValidateFunction {
  if (!validateSceneContractV16Fn) {
    const schema = loadSchema("scene_schema_v1.6.json");
    validateSceneContractV16Fn = ajv.compile(schema);
  }
  return validateSceneContractV16Fn as ValidateFunction;
}

/** v1.5/v1.6 scene step (contract format). */
export type UIFlowSceneStepAction =
  | "navigate"
  | "click"
  | "fill"
  | "wait"
  | "wait_ms"
  | "scroll"
  | "screenshot"
  | "done";

export type LocatorDescriptorType =
  | "getByRole"
  | "getByText"
  | "getByLabel"
  | "getByPlaceholder"
  | "locator";

export interface LocatorDescriptorBase {
  type: LocatorDescriptorType;
  /** Optional index for .nth() / .first() */
  nth?: number;
}

export interface GetByRoleLocatorDescriptor extends LocatorDescriptorBase {
  type: "getByRole";
  role: string;
  options?: {
    name?: string;
    exact?: boolean;
  };
}

export interface GetByTextLocatorDescriptor extends LocatorDescriptorBase {
  type: "getByText";
  text: string;
  options?: {
    exact?: boolean;
  };
}

export interface GetByLabelLocatorDescriptor extends LocatorDescriptorBase {
  type: "getByLabel";
  text: string;
}

export interface GetByPlaceholderLocatorDescriptor extends LocatorDescriptorBase {
  type: "getByPlaceholder";
  text: string;
}

export interface RawLocatorDescriptor extends LocatorDescriptorBase {
  type: "locator";
  selector: string;
  filter?: {
    hasText?: string;
  };
}

export type LocatorDescriptor =
  | GetByRoleLocatorDescriptor
  | GetByTextLocatorDescriptor
  | GetByLabelLocatorDescriptor
  | GetByPlaceholderLocatorDescriptor
  | RawLocatorDescriptor;

export interface UIFlowSceneStep {
  action: UIFlowSceneStepAction;
  url?: string;
  /** Legacy string-based selector (deprecated in favor of locator). */
  selector?: string;
  value?: string;
  /** Structured Playwright locator; preferred over selector when present. */
  locator?: LocatorDescriptor;
}

/** v1.5 intro/summary scene (Mode C pattern — PNG + TTS). */
export interface UIFlowIntroSummaryScene {
  scene_id: string;
  asset_path: string;
  prompt_key: string;
  seed: number;
  model_version: string;
  narration: {
    text_template_key: string;
    language: string;
    voice_gender: "male" | "female";
    speed: number;
  };
  buffer_sec: number;
  music: string;
}

export interface UIFlowIntroSummarySceneV16 extends UIFlowIntroSummaryScene {
  renderer?: "png" | "remotion";
}

/** v1.5 recording and post-production config. */
export interface UIFlowRecordingEnhancements {
  clickSound: boolean;
  clickHighlight: boolean;
  highlightColor: string;
  highlightDurationMs: number;
  cursorHighlight: boolean;
  ambientSounds: boolean;
  zoomToAction: boolean;
  zoomLevel: number;
}

export interface UIFlowPostProduction {
  stepTitleCard: boolean;
  progressIndicator: boolean;
  transitionSound: boolean;
  chapterMarkers: boolean;
  subtitleTrack: boolean;
  thumbnail: boolean;
  videoDescription: boolean;
}

export interface UIFlowPostProductionV16 extends UIFlowPostProduction {
  useRemotionOverlays?: boolean;
}

export interface UIFlowSceneV15 {
  scene_id: string;
  title: string;
  narration: {
    text_template_key: string;
    language: string;
    voice_gender: "male" | "female";
    speed: number;
  };
  buffer_sec: number;
  music: string;
  steps: UIFlowSceneStep[];
}

export interface UIFlowSceneContractV15 {
  schema_version: "1.5";
  video_id: string;
  topic: string;
  language: string;
  mode: "ui_flow_scenes";
  baseUrl: string;
  intro: UIFlowIntroSummaryScene;
  summary: UIFlowIntroSummaryScene;
  recording_enhancements: UIFlowRecordingEnhancements;
  post_production: UIFlowPostProduction;
  scenes: UIFlowSceneV15[];
}

export interface UIFlowSceneContractV16 {
  schema_version: "1.6";
  video_id: string;
  topic: string;
  language: string;
  mode: "ui_flow_scenes";
  baseUrl: string;
  intro: UIFlowIntroSummarySceneV16;
  summary: UIFlowIntroSummarySceneV16;
  recording_enhancements: UIFlowRecordingEnhancements;
  post_production: UIFlowPostProductionV16;
  scenes: UIFlowSceneV15[];
}

export function validateUIFlowScenesContract(
  data: unknown
): { valid: true; data: UIFlowSceneContractV15 | UIFlowSceneContractV16 } | { valid: false; errors: string[] } {
  const obj = data as { schema_version?: string; mode?: string };
  if (obj?.mode !== "ui_flow_scenes") {
    return {
      valid: false,
      errors: ['Contract must have mode "ui_flow_scenes" for scene-driven Mode A.'],
    };
  }

  if (obj.schema_version === "1.6") {
    const validateV16 = getSceneContractValidatorV16();
    const okV16 = validateV16(data);
    if (okV16) {
      return { valid: true, data: data as UIFlowSceneContractV16 };
    }
    const errorsV16 = (validateV16.errors ?? []).map(
      (e) => `${e.instancePath} ${e.message ?? ""}`.trim()
    );
    return { valid: false, errors: errorsV16 };
  }

  if (obj.schema_version !== "1.5") {
    return {
      valid: false,
      errors: ['Contract must have schema_version "1.5" or "1.6" for scene-driven Mode A.'],
    };
  }

  const validateV15 = getSceneContractValidatorV15();
  const okV15 = validateV15(data);
  if (okV15) return { valid: true, data: data as UIFlowSceneContractV15 };
  const errorsV15 = (validateV15.errors ?? []).map(
    (e) => `${e.instancePath} ${e.message ?? ""}`.trim()
  );
  return { valid: false, errors: errorsV15 };
}

/** Narration block shared by Mode C scenes. */
export interface ModeCSceneNarration {
  text_template_key: string;
  language: string;
  voice_gender: "male" | "female";
  speed: number;
}

/** Scene contract v1.3: governed_image visual + script template narration + narration.language + voice_gender. */
export interface ModeCSceneVisualV14 {
  type: "governed_image";
  asset_path: string;
  prompt_key: string;
  seed: number;
  model_version: string;
  visual_style?: "war_documentary" | "historical_archive" | "geopolitical_tension" | "news_report" | "impact_moment";
  motion?: {
    type: "zoom_in" | "zoom_out" | "pan_left" | "pan_right" | "pan_diagonal_tl" | "pan_diagonal_br";
    focus?: "center" | "left" | "right" | "top" | "bottom";
    intensity?: number;
    easing?: "linear" | "ease_in" | "ease_out" | "ease_in_out" | "spring" | "bounce";
    motion_blur?: boolean;
  };
  grade?: "cinematic_dark" | "warm_sunset" | "cold_war" | "news_neutral" | "high_contrast";
  grain?: boolean;
  parallax?: {
    foreground_path: string;
    depth: number;
  };
}

export interface ModeCSceneTransition {
  type?: "fade" | "slide" | "wipe" | "flip" | "clockWipe" | "iris" | "light_leak" | "none";
  duration_sec?: number;
  timing?: "spring" | "linear";
  direction?: "from-left" | "from-right" | "from-top" | "from-bottom";
}

export interface ModeCSceneSfx {
  path: string;
  start_sec: number;
  volume?: number;
}

export interface ModeCSceneAudio {
  ambient_path?: string;
  ambient_volume?: number;
  sfx?: ModeCSceneSfx[];
}

export interface ModeCOverlay {
  type: "lower_third" | "stat_badge" | "source_tag" | "highlight_circle" | "arrow_pointer" | "shape";
  text?: string;
  subtext?: string;
  label?: string;
  position?: "bottom_left" | "bottom_right" | "top_left" | "top_right";
  x?: number;
  y?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  radius?: number;
  color?: string;
  pulse?: boolean;
  pulse_speed?: number;
  start_sec: number;
  duration_sec: number;
  fade_in_sec?: number;
  fade_out_sec?: number;
  animation?: "slide_up" | "fade";
  count_up?: boolean;
  glow?: boolean;
  glow_radius?: number;
  shape?: "triangle" | "star" | "circle" | "pie";
  size?: number;
  fill?: boolean;
  draw_on?: boolean;
  language?: string;
}

export interface ModeCSceneV13 {
  scene_id: string;
  duration_sec: number;
  visual: ModeCSceneVisualV14;
  narration: ModeCSceneNarration;
  overlays?: ModeCOverlay[];
  transition?: ModeCSceneTransition;
  audio?: ModeCSceneAudio;
}

/** Mode C remotion scene: no duration_sec; duration from rendered clip. Component enum is Mode C–specific (scene-level only). */
export interface ModeCRemotionSceneV14 {
  scene_id: string;
  visual: {
    type: "remotion";
    component: "SceneTitleCard";
    props: Record<string, unknown>;
  };
  narration: ModeCSceneNarration;
}

export type ModeCSceneV14 = ModeCSceneV13 | ModeCRemotionSceneV14;

export function isModeCRemotionScene(scene: ModeCSceneV14): scene is ModeCRemotionSceneV14 {
  return scene.visual.type === "remotion";
}

export interface ModeCContractV13 {
  schema_version: "1.3";
  video_id: string;
  scenes: ModeCSceneV13[];
}

/** Scene contract v1.4: v1.3 + optional remotion scenes (topic, language, governed_image | remotion). */
export interface ModeCContractV14 {
  schema_version: "1.4";
  video_id: string;
  topic: string;
  language: string;
  scenes: ModeCSceneV14[];
}

/** @deprecated Use ModeCSceneV13 / ModeCContractV13. */
export interface ModeCSceneV12 {
  scene_id: string;
  duration_sec: number;
  visual: {
    type: "governed_image";
    asset_path: string;
    prompt_key: string;
    seed: number;
    model_version: string;
  };
  narration: {
    text_template_key: string;
    language: string;
    voice: string;
    speed: number;
  };
}

/** @deprecated Use ModeCContractV13. */
export interface ModeCContractV12 {
  schema_version: "1.2";
  video_id: string;
  scenes: ModeCSceneV12[];
}

/** @deprecated Use ModeCSceneV12 / ModeCContractV12. Kept for type compatibility during migration. */
export interface ModeCSceneV11 {
  scene_id: string;
  duration_sec: number;
  visual: {
    type: "governed_image";
    asset_path: string;
    prompt_key: string;
    seed: number;
    model_version: string;
  };
  narration: {
    text_template_key: string;
    voice: string;
    speed: number;
  };
}

/** @deprecated Use ModeCContractV12. */
export interface ModeCContractV11 {
  schema_version: "1.1";
  video_id: string;
  scenes: ModeCSceneV11[];
}

/** Legacy v1.0 types (rejected at runtime). */
export interface ModeCScene {
  scene_id: string;
  video_path: string;
  narration_path: string;
  duration_sec: number;
}

export interface ModeCContract {
  schema_version: string;
  video_id: string;
  scenes: ModeCScene[];
}

export function validateSceneContract(
  data: unknown
): { valid: true; data: ModeCContractV14 } | { valid: false; errors: string[] } {
  const obj = data as { schema_version?: string };
  if (obj?.schema_version === "1.0") {
    return { valid: false, errors: [SCHEMA_V1_0_REJECT_MESSAGE] };
  }
  if (obj?.schema_version === "1.1") {
    return { valid: false, errors: [SCHEMA_V1_1_REJECT_MESSAGE] };
  }
  if (obj?.schema_version === "1.2") {
    return { valid: false, errors: [SCHEMA_V1_2_REJECT_MESSAGE] };
  }
  if (obj?.schema_version === "1.3") {
    return { valid: false, errors: [SCHEMA_V1_3_REJECT_MESSAGE] };
  }
  const validate = getSceneContractValidatorV14();
  const ok = validate(data);
  if (ok) return { valid: true, data: data as ModeCContractV14 };
  const errors = (validate.errors ?? []).map(
    (e) => `${e.instancePath} ${e.message ?? ""}`.trim()
  );
  return { valid: false, errors };
}

export function validateOverlays(
  overlays: ModeCOverlay[] | undefined,
  sceneDurationSec: number,
): { valid: true } | { valid: false; code: string; message: string } {
  if (!overlays || overlays.length === 0) return { valid: true };

  for (const overlay of overlays) {
    const start = overlay.start_sec;
    const duration = overlay.duration_sec;
    const fadeIn = overlay.fade_in_sec ?? 0;
    const fadeOut = overlay.fade_out_sec ?? 0;

    if (start + duration > sceneDurationSec + 1e-6) {
      return {
        valid: false,
        code: "OVERLAY_TIMING_INVALID",
        message: `Overlay ${overlay.type} exceeds scene duration`,
      };
    }

    if (fadeIn + fadeOut > duration + 1e-6) {
      return {
        valid: false,
        code: "OVERLAY_FADE_INVALID",
        message: `Overlay ${overlay.type} has fade_in + fade_out greater than duration`,
      };
    }

    if (overlay.type === "lower_third" || overlay.type === "stat_badge" || overlay.type === "source_tag") {
      if (!overlay.text) {
        return {
          valid: false,
          code: "OVERLAY_FIELD_MISSING",
          message: `${overlay.type} overlay requires text`,
        };
      }
    }

    if (overlay.type !== "lower_third" && overlay.subtext) {
      return {
        valid: false,
        code: "OVERLAY_FIELD_INVALID",
        message: "subtext is only allowed on lower_third overlays",
      };
    }

    if (overlay.type !== "stat_badge" && overlay.label) {
      return {
        valid: false,
        code: "OVERLAY_FIELD_INVALID",
        message: "label is only allowed on stat_badge overlays",
      };
    }

    if (overlay.type === "highlight_circle") {
      if (
        overlay.x == null ||
        overlay.y == null ||
        overlay.radius == null
      ) {
        return {
          valid: false,
          code: "OVERLAY_FIELD_MISSING",
          message: "highlight_circle requires x, y, and radius",
        };
      }
      const x = overlay.x;
      const y = overlay.y;
      const r = overlay.radius;
      if (x - r < 0 || x + r > 1919 || y - r < 0 || y + r > 1079) {
        return {
          valid: false,
          code: "OVERLAY_BOUNDS_INVALID",
          message: "highlight_circle must be fully within 1920x1080 frame",
        };
      }
    }

    if (overlay.type === "arrow_pointer") {
      if (
        overlay.x1 == null ||
        overlay.y1 == null ||
        overlay.x2 == null ||
        overlay.y2 == null
      ) {
        return {
          valid: false,
          code: "OVERLAY_FIELD_MISSING",
          message: "arrow_pointer requires x1,y1,x2,y2",
        };
      }
      const dx = overlay.x2 - overlay.x1;
      const dy = overlay.y2 - overlay.y1;
      const length = Math.sqrt(dx * dx + dy * dy);
      if (length < 50) {
        return {
          valid: false,
          code: "OVERLAY_ARROW_TOO_SHORT",
          message: "arrow_pointer must be at least 50px long",
        };
      }
    }
  }

  return { valid: true };
}
