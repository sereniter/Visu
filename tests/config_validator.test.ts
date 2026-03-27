import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getConfig, setConfigForTest } from "../src/core/config.js";
import {
  validateContentRoot,
  validateOutputRoot,
  validateTopicDir,
} from "../src/validators/config_validator.js";

describe("config_validator", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "visu-config-val-"));
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

  it("validateContentRoot throws when contentRoot does not exist", () => {
    setConfigForTest({ ...getConfig(), contentRoot: join(tmpRoot, "nonexistent") });
    expect(() => validateContentRoot()).toThrow(/contentRoot not found/);
  });

  it("validateOutputRoot throws when outputRoot does not exist", () => {
    setConfigForTest({ ...getConfig(), outputRoot: join(tmpRoot, "nonexistent") });
    expect(() => validateOutputRoot()).toThrow(/outputRoot not found/);
  });

  it("validateTopicDir throws when topic directory does not exist", () => {
    expect(() => validateTopicDir("missing_topic")).toThrow(/Topic directory not found/);
  });

  it("validateContentRoot and validateOutputRoot pass when dirs exist", () => {
    expect(() => validateContentRoot()).not.toThrow();
    expect(() => validateOutputRoot()).not.toThrow();
  });

  it("validateTopicDir passes when topic dir exists", () => {
    mkdirSync(join(getConfig().contentRoot, "login_flow"), { recursive: true });
    expect(() => validateTopicDir("login_flow")).not.toThrow();
  });
});
