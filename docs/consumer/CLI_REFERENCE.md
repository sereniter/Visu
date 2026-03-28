# CLI Reference

Every command Bhairav or OpenClaw will call. Precise and complete; no internals.

**Invocation:** Run from the Visu repo root: `node dist/index.js <command> [args]`. **Configuration:** VISU loads **`config/shared.json`** and merges **`config/mode_a.json`**, **`mode_b.json`**, or **`mode_c.json`** depending on the command (see [CONFIG_REFERENCE.md](./CONFIG_REFERENCE.md)). Required fields include **contentRoot** and **outputRoot** (absolute paths to the content repository and output repository). Both must exist at startup when those validators run. For **Mode B** default background music when the script has no `music` field, set **execution.defaultBackgroundMusicPath** in **`mode_b.json`** (absolute path to a WAV); if set and the file exists, it is looped/trimmed to the video duration and mixed under narration for the full video (music continues after narration ends). Omit or leave empty for narration-only.

---

## Main run (modes)

Runs the pipeline in one of the supported modes.

```bash
node dist/index.js --mode <mode> [mode-specific flags] [options]
```

### Modes

| Mode | Required flags | Description |
|------|----------------|-------------|
| `ui_flow` | `--flow <path>` | Run a UI flow (Mode A). Path to flow JSON. |
| `ui_flow_scenes` | `--contract <path>` | Scene-driven Mode A: v1.5 contract → intro + recorded scenes + summary → final.mp4. Path relative to contentRoot. |
| `recorded` | `--topic <topic>` `--video <path>` `--script <path>` | Merge narration with existing video (Mode B). Paths relative to contentRoot/{topic}/ and contentRoot/{topic}/scripts/. |
| `generative` | `--contract <path>` | Run Mode C: scene contract (v1.4) → auto-tune (Phase 1) → Remotion render + AV merge (Phase 2) → final.mp4. Path relative to contentRoot. No separate auto-tune flag; always on. |

### Options

| Option | Description |
|--------|-------------|
| `--strict-determinism` | After a successful run, run an audit and exit non-zero if determinism checks fail (e.g. FFmpeg fingerprint mismatch). |
| `--expected-ffmpeg-fingerprint <hash>` | Override the expected FFmpeg binary fingerprint for the audit (used with `--strict-determinism` or `visu audit`). |

Mode B background music is controlled by the script `music` field (path relative to contentRoot/{topic}/) or by **`config/mode_b.json`** → `execution.defaultBackgroundMusicPath` when the script has no music; the track fills the full video (no silence after narration). See Contract Authoring Guide.

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success. |
| 1 | Pipeline failure (e.g. drift violation, merge failure). |
| 2 | Configuration or input error (e.g. missing --flow, invalid contract). |

### Examples

```bash
node dist/index.js --mode ui_flow --flow flows/onboarding.json
node dist/index.js --mode ui_flow_scenes --contract recipes/billing_flow/contracts/billing_flow_en.json
node dist/index.js --mode recorded --topic login_flow --video recording.mov --script login_flow_en.json
node dist/index.js --mode generative --contract login_flow/contract.json
node dist/index.js --mode generative --contract contract.json --strict-determinism
```

---

## visu audit

Verifies artifact integrity for a completed run (determinism and consistency).

```bash
node dist/index.js audit --runId <id>
```

### Options

| Option | Description |
|--------|-------------|
| `--expected-ffmpeg-fingerprint <hash>` | Override expected FFmpeg fingerprint; used to detect environment drift. |

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | PASS. |
| 1 | FAIL (determinism mismatch). |
| 2 | Error (invalid runId, missing files). |

### Output

JSON audit report to stdout.

---

## visu replay

Checks that all artifacts for a run exist and reports environment drift. Does not re-run the pipeline.

```bash
node dist/index.js replay --runId <id>
```

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | All artifacts present. |
| 1 | Missing or corrupt artifacts. |
| 2 | Error (e.g. invalid runId). |

