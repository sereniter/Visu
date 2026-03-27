import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runParseRecording } from "../src/cli/parse_recording.js";

describe("parse_recording", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "visu-parse-rec-"));
  });

  afterEach(() => {
    try {
      rmSync(tmpDir, { recursive: true });
    } catch {
      // ignore
    }
  });

  it("produces v1.5 contract with correct scenes and steps from codegen with SCENE_END markers", () => {
    const inputPath = join(tmpDir, "recording.js");
    const templateMapPath = join(tmpDir, "template_map.json");
    const outputPath = join(tmpDir, "contract.json");
    const codegen = `
await page.goto('https://app.anukramai.com/login');
await page.fill('input#email', 'u@x.com');
await page.click('button.submit');
window.__VISU_SCENE_END__ = "s1_login";
await page.click('a.billing-link');
window.__VISU_SCENE_END__ = "s2_billing";
`;
    writeFileSync(inputPath, codegen, "utf-8");
    writeFileSync(
      templateMapPath,
      JSON.stringify({ s1_login: "login_en", s2_billing: "billing_en" }),
      "utf-8"
    );

    runParseRecording({
      inputPath,
      templateMapPath,
      outputPath,
      topic: "billing_flow",
      language: "en",
      voiceGender: "female",
      music: "music/bg.mp3",
      baseUrl: "https://app.anukramai.com",
    });

    expect(existsSync(outputPath)).toBe(true);
    const contract = JSON.parse(readFileSync(outputPath, "utf-8"));
    expect(contract.schema_version).toBe("1.5");
    expect(contract.mode).toBe("ui_flow_scenes");
    expect(contract.baseUrl).toBe("https://app.anukramai.com");
    expect(contract.video_id).toBe("billing_flow_en");
    expect(contract.scenes).toHaveLength(2);
    expect(contract.scenes[0].scene_id).toBe("s1_login");
    expect(contract.scenes[0].steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "navigate", url: "https://app.anukramai.com/login" }),
        expect.objectContaining({ action: "fill", selector: "input#email", value: "u@x.com" }),
        expect.objectContaining({ action: "click", selector: "button.submit" }),
        expect.objectContaining({ action: "done" }),
      ])
    );
    expect(contract.scenes[1].scene_id).toBe("s2_billing");
    expect(contract.scenes[1].steps.some((s: { action: string }) => s.action === "click")).toBe(true);
    expect(contract.intro.scene_id).toBe("s0_intro");
    expect(contract.summary.scene_id).toBe("s_summary");
  });

  it("produces single scene when no SCENE_END markers", () => {
    const inputPath = join(tmpDir, "recording.js");
    const templateMapPath = join(tmpDir, "template_map.json");
    const outputPath = join(tmpDir, "contract.json");
    writeFileSync(
      inputPath,
      "await page.goto('https://example.com');\nawait page.click('button');\n",
      "utf-8"
    );
    writeFileSync(templateMapPath, JSON.stringify({}), "utf-8");

    runParseRecording({
      inputPath,
      templateMapPath,
      outputPath,
      topic: "single",
      language: "en",
      voiceGender: "male",
      music: "music/bg.mp3",
      baseUrl: "https://example.com",
    });

    const contract = JSON.parse(readFileSync(outputPath, "utf-8"));
    expect(contract.scenes).toHaveLength(1);
    expect(contract.scenes[0].scene_id).toBe("s1_main");
    expect(contract.scenes[0].steps.filter((s: { action: string }) => s.action === "navigate").length).toBe(1);
    expect(contract.scenes[0].steps.filter((s: { action: string }) => s.action === "done").length).toBe(1);
  });

  it("throws when input file does not exist", () => {
    expect(() =>
      runParseRecording({
        inputPath: join(tmpDir, "missing.js"),
        templateMapPath: join(tmpDir, "map.json"),
        outputPath: join(tmpDir, "out.json"),
        topic: "t",
        language: "en",
        voiceGender: "female",
        music: "m.mp3",
        baseUrl: "https://example.com",
      })
    ).toThrow(/Input file not found/);
  });
});
