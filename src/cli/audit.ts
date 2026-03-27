/**
 * Audit CLI (Sprint 7). Verifies determinism: fingerprints, node version, config hash,
 * encoding profile, final video SHA256. Exit 0 = PASS, 1 = FAIL, 2 = execution error.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getConfig, getConfigHash, getEncodingProfile } from "../core/config.js";
import { FFmpegAdapter } from "../adapters/ffmpeg_adapter.js";
import { LocalPiperAdapter } from "../adapters/tts/local_piper_adapter.js";
import { computeFileSha256 } from "../engines/metadata_writer.js";
import type { MediaMetadataPayload } from "../validators/media_metadata_schema.js";
import type { EnvironmentSnapshotPayload } from "../validators/environment_snapshot_validator.js";

export type AuditMode = "ui_flow" | "recorded" | "generative";
export type DeterminismLevel = "environment-sensitive" | "binary-sensitive";
export type AuditStatus = "PASS" | "FAIL";

export interface AuditMismatch {
  field: string;
  severity: "critical" | "warning";
  expected: string;
  actual: string;
}

export interface AuditOutput {
  runId: string;
  mode: AuditMode;
  determinismLevel: DeterminismLevel;
  status: AuditStatus;
  checked: {
    ffmpegBinaryFingerprint: boolean;
    piperBinaryFingerprint: boolean;
    nodeVersion: boolean;
    configHash: boolean;
    encodingProfile: boolean;
    finalVideoSha256: boolean;
  };
  mismatches: AuditMismatch[];
}

function determinismLevelFromMode(mode: string): DeterminismLevel {
  switch (mode) {
    case "ui_flow":
      return "environment-sensitive";
    case "recorded":
    case "generative":
      return "binary-sensitive";
    default:
      return "environment-sensitive";
  }
}

function encodingProfileMatches(meta: MediaMetadataPayload, profile: ReturnType<typeof getEncodingProfile>): boolean {
  return (
    meta.encodingProfileVersion === profile.encoding_profile_version &&
    meta.crf === profile.crf &&
    meta.audioSampleRate === profile.audio_sample_rate
  );
}

/**
 * Run audit for a runId. Returns audit output and exit code (0/1/2).
 * Exit 2: invalid runId, missing files, malformed metadata.
 * When expectedFfmpegFingerprint is set, compare current FFmpeg fingerprint against it instead of snapshot (strict-determinism escape hatch).
 */
