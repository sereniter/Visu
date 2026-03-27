#!/usr/bin/env bash
# Normalize a music WAV to LUFS -16 (acceptable range for VISU is -17 to -15).
# Usage: ./normalize-music-lufs.sh <input.wav> [output.wav]
# If output is omitted, writes <input>-normalized.wav in the same directory.

set -e
INPUT="${1:?Usage: $0 <input.wav> [output.wav]}"
OUTPUT="${2:-${INPUT%.*}-normalized.wav}"
ffmpeg -i "$INPUT" -filter:a loudnorm=I=-16:LRA=11:TP=-1.5 -ar 48000 "$OUTPUT" -y
echo "Wrote $OUTPUT (target -16 LUFS, 48 kHz). Use this path in config or script."
