export type MotionType =
  | "zoom_in"
  | "zoom_out"
  | "pan_left"
  | "pan_right"
  | "pan_diagonal_tl"
  | "pan_diagonal_br";

export type MotionFocus = "center" | "left" | "right" | "top" | "bottom";

export type EasingType =
  | "linear"
  | "ease_in"
  | "ease_out"
  | "ease_in_out"
  | "spring"
  | "bounce";

export type TransitionType =
  | "fade"
  | "slide"
  | "wipe"
  | "flip"
  | "clockWipe"
  | "iris"
  | "light_leak"
  | "none";

export type TransitionDirection =
  | "from-left"
  | "from-right"
  | "from-top"
  | "from-bottom";

export type OverlayAnimation = "slide_up" | "fade";

export interface MotionConfig {
  type: MotionType;
  focus?: MotionFocus;
  intensity?: number;
  easing?: EasingType;
  motion_blur?: boolean;
}

export interface SceneTransition {
  type: TransitionType;
  duration_sec?: number;
  timing?: "spring" | "linear";
  direction?: TransitionDirection;
}

export interface SceneSfx {
  path: string;
  start_sec: number;
  volume?: number;
}

export interface SceneAudio {
  ambient_path?: string;
  ambient_volume?: number;
  sfx?: SceneSfx[];
}

export interface ParallaxConfig {
  foreground_path: string;
  depth: number;
}

export interface VisualConfig {
  type: "governed_image";
  asset_path: string;
  visual_style?: string;
  motion?: MotionConfig;
  grade?: string;
  grain?: boolean;
  parallax?: ParallaxConfig;
  prompt_key: string;
  seed: number;
  model_version: string;
}

export interface OverlayConfig {
  type:
    | "lower_third"
    | "stat_badge"
    | "source_tag"
    | "highlight_circle"
    | "arrow_pointer"
    | "shape";
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
  animation?: OverlayAnimation;
  count_up?: boolean;
  glow?: boolean;
  glow_radius?: number;
  shape?: "triangle" | "star" | "circle" | "pie";
  size?: number;
  fill?: boolean;
  draw_on?: boolean;
  language?: string;
}

export interface SceneConfig {
  scene_id: string;
  duration_sec: number;
  visual: VisualConfig;
  narration: {
    text_template_key: string;
    language: string;
    voice_gender: "male" | "female";
    speed: number;
  };
  overlays?: OverlayConfig[];
  transition?: SceneTransition;
  audio?: SceneAudio;
}

export interface FontStyleConfig {
  heading: string;
  body: string;
  weight: number;
}

export interface FontsConfig {
  schema_version: string;
  google_fonts: boolean;
  styles: Record<string, FontStyleConfig>;
  languages: Record<string, FontStyleConfig>;
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

export interface ResolvedStyle {
  style: string;
  motion: MotionConfig | null;
  grade: string | null;
  overlayFontColor: string;
  overlayShadow: boolean;
}

export interface TransitionCompositionProps {
  scenes: SceneConfig[];
  fontsConfig: FontsConfig;
  gradesConfig: GradesConfig;
  fps: number;
}

export interface SceneCompositionProps {
  scene: SceneConfig;
  fontsConfig: FontsConfig;
  gradesConfig: GradesConfig;
}
