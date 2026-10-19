<!--
  Topbar — the admin's top bar (S37). Retires legacy .topbar (shell.css):
  solid --color-dark with light ink, sticky at --z-menu, 60px (56px at
  ≤640px — the shell sets --adm-topbar-h). No brand dot and no user chip
  (PORT-DEBT S37): the account lives in the sidebar footer.

  ≤900px: the burger that opens the navigation drawer, and the open page's
  title (the page-title store) — the sidebar that says where you are is
  folded away. Wider: the church's name, and the page's own h1 carries the
  title. The title here repeats the h1, so it is hidden from assistive tech.

  `end` is the right-hand slot (S43 puts the notifications bell there).
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import IconButton from '#lib/components/IconButton.svelte';
  import { CHURCH_NAME, MENU_LABEL } from './shell';

  interface Props {
    /** The open page's title, shown at ≤900px only. */
    title: string;
    /** The burger's id: the drawer gives focus back to it. */
    menuId: string;
    /** The drawer's id (aria-controls). */
    controls: string;
    /** Whether the drawer is open (aria-expanded). */
    expanded: boolean;
    onMenu: () => void;
    end?: Snippet;
  }

  let { title, menuId, controls, expanded, onMenu, end }: Props = $props();
</script>

<header class="adm-topbar">
  <IconButton
    id={menuId}
    class="adm-topbar__menu"
    icon="bars"
    label={MENU_LABEL}
    touch
    aria-expanded={expanded}
    aria-controls={controls}
    onclick={onMenu}
  />
  <span class="adm-topbar__brand">{CHURCH_NAME}</span>
  {#if title}
    <span class="adm-topbar__title" aria-hidden="true">{title}</span>
  {/if}
  {#if end}
    <div class="adm-topbar__end">{@render end()}</div>
  {/if}
</header>

<style>
  .adm-topbar {
    position: sticky;
    top: 0;
    z-index: var(--z-menu);
    grid-area: top;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-inline-size: 0;
    block-size: var(--adm-topbar-h);
    padding-inline: var(--pd-md);
    background: var(--color-dark);
    color: var(--color-white);
  }

  .adm-topbar :global(.adm-topbar__menu) {
    display: none;
  }

  .adm-topbar__brand,
  .adm-topbar__title {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .adm-topbar__brand {
    font-size: var(--fs-sm);
    font-weight: var(--fw-semibold);
    letter-spacing: 0.02em;
  }

  .adm-topbar__title {
    display: none;
    font-size: var(--fs-md);
    font-weight: var(--fw-semibold);
  }

  .adm-topbar__end {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 0.5rem;
    margin-inline-start: auto;
  }

  @media (max-width: 900px) {
    .adm-topbar {
      gap: 0.5rem;
      padding-inline: var(--pd-xs) var(--pd-md);
    }

    .adm-topbar :global(.adm-topbar__menu) {
      display: inline-flex;
    }

    .adm-topbar__brand {
      display: none;
    }

    .adm-topbar__title {
      display: block;
    }
  }
</style>
