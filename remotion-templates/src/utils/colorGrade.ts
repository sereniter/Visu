import type { GradePresetConfig } from "../types";

interface EqParts {
  contrast?: number;
  brightness?: number;
  saturation?: number;
  gamma?: number;
}

export function parseEqString(eq: string): EqParts {
  const parts: EqParts = {};
  for (const segment of eq.split(":")) {
    const [key, val] = segment.split("=");
    if (!key || !val) continue;
    const num = parseFloat(val);
    if (Number.isNaN(num)) continue;
    switch (key) {
      case "contrast":
        parts.contrast = num;
        break;
      case "brightness":
        parts.brightness = num;
        break;
      case "saturation":
        parts.saturation = num;
        break;
      case "gamma":
        parts.gamma = num;
        break;
    }
  }
  return parts;
}

export function buildCssGradeFilter(grade: GradePresetConfig): string {
  if (!grade.eq) return "";
  const parts = parseEqString(grade.eq);
  return [
    parts.contrast != null ? `contrast(${parts.contrast})` : null,
    parts.brightness != null ? `brightness(${1 + parts.brightness})` : null,
    parts.saturation != null ? `saturate(${parts.saturation})` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

export interface CurvesChannel {
  table: number[];
}

export function parseCurvesString(
  curves: string,
): { r: CurvesChannel; g: CurvesChannel; b: CurvesChannel } | null {
  const channelRegex = /([rgb])='([^']+)'/g;
  const result: Record<string, CurvesChannel> = {};
  let match: RegExpExecArray | null;

  while ((match = channelRegex.exec(curves)) !== null) {
    const channel = match[1]!;
    const pointsStr = match[2]!;
    const points = pointsStr.split(" ").map((p) => {
      const [x, y] = p.split("/").map(Number);
      return { x: x!, y: y! };
    });

    const table: number[] = [];
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      let val = t;
      for (let j = 0; j < points.length - 1; j++) {
        const p0 = points[j]!;
        const p1 = points[j + 1]!;
        if (t >= p0.x && t <= p1.x) {
          const segT = (t - p0.x) / (p1.x - p0.x);
          val = p0.y + segT * (p1.y - p0.y);
          break;
        }
      }
      table.push(Math.round(Math.max(0, Math.min(1, val)) * 255));
    }
    result[channel] = { table };
  }

  if (!result.r || !result.g || !result.b) return null;
  return { r: result.r, g: result.g, b: result.b };
}

export function buildSvgCurveFilterId(gradeName: string): string {
  return `curve-${gradeName}`;
}
