import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getConfig, setConfigForTest } from "../src/core/config.js";
import { resolveContentPath, resolveOutputPath } from "../src/core/path_resolver.js";

describe("path_resolver", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "visu-path-"));
    const config = getConfig();
    setConfigForTest({
      ...config,
      contentRoot: join(tmpRoot, "recipes"),
      outputRoot: join(tmpRoot, "menu_item"),
    });
    mkdirSync(join(tmpRoot, "recipes"), { recursive: true });
    mkdirSync(join(tmpRoot, "menu_item"), { recursive: true });
  });

  afterEach(() => {
    setConfigForTest(null);
    try {
      rmSync(tmpRoot, { recursive: true });
    } catch {
      // ignore
    }
  });

  it("resolveContentPath returns absolute path when file exists", () => {
    const contentRoot = getConfig().contentRoot;
    const relPath = "topic/recording.mov";
    const absPath = join(contentRoot, relPath);
    mkdirSync(join(contentRoot, "topic"), { recursive: true });
    writeFileSync(absPath, "x");
    const result = resolveContentPath(relPath);
    expect(result).toBe(absPath);
    expect(existsSync(result)).toBe(true);
  });

  it("resolveContentPath throws when path does not exist", () => {
    expect(() => resolveContentPath("nonexistent_topic_xyz/file.mov")).toThrow(/does not exist/);
  });

  it("resolveOutputPath creates directory and returns path", () => {
    const outputRoot = getConfig().outputRoot;
    const dir = resolveOutputPath("login_flow", "en");
    expect(dir).toBe(join(outputRoot, "login_flow", "en"));
    expect(existsSync(dir)).toBe(true);
  });
});
