import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateVisualAsset } from "../src/validators/visual_asset_validator.js";
import { probeImageDimensions } from "../src/adapters/ffmpeg_adapter.js";

const FIXTURE_REL = "tests/fixtures/mode_c_governed/test_12345_1.0.png";
const resolveFromCwd = (p: string) => join(process.cwd(), p);

vi.mock("../src/adapters/ffmpeg_adapter.js", () => ({
  probeImageDimensions: vi.fn().mockResolvedValue({ width: 1920, height: 1080 }),
}));

describe("validateVisualAsset", () => {
  it("returns valid when PNG and provenance exist, hash matches, dimensions 1920x1080 (mocked)", async () => {
    const result = await validateVisualAsset(FIXTURE_REL, "ffprobe", resolveFromCwd);
    expect(result.valid).toBe(true);
  });

  it("returns error when PNG is missing", async () => {
    const result = await validateVisualAsset(join(tmpdir(), "nonexistent.png"), "ffprobe");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/not found|PNG/);
  });

  it("returns error when provenance sidecar is missing", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "vis-"));
    const png = join(tmp, "only.png");
    writeFileSync(png, "not a real png");
    const result = await validateVisualAsset(png, "ffprobe", (p) => p);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Provenance|sidecar/);
  });

  it("returns error when output_hash does not match PNG SHA256", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "vis-"));
    const png = join(tmp, "x.png");
    writeFileSync(png, "content");
    const sidecar = join(tmp, "x.provenance.json");
    writeFileSync(
      sidecar,
      JSON.stringify({
        prompt_key: "k",
        prompt_text_hash: "h",
        model: "m",
        model_version: "1.0",
        model_file_hash: "f",
        seed: 1,
        sampler: "DDIM",
        steps: 30,
        resolution: "1920x1080",
        torch_version: "1",
        diffusers_version: "1",
        generated_at: new Date().toISOString(),
        output_hash: "wronghash",
      }),
      "utf-8"
    );
    const result = await validateVisualAsset(png, "ffprobe", (p) => p);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/output_hash|SHA256|match/);
  });

  it("returns error when PNG dimensions are not 1920x1080", async () => {
    vi.mocked(probeImageDimensions).mockResolvedValueOnce({ width: 800, height: 600 });
    const result = await validateVisualAsset(FIXTURE_REL, "ffprobe", resolveFromCwd);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/1920x1080|dimensions/);
  });
});
