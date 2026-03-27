import { describe, it, expect } from "vitest";
import { LocalPiperAdapter } from "../src/adapters/tts/local_piper_adapter.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RUN_TTS_INTEGRATION = process.env.RUN_TTS_INTEGRATION === "true";

// Env-gated integration test – only runs when RUN_TTS_INTEGRATION=true and Piper is installed.
const maybeDescribe = RUN_TTS_INTEGRATION ? describe : describe.skip;

maybeDescribe("LocalPiperAdapter (integration)", () => {
  it("synthesizes a WAV file via Piper", async () => {
    const adapter = new LocalPiperAdapter();
    const tmp = mkdtempSync(join(tmpdir(), "visu-tts-"));

    const result = await adapter.synthesize({
      text: "Test narration",
      runId: "integration-run",
      voice: "te",
      speechRate: 0.95,
      sampleRate: 48000,
      outputFormat: "wav",
      outputDir: tmp,
    });

    expect(result.audioPath).toBeDefined();
    expect(result.durationMs).toBeGreaterThan(0);
    expect(result.modelHash).toBeTruthy();
    if (result.synthesisDurationMs !== undefined) {
      expect(result.synthesisDurationMs).toBeGreaterThan(0);
    }
  });
});