### Output

JSON report to stdout.

---

## visu upload

Uploads `final.mp4` for the given run to YouTube.

```bash
node dist/index.js upload --runId <id> [options]
```

### Options

| Option | Description |
|--------|-------------|
| `--title <string>` | Video title (default: `VISU <runId>`). |
| `--visibility <public|unlisted|private>` | Default: `private`. |

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | Upload successful. |
| 1 | Upload failed. |
| 2 | Credential or configuration error. |

### Environment variables (required for upload)

Set these in the environment before calling `visu upload`:

| Variable | Description |
|----------|-------------|
| `VISU_YOUTUBE_CLIENT_ID` | OAuth client ID. |
| `VISU_YOUTUBE_CLIENT_SECRET` | OAuth client secret. |
| `VISU_YOUTUBE_REFRESH_TOKEN` | Refresh token for uploads. |

See your deployment or ENVIRONMENT documentation for how to obtain these.

---

## visu migrate-contract

Migrates a scene contract to the current schema version.

```bash
node dist/index.js migrate-contract --input <path> --output <path>
```

- Fails if the output file already exists.
- Input/output paths are files (e.g. `contract_v1.2.json` → `contract_v1.3.json`).

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | Migration successful (or completed with warnings). |
| 1 | Migration failed or error (e.g. missing args, invalid input). |

### Output

JSON migration report to stdout (`status`, `fromVersion`, `toVersion`, `scenesModified`, `warnings`).

---

## parse-recording

Converts Playwright codegen output into a v1.5 scene contract for **scene-driven Mode A** (`ui_flow_scenes`).

```bash
node dist/index.js parse-recording \
  --input <path> \
  --template-map <path> \
  --output <path> \
  --topic <topic> \
  --language <code> \
  --voice-gender male|female \
  --music <path> \
  --base-url <url>
```

### Required options

| Option | Description |
|--------|-------------|
| `--input` | Path to the codegen JS file (from `npx playwright codegen`). |
| `--template-map` | Path to a JSON file mapping scene IDs to script template keys (e.g. `{"s1_login": "billing_login_en"}`). |
| `--output` | Path where the v1.5 contract JSON will be written. |
| `--topic` | Topic identifier (e.g. `billing_flow`). |
| `--language` | Language code (e.g. `en`). |
| `--voice-gender` | `male` or `female`. |
| `--music` | Path to background music (relative to topic), e.g. `music/bg_track.mp3`. |
| `--base-url` | Base URL for the app (navigate steps with relative URLs are resolved against this). |

### Optional options

| Option | Description |
|--------|-------------|
| `--intro-template-key` | Script template key for intro narration (default: `{topic}_intro_{language}`). |
| `--summary-template-key` | Script template key for summary narration (default: `{topic}_summary_{language}`). |
| `--intro-asset` | Intro PNG path (default: `visuals/{topic}_intro_12345_1.0.png`). |
| `--summary-asset` | Summary PNG path (default: `visuals/{topic}_summary_12345_1.0.png`). |

### Behaviour

- Splits the codegen file at `window.__VISU_SCENE_END__ = "scene_id"` markers to define scene boundaries.
- Converts `page.goto`, `page.click`, `page.fill`, `page.waitForSelector`, `page.screenshot` to contract steps; adds `{ "action": "done" }` at the end of each scene.
- Uses the template map to set `narration.text_template_key` per scene.
- Writes a full v1.5 contract with intro, summary, recording_enhancements, post_production, and scenes. Add narration templates to `{contentRoot}/{topic}/scripts/script_templates.json` (or repo `scripts/script_templates.json` as fallback), place intro/summary PNGs in `recipes/{topic}/visuals/`, and run `visu run --mode ui_flow_scenes --contract <output>`.

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | Contract written successfully. |
| 1 | Error (missing file, invalid input). |
| 2 | Missing required option. |
