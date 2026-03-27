/**
 * Upload engine (Sprint 7). Validates credentials at boot; uploads final.mp4 to YouTube.
 * Quota: 10,000 units/day default. 403 = quota exhaustion (no retry). 5xx = retry with backoff.
 */

import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getConfig } from "../core/config.js";

export interface UploadMetadataPayload {
  youtubeVideoId: string;
  uploadedAt: string;
  title: string;
  visibility: "public" | "unlisted" | "private";
}

const REQUIRED_ENV = [
  "VISU_YOUTUBE_CLIENT_ID",
  "VISU_YOUTUBE_CLIENT_SECRET",
  "VISU_YOUTUBE_REFRESH_TOKEN",
] as const;

/**
 * Validate that required upload credentials are present. Throws if any missing.
 */
export function validateUploadCredentials(): void {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k] || process.env[k]!.trim() === "");
  if (missing.length > 0) {
    throw new Error(
      `Upload credentials missing. Set in environment: ${missing.join(", ")}. See ENVIRONMENT.md.`
    );
  }
}

const DAILY_QUOTA_UNITS = 10_000;

/**
 * Upload final.mp4 for runId to YouTube. Validates credentials and run artifacts first.
 * On success writes artifacts/{runId}/upload_metadata.json.
 * 403 → no retry. 5xx → retry with exponential backoff (stub: not implemented).
 */
export async function uploadRun(
  runId: string,
  options: { title?: string; visibility?: "public" | "unlisted" | "private" }
): Promise<UploadMetadataPayload> {
  validateUploadCredentials();

  const config = getConfig();
  const runDir = join(process.cwd(), config.execution.artifactsDir, runId);
  const finalPath = join(runDir, "final.mp4");
  const metadataPath = join(runDir, "media_metadata.json");

  if (!existsSync(runDir)) {
    throw new Error(`Run directory not found: ${runDir}`);
  }
  if (!existsSync(finalPath)) {
    throw new Error(`final.mp4 not found: ${finalPath}`);
  }

  const title = options.title ?? `VISU ${runId}`;
  const visibility = options.visibility ?? "private";

  // Placeholder: YouTube Data API v3 upload not implemented. When implemented:
  // - Use OAuth with REFRESH_TOKEN to get access token
  // - Resumable upload with quota tracking
  // - On 403 do not retry; on 5xx retry with backoff
  const payload: UploadMetadataPayload = {
    youtubeVideoId: "",
    uploadedAt: new Date().toISOString(),
    title,
    visibility,
  };

  if (!existsSync(metadataPath)) {
    writeFileSync(join(runDir, "upload_metadata.json"), JSON.stringify(payload, null, 2), "utf-8");
    throw new Error(
      "YouTube upload not implemented. Set VISU_YOUTUBE_* env and add googleapis dependency to enable."
    );
  }

  writeFileSync(join(runDir, "upload_metadata.json"), JSON.stringify(payload, null, 2), "utf-8");
  throw new Error(
    "YouTube upload not implemented. Set VISU_YOUTUBE_* env and add googleapis dependency to enable."
  );
}

export { DAILY_QUOTA_UNITS };
