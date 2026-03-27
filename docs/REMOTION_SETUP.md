# Remotion Setup — Sprint 12

This document describes how to install and use the Remotion sub-package for VISU.

### 1. Install dependencies

```bash
cd /Users/play/Bhirav/Engines/Visu/remotion-templates
npm install
```

All versions in `package.json` are pinned; do not introduce caret (`^`) or tilde (`~`) ranges.

### 2. Verify Remotion Studio

```bash
cd /Users/play/Bhirav/Engines/Visu/remotion-templates
npm run studio
```

The entry point `src/index.ts` must call `registerRoot(RemotionRoot)` so Studio can load compositions; this is already done in this repo. This should open Remotion Studio in the browser and list:

- `AnukramAIIntro`
- `AnukramAISummary`
- `SceneTitleCard`
- `ProgressOverlay`

### 3. Provide logo assets

Place governed logo PNGs in `remotion-templates/public/`:

- `anukramai-logo.png`
- `anukramai-logo-white.png`

The VISU `RemotionAdapter` validates `logoPath` values against this directory and logs SHA256 hashes for determinism audits.

### 4. Config

`config/default.json` contains:

```json
"remotion": {
  "templatesRoot": "./remotion-templates",
  "accentColor": "#FF6B35",
  "enabled": true
}
```

Set `enabled` to `false` to fall back to the existing PNG-based intro/summary pattern (used in later sprints when wiring modes).

### 5. Determinism lock files

After `npm install` in `remotion-templates`, generate and commit these so CI and the adapter can enforce determinism:

**package-lock.sha256** (from repo root or from `remotion-templates`):

```bash
cd remotion-templates
npm install
# macOS:
shasum -a 256 package-lock.json | cut -d' ' -f1 > package-lock.sha256
# Linux:
# sha256sum package-lock.json | cut -d' ' -f1 > package-lock.sha256
```

**CHROMIUM_VERSION.lock** (from repo root):

```bash
node -e "const r=require('./remotion-templates/node_modules/@remotion/renderer'); console.log('chromium_version=' + (r.getChromiumVersion?.() ?? 'unknown'))" > remotion-templates/CHROMIUM_VERSION.lock
echo "recorded_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> remotion-templates/CHROMIUM_VERSION.lock
echo "remotion_version=$(node -e "console.log(require('./remotion-templates/package.json').dependencies?.remotion ?? 'unknown')")" >> remotion-templates/CHROMIUM_VERSION.lock
```

**CHROMIUM_BINARY.lock** (from repo root):

```bash
node scripts/record_chromium_hash.js
```

Commit `remotion-templates/package-lock.sha256`, `remotion-templates/CHROMIUM_VERSION.lock`, and `remotion-templates/CHROMIUM_BINARY.lock`. The adapter validates the Chromium binary against `CHROMIUM_BINARY.lock` before every render.

### 6. Manual verification

- Open Remotion Studio and confirm all four compositions appear and preview.
- Render intro for English, Hindi, and Telugu (see Sprint 12 plan §16 for exact `npx remotion render` commands and props).
- Run `ffprobe` on one output and confirm: codec libx264, 1920×1080, 30fps, duration ~5s.

### 7. Troubleshooting

- **Studio shows "Waiting for registerRoot() to get called"** — The entry point (`src/index.ts`) must call `registerRoot(RemotionRoot)` before any exports. See [remotion.dev/docs/register-root](https://www.remotion.dev/docs/register-root).
- **Config error: `setFfmpegOverrideFunction is not a function`** — Remotion 4 uses `Config.overrideFfmpegCommand()` instead of `Config.setFfmpegOverrideFunction()`. The repo is already using `overrideFfmpegCommand` in `remotion.config.ts`.

### 8. Related docs

- **[REMOTION_COMPOSITION_CONSTRAINTS.md](./REMOTION_COMPOSITION_CONSTRAINTS.md)** — Banned vs allowed patterns in compositions (determinism, no Math.random/Date/fetch), and pre-merge checklist.
- **[DETERMINISM_RENDERER_AUDIT.md](./DETERMINISM_RENDERER_AUDIT.md)** — Cross-mode renderer determinism checklist (timing authority, profile enforcement, failure semantics). Use when changing intro/summary/overlay/wrap or scene-level Remotion behaviour.
