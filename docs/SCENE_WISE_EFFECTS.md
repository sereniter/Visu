# Scene-wise effects (Mode C contract → Remotion)

For **each scene** in `contract.scenes[]`, the following fields drive effects in Remotion `SceneComposition`. Every scene has at least `scene_id`, `duration_sec`, `visual`, `narration`; the rest are optional.

| Per-scene field | Effect in Remotion | Notes |
|-----------------|--------------------|--------|
| **`scene_id`** | Logging / ordering | — |
| **`duration_sec`** | Composition length | Used for Ken Burns duration and overlay timing. |
| **`visual.type`** | — | `governed_image` or `remotion`; both rendered via SceneComposition. |
| **`visual.asset_path`** | Background image | Main image for the scene. |
| **`visual.visual_style`** | Overlay styling | e.g. `war_documentary`, `news_report`; used for text overlay look. |
| **`visual.motion`** | Ken Burns + motion blur | `type`, `focus`, `intensity`, `easing`, `motion_blur`. |
| **`visual.grade`** | Color grade | e.g. `cinematic_dark`, `cold_war`; from `gradesConfig`. |
| **`visual.grain`** | Film grain overlay | Boolean; opacity 0.08 when true. |
| **`visual.parallax`** | Parallax scene | If set, replaces Ken Burns; uses `foreground_path` + `depth`. |
| **`narration`** | TTS (outside Remotion) | Narration is merged per scene in the pipeline after render. |
| **`scene.audio`** | Ambient + SFX in scene | `ambient_path` / `ambient_volume`, `sfx[]`; played by AudioLayer. |
| **`scene.overlays`** | Text + graphic overlays | Lower third, stat badge, source tag, highlight, arrow, shape. |
| **`scene.transition`** | Not used | Per-scene flow has no cross-scene transition in Remotion. |

**Scene-wise checklist (for a given scene):**

- **Image:** `visual.asset_path` (and `visual.parallax.foreground_path` if parallax).
- **Move:** `visual.motion` → Ken Burns or parallax; `motion_blur` optional.
- **Color:** `visual.grade` → GradedScene.
- **Grain:** `visual.grain` → FilmGrainOverlay.
- **In-scene audio:** `scene.audio` → AudioLayer.
- **On-screen text/graphics:** `scene.overlays[]` → LowerThird, StatBadge, SourceTag, GlowHighlight, ArrowPointer, ShapeOverlay.
