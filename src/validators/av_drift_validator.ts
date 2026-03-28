/**
 * AV drift validator (Sprint 4). Pure function: enforces narration ≤ video; optionally enforces max gap (200ms for Mode C).
 * Mode B (recorded): no gap cap — use options.maxDriftMs = null. Mode C: maxDriftMs 200. Mode A (`ui_flow_scenes`): per-row drift may be skipped in the timeline engine; post-concat check uses maxDriftMs null (narration ≤ stitched video only).
 * No correction logic; hard fail on violation.
 */

export interface AvDriftResult {
  valid: boolean;
  driftMs: number;
  error?: string;
}

const DEFAULT_MAX_DRIFT_MS = 200;

export interface AvDriftOptions {
  /** Max allowed gap (video - narration) in ms. Omit or 200 for Mode A/C. Use null for Mode B (no cap). */
  maxDriftMs?: number | null;
}

/**
 * Validates narration ≤ video. When maxDriftMs is a number, also validates (videoDurationMs - narrationDurationMs) ≤ maxDriftMs.
 * When maxDriftMs is null or omitted, only narration ≤ video is enforced (Mode B).
 */
export function validateAvDrift(
  videoDurationMs: number,
  narrationDurationMs: number,
  options?: AvDriftOptions
): AvDriftResult {
  if (narrationDurationMs > videoDurationMs) {
    return {
      valid: false,
      driftMs: narrationDurationMs - videoDurationMs,
      error: `Narration duration (${narrationDurationMs}ms) exceeds video duration (${videoDurationMs}ms)`,
    };
  }
  const driftMs = videoDurationMs - narrationDurationMs;
  const maxDrift = options?.maxDriftMs === null
    ? null
    : (options?.maxDriftMs ?? DEFAULT_MAX_DRIFT_MS);
  if (maxDrift != null && driftMs > maxDrift) {
    return {
      valid: false,
      driftMs,
      error: `AV drift ${driftMs}ms exceeds maximum ${maxDrift}ms`,
    };
  }
  return { valid: true, driftMs };
}
