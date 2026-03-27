#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getChromiumExecutablePath() {
  const child = spawnSync("node", ["-e", "const {RenderInternals}=require('@remotion/renderer'); console.log(RenderInternals.getExecutablePath('compositor'))"], {
    cwd: join(__dirname, "..", "remotion-templates"),
    shell: false,
    encoding: "utf8",
  });
  if (child.status !== 0) {
    throw new Error(
      `Failed to resolve Remotion Chromium executablePath: ${child.stderr ?? ""}`,
    );
  }
  return child.stdout.trim();
}

function computeFileSha256(path) {
  const buf = readFileSync(path);
  return createHash("sha256").update(buf).digest("hex");
}

function main() {
  const templatesRoot = join(__dirname, "..", "remotion-templates");
  const chromiumPath = getChromiumExecutablePath();
  const sha256 = computeFileSha256(chromiumPath);
  const now = new Date().toISOString();
  const pkgPath = join(templatesRoot, "package.json");
  let remotionVersion = "unknown";
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    remotionVersion = pkg.dependencies?.remotion ?? "unknown";
  } catch {
    // ignore
  }

  const lockContents = [
    `sha256=${sha256}  ${chromiumPath}`,
    `recorded_at=${now}`,
    `remotion_version=${remotionVersion}`,
    "",
  ].join("\n");

  const lockPath = join(templatesRoot, "CHROMIUM_BINARY.lock");
  writeFileSync(lockPath, lockContents, "utf-8");
  // eslint-disable-next-line no-console
  console.log(`Wrote Chromium hash to ${lockPath}`);
}

main();

