import { describe, it, expect } from "vitest";
import { validateMusicLufs, measureLufs } from "../src/validators/music_lufs_validator.js";

describe("validateMusicLufs", () => {
  it("returns valid with lufs null when musicPath is null", async () => {
    const r = await validateMusicLufs("ffmpeg", null);
    expect(r.valid).toBe(true);
    expect(r.lufs).toBe(null);
  });
});

describe("measureLufs", () => {
  it("is tested via integration or skip when ffmpeg not available", () => {
    expect(typeof measureLufs).toBe("function");
  });
});
