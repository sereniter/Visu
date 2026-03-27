/**
 * Path resolution for content repository (Sprint 10). All input paths resolve relative to contentRoot;
 * output paths resolve to outputRoot/{topic}/{language}/.
 */

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getConfig } from "./config.js";

/**
 * Resolve a relative input path against contentRoot. Hard fails if resolved path does not exist.
 */
export function resolveContentPath(relativePath: string): string {
  const config = getConfig();
  const absolute = join(config.contentRoot, relativePath);
  if (!existsSync(absolute)) {
    throw new Error(`Content path does not exist: ${absolute}`);
  }
  return absolute;
}

/**
 * Resolve output directory for a topic and language. Creates directory if it does not exist.
 * Returns: outputRoot/{topic}/{language}/
 */
export function resolveOutputPath(topic: string, language: string): string {
  const config = getConfig();
  const dir = join(config.outputRoot, topic, language);
  mkdirSync(dir, { recursive: true });
  return dir;
}
