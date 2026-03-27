#!/usr/bin/env python3
"""
SDXL determinism spike: generate one image twice with a fixed seed, compare outputs, measure time.
Run on the production machine to answer hardware and determinism for Mode C v1.1.
"""

import hashlib
import json
import os
import sys
import time
from pathlib import Path

# Fixed seed (aligns with PRD scene visual seed)
SEED = 12345
PROMPT = "A simple dashboard with a chart and numbers, clean UI, professional."
OUT_DIR = Path(__file__).resolve().parent / "out"
WIDTH = 768
HEIGHT = 768
NUM_INFERENCE_STEPS = 25


def get_device():
    try:
        import torch
        # macOS/CPU wheels don't have torch.xpu; diffusers/accelerate may reference it
        if not hasattr(torch, "xpu"):
            _xpu = type(sys)("torch.xpu")
            _xpu.is_available = lambda: False
            _xpu.empty_cache = lambda: None
            _xpu.synchronize = lambda: None
            _xpu.set_device = lambda _: None
            _xpu.current_device = lambda: 0
            _xpu.device_count = 0

            def _noop(*args, **kwargs):
                return None

            _xpu.__getattr__ = lambda name: _noop  # any other attr (e.g. empty_cache on older code paths)
            torch.xpu = _xpu
        if torch.cuda.is_available():
            return "cuda", torch.device("cuda")
        return "cpu", torch.device("cpu")
    except ImportError:
        return "none", None


def run_one(pipe, run_id: int):
    import torch

    out_path = OUT_DIR / f"run{run_id}.png"
    # New generator each run so we test reproducibility across invocations
    generator = torch.Generator(device=pipe.device).manual_seed(SEED)

    t0 = time.perf_counter()
    result = pipe(
        prompt=PROMPT,
        height=HEIGHT,
        width=WIDTH,
        num_inference_steps=NUM_INFERENCE_STEPS,
        generator=generator,
    )
    elapsed = time.perf_counter() - t0

    image = result.images[0]
    image.save(out_path)
    with open(out_path, "rb") as f:
        raw = f.read()
    return raw, elapsed  # (bytes, time_sec)


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    device_name, device = get_device()
    if device is None:
        print("ERROR: torch not installed. pip install -r requirements-spike.txt", file=sys.stderr)
        return 1

    print("Loading SDXL pipeline (first run may download model)...", flush=True)
    try:
        import torch
        from diffusers import StableDiffusionXLPipeline

        pipe = StableDiffusionXLPipeline.from_pretrained(
            "stabilityai/stable-diffusion-xl-base-1.0",
            torch_dtype=torch.float16 if device_name == "cuda" else torch.float32,
            use_safetensors=True,
        )
        pipe = pipe.to(device)
        if device_name == "cuda":
            pipe.set_progress_bar_config(disable=True)
    except Exception as e:
        print(f"ERROR: Failed to load pipeline: {e}", file=sys.stderr)
        return 1

    try:
        raw1, time1 = run_one(pipe, 1)
        raw2, time2 = run_one(pipe, 2)
    except Exception as e:
        print(f"ERROR: Generation failed: {e}", file=sys.stderr)
        return 1

    hash1 = hashlib.sha256(raw1).hexdigest()
    hash2 = hashlib.sha256(raw2).hexdigest()
    deterministic = hash1 == hash2

    report = {
        "deterministic": deterministic,
        "hash_run1": hash1,
        "hash_run2": hash2,
        "time_run1_sec": round(time1, 3),
        "time_run2_sec": round(time2, 3),
        "device": device_name,
        "seed": SEED,
        "output_dir": str(OUT_DIR),
    }
    try:
        report["torch_version"] = str(torch.__version__)
        report["diffusers_version"] = str(__import__("diffusers").__version__)
    except Exception:
        pass

    print(json.dumps(report, indent=2))
    print("\nDeterministic:", "yes" if deterministic else "no", flush=True)
    print(f"Time run1: {time1:.2f}s  run2: {time2:.2f}s", flush=True)
    print(f"Artifacts: {OUT_DIR}", flush=True)
    return 0 if deterministic else 0  # Exit 0 either way; report is the outcome


if __name__ == "__main__":
    sys.exit(main())
