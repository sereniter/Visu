# Test fixtures

Static committed binaries for integration tests. **Do not generate these during test runs.**

## AV merge (Sprint 4)

| File | Max size | Max duration |
|------|----------|-------------|
| `raw_fixture.webm` | 5 MB | 10 s |
| `narration_fixture.wav` | 5 MB | 10 s |
| `music_fixture.wav` | 5 MB | 10 s |

**Total committed fixture size ≤ 15 MB.** Git LFS not required.

```bash
RUN_MEDIA_INTEGRATION=true npm test
```

## Recorded mode (Sprint 5 / Mode B)

| File | Max size | Max duration |
|------|----------|-------------|
| `recorded_fixture.mp4` | 5 MB | 10 s |
| `script_fixture.json` | — | — |

`script_fixture.json` is committed. Add a valid MP4 (container MP4, one video stream, ≤10 s, ≤5 MB) as `recorded_fixture.mp4` for recorded integration tests. Narration from TTS must fit within video duration (drift ≤200 ms).

```bash
RUN_RECORDED_INTEGRATION=true npm test
```

If fixtures are missing, the corresponding integration test skips with a warning.
