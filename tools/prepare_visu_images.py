#!/usr/bin/env python3
"""
prepare_visu_images.py
======================
Prepares Gemini-generated images for VISU Mode C testing.
Run in a venv with Pillow installed: pip install Pillow

Modes:
- Contract-driven: --contract <path> uses contract's content_root and scenes.
  Images in content_root/assets/visuals (sorted by name) are mapped 1:1 to
  contract scenes: resize to 1920x1080, save as contract's asset_path, write
  .provenance.json with hash.
- Legacy: VISU_INPUT_DIR / VISU_OUTPUT_DIR and hardcoded SCENES (drone wars).
"""

import argparse
import json
import hashlib
import os
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

# ─── CONFIG ───────────────────────────────────────────────────────────────────

# Where your downloaded Gemini images are
INPUT_DIR = os.environ.get("VISU_INPUT_DIR", "./gemini_downloads")

# Where VISU expects the final images
OUTPUT_DIR = os.environ.get("VISU_OUTPUT_DIR", "./Visu/assets/visuals")

# Target dimensions (locked by VISU spec)
TARGET_WIDTH = 1920
TARGET_HEIGHT = 1080

# ─── SCENE MAPPING ────────────────────────────────────────────────────────────
# These are the exact filenames VISU's contract expects.
# Order matches contract_v1.3.json scene order.

SCENES = [
    {
        "scene_id": "scene_01_hook",
        "filename": "scene_01_shahed_swarm.png",
        "prompt_key": "drone_swarm_night_sky_dramatic",
        "seed": 42001,
        "description": "Drone swarm over night sky — Hook scene",
    },
    {
        "scene_id": "scene_02_shahed_origin",
        "filename": "scene_02_shahed136.png",
        "prompt_key": "shahed136_technical_infographic",
        "seed": 42002,
        "description": "Shahed-136 technical infographic",
    },
    {
        "scene_id": "scene_03_russia_copies",
        "filename": "scene_03_geran2_russia.png",
        "prompt_key": "geran2_drone_russia_ukraine",
        "seed": 42003,
        "description": "Geran-2 Russia/Ukraine map",
    },
    {
        "scene_id": "scene_04_april2024_attack",
        "filename": "scene_04_april2024_attack.png",
        "prompt_key": "iran_israel_attack_route_map",
        "seed": 42004,
        "description": "Iran-Israel April 2024 attack route map",
    },
    {
        "scene_id": "scene_05_economics",
        "filename": "scene_05_economics.png",
        "prompt_key": "drone_vs_missile_cost_comparison",
        "seed": 42005,
        "description": "Drone vs missile cost comparison infographic",
    },
    {
        "scene_id": "scene_06_us_reverse_engineers",
        "filename": "scene_06_lucas_drone.png",
        "prompt_key": "lucas_drone_us_military_pentagon",
        "seed": 42006,
        "description": "LUCAS drone at Pentagon",
    },
    {
        "scene_id": "scene_07_operation_epic_fury",
        "filename": "scene_07_epic_fury.png",
        "prompt_key": "us_israel_iran_strike_map_2026",
        "seed": 42007,
        "description": "Operation Epic Fury 2026 map",
    },
    {
        "scene_id": "scene_08_multiverse_conclusion",
        "filename": "scene_08_multiverse.png",
        "prompt_key": "drone_multiverse_all_nations",
        "seed": 42008,
        "description": "Copycat drone multiverse — all nations comparison",
    },
]


# ─── HELPERS ──────────────────────────────────────────────────────────────────

