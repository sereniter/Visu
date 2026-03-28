# VISU — System-Wide Determinism Checklist

**Purpose:** Verify that execution is reproducible: same inputs → same outcome for artifact content that must be bit-identical (e.g. `final.mp4`).  
**Scope:** All three modes (A, B, C). Last run: post–Sprint 8 (multilingual).

---

## 1. Randomness & Identity

| Item | Status | Notes |
|------|--------|--------|
| **randomUUID / runId** | ✅ Acceptable | Used only for run identity (log path, artifact dir, `media_metadata.runId`). Does **not** affect `final.mp4` or other bit-critical content. |
| **Math.random()** | ✅ None | No use in `src/`. |
| **crypto.randomBytes** | ✅ None | No use in `src/`. |

**Verdict:** Randomness is confined to run identity and paths; media output is not seeded by RNG.

---

## 2. Time & Date

| Item | Status | Notes |
|------|--------|--------|
| **new Date() / Date.now()** | ✅ Acceptable | Used for: log `timestamp`, `media_metadata.generatedAt`, Piper `synthesisDurationMs` (adapter-only). None are inputs to FFmpeg encode or to `final.mp4` content. |
| **Timestamps in media output** | ✅ None | No timestamp or date is muxed into video/audio streams. |

**Verdict:** Time is used only for audit (logs, metadata); it does not affect bit-identical media.

---

## 3. Network & External Services

| Item | Status | Notes |
|------|--------|--------|
| **Runtime network calls** | ✅ None | No `fetch`, `axios`, or `http(s).request` in `src/`. |
| **Runtime AI inference** | ✅ None | Mode C uses pre-generated PNGs + Piper TTS (local); no SDXL or other inference at runtime. |

**Verdict:** No network or cloud dependency at runtime; no inference in the pipeline.

---

## 4. Execution Order & Concurrency

| Item | Status | Notes |
|------|--------|--------|
| **Scene / step order** | ✅ Deterministic | Mode C: strict `for (const scene of contract.scenes)` with `await` inside; no `Promise.all` over scenes. Timeline and WAV concat use same ordered arrays. |
| **Filesystem enumeration** | ✅ N/A | No `readdir`/`readdirSync` in `src/`; all inputs are contract- or config-driven paths. |
| **Object key iteration** | ✅ Stable | Metadata built from fixed assignment order; `JSON.stringify(result.data, null, 2)` on objects built in fixed order. |

**Verdict:** Execution order is deterministic; no unordered iteration over external state.

---

## 5. Subprocesses & Encoding

| Item | Status | Notes |
|------|--------|--------|
| **FFmpeg args** | ✅ Deterministic | Transcode and scene-clip args built from config + input paths only; no timestamps or runId. Locked profile (Sprint 6B) for scene clips. |
| **Piper TTS** | ✅ Functionally deterministic | Same text, same model, same speed → correct and consistent narration. **Not bit-identical** on CPU due to ONNX floating-point variance; applies to all four supported languages (en, hi, te, ta). |
| **Spawn options** | ✅ Deterministic | `spawn(ffmpegPath, args, { stdio: [...] })`; no env or cwd that varies per run in a way that affects output. |

**Verdict:** Encode and TTS inputs are deterministic; no non-determinism injected into subprocesses.

---

## 6. Configuration & Environment

| Item | Status | Notes |
|------|--------|--------|
| **Config source** | ✅ File-based | `config/shared.json` + optional `mode_{a,b,c}.json` (see docs/consumer/CONFIG_REFERENCE.md); legacy `config/default.json` if `shared.json` absent. No `process.env` in `src/` that feeds encode/TTS. |
| **Config hash** | ✅ Reproducible | `getConfigHash()` uses `JSON.stringify(getConfig())` on the **merged** config; same files + same CLI mode → same hash. |
| **Platform / hostname** | ✅ Not used | No `os.hostname()`, `os.platform()`, or `process.arch` in media path. |

**Verdict:** Configuration is stable and file-based; no host- or env-dependent media output.

---

## 7. Allowed Per-Run Variation (Audit Only)

These are **intended** to differ per run; they do not affect bit-identical media:

- **runId** — Run identifier (paths, `media_metadata.runId`).
- **Log timestamp** — Each log line `timestamp`.
- **media_metadata.generatedAt** — ISO run time.
- **metadataHash** — Hash of metadata JSON (includes `runId` and `generatedAt`).

**Verdict:** Audit fields are explicitly variable; `final.mp4` and its SHA256 are not.

---

## 8. Mode-Specific Guarantees (Sprint 8)

| Mode | Determinism guarantee |
|------|------------------------|
| **A (ui_flow)** | **Environment-sensitive** — deterministic only under controlled environment (pinned browser version, fixed OS configuration, CI). Not guaranteed across arbitrary machines or OS updates. |
| **B (recorded)** | **Binary-sensitive** — same video + same script + same TTS model + same FFmpeg binary → same `final.mp4`. Optional background music: same music file → same mix. |
| **C (generative)** | **Functionally deterministic** — same contract + same PNGs + same provenance + same Piper model + same FFmpeg binary → correct and consistent output. **Not bit-identical** when narration is generated at runtime (Piper ONNX CPU variance). SHA256 stability of `final.mp4` requires pre-generated governed WAV assets. Applies to all four supported languages (en, hi, te, ta). |

### Per-mode drift policy

| Mode | Drift rule |
|------|------------|
| **B (recorded)** | Narration duration ≤ video duration only. No 200 ms limit. Background music (when set) fills the gap after narration ends. |
| **C (generative)** | Per scene: narration ≤ video and gap ≤ 200 ms (drift rule unchanged). |

---

## 9. Checklist Summary

| Category | Result |
|----------|--------|
| Randomness | ✅ Isolated to run identity |
| Time/date | ✅ Audit only; not in media |
| Network / inference | ✅ None at runtime |
| Order / concurrency | ✅ Deterministic |
| Subprocesses / encoding | ✅ Deterministic inputs |
| Config / environment | ✅ Stable, file-based |
| Allowed variation | ✅ Documented (runId, timestamps) |

**Overall:** The system is aligned with the determinism policy. Media outputs that must be bit-identical (`final.mp4`, and by construction scene clips and narration WAVs from same inputs) do not depend on random, time, network, or host-specific inputs. Run identity and timestamps remain variable for audit and replay.

---

## 10. Renderer architecture (Sprint 13+)

For Remotion integration across Mode A (intro/summary/overlay), Mode B (optional wrap), and Mode C (remotion scenes), use the dedicated audit:

- **[DETERMINISM_RENDERER_AUDIT.md](./DETERMINISM_RENDERER_AUDIT.md)** — Timing authority, profile and stream parity, failure semantics, logging, and contract/component scope per mode. Re-run when changing renderer or timeline behaviour.

---

*Last updated: Sprint 10 patch (Mode B background music, per-mode drift policy). Sprint 8: Piper described as functionally deterministic, not bit-identical; applies to all four supported languages. Sprint 13: Renderer audit split to DETERMINISM_RENDERER_AUDIT.md. Re-run when adding new modes, subprocesses, or config sources.*
