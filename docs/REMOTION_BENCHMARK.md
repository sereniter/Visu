## Remotion Benchmark — Sprint 12 Exit Gate ✅ Complete

Record render performance for the 2014 Mac mini before wiring Remotion into VISU modes. Run the benchmark on the target hardware, fill in the results table below, and confirm the ≤4 min SLA before starting Sprint 13.

**Sprint 13 outcome:** SLA met (Intro + Summary ~40s total). Overlays (title cards, progress) **green-lit** for Remotion; no fallback to FFmpeg drawtext required.

### 1. Benchmark commands

```bash
cd /Users/play/Bhirav/Engines/Visu/remotion-templates

# Intro
time npx remotion render src/index.ts AnukramAIIntro \
  out/bench_intro.mp4 \
  --concurrency 1 \
  --props '{"title":"Test","subtitle":"Test","language":"en","stepCount":7,"accentColor":"#FF6B35"}'

# Summary
time npx remotion render src/index.ts AnukramAISummary \
  out/bench_summary.mp4 \
  --concurrency 1 \
  --props '{"title":"Test","subtitle":"Test","language":"en","completedSteps":["Step 1","Step 2"],"accentColor":"#FF6B35"}'
```

### 2. Results

Fill this table after running the benchmarks:

| Composition      | Duration | Concurrency | Render Time | CPU Peak | Memory Peak |
|------------------|----------|-------------|-------------|----------|-------------|
| AnukramAIIntro   | 5s       | 1           | 18.65s      |          |             |
| AnukramAISummary | 6s       | 1           | 21.38s      |          |             |

### 3. SLA gate

For a 7-scene billing flow:

- Intro + summary renders should add **≤ 4 minutes** total to the pipeline.

If the combined Remotion render time exceeds this budget, overlays (title cards and progress) must fall back to FFmpeg `drawtext` in later sprints; intro and summary remain Remotion-based.

**Result:** Combined intro + summary render time (~40s) is within budget. Overlays use Remotion (SceneTitleCard, ProgressOverlay) when `post_production.useRemotionOverlays` is true and `remotion.enabled` is true.

