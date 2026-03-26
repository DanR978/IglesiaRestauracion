#!/usr/bin/env bash
# scripts/build.sh
# Auto-discovers all .css files. Just drop new files in the right folder.
# Order: tokens → base → layout → components → sections → pages → utilities

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/css/style.css"

echo ""
echo "Building css/style.css..."
echo ""

> "$OUT"

append() {
  local label="$1"
  local file="$ROOT/$2"
  if [ ! -f "$file" ]; then
    echo "  SKIP (not found): $2"
    return
  fi
  printf '\n/* -- %s -- */\n' "$label" >> "$OUT"
  cat "$file" >> "$OUT"
  echo "  OK   $2"
}

# Append all .css in a directory (alphabetical)
append_dir() {
  local prefix="$1" dir="$ROOT/$2"
  [ -d "$dir" ] || return
  for f in "$dir"/*.css; do
    [ -f "$f" ] || continue
    local name rel
    name="$(basename "$f" .css)"
    rel="${f#$ROOT/}"
    append "$prefix $name" "$rel"
  done
}

# Append all .css in subdirectories of a parent
append_subdirs() {
  local prefix="$1" parent="$ROOT/$2"
  [ -d "$parent" ] || return
  for sub in "$parent"/*/; do
    [ -d "$sub" ] || continue
    local dirname
    dirname="$(basename "$sub")"
    for f in "$sub"*.css; do
      [ -f "$f" ] || continue
      local name rel
      name="$(basename "$f" .css)"
      rel="${f#$ROOT/}"
      append "$prefix $dirname $name" "$rel"
    done
  done
}

# ── Cascade order ──
append_dir    "tokens"      "css/tokens"
append_dir    "base"        "css/base"
append_dir    "layout"      "css/layout"
append_dir    "components"  "css/components"
append_dir    "sections"    "css/sections"
append_subdirs "pages"      "css/pages"
append_dir    "pages"       "css/pages"
append_dir    "utilities"   "css/utilities"

echo ""
echo "Done: $OUT"
echo ""