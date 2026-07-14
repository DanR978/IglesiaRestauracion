# Dual-maintenance & freeze rules

The live site serves real users (and collects minors' PII) for the entire multi-month port. These rules keep it safe while the rewrite proceeds.

## The dual-maintenance rule

A change lands in the **legacy** (live) codebase **only if** it is one of:

1. a **security / PII** fix,
2. a **legal** fix (waiver wording, privacy policy), or
3. a **production-down** bug.

Everything else — features, redesigns, nice-to-haves — **waits for the new site** and is filed as a `post-migration` issue. **No new features in the legacy codebase.** Every feature request during the port is a reason to prioritize that surface's migration, not to patch the old one.

## Where a critical fix lands

- **Surface not yet cut over:** fix the legacy (live) code, *and* immediately mirror the fix into the new port — either in the port branch if it exists, or as an issue tagged `dual-fix` so the porting session applies it. 
- **Surface already cut over:** fix the new code only.
- A critical fix always ships **with a test that reproduces it**, added to whichever codebase(s) it touches.

## Freeze windows

No cutover of high-stakes surfaces during high-traffic / high-stakes periods:

- **VBS / registration season (summer):** freeze `eventos/registro` and `/admin`. Legacy-only critical fixes during the freeze. These two surfaces cut over **last and off-season** regardless.
- **Any known high-traffic weekend** (special events, holidays): no cutovers that weekend.

Record the active freeze in `MIGRATION.md §1 → Current state` so a fresh session sees it immediately. As of the plan's creation (2026-07-13) a VBS-season freeze is active.

## Why cut over admin last

`/admin` is auth-gated (zero SEO cost to delay), self-contained, and the biggest surface (auth, MFA, treasury money math, the Fabric designer, pdfmake). Cutting it last means the highest-risk code ships after the whole component library, data layer, and test harness are proven on the public site.
