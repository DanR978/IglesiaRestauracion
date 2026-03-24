#!/usr/bin/env bash
# scripts/build.sh
# Usage from repo root: bash scripts/build.sh

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

append "tokens colors"      "css/tokens/colors.css"
append "tokens typography"  "css/tokens/typography.css"
append "tokens sizes"       "css/tokens/sizes.css"
append "tokens spacing"     "css/tokens/spacing.css"
append "tokens radius"      "css/tokens/radius.css"
append "tokens z-index"     "css/tokens/z-index.css"
append "tokens shadows"     "css/tokens/shadows.css"

append "base" "css/base/base.css"

append "layout container" "css/layout/container.css"
append "layout zigzag"    "css/layout/zigzag.css"

append "components buttons"             "css/components/buttons.css"
append "components captcha"             "css/components/captcha.css"
append "components centered-text-block" "css/components/centered-text-block.css"
append "components glasscard"           "css/components/glasscard.css"
append "components listcard"            "css/components/listcard.css"
append "components logos"               "css/components/logos.css"
append "components toast"               "css/components/toast.css"

append "sections header"        "css/sections/header.css"
append "sections hero"          "css/sections/hero.css"
append "sections mission"       "css/sections/mission.css"
append "sections live-stream"   "css/sections/live-stream.css"
append "sections events"        "css/sections/events.css"
append "sections accordion-faq" "css/sections/section--accordion-faq.css"
append "sections contact-form"  "css/sections/contact-form.css"
append "sections footer"        "css/sections/footer.css"
append "sections service"       "css/sections/service.css"
append "sections versiculo"     "css/sections/versiculo.css"

append "calendar legend"    "css/pages/calendar/legend.css"
append "calendar nav"       "css/pages/calendar/nav.css"
append "calendar grid"      "css/pages/calendar/grid.css"
append "calendar list"      "css/pages/calendar/list.css"
append "calendar day-sheet" "css/pages/calendar/day-sheet.css"
append "calendar modal"     "css/pages/calendar/modal.css"
append "calendar page"      "css/pages/calendar/page.css"

append "admin auth"           "css/pages/admin/auth.css"
append "admin auth-animation" "css/pages/admin/auth-animation.css"
append "admin shell"          "css/pages/admin/shell.css"
append "admin buttons"        "css/pages/admin/buttons.css"
append "admin table"          "css/pages/admin/table.css"
append "admin filters"        "css/pages/admin/filters.css"
append "admin modal"          "css/pages/admin/modal.css"
append "admin forms"          "css/pages/admin/forms.css"
append "admin calendar-tab"   "css/pages/admin/calendar-tab.css"
append "admin presets"        "css/pages/admin/presets.css"
append "admin users"          "css/pages/admin/users.css"

append "pages event-detail" "css/pages/event-detail.css"
append "pages linktree"     "css/pages/linktree.css"

append "utilities animations" "css/utilities/animations.css"

echo ""
echo "Done: $OUT"
echo ""