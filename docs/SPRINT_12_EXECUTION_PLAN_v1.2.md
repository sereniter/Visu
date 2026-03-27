# SPRINT_12_EXECUTION_PLAN_v1.2

**Status:** Draft — v1.2 Hardened
**Review:** Architecture gate review v2 applied — conditionally approved pending five refinements (all addressed in this version)  
**Applies To:** VISU — Remotion Foundation Setup  
**Owner:** VISU Core Architecture  
**Prerequisites:** Sprint 11 complete  
**Scope:** Remotion package setup, RemotionAdapter, AnukramAI intro component, font handling, render pipeline — no mode changes yet

---

## 1. Objective

Establish Remotion as a properly integrated visual source in VISU. After this sprint:

- Remotion renders MP4 clips that match VISU's locked encoding profile exactly
- A branded AnukramAI intro component works in English, Hindi, and Telugu
- `RemotionAdapter` bridges VISU engine and Remotion CLI cleanly
- The foundation is in place for all three modes to use Remotion scenes

No mode wiring in this sprint. Foundation only. Mode integration follows in Sprint 13.
---

## 1A. Strategic Decision — Locked

> **VISU is a deterministic infrastructure engine.** Remotion is a rendering subsystem that must conform to VISU's determinism standard — not the other way around. This sprint does not change VISU's north star: identical input → identical output.

Remotion introduces a second rendering runtime. It is treated as a core architecture addition, not a cosmetic enhancement. All determinism guarantees that apply to FFmpeg apply equally to Remotion.

---


## 2. Repository Structure

### Sub-package inside VISU — Option A (confirmed)

VISU is a solo project at `/Users/play/Bhirav/Engines/Visu`. Remotion templates live inside VISU as a sub-package with its own `package.json`. One project, one repo, one `npm install` location.

```
/Users/play/Bhirav/Engines/Visu/     ← VISU root (solo project)
  src/                               ← existing VISU engine source
  config/
  schemas/
  assets/
    sounds/
  docs/
  tests/
  dist/
  package.json                       ← VISU root package
  tsconfig.json
  remotion-templates/                ← NEW: sub-package inside VISU
    src/
      compositions/
        AnukramAIIntro.tsx           ← first component
        AnukramAISummary.tsx         ← closing scene component
        SceneTitleCard.tsx           ← step title overlay
        ProgressOverlay.tsx          ← progress indicator overlay
      Root.tsx                       ← Remotion root — registers all compositions
      fonts.ts                       ← font loading per language
      index.ts                       ← entry: registerRoot(RemotionRoot); exports compositions
    public/
      anukramai-logo.png             ← brand asset
      anukramai-logo-white.png
    remotion.config.ts               ← Remotion config with locked encoding profile
    package.json                     ← own package.json — independent install
    tsconfig.json
    README.md

/Users/play/Documents/               ← content root (unchanged)
  recipes/
  menu_item/
```

**Install:**
```bash
cd /Users/play/Bhirav/Engines/Visu/remotion-templates
npm install
```

VISU engine references it via relative path in config. No workspace or monorepo setup needed. Folder boundary preserves the separation between engine and templates.

---

## 3A. Remotion Determinism Hardening

This section is **mandatory**. Remotion must conform to VISU's determinism standard.

### 3A.1 Exact Version Locking

No caret or tilde versions anywhere in `remotion-templates/package.json`. All versions pinned exactly. See section 11.

After install, generate a lockfile hash and commit it:

```bash
cd remotion-templates
npm install
sha256sum package-lock.json > package-lock.sha256
```

`package-lock.sha256` committed to repo. CI validates this hash before every render.

### 3A.2 Chromium Version Recording

Remotion bundles its own Chromium. Record the bundled Chromium version on first install:

```bash
cd remotion-templates
node -e "const r = require('@remotion/renderer'); console.log(r.getChromiumVersion?.() ?? 'unknown')"
```

Write result to `remotion-templates/CHROMIUM_VERSION.lock`:

```
chromium_version=112.0.5615.29
recorded_at=2025-01-01T00:00:00Z
remotion_version=4.0.0
```

This file is committed and validated before every render. If Chromium version changes after an `npm install`, the validator hard fails.

### 3A.3 Concurrency Policy

```
--concurrency 1   REQUIRED for all production renders
--concurrency 2+  PROHIBITED in production — introduces non-deterministic frame ordering
```

`RemotionAdapter` always passes `--concurrency 1` explicitly. No config override permitted for production mode. A `--benchmark` flag may use `--concurrency 2` for performance measurement only.

### 3A.4 Props Schema Governance

Remotion props are not arbitrary JSON. Each composition has a locked JSON schema:

