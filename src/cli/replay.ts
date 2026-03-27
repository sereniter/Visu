/**
 * Replay CLI (Sprint 7). Verifies artifact integrity and reports environment drift.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getConfig } from "../core/config.js";
import { computeFileSha256 } from "../engines/metadata_writer.js";
import { runAudit, type AuditOutput } from "./audit.js";

export interface ReplayReport {
  runId: string;
  artifactsExist: boolean;
  finalMp4Sha256Match: boolean;
  audit: AuditOutput;
  /** Paths checked */
  paths: {
    mediaMetadata: string;
    environmentSnapshot: string;
    finalMp4: string;
  };
}

/**
 * Run replay for a runId: verify artifacts, run audit, return report.
 */
export async function runReplay(runId: string): Promise<ReplayReport> {
  const config = getConfig();
  const artifactsDir = join(process.cwd(), config.execution.artifactsDir);
  const runDir = join(artifactsDir, runId);

  const mediaMetadataPath = join(runDir, "media_metadata.json");
  const environmentSnapshotPath = join(runDir, "environment_snapshot.json");
  const finalMp4Path = join(runDir, "final.mp4");

  const artifactsExist =
    existsSync(runDir) &&
    existsSync(mediaMetadataPath) &&
    existsSync(finalMp4Path);

  let finalMp4Sha256Match = false;
  if (artifactsExist && existsSync(finalMp4Path)) {
    try {
      const meta = JSON.parse(readFileSync(mediaMetadataPath, "utf-8")) as { outputSha256?: string };
      const actualSha = computeFileSha256(finalMp4Path);
      finalMp4Sha256Match = meta.outputSha256 === actualSha;
    } catch {
      finalMp4Sha256Match = false;
    }
  }

  const { output: audit } = await runAudit(runId);

  return {
    runId,
    artifactsExist,
    finalMp4Sha256Match,
    audit,
    paths: {
      mediaMetadata: mediaMetadataPath,
      environmentSnapshot: environmentSnapshotPath,
      finalMp4: finalMp4Path,
    },
  };
}
