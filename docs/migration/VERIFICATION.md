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
[ ]  6. Build                    npm run build          # adapter-static → web/build/ produced, 0 errors;
                                                        #   build-time reads are allowed, but a failed read
                                                        #   renders the loading state, never an empty one
                                                        #   (ADR-0004, D-032)
[ ]  7. Preview smoke            npm run preview & npx playwright test smoke/<surface>
                                                        # ported surface: no console errors, happy path renders,
                                                        #   <head>/OG present on public routes
[ ]  8. Legacy untouched         git diff --stat        # NO change to still-live legacy files
                                                        #   (unless THIS session's scope IS a cutover)
[ ]  9. Parity walk              open OLD vs NEW side by side; note any intended differences
[ ] 10. SEO diff (public only)   view-source: title / description / canonical / OG / JSON-LD match legacy
[ ] 11. SW cache bumped          (cutover sessions only) service-worker version incremented
[ ] 12. Secrets/PII clean        git diff origin/develop...HEAD | grep -nE "$SECRETS"   # no secret, no anon PII
         SECRETS='service_role|sb_secret_|eyJ[A-Za-z0-9_-]{10,}\.eyJ|GOCSPX-|[A-Za-z0-9_~.-]{3}[0-9]Q~[A-Za-z0-9_~.-]{31,34}|\bre_[A-Za-z0-9]{8,}_|PRIVATE KEY'
                                                        # service-role keys, JWTs, Google OAuth client secrets
                                                        #   (GOCSPX-…), Entra/Azure client secrets (…Q~…), Resend
                                                        #   keys, private keys. Read every hit: prose that names
                                                        #   a pattern (this box included) is expected
[ ] 13. Ledger updated           MIGRATION.md: status board + Current state + Next up + new D-xxx/G-xxx
[ ] 14. Cross-engine e2e         npx playwright test    # 0 failures in chromium, webkit, Mobile Safari (iPhone),
                                                        #   Mobile Chrome (Pixel); CI job `e2e` on every PR
[ ] 15. Automated a11y           tests/e2e/a11y.spec.ts # axe: 0 serious/critical violations on every public route
                                                        #   and /app/kit/* page, light and dark; a known violation
                                                        #   is an exception with an owner, recorded in the session
[ ] 16. Manual WCAG 2.2 AA       per ported surface     # each applicable criterion recorded in the PR: 2.4.11 Focus
                                                        #   Not Obscured, 2.5.7 Dragging Movements, 2.5.8 Target
                                                        #   Size, 3.2.6 Consistent Help, 3.3.7 Redundant Entry,
                                                        #   3.3.8 Accessible Authentication
[ ] 17. Performance budget       BASE_PATH=/app npm run build && npm run budget
                                                        # initial JS per prerendered page ≤ web/budget.json + 5%;
                                                        #   tests/e2e/perf.spec.ts: lab LCP ≤ 2.5 s, CLS ≤ 0.1 on a
                                                        #   throttled mobile profile (chromium)
[ ] 18. Supply chain             npm audit --audit-level=high
                                                        # the WHOLE tree: svelte, @sveltejs/kit and devalue are
                                                        #   devDependencies compiled into every page; clean, or an
                                                        #   exception recorded in the PR; every runtime CDN URL
                                                        #   carries an exact version; every CI action is pinned
                                                        #   to a commit SHA
[ ] 19. Security checklist       sessions touching auth, data or Edge Functions
                                                        # checklist pasted in the PR: OWASP ASVS 5.0 Level 1 for
                                                        #   public surfaces; Level 2 for V6 Authentication, V7
                                                        #   Session Management, V8 Authorization on the admin
```

Box 20 (Church Center check) joins this list with the first cutover PR — see [`testing-and-rollout.md` §1](../architecture/testing-and-rollout.md#1-proposed-gates).

**The load-bearing box is #5.** On a codebase that had zero tests, golden parity is what proves the port does exactly what the original did. Any intentional behavior change (e.g. float→cents in treasury) is a deliberate, reviewed golden update recorded as a Decision in `MIGRATION.md §2` — never a silently regenerated snapshot.

**Do NOT unit-test:** Supabase queries (that's RLS's job — cover with a small staging integration suite), Fabric canvas pixels, or exact pdfmake bytes (assert docdef *structure*/text instead).

**PII rule:** any end-to-end test that submits a registration or interest runs against a **staging Supabase project**, never production. No real PII in fixtures.
