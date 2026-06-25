# Admin UI/UX conventions

House rules for the `/admin` panel. Apply these everywhere — new tabs and edits
to existing ones should follow them. Goal: a calm, uncluttered, fully responsive
panel that never makes the user fight the layout.

## 1. Tuck secondary controls behind toggles
Don't show everything at once. Only the primary content (a list, a table, the
thing the user came for) plus its primary actions are visible by default.
Secondary panels start **collapsed** behind a clearly labeled toggle button:

- **QR / share** → behind a "Compartir / QR" toggle.
- **Filters** → behind a "Filtros" toggle.
- Any bulk/advanced/config controls → behind their own toggle.

Toggle button: real `<button>`, `aria-expanded` reflects state, gets `.is-active`
when open, `aria-controls` points at the panel. Panel uses the `hidden` attribute.
Reference implementation: `.se-actionbar` + `.se-collapse` + `wireCollapse()` in
`js/pages/admin/special-events-tab.js`.

## 2. No horizontal scroll — ever
Data tables must be **responsive**, never a sideways-scrolling strip.

- Table is full width; long values use `word-break` so a cell can't force width.
- Below ~1100px (or wherever it gets cramped), turn each row into a **labeled
  card**: `display:block` the table parts, hide `thead`, and render each cell as
  a `label : value` row via `td[data-label]` + `td::before { content: attr(data-label) }`.
- Put `data-label="…"` on every `<td>` in the renderer so the card view reads well.
- Don't reuse another component's mobile-card rules (e.g. `.events-table`'s
  nth-child rules) for a different column set — give the table its own class.

Reference: `.se-reg-table` in `css/pages/admin/special-events.css`.

## 3. Contrast: never same-tone-on-same-tone
Check every icon/text against the surface behind it.

- The topbar is dark teal → its controls (bell, title, buttons) must be **light**.
- Content links (email, etc.) use `var(--color-dark)`, never the default/inherited
  light link color that can render near-white on white.
- Hover states must keep text legible (no white text appearing on a light hover).

## 4. Mobile-first, responsive to the full extent
Everything must be usable on a phone: stack columns, collapse panels, let action
bars wrap. Test at ~360px wide. No fixed widths that overflow the viewport.

## 5. Inputs ≥ 16px on mobile
Handled globally in `css/base/forms.css` (prevents iOS focus auto-zoom). Don't
re-introduce sub-16px inputs on small screens.