export async function runAudit(
  runId: string,
  options?: { expectedFfmpegFingerprint?: string }
): Promise<{ output: AuditOutput; exitCode: 0 | 1 | 2 }> {
  const expectedFfmpegOverride = options?.expectedFfmpegFingerprint;
  const config = getConfig();
  const artifactsDir = join(process.cwd(), config.execution.artifactsDir);
  const runDir = join(artifactsDir, runId);

  if (!runId || runId.includes("..") || !existsSync(runDir)) {
    return {
      output: {
        runId,
        mode: "recorded",
        determinismLevel: "binary-sensitive",
        status: "FAIL",
        checked: {
          ffmpegBinaryFingerprint: false,
          piperBinaryFingerprint: false,
          nodeVersion: false,
          configHash: false,
          encodingProfile: false,
          finalVideoSha256: false,
        },
        mismatches: [{ field: "runId", severity: "critical", expected: "valid run directory", actual: "missing or invalid" }],
      },
      exitCode: 2,
    };
  }

  const metadataPath = join(runDir, "media_metadata.json");
  const snapshotPath = join(runDir, "environment_snapshot.json");
  const finalPath = join(runDir, "final.mp4");

  if (!existsSync(metadataPath)) {
    return {
      output: {
        runId,
        mode: "recorded",
        determinismLevel: "binary-sensitive",
        status: "FAIL",
        checked: {
          ffmpegBinaryFingerprint: false,
          piperBinaryFingerprint: false,
          nodeVersion: false,
          configHash: false,
          encodingProfile: false,
          finalVideoSha256: false,
        },
        mismatches: [{ field: "media_metadata", severity: "critical", expected: "file exists", actual: "missing" }],
      },
      exitCode: 2,
    };
  }

  let meta: MediaMetadataPayload;
  let snapshot: EnvironmentSnapshotPayload | null = null;
  try {
    meta = JSON.parse(readFileSync(metadataPath, "utf-8")) as MediaMetadataPayload;
    if (existsSync(snapshotPath)) {
      snapshot = JSON.parse(readFileSync(snapshotPath, "utf-8")) as EnvironmentSnapshotPayload;
    }
  } catch {
    return {
      output: {
        runId,
        mode: "recorded",
        determinismLevel: "binary-sensitive",
        status: "FAIL",
        checked: {
          ffmpegBinaryFingerprint: false,
          piperBinaryFingerprint: false,
          nodeVersion: false,
          configHash: false,
          encodingProfile: false,
          finalVideoSha256: false,
        },
        mismatches: [{ field: "metadata", severity: "critical", expected: "valid JSON", actual: "malformed" }],
      },
      exitCode: 2,
    };
  }

  const mismatches: AuditMismatch[] = [];
  const checked = {
    ffmpegBinaryFingerprint: true,
    piperBinaryFingerprint: true,
    nodeVersion: true,
    configHash: true,
    encodingProfile: true,
    finalVideoSha256: true,
  };

  const profile = getEncodingProfile();
  const currentConfigHash = getConfigHash();
  const expectedEncoding =
    `${profile.encoding_profile_version}:crf=${profile.crf}:ar=${profile.audio_sample_rate}`;
  const actualEncoding = `${meta.encodingProfileVersion}:crf=${meta.crf}:ar=${meta.audioSampleRate}`;

  if (!encodingProfileMatches(meta, profile)) {
    checked.encodingProfile = false;
    mismatches.push({
      field: "encodingProfile",
      severity: "critical",
      expected: expectedEncoding,
      actual: actualEncoding,
    });
  }

  if (!existsSync(finalPath)) {
    checked.finalVideoSha256 = false;
    mismatches.push({
      field: "finalVideoSha256",
      severity: "critical",
      expected: meta.outputSha256,
      actual: "final.mp4 missing",
    });
  } else {
    const actualSha = computeFileSha256(finalPath);
    if (actualSha !== meta.outputSha256) {
      checked.finalVideoSha256 = false;
      mismatches.push({
        field: "finalVideoSha256",
        severity: "critical",
        expected: meta.outputSha256,
        actual: actualSha,
      });
    }
  }

  if (snapshot) {
    if (snapshot.configHash !== currentConfigHash) {
      checked.configHash = false;
      mismatches.push({
        field: "configHash",
        severity: "warning",
        expected: snapshot.configHash,
        actual: currentConfigHash,
      });
    }
    if (snapshot.nodeVersion !== process.version) {
      checked.nodeVersion = false;
      mismatches.push({
        field: "nodeVersion",
        severity: "warning",
        expected: snapshot.nodeVersion,
        actual: process.version,
      });
    }

    try {
      const ffmpegAdapter = new FFmpegAdapter();
      const ffmpegInfo = await ffmpegAdapter.getVersionBuildconfAndFingerprint();
      const expectedFfmpeg = expectedFfmpegOverride ?? snapshot.ffmpegBinaryFingerprint;
      if (ffmpegInfo.fingerprint !== expectedFfmpeg) {
        checked.ffmpegBinaryFingerprint = false;
        mismatches.push({
          field: "ffmpegBinaryFingerprint",
          severity: "critical",
          expected: expectedFfmpeg,
          actual: ffmpegInfo.fingerprint,
        });
      }
    } catch {
      checked.ffmpegBinaryFingerprint = false;
      const expectedFfmpeg = expectedFfmpegOverride ?? snapshot.ffmpegBinaryFingerprint;
      mismatches.push({
        field: "ffmpegBinaryFingerprint",
        severity: "critical",
        expected: expectedFfmpeg,
        actual: "could not compute current fingerprint",
      });
    }

    try {
      const piperAdapter = new LocalPiperAdapter();
      const piper = await piperAdapter.getPiperFingerprints();
      if (piper.piperBinaryFingerprint && piper.piperBinaryFingerprint !== snapshot.piperBinaryFingerprint) {
        checked.piperBinaryFingerprint = false;
        mismatches.push({
          field: "piperBinaryFingerprint",
          severity: "critical",
          expected: snapshot.piperBinaryFingerprint,
          actual: piper.piperBinaryFingerprint,
        });
      }
    } catch {
      checked.piperBinaryFingerprint = false;
      mismatches.push({
        field: "piperBinaryFingerprint",
        severity: "critical",
        expected: snapshot.piperBinaryFingerprint,
        actual: "could not compute current fingerprint",
      });
    }
  } else {
    checked.ffmpegBinaryFingerprint = false;
    checked.piperBinaryFingerprint = false;
    checked.nodeVersion = false;
    checked.configHash = false;
    mismatches.push(
      { field: "environment_snapshot", severity: "warning", expected: "file exists", actual: "missing" }
    );
  }

  const status: AuditStatus = mismatches.length === 0 ? "PASS" : "FAIL";
  const exitCode: 0 | 1 | 2 = status === "PASS" ? 0 : 1;

  return {
    output: {
      runId,
      mode: meta.mode as AuditMode,
      determinismLevel: determinismLevelFromMode(meta.mode),
      status,
      checked,
      mismatches,
    },
    exitCode,
  };
}
