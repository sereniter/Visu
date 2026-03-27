# VISU -- PRD_v1.0

Status: Frozen (Pending CEO Confirmation) Owner: VISU Core Architecture
Language Scope: Telugu (te) Version: 1.0

------------------------------------------------------------------------

# 1. Product Name

VISU -- Viṣaya Sraṣṭā

------------------------------------------------------------------------

# 2. Problem Statement

Manual onboarding and educational video creation is:

-   Slow
-   Inconsistent
-   Non-reproducible
-   Dependent on human effort

We require a deterministic engine capable of generating structured
videos from:

1.  Automated UI flows
2.  Recorded screen sessions
3.  Generative AI scene definitions

------------------------------------------------------------------------

# 3. Objective

Build a deterministic media production engine that converts structured
inputs into publish-ready YouTube videos.

VISU contains no strategic logic and no KPI awareness.

------------------------------------------------------------------------

# 4. Language Scope

Single language for Phase 1:

Telugu (te)

All scripts, TTS, and narration must be Telugu.

------------------------------------------------------------------------

# 5. Non-Goals

-   No strategy logic
-   No KPI optimization
-   No OpenClaw integration
-   No multi-language support
-   No self-improvement
-   No analytics-driven adaptation

------------------------------------------------------------------------

# 6. Functional Requirements

## 6.1 Input Modes

### Mode A -- Automated UI Flow

-   Execute predefined Playwright flow
-   Capture screen (1920×1080 WebM to **artifacts/{runId}/raw.webm**)
-   Write **artifacts/{runId}/metadata.json** (flowId, flowVersion, playwrightVersion, nodeVersion, configHash, videoPath, generatedAt) for traceability, A/B experiments, and debugging
-   Generate structured Telugu script
-   Generate Telugu TTS
-   Merge via FFmpeg
-   Export MP4

### Mode B -- Recorded Session

-   Accept input MP4
-   Generate Telugu narration
-   Sync narration with recording
-   Render final MP4

### Mode C -- Generative AI Scene

-   Accept structured scene definition JSON
-   Generate visuals deterministically
-   Generate Telugu narration
-   Merge and render final video

------------------------------------------------------------------------

# 6.2 Generative Scene Schema Governance

## 6.2.1 Ownership

Scene Definition Schema is owned by VISU Core Architecture.

Schema updates require: - Version bump - CHANGE_LOG entry - JSON Schema
update

------------------------------------------------------------------------

## 6.2.2 Mandatory JSON Schema Validation

Path: /schemas/scene_schema_v1.json

Validation engine: - AJV (strict mode) - additionalProperties: false

Execution aborts on validation failure.

------------------------------------------------------------------------

## 6.2.3 Root Structure

{ "schema_version": "1.0", "video_id": "string", "language": "te",
"resolution": "1920x1080", "fps": 30, "scenes": \[\] }

------------------------------------------------------------------------

## 6.2.4 Scene Object

{ "scene_id": "string", "duration_sec": 8, "visual": {}, "narration":
{}, "transition": {} }

------------------------------------------------------------------------

## 6.2.5 Visual Object (Deterministic)

{ "type": "generated_image", "model": "stable-diffusion-xl",
"model_version": "1.0", "seed": 12345, "prompt_key":
"invoice_dashboard_intro" }

Rules: - No raw prompt text allowed - prompt_key must exist in
/prompts/prompt_library.json - seed mandatory - model_version mandatory

------------------------------------------------------------------------

## 6.2.6 Prompt Library

Path: /prompts/prompt_library.json

Structure: { "invoice_dashboard_intro": { "prompt": "...",
"negative_prompt": "...", "approved": true } }

Only approved prompts allowed.

------------------------------------------------------------------------

## 6.2.7 Narration Object

{ "text_template_key": "intro_invoice_creation", "voice":
"telugu_female_01", "speed": 1.0 }

Rules: - Template must exist in /scripts/script_templates.json - Voice
must be approved - Narration length must fit duration_sec

------------------------------------------------------------------------

## 6.2.8 Determinism Requirements

-   Fixed seed
-   Locked model version
-   Versioned prompt library
-   No runtime prompt injection
-   Idempotent rendering

Identical input must produce identical output.

------------------------------------------------------------------------

## 6.2.9 Runtime Validation Pipeline

Before render:

1.  JSON schema validation (AJV)
2.  Prompt key existence check
3.  Script template existence check
4.  Duration validation
5.  Voice validation
6.  Model compatibility validation

Failure at any step results in hard stop.

------------------------------------------------------------------------

# 7. Non-Functional Requirements

-   Deterministic
-   Reproducible
-   Replayable logs
-   Strict flow versioning
-   Idempotent runs
-   Clear failure states

------------------------------------------------------------------------

# 8. Constraints

-   Single language: Telugu
-   Single YouTube channel
-   No cloud scaling initially
-   No parallel execution initially

------------------------------------------------------------------------

# 9. Success Criteria

-   ≥ 95% successful generation rate
-   \< 20 min full pipeline runtime
-   Fully automated execution
-   Logs sufficient for replay
-   Identical output for identical input

------------------------------------------------------------------------

# 10. Risk Profile

  Risk                      Severity
  ------------------------- ----------
  UI automation flakiness   Medium
  FFmpeg sync issues        Medium
  Generative instability    Medium
  Scope creep               High

Overall Risk: Medium

------------------------------------------------------------------------

# PRD Freeze Note

Upon CEO confirmation, this document becomes:

VISU_PRD_v1.0 (Frozen)
