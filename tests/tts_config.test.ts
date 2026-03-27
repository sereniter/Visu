import { describe, it, expect } from "vitest";
import { getTTSConfig } from "../src/core/config.js";

describe("getTTSConfig", () => {
  it("returns TTS configuration with model paths", () => {
    const tts = getTTSConfig();
    expect(tts.provider).toBe("local_piper");
    expect(tts.outputFormat).toBe("wav");
    expect(typeof tts.modelPath).toBe("string");
    expect(typeof tts.modelConfigPath).toBe("string");
  });
});