**File:** `schemas/remotion_props_schema_v1.json`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema",
  "type": "object",
  "definitions": {
    "AnukramAIIntroProps": {
      "type": "object",
      "required": ["title", "subtitle", "language", "stepCount", "durationSec", "accentColor"],
      "additionalProperties": false,
      "properties": {
        "title":       { "type": "string", "minLength": 1 },
        "subtitle":    { "type": "string", "minLength": 1 },
        "language":    { "type": "string", "enum": ["en", "hi", "te", "ta"] },
        "stepCount":   { "type": "integer", "minimum": 1, "maximum": 20 },
        "durationSec": { "type": "number", "minimum": 1, "maximum": 30 },
        "accentColor": { "type": "string", "pattern": "^#[0-9A-Fa-f]{6}$" },
        "logoPath":    { "type": "string" }
      }
    },
    "AnukramAISummaryProps": {
      "type": "object",
      "required": ["title", "subtitle", "language", "completedSteps", "accentColor"],
      "additionalProperties": false,
      "properties": {
        "title":          { "type": "string", "minLength": 1 },
        "subtitle":       { "type": "string", "minLength": 1 },
        "language":       { "type": "string", "enum": ["en", "hi", "te", "ta"] },
        "completedSteps": { "type": "array", "items": { "type": "string" }, "minItems": 1 },
        "accentColor":    { "type": "string", "pattern": "^#[0-9A-Fa-f]{6}$" }
      }
    }
  }
}
```

`RemotionAdapter.render()` validates props against schema before spawning any process. Invalid props → `REMOTION_PROPS_INVALID` hard stop. No render attempted.

### 3A.5 Output SHA256 Capture

Every Remotion render hashes the output immediately:

```typescript
const outputHash = sha256File(outputPath);
log.info({
  event: 'remotion_render_complete',
  compositionId,
  outputPath,
  outputSha256: outputHash,
  durationMs: Date.now() - startTime,
});
```

Hash written to `artifacts/{runId}/remotion_renders.json`:

```json
[
  {
    "compositionId": "AnukramAIIntro",
    "outputPath": "artifacts/abc123/intro.mp4",
    "outputSha256": "e32d970b...",
    "renderedAt": "ISO8601",
    "remotionVersion": "4.0.0",
    "chromiumVersion": "112.0.5615.29",
    "concurrency": 1
  }
]
```

Included in `visu audit` verification.

### 3A.6 Automated ffprobe Validation

After every Remotion render, automated ffprobe validation — not manual:

```typescript
async function validateRemotionOutput(outputPath: string): Promise<void> {
  const probe = await ffprobe(outputPath);
  const video = probe.streams.find(s => s.codec_type === 'video');

  const checks = [
    { field: 'codec_name',    expected: 'h264',          actual: video.codec_name },
    { field: 'profile',       expected: 'High',           actual: video.profile },
    { field: 'width',         expected: 1920,             actual: video.width },
    { field: 'height',        expected: 1080,             actual: video.height },
    { field: 'pix_fmt',       expected: 'yuv420p',        actual: video.pix_fmt },
    { field: 'r_frame_rate',  expected: '30/1',           actual: video.r_frame_rate },
    { field: 'time_base',     expected: '1/30',           actual: video.time_base },
    { field: 'color_space',   expected: 'bt709',          actual: video.color_space ?? 'bt709' },
    { field: 'color_range',   expected: 'tv',             actual: video.color_range ?? 'tv' },
    { field: 'audio_streams', expected: 0,                actual: probe.streams.filter(s => s.codec_type === 'audio').length },
  ];

  const failures = checks.filter(c => String(c.actual) !== String(c.expected));
  if (failures.length > 0) {
    throw new VisuError('REMOTION_OUTPUT_PROFILE_MISMATCH',
      `Remotion output does not match locked profile: ${JSON.stringify(failures)}`
    );
  }
}
```

This runs automatically in `RemotionAdapter.render()` before returning the output path. No manual ffprobe step required.

---


### 3A.7 Duration Determinism — Single Source of Truth

`durationSec` and `durationInFrames` are two sources of truth that can diverge. If `durationSec = 180` is passed as a prop but `durationInFrames = 150` is registered in the composition, fade math clips incorrectly.

**Resolution: Remove `durationSec` from props entirely.**

The composition derives duration from Remotion's `useVideoConfig()` which reads `durationInFrames` from the composition registration — the single authoritative source:

```typescript
export const AnukramAIIntro: React.FC<Omit<AnukramAIIntroProps, 'durationSec'>> = ({
  title, subtitle, language, stepCount, accentColor, logoPath
}) => {
  const { durationInFrames, fps } = useVideoConfig();
  const durationSec = durationInFrames / fps;  // derived — never passed as prop

  const totalFade = interpolate(
    frame,
    [durationInFrames - 15, durationInFrames],  // uses durationInFrames directly
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  // ...
};
```

`RemotionAdapter` passes `durationInFrames` to the CLI via `--frames`. The composition reads it via `useVideoConfig()`. Props never carry duration. Divergence is impossible by construction.

**Updated `AnukramAIIntroProps` schema** — `durationSec` removed:

```typescript
type AnukramAIIntroProps = {
  title: string;
  subtitle: string;
  language: 'en' | 'hi' | 'te' | 'ta';
  stepCount: number;
  accentColor: string;
  logoPath?: string;      // governed — see 3A.8
};
```

**Updated JSON schema** — `durationSec` removed from `AnukramAIIntroProps`, `durationSec` field removed from `required` array:

```json
"AnukramAIIntroProps": {
  "required": ["title", "subtitle", "language", "stepCount", "accentColor"],
  "properties": {
    "title":       { "type": "string", "minLength": 1 },
    "subtitle":    { "type": "string", "minLength": 1 },
    "language":    { "type": "string", "enum": ["en", "hi", "te", "ta"] },
    "stepCount":   { "type": "integer", "minimum": 1, "maximum": 20 },
    "accentColor": { "type": "string", "pattern": "^#[0-9A-Fa-f]{6}$" },
    "logoPath":    { "type": "string", "pattern": "^[a-zA-Z0-9_\\-\\.]+\\.(png|jpg|svg)$" }
  }
}
```

---

### 3A.8 logoPath Governance

`logoPath` must not be an arbitrary filesystem path. It must be:

1. A filename only — no directory traversal
2. Relative to `remotion-templates/public/` implicitly
3. The file must exist in `public/` and be hashed

**Validation in `RemotionAdapter` before render:**

```typescript
if (props.logoPath) {
  const resolved = path.join(this.templatesRoot, 'public', props.logoPath);
  if (!fs.existsSync(resolved)) {
    throw new VisuError('REMOTION_LOGO_NOT_FOUND',
      `logoPath '${props.logoPath}' not found in remotion-templates/public/`
    );
  }
  // Hash and log for determinism audit
  const logoHash = sha256File(resolved);
  log.info({ event: 'remotion_logo_hash', logoPath: props.logoPath, sha256: logoHash });
}
```

**JSON schema pattern** enforces filename-only (no slashes, no `..`):

```json
"logoPath": {
  "type": "string",
  "pattern": "^[a-zA-Z0-9_\\-\\.]+\\.(png|jpg|svg)$"
}
```

System path injection blocked by schema. File existence enforced by adapter. Hash logged for audit.

---

### 3A.9 Webpack / Bundler Environment Hashing

Remotion bundles via Webpack at render time. Bundler output can drift if Node version or environment changes, even with locked npm dependencies.

**Before every render, log the bundler environment fingerprint:**

```typescript
const bundlerEnv = {
  nodeVersion: process.version,
  platform: process.platform,
  arch: process.arch,
  remotionConfigHash: sha256File(path.join(this.templatesRoot, 'remotion.config.ts')),
  packageJsonHash: sha256File(path.join(this.templatesRoot, 'package.json')),
};

log.info({ event: 'remotion_bundler_env', ...bundlerEnv });
```

Written to `artifacts/{runId}/remotion_renders.json` alongside the output hash. If bundler environment changes between runs, the audit log captures it. No hard fail — this is observability, not a gate, because Node minor version changes are outside VISU's control. The log makes drift detectable.

---

### 3A.10 Chromium Binary Hash

Version string alone is insufficient — silent patch-level Chromium rebuilds will not change the version string.

**Record SHA256 of Chromium executable on first install:**

```bash
# Find Chromium binary path
node -e "const {executablePath} = require('@remotion/renderer'); console.log(executablePath)"

# Hash it
shasum -a 256 /path/to/chromium > remotion-templates/CHROMIUM_BINARY.lock
```

`CHROMIUM_BINARY.lock` format:
```
sha256=abc123...  /path/to/chromium
recorded_at=2025-01-01T00:00:00Z
remotion_version=4.0.0
```

**Validate before every render in `RemotionAdapter`:**

```typescript
async function validateChromiumBinary(templatesRoot: string): Promise<void> {
  const lockPath = path.join(templatesRoot, 'CHROMIUM_BINARY.lock');
  if (!fs.existsSync(lockPath)) {
    throw new VisuError('REMOTION_CHROMIUM_LOCK_MISSING',
      'CHROMIUM_BINARY.lock not found. Run: node scripts/record_chromium_hash.js'
    );
  }
  const lock = fs.readFileSync(lockPath, 'utf8');
  const expectedHash = lock.match(/sha256=([a-f0-9]+)/)?.[1];
  const { executablePath } = require('@remotion/renderer');
  const actualHash = sha256File(executablePath);
  if (actualHash !== expectedHash) {
    throw new VisuError('REMOTION_CHROMIUM_DRIFT',
      `Chromium binary hash mismatch. Expected ${expectedHash}, got ${actualHash}. Re-run record_chromium_hash.js and commit.`
    );
  }
}
```

New helper script: `visu/scripts/record_chromium_hash.js` — run once after `npm install` in `remotion-templates`.

---

## 3. Remotion Config — Locked Encoding Profile

**File:** `remotion-templates/remotion.config.ts`

```typescript
import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(95);
Config.setCodec('h264');
Config.setOverwriteOutput(true);

// Match VISU locked encoding profile exactly
Config.overrideWebpackConfig((config) => config);

// FFmpeg output args to match AVMergeEngine profile:
// libx264, CRF 18, preset medium, 30fps, 1920x1080
// Remotion 4: use Config.overrideFfmpegCommand (not setFfmpegOverrideFunction)
Config.overrideFfmpegCommand(({ type }) => {
  if (type === 'pre-stitcher') return [];
  return [
    '-vcodec', 'libx264',
    '-crf', '18',
    '-preset', 'medium',
    '-profile:v', 'high',
    '-pix_fmt', 'yuv420p',
    '-r', '30',
    '-movflags', '+faststart',
    '-map_metadata', '-1',
  ];
});
```

Output from every Remotion render: `libx264 CRF 18 preset medium 30fps 1920x1080`. No re-encode needed when entering TimelineEngine.

---

## 4. Font Loading

**File:** `remotion-templates/src/fonts.ts`

Fonts loaded via `@remotion/fonts` — bundled at render time, not system fonts:

```typescript
import { loadFont } from '@remotion/google-fonts/Inter';
import { loadFont as loadDevanagari } from '@remotion/google-fonts/NotoSansDevanagari';
import { loadFont as loadTelugu } from '@remotion/google-fonts/NotoSansTelugu';

export const loadFontsForLanguage = (language: string) => {
  loadFont(); // Inter — always loaded (Latin fallback)
  if (language === 'hi') loadDevanagari();
  if (language === 'te') loadTelugu();
};
```

**Font-to-language mapping:**

| Language | Font | Coverage |
|---|---|---|
| `en` | Inter | Latin |
| `hi` | Noto Sans Devanagari | Devanagari script |
| `te` | Noto Sans Telugu | Telugu script |
| `ta` | Noto Sans Tamil | Tamil script (future) |

Fonts are loaded from `@remotion/google-fonts` — bundled at build time, no network calls during render. Works offline on the 2014 Mac mini.

**CSS font-family per language:**

```typescript
export const fontFamilyForLanguage = (language: string): string => {
  switch (language) {
    case 'hi': return '"Noto Sans Devanagari", Inter, sans-serif';
    case 'te': return '"Noto Sans Telugu", Inter, sans-serif';
    case 'ta': return '"Noto Sans Tamil", Inter, sans-serif';
    default:   return 'Inter, sans-serif';
  }
};
```

---

## 5. First Component — AnukramAI Intro Card

**File:** `remotion-templates/src/compositions/AnukramAIIntro.tsx`

### Props

```typescript
type AnukramAIIntroProps = {
  title: string;           // Video title e.g. "How to Create a Bill"
  subtitle: string;        // e.g. "AnukramAI Tutorial"
  language: 'en' | 'hi' | 'te' | 'ta';
  stepCount: number;       // e.g. 7 — shown as "7 steps"
  durationSec: number;     // Total video duration shown to viewer
  accentColor: string;     // Brand colour e.g. "#FF6B35"
  logoPath?: string;       // Optional logo override
};
```

### Visual Design

```
┌─────────────────────────────────────────┐
│                                         │
│         [AnukramAI Logo]                │
│                                         │
│    ─────────────────────────────        │  ← accent colour bar
│                                         │
│    How to Create a Bill                 │  ← title (large)
│    AnukramAI Tutorial                   │  ← subtitle (medium)
│                                         │
│    7 steps  ·  ~3 minutes               │  ← metadata row
│                                         │
└─────────────────────────────────────────┘
```

Background: deep navy `#0f172a`  
Accent bar: `accentColor` prop (default AnukramAI orange `#FF6B35`)  
Text: white  
Font: language-appropriate (Inter / Noto Sans Devanagari / Noto Sans Telugu)

### Animation sequence (5 seconds default)

```
0.0s → 0.3s  Background fades in
0.3s → 0.8s  Logo fades + slides up
0.8s → 1.0s  Accent bar slides in from left
1.0s → 1.5s  Title fades in
1.5s → 1.8s  Subtitle fades in
1.8s → 2.2s  Metadata row fades in
2.2s → 4.5s  Hold
4.5s → 5.0s  Gentle fade to black
```

All animations use Remotion's `interpolate` and `spring` — no CSS transitions.

### Component skeleton

```tsx
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { loadFontsForLanguage, fontFamilyForLanguage } from '../fonts';

export const AnukramAIIntro: React.FC<AnukramAIIntroProps> = ({
  title, subtitle, language, stepCount, durationSec, accentColor, logoPath
}) => {
  loadFontsForLanguage(language);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fontFamily = fontFamilyForLanguage(language);

  const logoOpacity = interpolate(frame, [9, 24], [0, 1], { extrapolateRight: 'clamp' });
  const logoY = interpolate(frame, [9, 24], [20, 0], { extrapolateRight: 'clamp' });
  const titleOpacity = interpolate(frame, [30, 45], [0, 1], { extrapolateRight: 'clamp' });
  const subtitleOpacity = interpolate(frame, [45, 54], [0, 1], { extrapolateRight: 'clamp' });
  const metaOpacity = interpolate(frame, [54, 66], [0, 1], { extrapolateRight: 'clamp' });
  const barWidth = interpolate(frame, [24, 30], [0, 100], { extrapolateRight: 'clamp' });
  const totalFade = interpolate(
    frame,
    [durationSec * fps - 15, durationSec * fps],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <AbsoluteFill style={{ backgroundColor: '#0f172a', opacity: totalFade }}>
      {/* Logo */}
      <div style={{ opacity: logoOpacity, transform: `translateY(${logoY}px)` }}>
        <img src={logoPath ?? staticFile('anukramai-logo-white.png')} height={80} />
      </div>

      {/* Accent bar */}
      <div style={{
        width: `${barWidth}%`, height: 4,
        backgroundColor: accentColor,
        transition: 'none'
      }} />

      {/* Title */}
      <div style={{ opacity: titleOpacity, fontFamily, color: 'white', fontSize: 64 }}>
        {title}
      </div>

      {/* Subtitle */}
      <div style={{ opacity: subtitleOpacity, fontFamily, color: '#94a3b8', fontSize: 36 }}>
        {subtitle}
      </div>

      {/* Metadata */}
      <div style={{ opacity: metaOpacity, fontFamily, color: '#64748b', fontSize: 28 }}>
        {stepCount} steps · ~{Math.round(durationSec / 60)} minutes
      </div>
    </AbsoluteFill>
  );
};
```

---

## 6. Second Component — AnukramAI Summary Card

**File:** `remotion-templates/src/compositions/AnukramAISummary.tsx`

Same props as intro minus `stepCount` and `durationSec`. Adds:

```typescript
completedSteps: string[];  // ["Logged in", "Navigated to billing", ...]
```

Visual design:

```
┌─────────────────────────────────────────┐
│                                         │
│    ✓  Logged in                         │
│    ✓  Navigated to billing              │  ← steps reveal one by one
│    ✓  Selected customer                 │
│    ✓  Added products                    │
│    ✓  Generated invoice                 │
│                                         │
│    You're ready to start billing.       │  ← closing line
│                                         │
│         [AnukramAI Logo]                │
│                                         │
└─────────────────────────────────────────┘
```

Steps reveal sequentially — one every 0.4 seconds. Checkmark slides in from left. Closing line fades in after all steps.

---

## 7. Utility Components

These replace the current FFmpeg `drawtext` implementations with Remotion components — better typography, animation, positioning.

### SceneTitleCard

**File:** `remotion-templates/src/compositions/SceneTitleCard.tsx`

Overlaid on top of scene recording clips. Props:

```typescript
type SceneTitleCardProps = {
  title: string;       // "Step 1: Login"
  language: string;
  accentColor: string;
  showDurationFrames: number;  // how long to show (default: 60 frames = 2s)
};
```

Animated pill — slides in from left, holds, slides out. Replaces `drawtext` title card.

### ProgressOverlay

**File:** `remotion-templates/src/compositions/ProgressOverlay.tsx`

```typescript
type ProgressOverlayProps = {
  currentStep: number;   // 2
  totalSteps: number;    // 7
  language: string;
  accentColor: string;
};
```

Bottom-right corner. Animated progress dots or "Step 2 of 7" text. Replaces `drawtext` progress indicator.

---

## 8. Root Composition Registration

**File:** `remotion-templates/src/Root.tsx`

```tsx
import { Composition } from 'remotion';
import { AnukramAIIntro } from './compositions/AnukramAIIntro';
import { AnukramAISummary } from './compositions/AnukramAISummary';
import { SceneTitleCard } from './compositions/SceneTitleCard';
import { ProgressOverlay } from './compositions/ProgressOverlay';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="AnukramAIIntro"
        component={AnukramAIIntro}
        durationInFrames={150}  // 5 seconds at 30fps
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          title: 'Tutorial Title',
          subtitle: 'AnukramAI Tutorial',
          language: 'en',
          stepCount: 5,
          durationSec: 180,
          accentColor: '#FF6B35',
        }}
      />
      <Composition
        id="AnukramAISummary"
        component={AnukramAISummary}
        durationInFrames={180}  // 6 seconds at 30fps
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          title: 'Tutorial Complete',
          subtitle: 'AnukramAI Tutorial',
          language: 'en',
          completedSteps: [],
          accentColor: '#FF6B35',
        }}
      />
      <Composition
        id="SceneTitleCard"
        component={SceneTitleCard}
        durationInFrames={60}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          title: 'Step 1: Login',
          language: 'en',
          accentColor: '#FF6B35',
          showDurationFrames: 60,
        }}
      />
      <Composition
        id="ProgressOverlay"
        component={ProgressOverlay}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          currentStep: 1,
          totalSteps: 5,
          language: 'en',
          accentColor: '#FF6B35',
        }}
      />
    </>
  );
};
```

---

## 9. RemotionAdapter

**File:** `visu/src/adapters/remotion_adapter.ts`

The bridge between VISU and the Remotion CLI.

```typescript
export type RemotionRenderOptions = {
  compositionId: string;        // "AnukramAIIntro"
  props: Record<string, unknown>; // passed as --props JSON
  outputPath: string;           // where to write the MP4
  durationInFrames?: number;    // override composition default
  fps?: number;                 // default 30
};

export class RemotionAdapter {
  private templatesRoot: string;

  constructor(templatesRoot: string) {
    this.templatesRoot = templatesRoot; // path to remotion-templates package
  }

  async render(options: RemotionRenderOptions): Promise<string> {
    const {
      compositionId, props, outputPath, durationInFrames, fps = 30
    } = options;

    const propsJson = JSON.stringify(props);
    const args = [
      'remotion', 'render',
      'src/index.ts',           // Remotion entry point
      compositionId,
      outputPath,
      '--props', propsJson,
      '--concurrency', '1',     // HARDCODED — never parallel, enforces determinism
      '--log', 'verbose',
    ];

    if (durationInFrames) {
      args.push('--frames', `0-${durationInFrames - 1}`);
    }

    // async spawn — not spawnSync — engine thread must not block during long renders
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const proc = spawn('npx', args, {
        cwd: this.templatesRoot,
        env: { ...process.env, NODE_ENV: 'production' }
      });

      // Stream Remotion logs into VISU structured logger
      proc.stdout.on('data', (data) => {
        log.debug({ event: 'remotion_stdout', compositionId, data: data.toString().trim() });
      });
      proc.stderr.on('data', (data) => {
        log.debug({ event: 'remotion_stderr', compositionId, data: data.toString().trim() });
      });

      proc.on('close', async (code) => {
        if (code !== 0) {
          return reject(new VisuError(
            'REMOTION_RENDER_FAILED',
            `Remotion render failed for ${compositionId} with exit code ${code}`
          ));
        }
        if (!fs.existsSync(outputPath)) {
          return reject(new VisuError(
            'REMOTION_OUTPUT_MISSING',
            `Remotion render completed but output not found: ${outputPath}`
          ));
        }

        // Automated profile validation — no manual ffprobe needed
        try {
          await validateRemotionOutput(outputPath);
        } catch (err) {
          return reject(err);
        }

        // SHA256 capture — every render hashed immediately
        const outputHash = sha256File(outputPath);
        // Read remotion version from package.json — never hardcode
        const pkgJson = JSON.parse(
          fs.readFileSync(path.join(this.templatesRoot, 'package.json'), 'utf8')
        );
        const remotionVersion = pkgJson.dependencies?.remotion ?? 'unknown';

        log.info({
          event: 'remotion_render_complete',
          compositionId,
          outputPath,
          outputSha256: outputHash,
          durationMs: Date.now() - startTime,
          remotionVersion,            // read from package.json — not hardcoded
          concurrency: 1,
        });

        resolve(outputPath);
      });

      proc.on('error', (err) => {
        reject(new VisuError('REMOTION_NOT_FOUND',
          `Failed to spawn Remotion: ${err.message}`
        ));
      });
    });
  }

  async renderIntro(params: {
    title: string;
    subtitle: string;
    language: string;
    stepCount: number;
    durationSec: number;
    accentColor?: string;
    outputPath: string;
  }): Promise<string> {
    return this.render({
      compositionId: 'AnukramAIIntro',
      props: {
        title: params.title,
        subtitle: params.subtitle,
        language: params.language,
        stepCount: params.stepCount,
        durationSec: params.durationSec,
        accentColor: params.accentColor ?? '#FF6B35',
      },
      outputPath: params.outputPath,
      durationInFrames: 150, // 5 seconds
    });
  }

  async renderSummary(params: {
    title: string;
    subtitle: string;
    language: string;
    completedSteps: string[];
    accentColor?: string;
    outputPath: string;
  }): Promise<string> {
    return this.render({
      compositionId: 'AnukramAISummary',
      props: {
        title: params.title,
        subtitle: params.subtitle,
        language: params.language,
        completedSteps: params.completedSteps,
        accentColor: params.accentColor ?? '#FF6B35',
      },
      outputPath: params.outputPath,
      durationInFrames: 180, // 6 seconds
    });
  }
}
```

---

## 10. Config Integration

**File:** `visu/config/default.json`

```json
{
  "remotion": {
    "templatesRoot": "./remotion-templates",
    "accentColor": "#FF6B35",
    "enabled": true
  }
}
```

`enabled: false` falls back to the existing PNG-based intro/summary pattern. Allows graceful degradation if Remotion is not installed.

---

## 11. package.json — remotion-templates

**File:** `remotion-templates/package.json`

```json
{
  "name": "@anukramai/remotion-templates",
  "version": "1.0.0",
  "description": "Remotion video components for AnukramAI / VISU",
  "main": "src/index.ts",
  "scripts": {
    "studio": "npx remotion studio",
    "render:intro": "npx remotion render src/index.ts AnukramAIIntro out/intro.mp4",
    "render:summary": "npx remotion render src/index.ts AnukramAISummary out/summary.mp4",
    "build": "tsc --noEmit"
  },
  "dependencies": {
    "@remotion/cli": "4.0.0",
    "@remotion/google-fonts": "4.0.0",
    "remotion": "4.0.0",
    "react": "18.3.1",
    "react-dom": "18.3.1"
  },
  "devDependencies": {
    "typescript": "5.4.5",
    "@types/react": "18.3.1"
  }
}
```

---

## 12. Remotion Studio — Development Preview

During component development:

```bash
cd remotion-templates
npm run studio
```

Opens Remotion Studio in the browser — live preview of every composition with prop controls. Test all languages, titles, step counts interactively before wiring into VISU.

This is the fastest way to iterate on component design without running a full VISU pipeline.

---

## 13A. Performance Benchmark — Required Before Mode Wiring

Remotion render times on the 2014 Mac mini must be measured and documented before Sprint 13 begins. If the combined render time for intro + summary + overlays pushes the VISU pipeline over 20 minutes, Sprint 13 scope must be adjusted.

### Benchmark script

```bash
cd /Users/play/Bhirav/Engines/Visu/remotion-templates

# Benchmark intro — concurrency 1 (production default)
time npx remotion render src/index.ts AnukramAIIntro \
  out/bench_intro.mp4 \
  --concurrency 1 \
  --props '{"title":"Test","subtitle":"Test","language":"en","stepCount":7,"durationSec":210,"accentColor":"#FF6B35"}'

# Benchmark summary — concurrency 1
time npx remotion render src/index.ts AnukramAISummary \
  out/bench_summary.mp4 \
  --concurrency 1 \
  --props '{"title":"Test","subtitle":"Test","language":"en","completedSteps":["Step 1","Step 2"],"accentColor":"#FF6B35"}'
```

### Record results in `docs/REMOTION_BENCHMARK.md`

```
| Composition      | Duration | Concurrency | Render Time | CPU Peak | Memory Peak |
|---|---|---|---|---|---|
| AnukramAIIntro   | 5s       | 1           | ???         | ???%     | ???MB       |
| AnukramAISummary | 6s       | 1           | ???         | ???%     | ???MB       |
```

### 20-minute SLA gate

Total Remotion render time for a 7-scene billing flow:
```
intro + summary = ??? minutes
7 × SceneTitleCard = ??? minutes (if used as overlays)
```

If total exceeds **4 minutes**, SceneTitleCard and ProgressOverlay revert to FFmpeg drawtext in Sprint 13. Intro and summary remain as Remotion. The threshold is 4 minutes because the existing pipeline already uses ~15 minutes on this hardware.

This benchmark is a **Sprint 12 exit gate** — Sprint 13 cannot begin until results are documented.

---

## 13. Render Performance on 2014 Mac mini

Remotion renders via headless Chrome — CPU only. Benchmark expectations:

| Composition | Duration | Expected render time |
|---|---|---|
| AnukramAIIntro | 5s | ~45-90 seconds |
| AnukramAISummary | 6s | ~60-120 seconds |
| SceneTitleCard | 2s | ~20-40 seconds |

These are one-time renders per video production run. For a 7-scene billing flow, intro + summary renders add approximately 2-4 minutes to the total pipeline. Acceptable for a machine with no GPU.

**Mitigation:** Remotion supports `--concurrency` flag. On 4-core Mac mini:

```
npx remotion render ... --concurrency 1
```

Two parallel frame renders. Reduces render time by ~40%.

---

## 14. Error Codes

New error codes added to VISU error catalogue:

| Code | Cause | Resolution |
|---|---|---|
| `REMOTION_NOT_FOUND` | `npx remotion` not available | Run `npm install` in `remotion-templates` |
| `REMOTION_RENDER_FAILED` | Remotion render process failed | Check Remotion logs in artifacts |
| `REMOTION_OUTPUT_MISSING` | Render completed but MP4 not written | Check disk space and output path |
| `REMOTION_TEMPLATES_NOT_FOUND` | `templatesRoot` path not found | Check `remotion.templatesRoot` in config |
| `REMOTION_COMPOSITION_NOT_FOUND` | Composition ID not registered | Check `Root.tsx` registrations |
| `REMOTION_PROPS_INVALID` | Props fail schema validation | Fix props against `remotion_props_schema_v1.json` |
| `REMOTION_OUTPUT_PROFILE_MISMATCH` | Output does not match locked encoding profile | Check `remotion.config.ts` FFmpeg overrides |
| `REMOTION_CHROMIUM_DRIFT` | Chromium binary hash mismatch | Re-run `record_chromium_hash.js` and commit `CHROMIUM_BINARY.lock` |
| `REMOTION_CHROMIUM_LOCK_MISSING` | `CHROMIUM_BINARY.lock` not found | Run `node scripts/record_chromium_hash.js` after install |
| `REMOTION_LOGO_NOT_FOUND` | `logoPath` not found in `public/` | Place logo file in `remotion-templates/public/` |

---

## 15. Files Created

```
remotion-templates/         ← inside /Users/play/Bhirav/Engines/Visu/
  src/
    compositions/
      AnukramAIIntro.tsx
      AnukramAISummary.tsx
      SceneTitleCard.tsx
      ProgressOverlay.tsx
    Root.tsx
    fonts.ts
    index.ts
  fonts/                          ← local font fallbacks if needed
  public/
    anukramai-logo.png
    anukramai-logo-white.png
  remotion.config.ts
  package.json
  tsconfig.json
  README.md

visu/src/adapters/
  remotion_adapter.ts             ← NEW (async spawn, props validation, sha256, ffprobe check)

visu/config/
  default.json                    ← remotion block added

visu/schemas/
  remotion_props_schema_v1.json   ← NEW: governed props schema per composition

visu/tests/
  remotion_adapter.test.ts        ← NEW
  remotion_output_validation.test.ts ← NEW: automated ffprobe profile checks

visu/scripts/
  record_chromium_hash.js         ← NEW: run once after npm install in remotion-templates

docs/
  REMOTION_SETUP.md               ← developer guide
  REMOTION_BENCHMARK.md           ← NEW: benchmark results (exit gate for Sprint 13)
  SPRINT_12_EXECUTION_PLAN_v1.2.md

remotion-templates/
  CHROMIUM_VERSION.lock           ← NEW: Chromium version string governance
  CHROMIUM_BINARY.lock            ← NEW: Chromium binary SHA256 hash
  package-lock.sha256             ← NEW: lockfile hash for CI
```

---

## 16. Testing Requirements

### Unit Tests — RemotionAdapter

| Test | Validates |
|---|---|
| `remotion.enabled: false` | Falls back to PNG pattern |
| `templatesRoot` not found | `REMOTION_TEMPLATES_NOT_FOUND` |
| Unknown compositionId | `REMOTION_COMPOSITION_NOT_FOUND` |
| Render succeeds | Output MP4 exists |
| Render fails | `REMOTION_RENDER_FAILED` with stderr |
| Output MP4 missing after render | `REMOTION_OUTPUT_MISSING` |

### Manual Verification

```bash
cd remotion-templates

# Preview in studio
npm run studio

# Render intro — English
npx remotion render src/index.ts AnukramAIIntro \
  out/intro_en.mp4 \
  --props '{"title":"How to Create a Bill","subtitle":"AnukramAI Tutorial","language":"en","stepCount":7,"durationSec":210,"accentColor":"#FF6B35"}'

# Render intro — Hindi
npx remotion render src/index.ts AnukramAIIntro \
  out/intro_hi.mp4 \
  --props '{"title":"बिल कैसे बनाएं","subtitle":"AnukramAI ट्यूटोरियल","language":"hi","stepCount":7,"durationSec":210,"accentColor":"#FF6B35"}'

# Render intro — Telugu
npx remotion render src/index.ts AnukramAIIntro \
  out/intro_te.mp4 \
  --props '{"title":"బిల్లు ఎలా సృష్టించాలి","subtitle":"AnukramAI ట్యుటోరియల్","language":"te","stepCount":7,"durationSec":210,"accentColor":"#FF6B35"}'
```

Verify all three:
- Correct font rendering per language
- Correct animation sequence
- Duration exactly 5 seconds
- Resolution 1920x1080
- Codec libx264 CRF 18

```bash
ffprobe out/intro_en.mp4
```

---

## 17. Success Criteria

Sprint 12 is complete when:

- [ ] `remotion-templates` package created and installs cleanly
- [ ] All dependency versions pinned exactly — no caret or tilde
- [ ] `package-lock.sha256` committed
- [ ] `CHROMIUM_VERSION.lock` committed
- [ ] Remotion Studio opens and shows all four compositions
- [ ] `AnukramAIIntro` renders correctly in English, Hindi, Telugu
- [ ] `AnukramAISummary` renders correctly in English, Hindi, Telugu
- [ ] `SceneTitleCard` renders correctly in all three languages
- [ ] `ProgressOverlay` renders correctly
- [ ] All fonts load correctly — no system font fallback
- [ ] Output MP4 matches locked encoding profile (libx264 CRF 18 30fps 1920x1080)
- [ ] `RemotionAdapter.renderIntro()` produces correct output from VISU
- [ ] `RemotionAdapter.renderSummary()` produces correct output from VISU
- [ ] `remotion.enabled: false` falls back gracefully to PNG pattern
- [ ] Render performance benchmarked on 2014 Mac mini
- [ ] All new error codes documented in `ERROR_REFERENCE.md`
- [ ] Props schema `remotion_props_schema_v1.json` defined — `durationSec` removed from `AnukramAIIntroProps`
- [ ] `durationSec` derived from `useVideoConfig()` inside composition — never passed as prop
- [ ] `logoPath` validated against `remotion-templates/public/` — no arbitrary paths
- [ ] `logoPath` hashed and logged on every render
- [ ] `RemotionAdapter` uses async spawn — engine thread never blocks
- [ ] Every render hashes output SHA256 and logs to structured log
- [ ] `remotionVersion` read from `package.json` — never hardcoded in logs
- [ ] Bundler environment fingerprint (Node version, platform, config hash) logged per render
- [ ] ffprobe validation extended — `time_base`, `color_space`, `color_range` checked
- [ ] Automated ffprobe validation passes after every render
- [ ] `CHROMIUM_VERSION.lock` committed — version string recorded
- [ ] `CHROMIUM_BINARY.lock` committed — binary SHA256 recorded
- [ ] Chromium binary hash validated before every render
- [ ] `record_chromium_hash.js` script present and documented
- [ ] `--concurrency 1` hardcoded in spawn args — not just policy text
- [ ] Unit tests pass
- [ ] Automated profile validation test passes
- [ ] Manual render verification passes for all three languages
- [ ] Performance benchmark documented in `docs/REMOTION_BENCHMARK.md`
- [ ] SLA gate confirmed — Remotion render time within 4-minute budget
- [ ] All error codes in `ERROR_REFERENCE.md`: `REMOTION_PROPS_INVALID`, `REMOTION_OUTPUT_PROFILE_MISMATCH`, `REMOTION_CHROMIUM_DRIFT`, `REMOTION_CHROMIUM_LOCK_MISSING`, `REMOTION_LOGO_NOT_FOUND`
- [ ] `npm run build`, `npm test`, `npm run lint` all pass in both packages
- [ ] `REMOTION_SETUP.md` written for developer onboarding

---

## 18. What Comes Next — Sprint 13

After this sprint Remotion is proven and ready. Sprint 13 wires it into all three modes:

- Mode A — intro and summary scenes use `RemotionAdapter` instead of PNG pattern
- Mode B — same
- Mode C — Remotion scenes as a new scene type alongside `governed_image`
- Contract schema v1.6 — `type: "remotion"` scene type with `component` and `props`
- `SceneTitleCard` and `ProgressOverlay` replace FFmpeg `drawtext` in post-production

