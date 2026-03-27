# Remotion Composition Constraints

Rules for Remotion compositions used by VISU so that renders are deterministic, reproducible, and safe for headless runs.

---

## 1. Banned patterns

Do **not** use these inside compositions (or in code they call):

- **`Math.random()`** — Use props or fixed values so the same props produce the same pixels.
- **`Date.now()` / `new Date()`** — No wall-clock or timestamp-dependent visuals.
- **`fetch()` / network I/O** — Compositions must not depend on external services or files outside the project.
- **`localStorage` / `sessionStorage`** — Not available in headless render; do not rely on them.
- **Browser-only APIs** that are undefined or non-deterministic in Node (e.g. `window` outside Remotion’s provided context).

These would break deterministic rendering and CI/reproducibility.

---

## 2. Allowed patterns

- **Props-driven content** — All variable content (title, subtitle, language, step count, accent color, etc.) must come from the composition’s `props`. VISU passes props from the contract or wrap; the same props must yield the same output.
- **Static assets** — Use files under `remotion-templates/public/` (e.g. logos); paths are validated by the adapter.
- **Remotion’s timing APIs** — `useCurrentFrame()`, `useVideoConfig()`, `interpolate()` etc. are deterministic for a given composition duration and frame.
- **Locked dependencies** — `package.json` and lock files (including Chromium) are pinned and verified so that installs are reproducible.

---

## 3. Pre-merge checklist

Before adding or changing a composition used by VISU:

1. **No non-determinism** — Search for `Math.random`, `Date`, `fetch`, and ensure they are not used in the composition (or in shared code it uses).
2. **Props schema** — If the composition is used from a contract or wrap, ensure its props are described in `remotion_props_schema_v1.json` and that the adapter validates props before render.
3. **Profile** — Compositions must render at the locked encoding profile (e.g. 1920×1080, 30fps) so concatenation with other clips does not fail.
4. **Logo paths** — Any `logoPath` prop must resolve to a file under `remotion-templates/public/`; the adapter validates this.

---

## 4. Related docs

- **[REMOTION_SETUP.md](./REMOTION_SETUP.md)** — Install, config, lock files, Studio.
- **[DETERMINISM_RENDERER_AUDIT.md](./DETERMINISM_RENDERER_AUDIT.md)** — Cross-mode determinism and failure semantics.
