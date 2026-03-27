import React from "react";
import { AbsoluteFill } from "remotion";
import type { GradesConfig } from "../types";
import {
  buildCssGradeFilter,
  parseCurvesString,
  buildSvgCurveFilterId,
} from "../utils/colorGrade";

export type GradedSceneProps = {
  grade: string | null;
  gradesConfig: GradesConfig;
  children: React.ReactNode;
};

export const GradedScene: React.FC<GradedSceneProps> = ({
  grade,
  gradesConfig,
  children,
}) => {
  if (!grade) return <>{children}</>;

  const gradeConfig = gradesConfig.grades[grade];
  if (!gradeConfig) return <>{children}</>;

  const cssFilter = buildCssGradeFilter(gradeConfig);
  const curves = gradeConfig.curves
    ? parseCurvesString(gradeConfig.curves)
    : null;
  const curveFilterId = buildSvgCurveFilterId(grade);
  const hasVignette = Boolean(gradeConfig.vignette);

  const filterParts = [
    cssFilter || null,
    curves ? `url(#${curveFilterId})` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <AbsoluteFill>
      {curves && (
        <svg width="0" height="0" style={{ position: "absolute" }}>
          <defs>
            <filter id={curveFilterId}>
              <feComponentTransfer>
                <feFuncR
                  type="table"
                  tableValues={curves.r.table.map((v) => v / 255).join(" ")}
                />
                <feFuncG
                  type="table"
                  tableValues={curves.g.table.map((v) => v / 255).join(" ")}
                />
                <feFuncB
                  type="table"
                  tableValues={curves.b.table.map((v) => v / 255).join(" ")}
                />
              </feComponentTransfer>
            </filter>
          </defs>
        </svg>
      )}

      <AbsoluteFill style={{ filter: filterParts || undefined }}>
        {children}
      </AbsoluteFill>

      {hasVignette && (
        <AbsoluteFill
          style={{
            background:
              "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.7) 100%)",
            pointerEvents: "none",
          }}
        />
      )}
    </AbsoluteFill>
  );
};
