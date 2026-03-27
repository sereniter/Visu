# Background music (Mode B)

Place WAV files here for use as default or per-topic background music.

- **Format:** WAV, 48 kHz stereo preferred (will be resampled if needed).
- **LUFS:** -17 to -15 (VISU validates before mix). Normalize with `tools/normalize-music-lufs.sh` if needed.
- **Behaviour:** The track is looped or trimmed to the video duration and mixed under narration (15% level). The mix runs for the full video so music continues after narration ends with no silence.

**Default music:** Set `execution.defaultBackgroundMusicPath` in `config/default.json` to the absolute path of a file in this folder, e.g.  
`/Users/play/Bhirav/Engines/Visu/assets/music/mixaund-motivate-me.wav`

**Per-topic music:** Put files under your content repo at `{contentRoot}/{topic}/music/<file>.wav` and set the script field `"music": "music/<file>.wav"`.
