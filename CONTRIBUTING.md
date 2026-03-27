# Contributing to VISU

## Determinism checklist governance

Any new dependency, subprocess, environment variable, or external input source must:

1. **Update the determinism checklist** — Add or adjust entries in `docs/DETERMINISM_CHECKLIST.md` as needed.
2. **Re-run Sprint 7 audit validation** — Ensure `visu audit --runId <id>` still passes for existing runs where applicable.
3. **Pass checklist review before merge** — The determinism checklist is a mandatory review artifact for all new features.

See `docs/DETERMINISM_CHECKLIST.md` for the full checklist and mode-specific guarantees.
