<!--
  AccessHeading — the h1 of a sign-in page and its tab title (S39).
  Each acceso/ page owns its title (D-036): "<step> · Panel · Iglesia
  Restauración Divina". The legacy auth cards had a static church-name <h1>
  and a step <h2> swapped by script, so the tab title never said where you
  were.

  Focus moves to the heading whenever a step appears — the page loads, or
  verificar/ turns from the code into the QR, or a link page reaches the
  password step — so a screen reader starts reading at the new step instead
  of wherever focus was. It is a reading position, not a control
  (tabindex -1, never in the Tab order), so it draws no ring — the same rule
  base/reset.css applies to `main:focus`.

  Usage:
    <AccessHeading title="Iniciar sesión" lede="Entra con tu correo y tu contraseña." />
-->
<script lang="ts">
  interface Props {
    /** The step's name: the h1, and the start of the document title. */
    title: string;
    /** One line under the heading. */
    lede?: string;
  }

  let { title, lede }: Props = $props();

  function focusHeading(node: HTMLElement): void {
    node.focus();
  }
</script>

<svelte:head>
  <title>{title} · Panel · Iglesia Restauración Divina</title>
</svelte:head>

<div class="acceso-head">
  {#key title}
    <h1 class="acceso-head__title" tabindex="-1" {@attach focusHeading}>{title}</h1>
  {/key}
  {#if lede}
    <p class="acceso-head__lede">{lede}</p>
  {/if}
</div>

<style>
  .acceso-head {
    display: flex;
    flex-direction: column;
    gap: var(--mg-xs);
  }

  .acceso-head__title {
    color: var(--color-text);
    font-size: var(--fs-xl);
    font-weight: var(--fw-bold);
    line-height: 1.2;
  }

  .acceso-head__title:focus {
    outline: none;
  }

  .acceso-head__lede {
    margin: 0;
    color: var(--color-muted);
    font-size: var(--fs-base);
  }
</style>