def sha256_file(path: str) -> str:
    """Compute SHA256 hash of a file."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def resize_and_save(input_path: str, output_path: str) -> None:
    """Resize image to 1920x1080 using LANCZOS and save as PNG."""
    img = Image.open(input_path)

    if img.mode != "RGB":
        img = img.convert("RGB")

    original_size = img.size
    img = img.resize((TARGET_WIDTH, TARGET_HEIGHT), Image.LANCZOS)
    img.save(output_path, "PNG", optimize=False)

    print(
        f"  Resized: {original_size[0]}x{original_size[1]}"
        f" → {TARGET_WIDTH}x{TARGET_HEIGHT}"
    )


def write_provenance(
    output_png_path: str,
    scene: dict,
    sha256: str,
    relative_asset_path: str | None = None,
) -> str:
    """Write .provenance.json sidecar next to the PNG."""
    provenance_filename = Path(output_png_path).stem + ".provenance.json"
    provenance_path = str(Path(output_png_path).parent / provenance_filename)

    rel = relative_asset_path or f"assets/visuals/{scene['filename']}"

    provenance = {
        "schema_version": "1.0",
        "asset_path": rel,
        "prompt_key": scene["prompt_key"],
        "model": "gemini-2.0-flash-preview-image-generation",
        "model_version": "gemini-2.0-flash-exp",
        "seed": scene["seed"],
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "generated_by": "manual-test-gemini",
        "dimensions": {
            "width": TARGET_WIDTH,
            "height": TARGET_HEIGHT,
        },
        "output_hash": sha256,
        "approved": True,
        "approved_by": "manual-test",
        "content_policy": "military_historical_educational",
        "tool_used": "gemini_image_app",
        "fallback_tool": None,
    }

    with open(provenance_path, "w", encoding="utf-8") as f:
        json.dump(provenance, f, indent=2)

    return provenance_path


def list_input_images(input_dir: str) -> list:
    """List all image files in the input directory."""
    supported = {".png", ".jpg", ".jpeg", ".webp"}
    files = [
        f
        for f in sorted(Path(input_dir).iterdir())
        if f.suffix.lower() in supported
    ]
    return files


# ─── CONTRACT-DRIVEN MODE ─────────────────────────────────────────────────────

def run_contract_mode(contract_path: str) -> None:
    """Use contract content_root and scenes; images in assets/visuals (sorted) → 1:1 to scenes."""
    with open(contract_path, encoding="utf-8") as f:
        contract = json.load(f)
    content_root = Path(contract.get("content_root", ""))
    if not content_root.is_absolute():
        content_root = Path(contract_path).resolve().parent / content_root
    else:
        content_root = Path(content_root)
    visuals_dir = content_root / "assets" / "visuals"
    scenes = contract.get("scenes", [])
    if not scenes:
        print(f"\n❌ No scenes in contract: {contract_path}")
        return

    print("\n" + "=" * 60)
    print("VISU — CONTRACT-DRIVEN IMAGE PREPARATION")
    print("=" * 60)
    print(f"\nContract:   {contract_path}")
    print(f"Content:    {content_root}")
    print(f"Visuals:    {visuals_dir}")
    print(f"Scenes:     {len(scenes)}")

    if not visuals_dir.exists():
        print(f"\n❌ Visuals folder does not exist: {visuals_dir}")
        return
    visuals_dir.mkdir(parents=True, exist_ok=True)

    input_files = list_input_images(str(visuals_dir))
    if not input_files:
        print(f"\n❌ No images in {visuals_dir}")
        return
    if len(input_files) < len(scenes):
        print(f"\n❌ Need {len(scenes)} images, found {len(input_files)}")
        return

    results = []
    print("\n" + "=" * 60)
    print("PROCESSING IMAGES")
    print("=" * 60)

    for i, scene in enumerate(scenes):
        visual = scene.get("visual", {})
        asset_path = visual.get("asset_path", f"assets/visuals/scene_{i+1:02d}.png")
        scene_id = scene.get("scene_id", f"scene_{i+1:02d}")
        prompt_key = visual.get("prompt_key", "unknown")
        seed = visual.get("seed", 40000 + i + 1)
        output_path = content_root / asset_path
        output_path.parent.mkdir(parents=True, exist_ok=True)
        input_path = input_files[i]

        entry = {
            "scene_id": scene_id,
            "filename": Path(asset_path).name,
            "prompt_key": prompt_key,
            "seed": seed,
            "asset_path": asset_path,
        }
        print(f"\n[{i + 1}/{len(scenes)}] {scene_id}")
        print(f"  Input:  {input_path.name}")
        print(f"  Output: {output_path.name}")

        try:
            resize_and_save(str(input_path), str(output_path))
            sha256 = sha256_file(str(output_path))
            print(f"  SHA256: {sha256[:16]}...{sha256[-8:]}")
            write_provenance(
                str(output_path),
                entry,
                sha256,
                relative_asset_path=asset_path,
            )
            print(f"  Provenance: {Path(output_path).stem}.provenance.json ✅")
            results.append({"scene_id": scene_id, "filename": entry["filename"], "sha256": sha256, "status": "ok"})
        except Exception as e:  # noqa: BLE001
            print(f"  ❌ Error: {e}")
            results.append(
                {"scene_id": scene_id, "filename": entry["filename"], "status": "failed", "error": str(e)}
            )

    ok = [r for r in results if r["status"] == "ok"]
    fails = [r for r in results if r["status"] == "failed"]
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"\n✅ Processed: {len(ok)}/{len(scenes)} scenes")
    if fails:
        for f in fails:
            print(f"   ❌ {f['scene_id']}: {f['error']}")
    if len(ok) == len(scenes):
        print(f"\n🎉 All images ready. Location: {visuals_dir}")
    hash_ref_path = visuals_dir / "_hash_reference.json"
    with open(hash_ref_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    print(f"\n📋 Hash reference: {hash_ref_path}")


# ─── LEGACY MAIN ─────────────────────────────────────────────────────────────

def main_legacy() -> None:
    print("\n" + "=" * 60)
    print("VISU MODE C — IMAGE PREPARATION SCRIPT (tools version)")
    print("Drone Wars Copycat — 8 scenes")
    print("=" * 60)

    print(f"\nInput dir:  {INPUT_DIR}")
    print(f"Output dir: {OUTPUT_DIR}")

    input_path = Path(INPUT_DIR)
    if not input_path.exists():
        print(f"\n❌ Input folder does not exist: {INPUT_DIR}")
        return

    Path(OUTPUT_DIR).mkdir(parents=True, exist_ok=True)
    input_files = list_input_images(INPUT_DIR)
    if not input_files:
        print(f"\n❌ No images found in {INPUT_DIR}")
        return
    print(f"\nFound {len(input_files)} image(s) in {INPUT_DIR}")
    if len(input_files) < len(SCENES):
        print(f"\n❌ Need at least {len(SCENES)} images, found {len(input_files)}.")
        return

    mapping = {i: input_files[i] for i in range(len(SCENES))}
    print("\n" + "=" * 60)
    print("PROCESSING IMAGES")
    print("=" * 60)
    results = []

    for scene_idx, input_path in mapping.items():
        scene = SCENES[scene_idx]
        output_path = str(Path(OUTPUT_DIR) / scene["filename"])
        print(f"\n[{scene_idx + 1}/8] {scene['scene_id']}")
        print(f"  Input:  {input_path.name}")
        print(f"  Output: {scene['filename']}")
        try:
            resize_and_save(str(input_path), output_path)
            sha256 = sha256_file(output_path)
            print(f"  SHA256: {sha256[:16]}...{sha256[-8:]}")
            write_provenance(output_path, scene, sha256)
            print(f"  Provenance: {Path(output_path).stem}.provenance.json ✅")
            results.append(
                {"scene_id": scene["scene_id"], "filename": scene["filename"], "sha256": sha256, "status": "ok"}
            )
        except Exception as e:  # noqa: BLE001
            print(f"  ❌ Error: {e}")
            results.append(
                {"scene_id": scene["scene_id"], "filename": scene["filename"], "status": "failed", "error": str(e)}
            )

    ok = [r for r in results if r["status"] == "ok"]
    fails = [r for r in results if r["status"] == "failed"]
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"\n✅ Processed: {len(ok)}/{len(SCENES)} scenes")
    if fails:
        for f in fails:
            print(f"   - {f['scene_id']}: {f['error']}")
    if len(ok) == len(SCENES):
        print(f"\n🎉 All {len(SCENES)} images ready. Location: {OUTPUT_DIR}/")
    else:
        print(f"\n⚠️  {len(SCENES) - len(ok)} scene(s) still need images.")
    hash_ref_path = str(Path(OUTPUT_DIR) / "_hash_reference.json")
    with open(hash_ref_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    print(f"\n📋 Hash reference saved: {hash_ref_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare images for VISU Mode C (resize, hash, provenance).")
    parser.add_argument(
        "--contract",
        metavar="PATH",
        help="Contract JSON path (v1.3). Uses content_root and scenes; images in content_root/assets/visuals.",
    )
    args = parser.parse_args()
    if args.contract:
        run_contract_mode(args.contract)
    else:
        main_legacy()


if __name__ == "__main__":
    main()

