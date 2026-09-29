#!/usr/bin/env bash
# Export the TabBundle icons and the small promo tile from the SVG sources in this folder.
#
#   public/icons/icon16.png   <- icon16.svg (simplified for 16px)
#   public/icons/icon48.png   <- icon.svg with the viewBox cropped to 12..116 (smaller margin)
#   public/icons/icon128.png  <- icon.svg (art in the center 96x96, outer 16px transparent)
#   store/promo/small-440x280.png <- promo-small.svg (opaque background)
#
# Needs: Google Chrome (headless render of the SVG) and ImageMagick 7 (`magick`).
# The SVG is rendered 8x/16x larger on a transparent background and then box-downscaled,
# which gives clean anti-aliasing. Metadata (timestamps) is stripped from the PNGs.
# Set CHROME=/path/to/chrome if Chrome is somewhere else (Windows/Linux: point it at the Chrome binary).
#
# Usage (from anywhere):  bash store/icon-src/export.sh
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SRC/../.." && pwd)"
ICONS="$ROOT/public/icons"
PROMO="$ROOT/store/promo"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"; rm -f "$SRC"/*.render-tmp.svg' EXIT
mkdir -p "$ICONS" "$PROMO"

# render <svg> <width> <height> <out.png>: headless Chrome screenshot, transparent background.
# The SVG gets an explicit width/height so it is drawn at the top-left at exactly that size
# (headless Chrome keeps a minimum viewport width, so a size-less SVG would be centered).
# The copy stays next to the source so relative references (promo -> icon.svg) still resolve.
# Headless Chrome sometimes keeps running after writing the screenshot, so wait for the file and stop it.
render() {
  local sized="${1%.svg}.render-tmp.svg"
  sed "s/<svg /<svg width=\"$2\" height=\"$3\" /" "$1" > "$sized"
  rm -f "$4"
  "$CHROME" --headless --disable-gpu --hide-scrollbars --no-first-run \
    --no-default-browser-check --disable-extensions \
    --user-data-dir="$TMP/profile" \
    --force-device-scale-factor=1 \
    --default-background-color=00000000 \
    --window-size="$2,$3" \
    --screenshot="$4" "file://$sized" >/dev/null 2>&1 &
  local pid=$! i
  for i in $(seq 1 300); do
    if [ -s "$4" ] && ! kill -0 "$pid" 2>/dev/null; then break; fi
    if [ -s "$4" ] && [ "$i" -gt 20 ]; then sleep 1; break; fi
    sleep 0.1
  done
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  rm -f "$sized"
  [ -s "$4" ] || { echo "render failed: $1" >&2; exit 1; }
}

# icon <svg> <size> <out.png>: render at 16x and box-downscale to <size>
icon() {
  local big=$(( $2 * 16 ))
  render "$1" "$big" "$big" "$TMP/big.png"
  magick "$TMP/big.png" -scale "$2x$2" -strip -define png:color-type=6 "$3"
}

icon "$SRC/icon.svg"   128 "$ICONS/icon128.png"

sed 's/viewBox="0 0 128 128"/viewBox="12 12 104 104"/' "$SRC/icon.svg" > "$TMP/icon48.svg"
grep -q 'viewBox="12 12 104 104"' "$TMP/icon48.svg" || { echo "icon.svg viewBox changed; update the 48px crop" >&2; exit 1; }
icon "$TMP/icon48.svg"  48 "$ICONS/icon48.png"

icon "$SRC/icon16.svg"  16 "$ICONS/icon16.png"

# promo tile: render at 2x (promo-small.svg references icon.svg next to it), downscale, drop alpha
render "$SRC/promo-small.svg" 880 560 "$TMP/promo.png"
magick "$TMP/promo.png" -resize 440x280 -background "#EAF1FD" -flatten -alpha off -strip "$PROMO/small-440x280.png"

echo "exported:"
for f in "$ICONS"/icon16.png "$ICONS"/icon48.png "$ICONS"/icon128.png "$PROMO"/small-440x280.png; do
  magick identify -format "  %f %wx%h\n" "$f"
done
