#!/usr/bin/env bash
# Download and verify Piper TTS model files declared in models/piper/models.json.
# Usage:
#   ./scripts/download_piper_models.sh            # download all missing models
#   ./scripts/download_piper_models.sh --verify   # verify already-downloaded models only
#   ./scripts/download_piper_models.sh --force    # re-download even if file exists

set -euo pipefail

MANIFEST="$(cd "$(dirname "$0")/.." && pwd)/models/piper/models.json"
DEST_DIR="$(cd "$(dirname "$0")/.." && pwd)/models/piper"
VERIFY_ONLY=false
FORCE=false

for arg in "$@"; do
  case "$arg" in
    --verify) VERIFY_ONLY=true ;;
    --force)  FORCE=true ;;
  esac
done

command -v curl  >/dev/null 2>&1 || { echo "ERROR: curl is required"; exit 1; }
command -v shasum >/dev/null 2>&1 || { echo "ERROR: shasum is required"; exit 1; }
command -v node  >/dev/null 2>&1 || { echo "ERROR: node is required to parse JSON"; exit 1; }

COUNT=$(node -e "const m=require('$MANIFEST'); console.log(m.models.length)")
echo "Piper model manifest: $COUNT models"
echo ""

FAILED=0

for i in $(seq 0 $((COUNT - 1))); do
  VOICE=$(node    -e "const m=require('$MANIFEST'); console.log(m.models[$i].voice)")
  ONNX_URL=$(node -e "const m=require('$MANIFEST'); console.log(m.models[$i].onnx_url)")
  CFG_URL=$(node  -e "const m=require('$MANIFEST'); console.log(m.models[$i].config_url)")
  EXPECTED=$(node -e "const m=require('$MANIFEST'); console.log(m.models[$i].sha256)")
  ONNX_FILE="$DEST_DIR/${VOICE}.onnx"
  CFG_FILE="$DEST_DIR/${VOICE}.onnx.json"

  echo "── $VOICE"

  if $VERIFY_ONLY; then
    if [ ! -f "$ONNX_FILE" ]; then
      echo "   MISSING: $ONNX_FILE"
      FAILED=$((FAILED + 1))
      continue
    fi
  else
    if [ ! -f "$ONNX_FILE" ] || $FORCE; then
      echo "   Downloading .onnx  → $ONNX_FILE"
      curl -L --progress-bar "$ONNX_URL" -o "$ONNX_FILE"
    else
      echo "   Already present, skipping download (use --force to re-download)"
    fi

    if [ ! -f "$CFG_FILE" ] || $FORCE; then
      echo "   Downloading .onnx.json → $CFG_FILE"
      curl -L --silent "$CFG_URL" -o "$CFG_FILE"
    fi
  fi

  ACTUAL=$(shasum -a 256 "$ONNX_FILE" | awk '{print $1}')
  if [ "$ACTUAL" = "$EXPECTED" ]; then
    echo "   SHA256 OK"
  else
    echo "   SHA256 MISMATCH"
    echo "     expected: $EXPECTED"
    echo "     actual:   $ACTUAL"
    FAILED=$((FAILED + 1))
  fi
done

echo ""
if [ "$FAILED" -eq 0 ]; then
  echo "All $COUNT models OK."
else
  echo "FAILED: $FAILED model(s) did not pass verification."
  exit 1
fi
