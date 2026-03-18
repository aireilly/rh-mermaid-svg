#!/usr/bin/env bash
# Render all .mmd files in the repo root to SVG and PNG.
# Usage: ./render.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="${SCRIPT_DIR}/out"

mkdir -p "$OUT_DIR"

for mmd in "$SCRIPT_DIR"/*.mmd; do
  base="$(basename "$mmd" .mmd)"
  svg="${OUT_DIR}/${base}.svg"
  png="${OUT_DIR}/${base}.png"

  echo "Rendering ${base}..."

  # Generate SVG
  mmdc -i "$mmd" -o "$svg" \
    -C "$SCRIPT_DIR/rh-diagrams.css" \
    -c "$SCRIPT_DIR/mermaid-config.json" \
    -I rh-diagram-svg

  # Post-process SVG
  node "$SCRIPT_DIR/post-process-svg.mjs" "$svg"

  # Render PNG at 128 DPI, 1013x693
  inkscape "$svg" \
    --export-type=png \
    --export-filename="$png" \
    --export-dpi=128 \
    --export-width=1013 \
    --export-height=693 2>/dev/null

  echo "  -> ${svg}"
  echo "  -> ${png}"
done

echo "Done."
