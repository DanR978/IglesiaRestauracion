# Church Center compatibility

> Snapshot 2026-10-18 · repo `f3b8c94` (= production `main` tree) · every external source was fetched
> 2026-10-17/18. Status vocabulary: **Confirmed** · **Conditional** · **Unsupported** · **Unknown**.
> Source types: *Official doc* (help.planningcenter.com / planningcenter.com), *Official changelog*,
> *Official API* (api.planningcenteronline.com docs / OpenAPI specs), *Staff reply* (Planning Center
> staff on github.com/planningcenter/developers), *Store listing*, *Platform vendor* (Apple, Google,
> WebKit), *Standard* (IETF/W3C). Anything not backed by a source is labeled **Assumption**.

## 1. The integration objective

www.irdlex.org is the church's own web application: a Spanish-language public site (events hub and
calendar, event detail pages, multi-participant event registration with a signed waiver, sermons,
photo gallery, discipleship groups and interest sign-ups, leaders, contact form, newsletter) and an
invite-only staff admin at `/admin/` (events, registrations, treasury, gallery, discipleship, users
and roles, analytics, designer). Visitors and congregants use the public site anonymously; staff
sign in with Supabase Auth. See [current-state-audit.md](current-state-audit.md).

The goal is that people who use the official **Church Center** app (iOS and Android) can reach these
features from inside that app, and that everyone else keeps reaching them exactly as today.

## 2. What Church Center is

