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
| Build | PostCSS concatenation via `build.sh` — auto-discovers CSS by directory order |
| Hosting | GitHub Pages with custom domain (`irdlex.org`) |
| CI/CD | GitHub Actions — rebuilds `style.css` on push |
| Media | YouTube Data API v3 proxied through Supabase Edge Function |
| Forms | [FormSubmit](https://formsubmit.co) for contact form processing |
| Fonts | Lexend Deca, Geist, Signika, Carattere (Google Fonts) |
| Icons | Font Awesome 6, custom SVG sprite system |

---

## Project Structure

```
IglesiaRestauracion/
├── index.html                    # Homepage
├── visitanos.html                # Plan Your Visit
├── proximos-pasos.html           # Next Steps
├── eventos.html                  # Events page
├── sermones.html                 # Sermon archive (YouTube SPA)
├── doctrina.html                 # Core beliefs
├── vision-valores.html           # Mission, vision & values
├── donacion.html                 # Giving
│
├── css/
│   ├── main.css                  # Import manifest (build entry)
│   ├── style.css                 # Concatenated output (auto-built)
│   ├── base/                     # Reset, defaults
│   ├── tokens/                   # Colors, typography, spacing, radius, shadows, z-index
│   ├── layout/                   # Container, zigzag grid
│   ├── components/               # Buttons, toast, glass-card, captcha, list-card
│   ├── sections/                 # Header, hero, footer, events, accordion, live-stream
│   ├── pages/                    # Page-specific styles (linktree, doctrina, etc.)
│   └── utilities/                # Animations, helpers
│
├── js/
│   ├── main.js                   # App entry — imports, Supabase bridge, event wiring
│   ├── include.js                # Fragment loader (header, footer, events, contact)
│   ├── core/                     # IRD namespace
│   ├── app/                      # UI utilities (animations, accordion, sticky nav, verse)
│   ├── lib/                      # Supabase client, forms, toast, validators, captcha
│   ├── components/               # Shared modules (events, splash, fish-scene, transitions)
│   ├── pages/                    # Page-specific scripts (admin, sermons)
│   └── utils/                    # Icon loader, device detection
│
├── src/                          # HTML fragments loaded by include.js
│   ├── header.html
│   ├── footer.html
│   ├── contact-form.html
│   ├── 4-events.html
│   └── all-events.html
│
├── resources/
│   ├── media/images/             # Optimized images
│   ├── media/logo icons/         # Favicon variants
│   └── verses/                   # Daily Bible verses (JSON)
│
├── scripts/
│   ├── build.sh                  # CSS build pipeline
│   └── seed-presets.js           # Calendar preset seeder
│
├── CNAME                         # Custom domain config
├── robots.txt                    # Crawl rules
├── sitemap.xml                   # Search engine sitemap
└── .env                          # API keys (not committed)
```

---

## CSS Architecture

The design system uses a **modular CSS approach** — source files are organized by concern and auto-discovered by the build script in directory order:

**tokens → base → layout → components → sections → pages → utilities**

The build script (`scripts/build.sh`) concatenates all source files into a single `css/style.css`. A GitHub Actions workflow runs this on every push, so the built file is always up to date.

Key design tokens live in `css/tokens/`:
- `colors.css` — Full teal + orange ramps with automatic dark mode inversion
- `typography.css` — Fluid type scale with `clamp()`, font stack definitions
- `spacing.css` — Responsive padding, margin, and gap scales
- `radius.css`, `shadows.css`, `z-index.css` — Shared visual tokens

Dark mode is handled entirely through `prefers-color-scheme` media queries with inverted color ramps — no JS toggle needed.

---

## Key Features

- **Splash Screen** — Animated fish underwater scene with a loading logo animation
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

### Build CSS

```bash
# Manually rebuild the concatenated stylesheet
bash scripts/build.sh
```

> The GitHub Actions workflow handles this automatically on push.

---

## Environment Variables

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

> **`.env` is the single source of truth.** No hardcoded API key fallbacks in source files.

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

The site deploys automatically to **GitHub Pages** on push to `main`. The GitHub Actions workflow:

1. Runs `build.sh` to concatenate CSS
2. Commits the rebuilt `style.css`
3. Deploys to GitHub Pages with the custom domain (`irdlex.org`)

---

## Contributing

This is a church project maintained by the development team. If you'd like to contribute or report an issue, reach out at [contactanos@irdlex.org](mailto:contactanos@irdlex.org).

---

<p align="center">
  <sub>Built with faith for Iglesia Restauración Divina · Lexington, KY</sub>
</p>