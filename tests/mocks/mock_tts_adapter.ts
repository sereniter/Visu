import type { ITTSAdapter, TTSRequest, TTSResponse } from "../../src/core/tts_interface.js";
import { join } from "node:path";

export class MockTTSAdapter implements ITTSAdapter {
  public lastRequest: TTSRequest | null = null;
  public responseOverrides: Partial<TTSResponse> = {};

  async synthesize(request: TTSRequest): Promise<TTSResponse> {
    this.lastRequest = request;

    const audioPath = join(request.outputDir, "mock_narration.wav");

    return {
      audioPath,
      durationMs: 1234,
      provider: "mock_tts",
      voiceId: request.voice,
      modelHash: "mock-hash",
      engineVersion: "mock-engine",
      ...this.responseOverrides,
    };
  }
}

