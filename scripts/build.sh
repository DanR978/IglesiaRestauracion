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

# Append all .css in subdirectories of a parent (optional 3rd arg = subdir to skip)
append_subdirs() {
  local prefix="$1" parent="$ROOT/$2" exclude="$3"
  [ -d "$parent" ] || return
  for sub in "$parent"/*/; do
    [ -d "$sub" ] || continue
    local dirname
    dirname="$(basename "$sub")"
    [ -n "$exclude" ] && [ "$dirname" = "$exclude" ] && continue
    for f in "$sub"*.css; do
      [ -f "$f" ] || continue
      local name rel
      name="$(basename "$f" .css)"
      rel="${f#$ROOT/}"
      append "$prefix $dirname $name" "$rel"
    done
  done
}

# ── Public bundle (css/style.css) — everything EXCEPT the admin page CSS,
#    which only the /admin route needs and which public visitors shouldn't
#    have to download. ──
append_dir    "tokens"      "css/tokens"
append_dir    "base"        "css/base"
append_dir    "layout"      "css/layout"
append_dir    "components"  "css/components"
append_dir    "sections"    "css/sections"
append_subdirs "pages"      "css/pages"   "admin"   # skip css/pages/admin/*
append_dir    "pages"       "css/pages"
append_dir    "utilities"   "css/utilities"

echo ""
echo "Done: $OUT"

# ── Admin-only bundle (css/admin.css) — loaded only by admin/index.html,
#    layered on top of style.css. ──
OUT="$ROOT/css/admin.css"
> "$OUT"
echo ""
echo "Building css/admin.css..."
echo ""
append_dir "pages admin" "css/pages/admin"

echo ""
echo "Done: $OUT"
echo ""