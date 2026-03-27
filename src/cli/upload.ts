/**
 * Upload CLI (Sprint 7). Uploads artifacts/{runId}/final.mp4 to YouTube.
 * Fails at boot if credentials absent.
 */

import { uploadRun, validateUploadCredentials } from "../engines/upload_engine.js";

export async function runUpload(
  runId: string,
  options: { title?: string; visibility?: "public" | "unlisted" | "private" }
): Promise<{ exitCode: 0 | 1 | 2 }> {
  try {
    validateUploadCredentials();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    return { exitCode: 2 };
  }

  try {
    await uploadRun(runId, options);
    return { exitCode: 0 };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    return { exitCode: 1 };
  }
}
