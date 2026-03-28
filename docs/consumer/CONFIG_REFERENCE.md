# Configuration reference

Visu reads JSON from the **`config/`** directory at the Visu repo root (resolved from `process.cwd()` when you run `node dist/index.js`). Settings are **layered**: a shared baseline plus an optional **mode overlay** chosen by the CLI for engine runs.

---

## Files

| File | Role |
|------|------|
| **`shared.json`** | **Baseline** (required unless you use the legacy file below). Holds paths, encoding, TTS defaults, core `execution` fields, `remotion` base block, etc. |
| **`mode_a.json`** | **Mode A overlay** — merged when running `--mode ui_flow` or `--mode ui_flow_scenes`. Typical contents: `browser`, `screenCapture`, `remotion.useRemotionOverlays`, and other UI-recording-oriented overrides. |
| **`mode_b.json`** | **Mode B overlay** — merged when running `--mode recorded`. Typical contents: `execution.defaultBackgroundMusicPath` (default WAV when the script has no `music` field). |
| **`mode_c.json`** | **Mode C overlay** — merged when running `--mode generative`, `resume`, or `add-audio`. Add generative-only overrides here (may be `{}`). |
| **`languages.json`** | Voice registry and Piper model paths (unchanged). |
| **`fonts.json`**, **`grades.json`**, **`visual_styles.json`** | Mode C styling (unchanged). |

Merge is **deep**: nested objects (e.g. `execution`, `remotion`) are combined; overlay keys win.

---

## CLI and which overlay loads

| Command / mode | Active overlay |
|----------------|----------------|
| `--mode ui_flow` | `mode_a.json` |
| `--mode ui_flow_scenes` | `mode_a.json` |
| `--mode recorded` | `mode_b.json` |
| `--mode generative` | `mode_c.json` |
| `resume`, `add-audio` | `mode_c.json` |
| `--mode narrate` | **none** (shared only) |
| `audit`, `replay`, `upload`, `migrate-contract`, `parse-recording` | **none** (shared only) |

`getConfigHash()` reflects the **merged** result (shared + overlay for that run), so hashes differ by mode when overlays differ.

---

## Required and common fields

- **`contentRoot`**, **`outputRoot`**: absolute paths to the content repo (e.g. recipes) and output repo (e.g. menu_item). Both must exist when validated.
- **`execution`**: at least `actionTimeoutMs`, `videoDir`, `artifactsDir`, `viewport`.
- **`tts`**, **`encoding`**: as documented in the main README and technical spec.

Mode-specific keys may live only in a mode file (e.g. `defaultBackgroundMusicPath` in `mode_b.json`) as long as the merged JSON is complete for code paths that run.

---

## Legacy `default.json`

If **`shared.json` is missing** but **`default.json`** exists, Visu loads **`default.json` only** as a single monolithic config and **does not** merge `mode_*.json`. Prefer `shared.json` + `mode_*.json` for new setups.

---

## Tests and programmatic use

In tests, `setConfigForTest(...)` replaces the merged config in memory. `setConfigForTest(null)` clears the cache and resets the active mode overlay state so the next `getConfig()` reloads from disk (shared + overlay per `setActiveConfigMode`, if any).
