# ADR-0003 — Design tokens: three layers in CSS custom properties, plus motion tokens

- **Status:** Accepted on merge of this change (2026-10-18)
- **Ledger:** D-031 (`MIGRATION.md` §2). **Amends** `docs/migration/DESIGN-SYSTEM.md` §2 ("no
  motion tokens — do not invent them") and its checklist line on the house easing, **for `web/`
  only**. Root `CLAUDE.md` §4 stays true for the legacy CSS.
- **Evidence and detail:** [design-system.md](../design-system.md)

## Context

The port's tokens (`web/src/lib/styles/tokens/*`) carry over the legacy names, which is right for
coexistence (DESIGN-SYSTEM §2). But raw ramps (`--color-0…100`, `--gray-*`, `--orange-*`) and
semantic roles (`--color-text`, `--color-surface`, …) sit in the same `:root` with nothing stopping
components from using a raw ramp. Measured on `main` (2026-10-18), the primitives in
`web/src/lib/components/*.svelte` hold **14 raw-palette references across 4 files**, no hex
literals outside comments, and no `var(--x, #hex)` fallbacks.

Motion is untokenized: the house curve `cubic-bezier(0.22, 1, 0.36, 1)` is repeated **60 times in 18
files** under `web/src`, and durations are scattered literals (0.18s ×10, 120ms, 0.22–0.3s, 450ms,
600ms). The owner's brief asks for foundation motion tokens; the case for them is centralization
and a single reduced-motion switch.

No token `color-scheme` is declared, so native form controls and scrollbars don't follow a forced
dark theme.

## Decision

1. **Three layers**, all as CSS custom properties in `web/src/lib/styles/tokens/*`. Existing names
   are kept; nothing is renamed.
   - **Foundation:** palettes, `--fs-*` (D-015/D-022), spacing `--pd-*`/`--mg-*`/`--gap-*`,
     `--size-*`, `--radius-*`, `--shadow-rgb`, `--z-*`, and **new motion tokens**:
     - `--ease-standard: cubic-bezier(0.22, 1, 0.36, 1)`
     - `--dur-fast: 120ms`, `--dur-base: 180ms`, `--dur-slow: 300ms` — initial values taken from current usage; S11b may tune values but not names
     - All durations collapse to `0.01ms` under `prefers-reduced-motion: reduce`, in the token file.
   - **Semantic:** the only color and elevation tokens components may use — surfaces and ink
     (`--color-surface`, `--color-text`, `--color-muted`, `--color-bg-light`), focus, status,
     money, category, and `--shadow-sm/md/lg` (D-020). New roles are added only with a consumer.
   - **Component:** custom properties declared at a component's root (`--modal-max`,
     `--act-ink-*`), named `--<block>-<property>`, consumed only inside that component, never
     declared in token files.
2. **Breakpoints stay documented constants** (768 / 640 / 600 / 480, plus 900 drawer and 1100 table —
   DESIGN-SYSTEM §4). `var()` can't be used in a media query; a test enforces the list.
3. **Declare `color-scheme`** in the token layer next to the existing `data-theme` blocks (still the
   only place that mentions `data-theme`, D-017), so UA widgets follow the resolved theme.
4. **No preprocessor and no token pipeline:** no Sass, no DTCG JSON / Style Dictionary, no Tailwind,
   no `light-dark()` (Baseline 2024, *newly* available).
5. **Enforcement by ratchet** (S11b): primitives may not reference raw palettes — the 14 existing
   references go on an allowlist that only shrinks. `--color-dark` (16 uses) and `--color-white`
   (5 uses) are classified as surface vs ink first. The hex scan in `tokens.test.ts` extends to
   `.svelte` style blocks. `var(--x, #hex)` fallbacks are disallowed in `web/`. Semantic pairs get
   contrast tests in both themes.

## Consequences

- **+** One place to change motion; reduced motion handled centrally; components can't drift onto raw ramps.
- **+** Small cost now: S11b touches 4 primitives and the token files. Do it after the S23 branch merges, which adds tokens of its own.
- **−** One more amendment to an append-only spec (struck through, with a pointer here).
- **−** Two parallel token vocabularies exist until S65 deletes the legacy CSS.

## Alternatives considered

| Alternative | Why not |
|---|---|
| Sass | No mixin or loop need that custom properties and Svelte scoped styles don't already cover; adds a dependency |
| DTCG 2025.10 JSON + Style Dictionary | The format is stable ([W3C CG report](https://www.w3.org/community/reports/design-tokens/CG-FINAL-format-20251028/)), but there is one platform (web) and no designer tooling consuming tokens; it would add a build step for no consumer |
| Tailwind | Duplicates the token system in a second vocabulary |
| `light-dark()` | Baseline 2024 *newly* available ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/light-dark)); the `data-theme` override already works with forced themes |
| Keep "no motion tokens" | Leaves 60 copies of the curve and scattered durations; contradicts the brief |

## Revisit triggers

A second platform needs the same tokens (native app, generated email templates) → reconsider DTCG ·
`light-dark()` reaches Baseline widely available and a forced-theme test passes with it.
