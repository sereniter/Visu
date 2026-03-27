# VISU — Cross-Mode Renderer Determinism Audit Checklist

**Purpose:** Formally freeze the Remotion/renderer architecture across Mode A, Mode B, and Mode C. Use this checklist to verify single timing authority, profile enforcement, and failure semantics before changing renderer or timeline behaviour.

**Scope:** Intro/summary, overlays, wrap, and scene-level Remotion integration. Complements [DETERMINISM_CHECKLIST.md](./DETERMINISM_CHECKLIST.md) (system-wide randomness, time, config).

**Last updated:** Post–Sprint 13 (Remotion integration across all three modes).

---

## 1. Timing Authority (Single Source of Truth)

| Item | Mode | Check |
|------|------|--------|
| Intro/summary duration | A | From rendered clip or fixed frames (e.g. TITLE_CARD_FRAMES); no contract-driven duration for overlays. |
| Overlay / scene clip duration | A | Per-scene clip duration from actual clip; overlay duration matches scene frames. |
| Wrap intro/summary | B | Intro/summary duration from Remotion-rendered clip only; merged segment from normalized + AV merge. |
| Governed_image scene | C | Duration from PNG→clip pipeline (existing). |
| Remotion scene | C | **No** `durationSec` (or equivalent) in contract; duration from rendered clip only. |

**Verdict:** No dual timing authority; timeline duration = sum of actual clip durations.

---

## 2. Profile and Stream Validation

| Item | Mode | Check |
|------|------|--------|
| Remotion outputs | A, B, C | All Remotion outputs validated with `validateRemotionProbe` (or equivalent) before use (intro/summary/overlay/wrap/scene). |
| Input normalization | B | External recorded input normalized to locked profile before merge and wrap. |
| Stream parity before concat | A | Overlay composite and title card validated; concat demuxer only after parity. |
| Stream parity before concat | C | All scene clips (governed_image + remotion) checked for codec, size, pix_fmt, fps; `MODE_C_STREAM_PROFILE_MISMATCH` on mismatch. |
| Optional parity tightening | C | Consider also comparing profile, time_base, color_space, color_range when extending ffprobe. |

**Verdict:** Profile locking and stream parity enforced; no silent demuxer or re-encode drift.

---

## 3. Failure and Config Semantics

| Item | Check |
|------|--------|
| Contract requests Remotion, config disabled | Hard fail with `REMOTION_DISABLED_IN_CONFIG`; no silent fallback to PNG/drawtext. |
| Overlay failure (Mode A) | `REMOTION_OVERLAY_FAILED`; run aborted. |
| Wrap failure (Mode B) | `REMOTION_WRAP_*` / `REMOTION_WRAP_CONCAT_FAILED`; run aborted. |
| Scene render failure (Mode C) | `REMOTION_SCENE_RENDER_FAILED`; run aborted. |
| Unknown scene type (Mode C) | `MODE_C_UNKNOWN_SCENE_TYPE` when `visual.type` is neither `governed_image` nor `remotion`. |
| Stream mismatch | Mode-specific: `REMOTION_WRAP_PROFILE_MISMATCH` (B), `MODE_C_STREAM_PROFILE_MISMATCH` (C). |

**Verdict:** Mode-scoped error codes; no cross-mode ambiguity; no silent fallbacks.

---

## 4. Logging and Audit

| Item | Check |
|------|--------|
| Mode A | Renderer selection logged (`ui_flow_scenes_renderer_selection`); per-scene overlay pipeline logged (`mode_a_scene_overlay_pipeline` or equivalent). |
| Mode B | `recorded_renderer_selection` with introRenderer, summaryRenderer, wrapConfigured, normalized. |
| Mode C | `mode_c_scene_router` per scene with index, type, component (if remotion), renderer; for remotion scenes: renderedDurationFrames, renderedDurationSec, fps. |

**Verdict:** Runs are auditable; renderer choice and clip duration are logged.

---

## 5. Contract and Component Scope

| Mode | Contract / schema | Component enum scope |
|------|-------------------|----------------------|
| A | v1.6; optional renderer, `useRemotionOverlays` | Intro/summary + SceneTitleCard, ProgressOverlay (overlays). |
| B | Optional wrap contract (v1.1); `--wrap-contract` | IntroCard, SummaryCard only (no scene-level). |
| C | v1.4 oneOf (governed_image \| remotion) | Remotion scene: **SceneTitleCard** only (no IntroCard/SummaryCard/ProgressOverlay). |

**Verdict:** Enum-gated components; no free-string composition IDs; contract discipline per mode.

---

## 6. Summary Table

| Mode | Timing authority | Renderer surface | Profile enforcement | Determinism |
|------|-------------------|-------------------|---------------------|-------------|
| A | Rendered clip | Intro / summary / overlay | Strict (ffprobe + concat parity) | Strong |
| B | Normalized + rendered clip | Optional wrap | Strict (normalize then concat) | Strong |
| C | Rendered clip | Scene-level remotion | Strict (stream parity + probe) | Strong |

---

## 7. References

- [REMOTION_SETUP.md](./REMOTION_SETUP.md) — Install, Studio, config, determinism lock files.
- [REMOTION_BENCHMARK.md](./REMOTION_BENCHMARK.md) — Render times, SLA, overlay green-light.
- [DETERMINISM_CHECKLIST.md](./DETERMINISM_CHECKLIST.md) — System-wide randomness, time, config, mode guarantees.
- [consumer/ERROR_REFERENCE.md](./consumer/ERROR_REFERENCE.md) — Error codes (REMOTION_*, MODE_C_*).

---

*Re-run this audit when adding new compositions, new scene types, or changing timeline/concat semantics.*
