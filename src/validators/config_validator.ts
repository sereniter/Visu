/**
 * Startup validation for content repository (Sprint 10). Hard fails if contentRoot, outputRoot,
 * or topic directory are missing or not directories.
 */

import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { getConfig } from "../core/config.js";

export function validateContentRoot(): void {
  const config = getConfig();
  const path = config.contentRoot;
  if (!existsSync(path)) {
    throw new Error(`contentRoot not found: ${path}`);
  }
  if (!statSync(path).isDirectory()) {
    throw new Error(`contentRoot is not a directory: ${path}`);
  }
}

export function validateOutputRoot(): void {
  const config = getConfig();
  const path = config.outputRoot;
  if (!existsSync(path)) {
    throw new Error(`outputRoot not found: ${path}`);
  }
  if (!statSync(path).isDirectory()) {
    throw new Error(`outputRoot is not a directory: ${path}`);
  }
}

export function validateTopicDir(topic: string): void {
  const config = getConfig();
  const path = join(config.contentRoot, topic);
  if (!existsSync(path)) {
    throw new Error(`Topic directory not found: ${path}`);
  }
  if (!statSync(path).isDirectory()) {
    throw new Error(`Topic path is not a directory: ${path}`);
  }
}
