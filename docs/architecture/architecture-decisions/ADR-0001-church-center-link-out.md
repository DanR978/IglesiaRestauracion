# ADR-0001 — Church Center integration: link out; irdlex.org stays the system of record

- **Status:** Accepted on merge of this change (2026-10-18)
- **Ledger:** D-029 (`MIGRATION.md` §2)
- **Evidence:** [church-center-compatibility.md](../church-center-compatibility.md)

## Context

The owner wants www.irdlex.org reachable from the official Church Center app on iOS and Android.
Planning Center's documentation establishes what is possible:

- A church can add **navigation items, home-page buttons and page links that point to external URLs**
  (R1, §4). It cannot embed a web app (no HTML/iframe/script block, R4), add native screens or plugins
  (R5), or ship a branded app or custom domain (§2).
- How the app opens an external URL is **undocumented** (R6) and can't be chosen per link (R7).
- The Church Center user's identity **can't reach** an external site (R10). Planning Center
  OAuth/OIDC covers people with Planning Center logins, not congregants (R11).
- The API can't create Calendar events, and Registrations is read-only (R12), so irdlex.org data
  can't be pushed into native Church Center screens.

## Decision

1. Integrate by **linking out**: Church Center navigation items (primary) and home-page buttons
   (fallback/featured) point to canonical `https://www.irdlex.org/<path>/` URLs tagged
   `utm_source=churchcenter&utm_medium=nav|home|announcement`.
2. **No embedding, native, plugin or white-label work** — it is unsupported.
3. **irdlex.org remains the system of record** for events, registrations, discipleship, gallery,
   sermons, leaders and treasury. No sync layer with Planning Center.
4. **Supabase Auth remains the only identity provider.** No Planning Center OAuth/OIDC, no
   Church Center SSO.
5. `/admin/` is **not** linked from Church Center navigation.
6. The Church Center modal, Planning Center API use, and Planning Center OIDC for staff are
   **deferred** behind the revisit triggers below.

## Consequences

- **+** Go-live needs configuration, not code, if the CC1 pilot passes. The collector already stores
  `utm_*` (`supabase/functions/track/index.ts`).
- **+** People without the app are unaffected; there is one website.
- **+** Links survive the whole migration because D-001 freezes every public URL. Each cutover still
  gets a Church Center check ([testing-and-rollout.md](../testing-and-rollout.md)).
- **−** In the app, irdlex.org appears inside another app's browser view, whose chrome we don't control.
- **−** On iOS the irdlex.org session inside Church Center is separate from Safari's (R19). Staff
  sign in again there if they ever use it.
- **−** Church Center's own UI is English-only (R23); our pages stay Spanish.
- **−** Our events can't appear in Church Center's native calendar (R12).

## Alternatives considered

| Alternative | Why not |
|---|---|
| Embed irdlex.org inside Church Center | Unsupported (R4) |
| White-label app / custom domain | Unsupported (§2) |
| Move features into Planning Center products (Registrations, Groups, Calendar, Giving) to get native screens | A product decision, not an integration: it replaces custom features (the signed waiver and its signature pad — not verified to exist in Registrations — the Spanish UX, the treasury links), adds subscription costs, and contradicts "make this application available". Not taken; it stays a revisit trigger |
| Sync irdlex.org data into Planning Center via the API | Calendar can't create events; Registrations is read-only (R12) |
| Planning Center OIDC for staff | Only works for people with Planning Center logins, adds a second identity provider, and gives no benefit for this objective (R11) |
| Church Center modal on irdlex.org | Only relevant if Planning Center products are adopted; adds a third-party script and iframe (CSP and privacy-policy changes); opens a new window on mobile anyway (R22) |

## Revisit triggers

Planning Center documents embedding, SSO or identity hand-off · the church adopts Planning Center
Giving, Registrations, Groups or Calendar · the Calendar API gains event creation (developers #1481) ·
CC1 shows link-out is unusable on a platform · the app gains a per-link browser option.

## Findings

*To be appended by CC1 (link-open mechanism per platform; per-surface link-ready / blocked).
Findings refine which surfaces are linked; they do not reverse this decision.*
