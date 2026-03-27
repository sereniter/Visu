#!/usr/bin/env bash
# Convert MP3 to WAV (44.1 kHz stereo, 16-bit PCM).
# Usage: ./mp3-to-wav.sh <input.mp3> [output.wav]
# If output is omitted, writes same basename with .wav in the same directory.

set -e
INPUT="${1:?Usage: $0 <input.mp3> [output.wav]}"
OUTPUT="${2:-${INPUT%.*}.wav}"
ffmpeg -i "$INPUT" "$OUTPUT"
