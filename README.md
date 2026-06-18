<p align="center">
  <img src="https://raw.githubusercontent.com/DanR978/IglesiaRestauracion/refs/heads/main/resources/media/logo%20icons/light-church-logo.ico" alt="IRD Logo" width="80">
</p>

<h1 align="center">Iglesia Restauración Divina</h1>

<p align="center">
  <strong>irdlex.org</strong> — The official website for Iglesia Restauración Divina in Lexington, Kentucky.
</p>

<p align="center">
  <a href="https://www.irdlex.org">Live Site</a> · 
  <a href="https://www.youtube.com/@Lex.IglesiaRestauracionDivina">YouTube</a> · 
  <a href="https://www.instagram.com/iglesiarestauracion.divina">Instagram</a> · 
  <a href="https://www.facebook.com/iglesia.restauracion2016/">Facebook</a>
</p>

---

## About

A bilingual church website built to serve the Hispanic Christian community in Lexington, KY. The site provides service information, event listings, sermon archives, and a way for visitors to connect with the church — all wrapped in an immersive, mobile-first experience.

**Service Times**
- Domingos de Adoración — 2:00 PM (ET)
- Estudio Bíblico — Martes 7:00 PM (ET)
- Servicio de Oración — Viernes 7:00 PM (ET)

**Location:** 2601 Clays Mill Rd, Lexington, KY 40503

---

## Pages

| Page | Description |
|------|-------------|
| Home | Hero, mission statement, daily verse, live stream embed, upcoming events, donation CTA |
| Plan Your Visit | Service times, directions, FAQ accordion |
| Próximos Pasos | Salvation, baptism, and serving — zigzag storytelling layout |
| Events | Upcoming events grid powered by Supabase in real-time |
| Sermones | YouTube playlist SPA pulling from the church channel |
| Donación | Giving page |
| Doctrina | Core beliefs — 7 doctrines in zigzag layout |
| Visión y Valores | Mission, vision, and values with interactive cards |
| Contact | Contact form (via FormSubmit) |

---

## Tech Stack

