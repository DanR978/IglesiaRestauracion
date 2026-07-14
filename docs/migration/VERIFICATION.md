# Verification gate

A session is **not done** until every applicable box is green and the results are pasted into the PR description. This is the reusable checklist referenced by every session file.

```
VERIFICATION GATE  —  paste results into the PR

[ ]  1. Install clean            cd web && npm ci
[ ]  2. Typecheck                npm run check          # svelte-check --tsconfig ./tsconfig.json → 0 errors
[ ]  3. Lint / format            npm run lint           # eslint + prettier --check → 0 errors
[ ]  4. Unit tests               npm run test           # vitest run → all pass; coverage not below prior
[ ]  5. Golden parity            npm run test:golden    # ported module byte-identical to the legacy golden,
                                                        #   OR the diff is explicitly approved in MIGRATION.md §2
[ ]  6. Build                    npm run build          # adapter-static → web/build/ produced, 0 errors,
                                                        #   prerender ran with no network access
[ ]  7. Preview smoke            npm run preview & npx playwright test smoke/<surface>
                                                        # ported surface: no console errors, happy path renders,
                                                        #   <head>/OG present on public routes
[ ]  8. Legacy untouched         git diff --stat        # NO change to still-live legacy files
                                                        #   (unless THIS session's scope IS a cutover)
[ ]  9. Parity walk              open OLD vs NEW side by side; note any intended differences
[ ] 10. SEO diff (public only)   view-source: title / description / canonical / OG / JSON-LD match legacy
[ ] 11. SW cache bumped          (cutover sessions only) service-worker version incremented
[ ] 12. Secrets/PII clean        grep the patch: no SUPABASE_* service_role, no anon PII, no API keys
[ ] 13. Ledger updated           MIGRATION.md: status board + Current state + Next up + new D-xxx/G-xxx
```

**The load-bearing box is #5.** On a codebase that had zero tests, golden parity is what proves the port does exactly what the original did. Any intentional behavior change (e.g. float→cents in treasury) is a deliberate, reviewed golden update recorded as a Decision in `MIGRATION.md §2` — never a silently regenerated snapshot.

**Do NOT unit-test:** Supabase queries (that's RLS's job — cover with a small staging integration suite), Fabric canvas pixels, or exact pdfmake bytes (assert docdef *structure*/text instead).

**PII rule:** any end-to-end test that submits a registration or interest runs against a **staging Supabase project**, never production. No real PII in fixtures.
