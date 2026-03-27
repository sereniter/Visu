export interface TTSRequest {
  text: string;
  runId: string;
  voice: string;
  speechRate: number;
  sampleRate: number;
  outputFormat: "wav";
  outputDir: string;
  /** If set, write WAV to this path (Mode C per-scene narration). Otherwise use outputDir/narration.wav. */
  outputPath?: string;
}

export interface TTSResponse {
  audioPath: string;
  durationMs: number;
  provider: string;
  voiceId: string;
  modelHash: string;
  engineVersion?: string;
   /** Wall-clock synthesis time in milliseconds (adapter-measured). */
  synthesisDurationMs?: number;
}

export interface ITTSAdapter {
  synthesize(request: TTSRequest): Promise<TTSResponse>;
}

