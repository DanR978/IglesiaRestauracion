<!--
  AccountFooter — who is signed in, pinned to the foot of the sidebar (S37).
  Retires legacy .adm-nav__footer (#navAccount + #logoutBtn) and
  renderNavAccount() in js/pages/admin/account.js: the photo or initials
  (Avatar, decorative beside the name), the display name, the role in Spanish,
  and the logout button. Presentational: the shell asks "¿Cerrar sesión?" and
  signs out when `onLogout` fires.
-->
<script lang="ts">
  import Avatar from '#lib/components/Avatar.svelte';
  import IconButton from '#lib/components/IconButton.svelte';
  import { LOGOUT_LABEL } from './shell';

  interface Props {
    /** The display name, or the address when there is none. */
    name: string;
    /** The role in Spanish (perms.roleLabel). */
    role: string;
    /** profiles.avatar_url — Avatar refuses anything that is not a photo URL. */
    avatarUrl?: string | null;
    onLogout: () => void;
    /** Signing out: the button shows its spinner. */
    busy?: boolean;
  }

  let { name, role, avatarUrl = null, onLogout, busy = false }: Props = $props();
</script>

<div class="adm-account">
  <Avatar {name} src={avatarUrl} size={36} decorative />
  <div class="adm-account__meta">
    <span class="adm-account__name">{name}</span>
    {#if role}
      <span class="adm-account__role">{role}</span>
    {/if}
  </div>
  <IconButton
    icon="arrow-right-from-bracket"
    label={LOGOUT_LABEL}
    touch
    loading={busy}
    onclick={onLogout}
  />
</div>

<style>
  .adm-account {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.75rem 0.8rem;
    border-block-start: 1px solid rgba(127, 127, 127, 0.18);
    color: var(--color-text);
  }

  .adm-account__meta {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-inline-size: 0;
    line-height: 1.3;
  }

  .adm-account__name,
  .adm-account__role {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .adm-account__name {
    font-size: var(--fs-sm);
    font-weight: var(--fw-semibold);
  }

  .adm-account__role {
    color: var(--color-muted);
    font-size: var(--fs-xs);
  }
</style>
