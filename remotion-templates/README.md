# Remotion Templates for VISU / AnukramAI

This package contains Remotion compositions used by VISU as a visual source:

- `AnukramAIIntro` — animated intro card for tutorials
- `AnukramAISummary` — animated closing summary card
- `SceneTitleCard` — step title overlay
- `ProgressOverlay` — step progress indicator overlay

## Usage

```bash
cd remotion-templates
npm install
npm run studio
```

This opens Remotion Studio so you can preview and tweak compositions.

## Post-install (determinism)

After `npm install`, generate the lock files required for VISU determinism (package-lock.sha256, CHROMIUM_VERSION.lock, CHROMIUM_BINARY.lock). See **docs/REMOTION_SETUP.md** §5 (Determinism lock files) for exact commands. The VISU adapter will not render until `CHROMIUM_BINARY.lock` is present and matches the bundled Chromium.

## Determinism

- All dependencies are **pinned** (no caret/tilde).
- `remotion.config.ts` is configured to match VISU's locked encoding profile:
  - `libx264`, CRF 18, preset `medium`
  - 1920×1080, 30fps, `yuv420p`
- Fonts are loaded via `@remotion/google-fonts` so renders work offline.

## Assets

Expected public assets:

- `public/anukramai-logo.png`
- `public/anukramai-logo-white.png`

These are not committed here; place your governed logo PNGs into `public/` before running renders.

