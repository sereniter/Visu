# Default sound assets (Scene-driven Mode A)

Place WAV files here for recording and post-production enhancements. All must be **48 kHz, 16-bit PCM** for pipeline uniformity.

| File | Description | Duration (approx) |
|------|-------------|------------------|
| `click.wav` | Soft mouse click tone | 80 ms |
| `keyboard.wav` | Single keypress (fill actions) | 120 ms |
| `page_load.wav` | Subtle navigation whoosh | 400 ms |
| `transition.wav` | Scene transition chime | 500 ms |

**Usage:** The scene-driven engine (`visu run --mode ui_flow_scenes`) uses `transition.wav` between intro, scenes, and summary when `post_production.transitionSound` is true. Click and ambient sounds are injected during recording when `recording_enhancements.clickSound` and `recording_enhancements.ambientSounds` are enabled.

**Override per topic:** Put files under `{contentRoot}/{topic}/sounds/` to override these defaults for a given topic.
