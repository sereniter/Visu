# SDXL Determinism Spike

**Purpose:** Run on the production machine to establish a factual foundation for Mode C v1.1 (generative visuals). Answers:

1. **Hardware** — Can this machine run SDXL in acceptable time?
2. **Determinism** — With a fixed seed, are two runs bit-identical (or pixel-identical)?

Without this spike, v1.1 planning would be speculation.

## How to run on the production machine

### 1. Environment

- **Python 3.10, 3.11, or 3.12** — PyTorch does not yet ship wheels for Python 3.14. If your system `python3` is 3.14, create the venv with an older interpreter (e.g. `python3.12 -m venv .venv` after installing Python 3.12 via Homebrew: `brew install python@3.12`).
- **Intel Mac:** CPU-only is fine; script uses CPU. (Apple Silicon can use MPS.)
- Sufficient disk for the model (e.g. stabilityai/stable-diffusion-xl-base-1.0 is several GB).

### 2. Install

From the **repo root** (so `spikes/sdxl_determinism_spike` exists):

```bash
cd spikes/sdxl_determinism_spike
python3.12 -m venv .venv   # or python3 if it's 3.10–3.12
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements-spike.txt
```

First run will download the SDXL model from Hugging Face (requires network and sufficient disk).

### 3. Run spike

```bash
python run_spike.py
```

Outputs:

- `run1.png`, `run2.png` — generated images (same prompt, same seed, two separate runs).
- Report to stdout: deterministic (yes/no), time per run (seconds), hashes, device.

**Troubleshooting:**  
- **"No matching distribution found for torch"** — Use Python 3.10–3.12 (see Environment above). PyTorch does not support 3.14 yet.  
- **Intel Mac:** `pip install torch` from PyPI is sufficient once the Python version is 3.10–3.12. If it still fails, install from [pytorch.org/get-started/locally](https://pytorch.org/get-started/locally/) (choose macOS, CPU), then `pip install diffusers transformers accelerate safetensors`.
- **"NumPy 1.x cannot be run in NumPy 2.x"** — Requirements pin `numpy<2` for compatibility with the prebuilt torch wheel. Reinstall: `pip install -r requirements-spike.txt --force-reinstall` (or recreate the venv).
- **"module 'torch' has no attribute 'xpu'"** — The script shims `torch.xpu` on macOS so pipeline loading does not require Intel XPU. If you still see this, ensure you have the latest `run_spike.py`.
- **"PyTorch >= 2.4 is required" / "device_mesh"** — Requirements pin to `torch<2.4`, `transformers<5`, `diffusers<0.28` so the spike runs on macOS with the torch 2.2 wheel. Reinstall: `pip install -r requirements-spike.txt --force-reinstall`.
- **"cannot import name 'cached_download' from 'huggingface_hub'"** — Pinned `huggingface_hub<0.22` (diffusers 0.27 expects the old API). Reinstall: `pip install -r requirements-spike.txt --force-reinstall`.

### 4. Interpret results

| Result | Meaning |
|--------|--------|
| **Deterministic: yes** (hashes match) | Same seed → same output on this machine. Safe to base v1.1 on fixed-seed SDXL for this hardware. |
| **Deterministic: no** (hashes differ) | Document driver/CUDA/diffusers versions; consider CPU generator or environment locking for v1.1. |
| **Time** | Informs sprint capacity (e.g. N scenes × time per image). |

## Output location

Artifacts are written under `spikes/sdxl_determinism_spike/out/` (created if missing). Report is printed to stdout and can be redirected, e.g. `python run_spike.py > spike_report.txt`.

---

## Spike result (first successful run)

**Machine:** Intel Mac (CPU). **Date:** First successful run.

| Outcome | Value |
|--------|--------|
| **Deterministic** | Yes (run1 and run2 SHA256 identical) |
| **Hash (both runs)** | `e32d970bb444350b2929d2111bc4febdcf79006b7ede078cfb723e70d77696c6` |
| **Time run1** | ~1921 s (~32 min) |
| **Time run2** | ~1857 s (~31 min) |
| **Device** | cpu |
| **Versions** | torch 2.2.2, diffusers 0.27.2 |

**Implications for v1.1:** Fixed-seed SDXL is bit-identical on this hardware; safe to base Mode C generative visuals on it. Per-image latency ~31 min on CPU (GPU would reduce this; use for sprint capacity planning).