| Layer | Tool |
|-------|------|
| Frontend | Vanilla JavaScript (ES Modules), custom CSS design system |
| Backend | [Supabase](https://supabase.com) — Auth, Database, Storage, Edge Functions, Realtime |
| Build | Plain `cat` concatenation via `build.sh` (no PostCSS) + Node build scripts for heads/sitemap/partials |
| Hosting | GitHub Pages with custom domain (`irdlex.org`) |
| CI/CD | GitHub Actions — builds CSS + heads + sitemap, inlines partials, deploys |
| Media | YouTube Data API v3 proxied through Supabase Edge Function |
| Forms | [FormSubmit](https://formsubmit.co) for contact form processing |
| Fonts | Lexend Deca, Geist, Signika, Carattere (Google Fonts) |
| Icons | Font Awesome 6, custom SVG sprite system |

---

## Project Structure

Public pages use folder/`index.html` routing (clean trailing-slash URLs):

```
IglesiaRestauracion/
├── index.html                    # Homepage
├── 404.html                      # Custom not-found page
├── visitanos/index.html          # Plan Your Visit
├── proximos-pasos/index.html     # Next Steps
├── eventos/index.html            # Events    (eventos/evento.html = detail template)
├── sermones/index.html           # Sermon archive (YouTube SPA)
├── doctrina/index.html           # Core beliefs
├── vision-valores/index.html     # Mission, vision & values
├── donacion/index.html           # Giving
├── galeria/, calendario/, contacto/, discipulado/, quienes-somos/, …
├── admin/index.html              # Admin console (noindex; loads css/admin.css)
│
├── css/                          # SOURCE — never hand-edit css/style.css
│   ├── style.css                 # Generated bundle (public). Built by build.sh
│   ├── admin.css                 # Generated bundle (admin only)
│   ├── tokens/  base/  layout/  components/  sections/  pages/  utilities/
│
├── js/                           # ES modules
│   ├── main.js  include.js  core/  app/  lib/  components/  pages/  utils/
│
├── src/                          # HTML partials inlined into pages at build time
│   ├── header.html  footer.html  contact-form.html
│   ├── 4-events.html  all-events.html
│
├── scripts/
│   ├── build.sh                  # Concatenates css/** → style.css + admin.css (plain cat)
│   ├── build-heads.mjs           # Regenerates every page <head> from a data map
│   ├── build-sitemap.mjs         # Regenerates sitemap.xml from git commit dates
│   ├── inline-includes.mjs       # Inlines src/ partials into each page body
│   └── add-faqs.mjs              # One-off FAQ generator (already applied)
│
├── supabase/                     # Edge functions + RLS migrations
├── CNAME  robots.txt  sitemap.xml  manifest.json  sw.js
└── js/lib/config.js              # Generated at deploy from GitHub Secrets (gitignored)
```

---

## CSS Architecture

The design system uses a **modular CSS approach** — source files are organized by concern and auto-discovered by the build script in directory order:

**tokens → base → layout → components → sections → pages → utilities**

The build script (`scripts/build.sh`) concatenates all source files into a single `css/style.css` with plain `cat` (no PostCSS, no `@import`). **Never hand-edit `css/style.css`** — edit the source files under `css/{tokens,base,…}/` and rerun the build. Admin-only styles are emitted separately to `css/admin.css` so public visitors don't download them.

Key design tokens live in `css/tokens/`:
- `colors.css` — Full teal + orange ramps with automatic dark mode inversion
- `typography.css` — Fluid type scale with `clamp()`, font stack definitions
- `spacing.css` — Responsive padding, margin, and gap scales
- `radius.css`, `shadows.css`, `z-index.css` — Shared visual tokens

Dark mode is handled entirely through `prefers-color-scheme` media queries with inverted color ramps — no JS toggle needed.

---

## Key Features

- **Page Transitions** — Cross-page overlay transitions coordinated via `sessionStorage`
- **Real-time Events** — Supabase Realtime subscriptions + polling fallback for live event updates
- **Daily Bible Verse** — Random verse served from local JSON, displayed on the homepage
- **Live Stream Detection** — Auto-embeds YouTube live stream when available
- **Sermon Archive** — SPA that pulls the church YouTube playlist via server-side proxy
- **Scroll Animations** — Intersection Observer-based fade/slide/zoom animations
- **Admin Panel** — Event CRUD wizard, calendar management, image uploads, user management
- **Contact Form** — AJAX submission with validation and toast notifications
- **Responsive Design** — Mobile-first with fluid typography and container queries

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) (for Vite dev server and build scripts)
- A `.env` file at the project root with your Supabase credentials

### Development

```bash
# Install dependencies
npm install

# Start the dev server (DO NOT use VS Code Live Server — import.meta.env will crash)
npm run dev
```

### Build

```bash
npm run build:css      # regenerate css/style.css + css/admin.css (build.sh)
npm run build:heads    # regenerate every page <head> from the data map
npm run build:sitemap  # regenerate sitemap.xml from git commit dates
npm run inline         # inline src/ partials (header/footer/contact-form) into pages
npm run build:site     # all of the above, in order
```

> The GitHub Actions deploy workflow runs the full pipeline automatically on push to `main`. After editing CSS locally, run `git checkout -- css/admin.css` if only its line endings changed.

---

## Configuration

The browser reads runtime config from `js/lib/config.js`, which is **generated at deploy time** from GitHub Actions secrets (see `.github/workflows/deploy.yml`) and is gitignored. For local development, copy the example:

```bash
cp js/lib/config.example.js js/lib/config.js   # then fill in your values
```

The Supabase URL and anon key in `config.js` are public by design — row-level security (RLS) is what protects the data. Service-role keys live only in Supabase Edge Functions and never reach the browser.

---

## Supabase Setup

The project uses Supabase for:

| Service | Purpose |
|---------|---------|
| Database | Events table, calendar presets |
| Auth | Admin panel access |
| Storage | `web-images` and `event-images` buckets |
| Edge Functions | YouTube API proxy (keeps API key server-side) |
| Realtime | Live event updates on the frontend |

RLS policies follow the pattern: **anon can read, authenticated can write**.

---

## Deployment

The site deploys automatically to **GitHub Pages** on push to `main`. The deploy workflow:

1. Generates `js/lib/config.js` from repository secrets
2. Builds CSS (`build.sh`), page heads (`build-heads.mjs`), and the sitemap (`build-sitemap.mjs`)
3. Inlines the shared `src/` partials into each page (`inline-includes.mjs`)
4. Prunes build tooling / backend / dependencies from the artifact
5. Deploys to GitHub Pages with the custom domain (`irdlex.org`)

---

## Contributing

This is a church project maintained by the development team. If you'd like to contribute or report an issue, reach out at [contactanos@irdlex.org](mailto:contactanos@irdlex.org).

---

<p align="center">
  <sub>Built with faith for Iglesia Restauración Divina · Lexington, KY</sub>
</p>