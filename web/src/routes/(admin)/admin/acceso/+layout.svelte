<script lang="ts">
  // acceso/ — the frame of every sign-in page (S39): one card, centred, with
  // the church's name on top, then the page itself (its own h1 and content),
  // and below it the one help line every page repeats in the same place
  // (WCAG 3.2.6 Consistent Help). Retires the legacy .auth-card screens of
  // admin/index.html.
  //
  // Outside the (app) group on purpose: no guard and no shell here — each page
  // reads the session store itself and moves on. The card hangs from the top
  // instead of being centred vertically, so a step that grows (a QR code, an
  // error) never re-centres it and shifts what is already on screen.
  import Icon from '#lib/components/Icon.svelte';
  import type { LayoutProps } from './$types';

  let { children }: LayoutProps = $props();
</script>

<div class="acceso">
  <main class="acceso__card" id="contenido">
    <p class="acceso__brand">
      <span class="acceso__logo"><Icon set="sprite" name="logo-church" /></span>
      <span class="acceso__names">
        <span class="acceso__church">Iglesia Restauración Divina</span>
        <span class="acceso__panel">Panel de administración</span>
      </span>
    </p>
    {@render children()}
  </main>

  <footer class="acceso__help">
    <p>
      ¿Problemas para entrar? Escribe a
      <a href="mailto:contactanos@irdlex.org">contactanos@irdlex.org</a>
    </p>
  </footer>
</div>

<style>
  .acceso {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--mg-md);
    min-height: 100vh;
    min-height: 100dvh;
    padding: clamp(1.5rem, 6vh, 4rem) var(--pd-md) var(--pd-lg);
    font-family: var(--font-base);
    font-size: var(--fs-base);
    line-height: 1.5;
  }

  .acceso__card {
    display: flex;
    flex-direction: column;
    gap: var(--mg-md);
    width: 100%;
    max-width: 28rem;
    padding: var(--pd-md);
    border: 1px solid rgba(127, 127, 127, 0.18);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text);
  }

  .acceso__brand {
    display: flex;
    align-items: center;
    gap: var(--mg-sm);
    margin: 0;
  }

  /* The sprite glyph is 1em square; the type token sizes it. */
  .acceso__logo {
    display: inline-flex;
    flex-shrink: 0;
    color: var(--color-text);
    font-size: var(--fs-2xl);
  }

  .acceso__names {
    display: flex;
    flex-direction: column;
    min-width: 0;
    line-height: 1.3;
  }

  .acceso__church {
    color: var(--color-text);
    font-size: var(--fs-sm);
    font-weight: var(--fw-semibold);
  }

  .acceso__panel {
    color: var(--color-muted);
    font-size: var(--fs-xs);
  }

  .acceso__help {
    max-width: 28rem;
    color: var(--color-muted);
    font-size: var(--fs-sm);
    text-align: center;
  }

  .acceso__help p {
    margin: 0;
  }

  /* Accent ink (D-038): AA on the page in both themes; underlined, so it is
     never told apart from the sentence by colour alone. A long address wraps
     instead of widening a 360px screen. */
  .acceso__help a {
    color: var(--color-accent-ink);
    text-decoration: underline;
    text-underline-offset: 0.15em;
    overflow-wrap: anywhere;
  }

  @media (hover: hover) {
    .acceso__help a:hover {
      color: var(--color-text);
    }
  }
</style>
