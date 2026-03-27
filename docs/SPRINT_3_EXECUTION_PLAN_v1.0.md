# SPRINT_3\_EXECUTION_PLAN_v1.0

Status: Ready for Execution Applies To: VISU -- Sprint 3 (Narration /
TTS Layer) Mode Scope: All Modes (A, B, C) -- Voice Subsystem Only Cost
Policy: Zero-cost implementation (Local TTS only) Integration: No video
merge in this sprint

------------------------------------------------------------------------

# 1. Sprint Objective

Build a deterministic, pluggable Text-to-Speech (TTS) subsystem that:

-   Uses a local CLI-based engine (Piper) for zero cost
-   Is vendor-agnostic via abstraction layer
-   Produces WAV output
-   Logs all relevant metadata
-   Is reusable by Mode A, B, and C
-   Does NOT integrate with video yet

------------------------------------------------------------------------

# 2. Architecture Overview

CLI (visu narrate) ↓ NarrationEngine ↓ ITTSAdapter (Core Interface) ↓
LocalPiperAdapter (Adapter Layer) ↓ Piper CLI ↓
artifacts/{runId}/narration.wav

------------------------------------------------------------------------

# 3. Deliverables

## 3.1 Core Interface

File: src/core/tts_interface.ts

Define:

-   TTSRequest
-   TTSResponse
-   ITTSAdapter

Core must NOT import any vendor or CLI-specific code.

------------------------------------------------------------------------

## 3.2 Config Extension

Update config/default.json:

{ "tts": { "provider": "local_piper", "defaultVoice": "te",
"speechRate": 0.95, "sampleRate": 48000, "outputFormat": "wav" } }

Add helper in src/core/config.ts: - getTTSConfig()

No hardcoded values.

------------------------------------------------------------------------

## 3.3 SSML Formatter

File: src/core/ssml_formatter.ts

Responsibilities:

-   Wrap text in `<speak>`{=html}
-   Apply `<prosody rate="...">`{=html}
-   Insert small pauses after punctuation
-   Return SSML string

Keep logic simple and deterministic.

------------------------------------------------------------------------

## 3.4 Local Piper Adapter

File: src/adapters/tts/local_piper_adapter.ts

Responsibilities:

-   Spawn Piper CLI using child_process.spawn
-   Accept plain text input
-   Generate WAV output
-   Store at artifacts/{runId}/narration.wav
-   Handle process exit codes
-   Throw error on failure
-   Return TTSResponse

Must log provider name as "local_piper".

------------------------------------------------------------------------

## 3.5 Narration Engine

File: src/engines/narration_engine.ts

Responsibilities:

-   Accept script text + runId
-   Convert to SSML (if required)
-   Select adapter based on config
-   Call adapter.synthesize()
-   Log:
    -   provider
    -   voiceId
    -   durationMs
    -   audioPath
    -   scriptHash
-   Return TTSResponse

No video logic allowed.

------------------------------------------------------------------------

## 3.6 CLI Extension

Extend src/index.ts

Add:

--mode narrate --script scripts/`<file>`{=html}.txt

Execution Flow:

1.  Load script file
2.  Create runId
3.  Create artifacts directory
4.  Call NarrationEngine
5.  Log result
6.  Exit

------------------------------------------------------------------------

# 4. Logging Requirements

Each narration run must log:

-   runId
-   scriptHash
-   tts_provider
-   voice_id
-   speech_rate
-   duration_ms
-   audio_path
-   experiment_enabled (default false)
-   variant_id (default 1)
-   seed (default fixed)

Logs must follow existing log schema conventions.

------------------------------------------------------------------------

# 5. Artifact Structure

artifacts/{runId}/ narration.wav metadata.json (optional enhancement)

Audio format: WAV Sample rate: 48000 Hz

------------------------------------------------------------------------

# 6. Determinism Rules

When experiment mode is disabled:

-   speechRate fixed
-   voice fixed
-   same script → same output
-   no random variation

All parameters must come from config.

------------------------------------------------------------------------

# 7. Testing Requirements

## 7.1 Unit Tests

-   SSML formatting
-   NarrationEngine with mock adapter
-   Config retrieval

## 7.2 Adapter Test

-   Spawn Piper (env-gated)
-   Confirm WAV file exists
-   Confirm duration \> 0

Use env flag:

RUN_TTS_INTEGRATION=true

------------------------------------------------------------------------

# 8. Exit Criteria

Sprint 3 is complete when:

-   `npm run build` passes
-   `npm test` passes
-   `npm run lint` passes
-   CLI command generates valid WAV
-   Logs contain full metadata
-   Determinism verified (same input → same hash/audio)

------------------------------------------------------------------------

# 9. Explicitly Out of Scope

-   No FFmpeg
-   No audio-video merge
-   No music
-   No emotional voice variation
-   No experiment mode activation
-   No Mode A integration

------------------------------------------------------------------------

# 10. Future Extensions (Not in Sprint 3)

-   Google TTS adapter
-   Azure TTS adapter
-   ElevenLabs adapter
-   VoiceProfile system
-   Emotional modulation
-   Batch narration
-   Media composition integration

------------------------------------------------------------------------

SPRINT_3\_EXECUTION_PLAN_v1.0 is locked.