- One shared app, published by Planning Center (seller: Ministry Centered Technologies), plus a web
  version at `https://<subdomain>.churchcenter.com`. Users find their church by search, location, or
  setup link, and can connect several churches.
  — [Find your church](https://help.planningcenter.com/en/141274-find-your-church.html) (Official doc)
- No branded app, no branded app icon, no custom domain: "It isn't possible to create a branded app
  logo for Church Center." · "There's not currently a way to use a custom, purchased domain with
  Publishing." — [Publishing](https://www.planningcenter.com/publishing) (Official doc)
- iOS requirement **16.0 or later**; listed language **English** only.
  — [App Store listing](https://apps.apple.com/us/app/church-center-app/id1357742931) (Store listing;
  version 2026.10.2 on 2026-10-18; releases several times a month in Aug–Oct 2026). Android:
  [Play listing](https://play.google.com/store/apps/details?id=com.ministrycentered.churchcenter).
- Church Center is free. Publishing plans: **Essential** free ("App management, home page, and page
  analytics"), **Plus** $15/mo ("Custom pages and themes"), **Premium** $32/mo ("Audio and video
  channels, sermon notes"). — [Publishing](https://www.planningcenter.com/publishing) (prices as of
  2026-10-18)

## 3. Evidence table

| # | Requirement | Status | Evidence | Architectural implication | How to test | External dependency |
|---|---|---|---|---|---|---|
| R1 | An external web app can be reached from the Church Center app | **Confirmed** | "You can add custom pages or URLs to the Church Center navigation" — [Edit navigation](https://help.planningcenter.com/en/139238-edit-church-center-navigation.html) (Official doc) | Integration = **link-out** to canonical irdlex.org URLs ([ADR-0001](architecture-decisions/ADR-0001-church-center-link-out.md)) | CC1: add an item, open it on both platforms | Publishing access (organization admin) |
| R2 | Navigation editing is available on the free Essential plan | **Unknown** | Plan descriptions don't assign navigation to a tier — [Publishing](https://www.planningcenter.com/publishing); the 2020 launch post said arranging navigation "is completely free" — [blog](https://www.planningcenter.com/blog/2020/08/announcing-publishing-create-custom-web-and-app-content) | If not free: home-page buttons (Essential) or Plus custom pages | Check Publishing → Customize in the church's account | Plan tier |
| R3 | Where links appear | **Confirmed** (web) / **Unknown** (app count) | "In the mobile app, the navigation is located at the bottom of each page." · "The top navigation in Church Center displays four pages, with any additional pages accessible by selecting More." — [Edit navigation](https://help.planningcenter.com/en/139238-edit-church-center-navigation.html) | Put the four most-used surfaces first; labels must survive truncation | CC1: count visible items in the app's bottom bar | — |
| R4 | Embedding the app inside a Church Center page (HTML, iframe, script) | **Unsupported** | Block list has no HTML/iframe/script block; video accepts "YouTube, Vimeo, Resi, or Boxcast" only — [Block types](https://help.planningcenter.com/en/142338-understanding-block-types-in-publishing.html) (Official doc) | No embedded/iframe architecture, no postMessage bridge, no framing work | — | — |
| R5 | Custom native screens or plugins inside Church Center | **Unsupported** for churches | Add-ons are a selective partner program ("we get lots of interest but can only work with a few partners" — [Add-on process](https://api.planningcenteronline.com/docs/overview/add-ons/process)) whose documented insertion points are staff-side People screens — [Insertion points](https://api.planningcenteronline.com/docs/overview/add-ons/insertion-points) (Official API) | Nothing native to build | — | — |
| R6 | How the app opens an external URL (in-app browser tab, embedded WebView, or system browser) | **Unknown** | Not in current docs. 2021–22 release notes: "New: Set your preferred browser" — [v2021.3.19](https://www.planningcenter.com/changelog/church-center/1260803617310-new-church-center-app-v2021-3-19); Android "in-app browser now allows opening URL in Chrome" — [v2021.2.8](https://www.planningcenter.com/changelog/church-center/1260802306449-new-church-center-app-v2021-2-8); "open native app views instead of opening in a webview" — [v2021.3.8](https://www.planningcenter.com/changelog/church-center/1260803366489-new-church-center-app-v2021-3-8) (Official changelog) | Design for all three contexts: no reliance on popups, persistent storage, service workers, or third-party cookies ([mobile-compatibility.md](mobile-compatibility.md)) | CC1 diagnostic page + device matrix | Ask Planning Center support |
| R7 | Per-link choice of "open in app" vs "open in browser" | **Unsupported** | Navigation items have URL, label, icon only — [Edit navigation](https://help.planningcenter.com/en/139238-edit-church-center-navigation.html); "Selecting the Open link in new tab only applies when someone is using Church Center in a web browser." — [Block types](https://help.planningcenter.com/en/142338-understanding-block-types-in-publishing.html) | We can't choose the context; the site must work in all of them | — | — |
| R8 | A user-level browser preference still exists | **Unknown** | Present in 2021 (R6); the current [Me page](https://help.planningcenter.com/en/141278-use-the-me-page.html) doc doesn't mention it | Behavior may differ per user, not just per platform | CC1: inspect the app's settings on both platforms | — |
| R9 | Returning to Church Center | **Unknown** | Depends on R6 (close/Done control for in-app browsers; app switcher for the system browser) | Never build our own "back to app" chrome; a plain link to `https://<subdomain>.churchcenter.com/...` opens the app (R18) | CC1 flow F13 | — |
| R10 | The Church Center user's identity reaches irdlex.org | **Unsupported** | "Church Center uses a passwordless login" — [Log in](https://help.planningcenter.com/en/141275-log-in-to-church-center.html); "We don't currently have plans to allow access to the Church Center API from JavaScript on other domains." — [developers #1283](https://github.com/planningcenter/developers/issues/1283) (Staff reply, 2025-05-07) | Public site stays anonymous; nothing can pre-fill or personalize from Church Center | — | — |
| R11 | Planning Center OAuth / OpenID Connect | **Conditional** — only for people with Planning Center logins (staff/volunteers), not congregants who use Church Center's code login | "OIDC lets you authenticate Planning Center users with minimal data access." — [changelog 2025-09-29](https://www.planningcenter.com/changelog/integrations-api/new-openid-connect-for-privacy-conscious-authentication); tokens "expire after 2 hours"; PKCE "require[d] for public apps"; "only Organization Administrators can create OAuth applications" — [Authentication](https://api.planningcenteronline.com/docs/overview/authentication) (Official API) | Not used: Supabase Auth stays the only identity provider ([ADR-0001](architecture-decisions/ADR-0001-church-center-link-out.md)) | — | Org admin creates the app if ever revisited |
| R12 | Planning Center API can put our data into native Church Center screens | **Unsupported** for events and registrations | Calendar has no event-create endpoint (OpenAPI 2026-06-22; staff in [developers #1481](https://github.com/planningcenter/developers/issues/1481): "We do want to provide a first-class path for event creation"); Registrations and Check-Ins are read-only (OpenAPI) | irdlex.org remains the system of record; no sync layer | — | — |
| R13 | Personal Access Tokens from the browser | **Unsupported** | "These tokens cannot be used in client-side requests from a web page." — [Authentication](https://api.planningcenteronline.com/docs/overview/authentication) | Any future API use runs in an Edge Function with a server secret | — | — |
| R14 | Church Center branding is inherited by irdlex.org | **Unsupported** | Logo on any plan; theme colors on paid plans — [Logo and theme](https://help.planningcenter.com/en/139239-customize-your-church-center-logo-and-theme.html); no theme API (Publishing OpenAPI) | irdlex.org keeps its own design system ([design-system.md](design-system.md)); optionally set the Church Center logo/colors to match by hand | — | Paid plan for theme colors |
| R15 | Restrictions on external URLs (HTTPS, domain allow-lists, URL shape) | **Unknown** (undocumented) | No rules in [Edit navigation](https://help.planningcenter.com/en/139238-edit-church-center-navigation.html) | Use canonical `https://www.irdlex.org/<path>/` URLs (trailing slash, D-001) | CC1: confirm the editor accepts the UTM query string | — |
| R16 | Church Center redirects (`/r/…`) to external targets | **Unknown** | Documented as pointing to Church Center pages — [QR/NFC links](https://www.planningcenter.com/changelog/publishing/new-create-reusable-links-for-qr-codes-and-nfc-tags) (Official changelog, 2026-04-16) | Don't depend on them; irdlex.org QR codes keep pointing at irdlex.org | — | — |
| R17 | Approval process for links | **Confirmed** none documented | Publishing has one permission, "Administrator" — [Permissions](https://help.planningcenter.com/en/136862-permissions-in-publishing.html); only organization admins activate the app — [Activate the app](https://help.planningcenter.com/en/139237-activate-the-church-center-mobile-app.html) | Configuration is an owner task, outside the repo | — | Org admin |
| R18 | Links to churchcenter.com open the native app | **Confirmed** | Church Center web links "automatically open in the app" — [changelog 2021-09-20](https://www.planningcenter.com/changelog/church-center/4407110821403-new-church-center-web-links-now-automatically-open-in-the-app) | Any irdlex.org → churchcenter.com link jumps into the app when it's installed; behavior from inside an in-app browser is untested | CC1 flow F13 | — |
| R19 | Storage and cookies in the link-out context | **Conditional** by platform | iOS: SFSafariViewController — "you can't access AutoFill data, browsing history, or website data … To share data between your app and Safari, use ASWebAuthenticationSession" — [Apple](https://developer.apple.com/documentation/safariservices/sfsafariviewcontroller) (Platform vendor); its storage has been separate from Safari's since iOS 11 ([Branch, third-party](https://www.branch.io/resources/blog/ios-11-safari-view-controller-cookie-passthrough-and-the-future-of-mobile-web/)). Android: Custom Tabs have a "Shared cookie jar and permissions model"; WebViews "don't share state with the browser" — [Chrome](https://developer.chrome.com/docs/android/custom-tabs) (Platform vendor). WebKit deletes script-writable storage after 7 days without interaction — [WebKit](https://webkit.org/tracking-prevention/) | A session started in Safari is not the session inside Church Center on iOS; on Android it may be. Never assume a session carries across contexts | CC1: sign in, close, reopen; recovery-email flow F11 | — |
| R20 | Third-party cookies | **Unsupported** in WebKit ("ITP by default blocks all third-party cookies") — [WebKit](https://webkit.org/tracking-prevention/) | Link-out is first-party, so this only matters if someone frames irdlex.org or irdlex.org frames Church Center (the modal, R22) | — | — |
| R21 | People without the app | **Confirmed** | The same URLs work in any browser; Church Center web shows the same navigation links | Nothing extra to build | — | — |
| R22 | Church Center modal on irdlex.org (the reverse direction) | **Confirmed** exists | `https://js.churchcenter.com/modal/v1`; "On mobile devices, the donation form always opens in a new browser window." · "Your website must be encrypted (https)" — [Donation form](https://help.planningcenter.com/en/144372-link-to-your-donation-form-on-your-website.html) | Out of scope; a revisit trigger only if the church adopts Planning Center Giving/Registrations (third-party script, CSP and privacy-policy change) | — | Planning Center products |
| R23 | Church Center's own UI language | **Confirmed** English (store listing); in-app Spanish **Unknown** | [App Store listing](https://apps.apple.com/us/app/church-center-app/id1357742931) | Navigation labels are free text, so they can be Spanish; the surrounding chrome may be English | CC1: check label truncation | Ask Planning Center support |

## 4. Integration methods, ranked

| Method | Status | Decision |
|---|---|---|
| Navigation item → external URL | Confirmed (R1); plan tier Unknown (R2) | **Primary** |
| Home-page button / linked image → external URL | Confirmed — [Home page](https://help.planningcenter.com/en/139214-create-and-edit-your-home-page.html) | **Primary fallback** if R2 fails; also used for featured links |
| Custom page (Plus) with Button blocks → external URLs | Confirmed (Plus $15/mo) | Optional |
| Announcements with an external link | Confirmed; needs Plus/Premium — [Announcements](https://help.planningcenter.com/en/139225-manage-your-announcements-page.html) | Optional, for time-boxed promotion (e.g. VBS registration) |
| Planning Center API (read data into irdlex.org, or write People/forms) | Conditional (R12, R13) | Deferred — revisit trigger |
| Planning Center OIDC for staff | Conditional (R11) | Deferred — revisit trigger |
| Church Center modal on irdlex.org | Confirmed (R22) | Deferred — revisit trigger |
| Embedded app / native screen / white-label app / custom domain | Unsupported (R4, R5, §2) | Rejected |

## 5. User journeys

- **iOS, Church Center app:** open app → bottom navigation item (or home-page button) → irdlex.org
  page opens in a context **to be determined by CC1** (likely an in-app browser tab, per R6) → user
  browses, registers, signs up → closes the browser view (Done/close) to return. The irdlex.org session
  in that view is separate from Safari's (R19).
- **Android, Church Center app:** same, except an in-app browser on Android is likely a Custom Tab
  sharing Chrome's cookies and storage (R19), and 2021 notes describe an "open in Chrome" escape (R6).
- **Church Center web:** navigation link → irdlex.org in the same browser (or a new tab, R7).
- **No app:** unchanged — search, QR codes, WhatsApp, social links, bookmarks.
- **Staff:** `/admin/` is **not** put in Church Center navigation. If a staff member opens it from
  inside Church Center anyway, they sign in there separately on iOS; nothing breaks, but the session
  doesn't carry from Safari (R19).

## 6. Configuration guide (organization admin)

**Prerequisites:** a Planning Center organization; Publishing Essential (free); at least one campus
with "List in Church Center app search" on; the app activated by an organization admin —
[Set up](https://help.planningcenter.com/en/179950-set-up-church-center-and-publishing.html),
[Activate](https://help.planningcenter.com/en/139237-activate-the-church-center-mobile-app.html).

**Add a link:** Publishing → Customize → Navigation → *Add item* → paste the URL into "Search or paste
a link" → Label → Icon → *Save & Publish*
([Edit navigation](https://help.planningcenter.com/en/139238-edit-church-center-navigation.html)).

**URL convention:** `https://www.irdlex.org/<path>/?utm_source=churchcenter&utm_medium=nav` for
navigation items, `utm_medium=home` for home-page buttons, `utm_medium=announcement` for
announcements; `utm_campaign` only for time-boxed promotions. The first-party analytics collector
already stores `utm_source`, `utm_medium` and `utm_campaign` (`supabase/functions/track/index.ts`,
`cleanPath`). UTM can't tell the app from Church Center web — both use the same item — so
platform splits come from the CC1 referrer measurements, not from the URL.

**Proposed set (draft — finalized after CC1; Spanish labels, check truncation):**

| Order | Label | Path |
|---|---|---|
| 1 | Eventos | `/eventos/` |
| 2 | Sermones | `/sermones/` |
| 3 | Discipulado | `/discipulado/` |
| 4 | Visítanos | `/visitanos/` |
| More | Galería · Próximos pasos · Donaciones · Contacto · Líderes · Nuestra iglesia | `/galeria/` · `/proximos-pasos/` · `/donacion/` · `/contacto/` · `/lideres/` · `/quienes-somos/` |

**Configuration register** — keep it in this file. Record roles, never personal names, emails or
account IDs:

| Date | Change | Label | URL | Where | By (role) | Reason |
|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — |

## 7. Constraints that shape the architecture

- **Domains/URLs:** canonical `https://www.irdlex.org/...` only; every public URL is frozen by D-001,
  so a link configured today survives every cutover. The S28 redirect stubs for
  `evento.html?id=` / `evento-especial.html?e=` must forward `location.search`.
- **Redirects:** GitHub Pages redirects are client-side; never rely on server redirects.
- **Cookies/storage:** first-party only; assume storage can be separate per context (R19) and purged
  after 7 days without interaction.
- **Authentication:** passwords and codes are typed in place; email links (invite, recovery) open in
  whatever browser the mail app chooses, so the session they create may land in a different context
  (see [target-architecture.md §5](target-architecture.md#5-authentication-authorization-sessions)).
- **Cross-origin:** no messaging API with the Church Center app exists or is needed.
- **Framing:** nothing embeds irdlex.org, and irdlex.org embeds nothing from Church Center.

## 8. What may not work in the link-out context (to measure in CC1)

| Capability | Where the site uses it | Risk in an embedded WebView | Risk in an in-app browser tab | Fallback |
|---|---|---|---|---|
| Blob downloads (`a.download`) | admin PDFs (pdfmake `.download()`), CSV/QR exports, iOS `.ics` | High (host app must implement downloads) | Medium | Open in the same tab; share sheet; instructions |
| `window.open` / `target=_blank` | maps directions, Google Calendar, social links | High | Medium (opens in the same view or is blocked) | Same-tab navigation |
| `tel:` / `mailto:` / `wa.me` | contact, donation, leaders | Medium (host app decides) | Low | Show the number/address as text where the page allows it |
| Geolocation prompt | `/visitanos/` directions | Medium | Low | Plain maps link |
| Service worker / offline | legacy `sw.js`, port S35 | High on iOS (needs App-Bound Domains) | Low | Site works without it |
| Persistent localStorage | Supabase session, analytics opt-out, theme | Medium (Android WebView DOM storage can be off) | Low (separate jar on iOS) | Re-login messaging |
| Web Share / clipboard / fullscreen | gallery lightbox, QR copy | Medium | Low; element fullscreen unsupported on iPhone | Existing fallbacks |
| YouTube playback | sermons, home | Low | Low | Link to YouTube |
| Realtime websockets in background | events, gallery, admin | Medium (suspended) | Medium | Refetch on visibility change |

## 9. iOS vs Android

| Topic | iOS | Android | Source |
|---|---|---|---|
| Link-out context | Unknown (R6) | Unknown; 2021 notes show an in-app browser with "open in Chrome" | R6 |
| Storage sharing with the main browser | Separate (SFSafariViewController) | Shared (Custom Tabs) / separate (WebView) | R19 |
| Universal / App Links into Church Center | Universal Links | App Links | R18 |
| Minimum OS for the app | 16.0 | see Play listing | §2 |
| Giving inside the app | Apple Pay only (Planning Center Giving) | Google Pay "not supported by the Church Center app" — [Give online](https://help.planningcenter.com/en/140949-give-online.html) | Not used by irdlex.org |

## 10. Questions for Planning Center support

1. Which browser component opens external navigation links on iOS and on Android (SFSafariViewController / Chrome Custom Tabs, an embedded WebView, or the system browser)? Is it the same for home-page buttons?
2. Does the "preferred browser" setting from 2021 still exist, and where?
3. Can the free Essential plan add navigation items that point to external URLs?
4. How many navigation items does the app's bottom bar show before "More"?
5. Is the app UI available in Spanish, and are navigation labels truncated at a fixed length?
6. Is any identity hand-off or SSO for Church Center users on the roadmap?
7. Can Church Center redirects (`/r/…`) point to an external URL?

Log answers here with the date (no ticket numbers, emails or staff names — this file is public).

## 11. Revisit triggers

Reopen [ADR-0001](architecture-decisions/ADR-0001-church-center-link-out.md) if any of these happen:
Planning Center documents embedding, SSO, or an identity hand-off; the church adopts Planning Center
Giving, Registrations, Groups or Calendar as a system of record; the Calendar API gains event creation
(developers #1481); CC1 shows link-out is unusable on a platform; or the app adds a per-link browser
option.
