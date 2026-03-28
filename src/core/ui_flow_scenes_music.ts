/**
 * Resolve background music WAV for ui_flow_scenes AV merge.
 * Contract paths are relative to the flow directory (contentRoot/topic).
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { UIFlowSceneContractV15, UIFlowSceneContractV16 } from "../validators/scene_schema.js";

export function resolveUIFlowScenesBackgroundMusicPath(
  contract: UIFlowSceneContractV15 | UIFlowSceneContractV16,
  flowBaseDir: string,
  configDefaultPath: string | null | undefined
): string | null {
  const tryResolve = (p: string): string | null => {
    const trimmed = p.trim();
    if (!trimmed) return null;
    const abs = resolve(flowBaseDir, trimmed);
    return existsSync(abs) ? abs : null;
  };

  const intro = tryResolve(contract.intro.music);
  if (intro) return intro;
  const summary = tryResolve(contract.summary.music);
  if (summary) return summary;
  for (const s of contract.scenes) {
    const m = tryResolve(s.music);
    if (m) return m;
  }
  if (configDefaultPath && existsSync(configDefaultPath)) return configDefaultPath;
  return null;
}
