<!--
  Sidebar — the admin's navigation, and at ≤900px its drawer (S37).
  Retires legacy #admNav + #admNavBackdrop (shell.css) and the drawer wiring
  in js/pages/admin/index.js, which closed only on a backdrop click or a tab
  pick: no Escape, no focus trap, focus never returned to the burger, and the
  closed drawer's links stayed in the tab order off-screen (PORT-DEBT S37).

  Desktop: a 238px column under the topbar, sticky, its nav scrolling on its
  own and the account pinned to its foot. ≤900px (`drawer`): a 264px (max
  82vw) panel over a dimmed scrim, open while `open` is true — the shell keeps
  that in history state, so Back closes it. Closed, it is off-screen and
  `inert`: out of the tab order and the accessibility tree. (Not `visibility:
  hidden`: under reduced motion the global guard gives every descendant a
  0.01ms transition, so their inherited visibility lagged the panel's.) Open,
  it is a modal dialog: focus moves in and is trapped, the page stops
  scrolling, Escape / the scrim / "Cerrar menú" close it and focus goes back
  to the burger. Picking a page closes it by navigating — the link replaces
  the drawer's history entry, so Back does not reopen it, and focus is left to
  the navigation.

  The nav: ported surfaces grouped (perms.nav), each a link with
  aria-current="page" when open, then ONE "Abrir panel actual" link to the
  legacy panel for everything else (D-036), described by its hint.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Surface } from '#lib/auth/surfaces.js';
  import Icon from '#lib/components/Icon.svelte';
  import IconButton from '#lib/components/IconButton.svelte';
  import { isTopmostTrap, returnFocusTarget, trapFocus } from '#lib/focus-trap.js';
  import { lockBodyScroll } from '#lib/scroll-lock.js';
  import AccountFooter from './AccountFooter.svelte';
  import NavGroup from './NavGroup.svelte';
  import NavItem from './NavItem.svelte';
  import {
    CHURCH_NAME,
    CLOSE_MENU_LABEL,
    DRAWER_LABEL,
    LEGACY_PANEL_HINT,
    LEGACY_PANEL_HREF,
    LEGACY_PANEL_LABEL,
    NAV_LABEL,
    isCurrentRoute,
    type NavSection,
  } from './shell';

  interface Props {
    id: string;
    sections: readonly NavSection[];
    /** The open page's pathname, for aria-current. */
    pathname: string;
    /** Inicio's resolved route: it is current only on itself. */
    home: string;
    /** Show "Abrir panel actual" — the account has surfaces only the legacy panel serves. */
    legacy: boolean;
    account: { name: string; role: string; avatarUrl: string | null };
    /** The viewport is ≤900px: the sidebar is a drawer. */
    drawer: boolean;
    /** The drawer is open (only ever true with `drawer`). */
    open: boolean;
    onClose: () => void;
    /** Where focus returns when the drawer closes without a navigation: the burger. */
    trigger?: () => HTMLElement | null;
    onLogout: () => void;
    loggingOut?: boolean;
    /** A nav item's count (NavItem's badge slot). */
    badge?: Snippet<[Surface]>;
  }

  let {
    id,
    sections,
    pathname,
    home,
    legacy,
    account,
    drawer,
    open,
    onClose,
    trigger,
    onLogout,
    loggingOut = false,
    badge,
  }: Props = $props();

  const hintId = $props.id();

  let panel = $state<HTMLElement>();
  /** A nav link was followed while open: the navigation owns focus, not the burger. */
  let navigated = false;

  function plainClick(event: MouseEvent): boolean {
    return (
      event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
    );
  }

  function onPick(event: MouseEvent): void {
    if (open && plainClick(event)) navigated = true;
  }

  function onWindowKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !open || !panel) return;
    // A confirm opened from the drawer (logout) is on top: Escape is its.
    if (!isTopmostTrap(panel)) return;
    event.stopPropagation();
    onClose();
  }

  // Open: lock → trap → focus in. Closed: untrap → unlock → focus back to the
  // burger, unless a link was followed (SvelteKit then resets focus itself).
  $effect(() => {
    const dialog = panel;
    if (!open || !dialog) return;

    const back = returnFocusTarget(trigger?.() ?? null);
    const releaseScroll = lockBodyScroll();
    const releaseTrap = trapFocus(dialog);
    navigated = false;
    dialog.focus();

    return () => {
      releaseTrap();
      releaseScroll();
      if (!navigated && back?.isConnected) back.focus();
    };
  });
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#if open}
  <!-- The scrim repeats two keyboard-reachable ways out (Escape, "Cerrar
       menú"), so it takes no role and no tab stop. -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="adm-drawer-scrim" onclick={onClose}></div>
{/if}

<div
  bind:this={panel}
  {id}
  class={['adm-sidebar', open && 'is-open']}
  role={open ? 'dialog' : undefined}
  aria-modal={open ? 'true' : undefined}
  aria-label={open ? DRAWER_LABEL : undefined}
  tabindex="-1"
  inert={drawer && !open}
  data-sveltekit-replacestate={open ? '' : undefined}
>
  <div class="adm-sidebar__head">
    <span class="adm-sidebar__brand">{CHURCH_NAME}</span>
    <IconButton icon="xmark" label={CLOSE_MENU_LABEL} touch onclick={onClose} />
  </div>

  <nav class="adm-sidebar__nav" aria-label={NAV_LABEL}>
    {#each sections as section (section.group)}
      <NavGroup label={section.group}>
        {#each section.items as item (item.key)}
          {#snippet itemBadge()}{@render badge?.(item)}{/snippet}
          <NavItem
            href={item.route}
            label={item.label}
            icon={item.icon}
            current={isCurrentRoute(item.route, pathname, home)}
            badge={badge ? itemBadge : undefined}
            onclick={onPick}
          />
        {/each}
      </NavGroup>
    {/each}

    {#if legacy}
      <div class="adm-sidebar__legacy">
        <!-- The legacy panel is outside the app (and its base path): a full
             page load, never the client router — rel="external". -->
        <a
          class="adm-sidebar__legacy-link"
          href={LEGACY_PANEL_HREF}
          rel="external"
          aria-describedby={hintId}
        >
          <span class="adm-sidebar__legacy-icon"><Icon name="arrow-up-right-from-square" /></span>
          <span>{LEGACY_PANEL_LABEL}</span>
        </a>
        <p class="adm-sidebar__legacy-hint" id={hintId}>{LEGACY_PANEL_HINT}</p>
      </div>
    {/if}
  </nav>

  <AccountFooter
    name={account.name}
    role={account.role}
    avatarUrl={account.avatarUrl}
    {onLogout}
    busy={loggingOut}
  />
</div>

<style>
  /* Desktop: a column of the shell's grid, sticky under the topbar. */
  .adm-sidebar {
    position: sticky;
    top: var(--adm-topbar-h);
    grid-area: side;
    display: flex;
    flex-direction: column;
    align-self: start;
    block-size: calc(100vh - var(--adm-topbar-h));
    block-size: calc(100dvh - var(--adm-topbar-h));
    border-inline-end: 1px solid rgba(127, 127, 127, 0.18);
    background: var(--color-surface);
    color: var(--color-text);
  }

  .adm-sidebar:focus {
    outline: none;
  }

  .adm-sidebar__head {
    display: none;
  }

  .adm-sidebar__nav {
    flex: 1;
    min-block-size: 0;
    padding: 0.9rem 0.8rem;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
  }

  .adm-sidebar__legacy {
    margin-block-start: 0.85rem;
    padding-block-start: 0.85rem;
    border-block-start: 1px solid rgba(127, 127, 127, 0.18);
  }

  .adm-sidebar__legacy-link {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    min-block-size: 2.5rem;
    padding: 0.45rem 0.75rem;
    border-radius: var(--radius-sm);
    color: var(--color-text);
    font-size: var(--fs-sm);
    font-weight: var(--fw-medium);
    text-decoration: none;
    transition: background-color 0.15s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .adm-sidebar__legacy-icon {
    display: inline-flex;
    flex: 0 0 1.125rem;
    justify-content: center;
    color: var(--color-muted);
    font-size: var(--fs-sm);
  }

  @media (hover: hover) {
    .adm-sidebar__legacy-link:hover {
      background: rgba(127, 127, 127, 0.12);
    }
  }

  .adm-sidebar__legacy-link:active {
    background: rgba(127, 127, 127, 0.18);
  }

  /* Aligned with the link's words: past the icon column and its gap. */
  .adm-sidebar__legacy-hint {
    margin: 0.15rem 0 0;
    padding-inline: calc(0.75rem + 1.125rem + 0.7rem) 0.75rem;
    color: var(--color-muted);
    font-size: var(--fs-xs);
    line-height: 1.4;
  }

  .adm-drawer-scrim {
    display: none;
  }

  /* ≤900px: the drawer. Closed, it waits off-screen (and `inert`); the shadow
     is drawn only while open, so none of it shows at the viewport's edge. */
  @media (max-width: 900px) {
    .adm-sidebar {
      position: fixed;
      inset-block: 0;
      inset-inline-start: 0;
      z-index: var(--z-overlay);
      grid-area: auto;
      inline-size: 16.5rem;
      max-inline-size: 82vw;
      block-size: 100vh;
      block-size: 100dvh;
      border-inline-end: 0;
      transform: translateX(-100%);
      transition:
        transform 0.26s cubic-bezier(0.22, 1, 0.36, 1),
        box-shadow 0.26s cubic-bezier(0.22, 1, 0.36, 1);
    }

    .adm-sidebar.is-open {
      transform: none;
      box-shadow: var(--shadow-lg);
    }

    .adm-sidebar__head {
      display: flex;
      flex-shrink: 0;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      min-block-size: var(--adm-topbar-h);
      padding-inline: 1.1rem 0.4rem;
      border-block-end: 1px solid rgba(127, 127, 127, 0.18);
    }

    .adm-sidebar__brand {
      min-inline-size: 0;
      overflow: hidden;
      font-size: var(--fs-sm);
      font-weight: var(--fw-semibold);
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .adm-sidebar__legacy-link {
      min-block-size: 2.75rem;
    }

    /* --static-black, not --color-black: that one turns light in dark mode. */
    .adm-drawer-scrim {
      position: fixed;
      inset: 0;
      z-index: var(--z-overlay);
      display: block;
      background: color-mix(in srgb, var(--static-black) 40%, transparent);
      animation: adm-scrim-in 0.2s cubic-bezier(0.22, 1, 0.36, 1) both;
    }
  }

  @keyframes adm-scrim-in {
    from {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .adm-sidebar,
    .adm-sidebar__legacy-link {
      transition: none;
    }

    .adm-drawer-scrim {
      animation: none;
    }
  }
</style>
