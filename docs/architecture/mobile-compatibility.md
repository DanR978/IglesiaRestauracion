# Mobile compatibility

> Snapshot 2026-10-18 · repo `f3b8c94`. **Nothing on this page has been verified on a device yet.**
> The real-device matrix runs in CC1 ([`docs/migration/sessions/CC1-church-center-pilot.md`](../migration/sessions/CC1-church-center-pilot.md));
> results are logged in §5.

## 1. Supported environments

- **Build target:** Vite's `baseline-widely-available` default — for Vite 8, Chrome/Edge 111,
  Firefox 114, Safari/iOS 16.4 ([Vite](https://vite.dev/config/build-options)). It is configurable
  in `vite.config.ts`.
- **Church Center app floor:** iOS 16.0 ([App Store](https://apps.apple.com/us/app/church-center-app/id1357742931)).
  iOS 16.0–16.3 is best-effort; those devices can update within iOS 16.
- **First-class contexts:** iOS Safari · iOS Church Center link-out · Android Chrome · Android Church
  Center link-out · desktop evergreen browsers. The link-out mechanism is unknown until CC1 (R6), so
  every rule below assumes the least capable of an in-app browser tab, an embedded WebView, and the
  system browser.
- **Never required:** popups, service workers, persistent storage, third-party cookies, Web Share,
  clipboard, element fullscreen. Feature-detect, then fall back.
- **No third-party cookie reliance:** GA4 uses first-party cookies; YouTube plays behind a
  click-to-load `youtube-nocookie` facade in the port (S23); the Church Center modal is not used (R22).

## 2. Requirements

"Legacy" is the live site; "Port" is `web/` on `main`.

| # | Area | Rule for new code | Legacy today | Port today |
|---|---|---|---|---|
| 1 | Responsive layout | Fluid tokens first; canonical breakpoints only; no horizontal scroll at 360px | Mostly fluid; ~25 breakpoint values in use | Canonical set; DataTable has no horizontal scroll |
| 2 | Mobile navigation | Drawer with focus trap, Escape and a visible close; links are real anchors | Drawer without focus trap (PORT-DEBT S37) | Header drawer on the S23 branch (verify it renders at full height) |
| 3 | Safe-area insets | `viewport-fit=cover` + `env(safe-area-inset-*)` on fixed bottom UI | Public pages yes; admin no | No `viewport-fit` in `app.html`, so insets read 0; Toast and ActionSheet unpadded |
| 4 | Touch targets | ≥ 44px primary; never < 24px (WCAG 2.5.8) | Several admin controls 15–34px | 44px primary; 36–40px secondary |
| 5 | On-screen keyboard | Inputs compute ≥ 16px on phones; keep the focused field visible (`visualViewport`); don't depend on `interactive-widget` (not in Safari) | 16px rule exists but loses to more specific `select`/`textarea` rules in several forms | Enforced for inputs by test; no keyboard handling |
| 6 | Form focus & validation | Focus the first invalid field; `aria-invalid` + `aria-describedby`; `autocomplete`, `inputmode`, `enterkeyhint`; paste always allowed | Mixed | FormWizard focuses the first invalid field but doesn't wire `aria-*` |
| 7 | Viewport resizing | `dvh`/`svh` with a `vh` fallback for full-height layers; never fixed `100vh` containers | `100vh` header grid; one `svh` | Lightbox `dvh`; Modal/FormWizard `vh` |
| 8 | Nested scroll | `overscroll-behavior: contain` in sheets and dialogs; reference-counted scroll lock | Lock not reference-counted (stacked dialogs unlock the page) | Reference-counted `scroll-lock.ts` |
| 9 | Dialogs & overlays | Visible close (no Escape key on phones); safe-area padding; one focus-trap stack; back closes full-screen overlays | Per-dialog handling | Three overlays outside the shared stack (design-system.md §6) |
| 10 | External links & downloads | Same-tab links; plain `tel:`/`mailto:`/`https://wa.me/` anchors; downloads feature-detected with a fallback | `window.open` inside async geolocation callbacks; blob downloads (PDF, CSV, QR, iOS `.ics`); a cross-origin `download` attribute the browser ignores | Lightbox download fetches a blob first |
| 11 | Authentication redirects | No popups or redirect chains; email links via `token_hash` (works in any browser) | `token_hash` + `verifyOtp` on `/admin/?action=…` | Owed in S39 |
| 12 | Session expiration | `onAuthStateChange`; Spanish "Tu sesión expiró" + sign-in | Not handled — expiry shows up as failed queries | Owed in S38/S39 |
| 13 | Storage & cookies | Assume ephemeral and per-context (7-day WebKit purge; separate iOS jar); never persist personal data drafts on the device | Session in localStorage (supabase-js default) | Same |
| 14 | Back navigation | Every meaningful state is a URL; shallow routing for overlays | Admin tabs, sermons and hub views add no history | Owed in S37 and per overlay |
| 15 | Network failures & loading | Skeleton, then content / empty / error with Retry (ADR-0004); refetch on `visibilitychange` | Errors often render as empty | Repo reads return empty on error (being fixed: S22b) |
| 16 | Accessibility & reduced motion | WCAG 2.2 AA; global reduced-motion guard; motion tokens; pausable background video (2.2.2) | Global guard exists | Global guard; S23 hero video has no pause control |
| 17 | Performance on real devices | p75 LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1 ([web.dev](https://web.dev/articles/vitals)); per-route JS budget | Every page loads a ~5 MB verse file, unused jQuery + Bootstrap, a Realtime socket and a 2-minute events poll | Prerendered; verse computed at build (S23) |

Hover-only interactions: none in new code. Hover effects live inside `@media (hover: hover)`.

## 3. Automated matrix (S05b)

Playwright projects run in CI on every PR that touches `web/`: `chromium` (desktop), `webkit`
(desktop Safari engine), `Mobile Safari` (iPhone descriptor, WebKit) and `Mobile Chrome` (Pixel
descriptor). Each runs the smoke suite plus the flows below that don't need a device, in light and
dark, plus a reduced-motion run. Emulation is not a real iPhone and not Church Center; the device
matrix stays the gate for in-app behavior.

## 4. Real-device matrix

**Environments**

| ID | Environment | CC1 |
|---|---|---|
| E1 | iOS Safari (current iOS) | regression only |
| E2 | iOS — link opened from the Church Center app (current iOS) | **required** |
| E3 | iOS — link from the Church Center app on the oldest iOS available | **required** |
| E4 | Android Chrome | regression only |
| E5 | Android — link opened from the Church Center app, Chrome as default browser | **required** |
| E6 | Android — Church Center app with a non-Chrome default browser (e.g. Samsung Internet) | optional |
| E7 | Desktop browsers | regression only |

**Flows** — never submit personal data in production: registration and discipleship stop at the
final step (minors' data, `docs/migration/VERIFICATION.md` PII rule). Contact and newsletter stop
before submit unless the owner approves a test identity and cleanup.

| ID | Flow | Checks |
|---|---|---|
| F1 | Home | loads, no layout jump, hero behaves under reduced motion |
| F2 | Events hub | list / month views, category filter, back button |
| F3 | Event detail + add-to-calendar | `.ics` on iOS, Google Calendar on Android, return path |
| F4 | Registration wizard to the final step (no submit) | participants add/remove, signature pad drawing, keyboard, validation |
| F5 | Discipleship interest / group sign-up to the final step (no submit) | same as F4 |
| F6 | Sermons | playback inline and fullscreen |
| F7 | Gallery album + lightbox | swipe, share, download |
| F8 | Contact and newsletter forms | validation only |
| F9 | Contact links | `tel:`, `mailto:`, `wa.me`, maps directions (geolocation prompt), Líderes contact icons |
| F10 | Admin sign-in → close the in-app browser → reopen → sign out | session persistence per context |
| F11 | Password recovery requested inside Church Center → open the email | which browser the link opens in; outcome |
| F12 | Admin blank-waiver PDF | download/open behavior (no personal data) |
| F13 | Return to Church Center | close control, back gesture, a link to `churchcenter.com` |
| F14 | Diagnostic page readings (CC1 only) | context, referrer, storage persistence over reload, relaunch and 7+ days |

Every flow in the system theme (one pass light, one dark), plus a VoiceOver (iOS) and TalkBack
(Android) spot check on F2 and F4.

## 5. Results log

Record roles, not names (this file is public).

| Date | Env | Device / OS | Church Center app version | Flow | Result | Notes |
|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — |
