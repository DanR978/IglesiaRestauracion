<!--
  SignInMethods — Mi cuenta › Seguridad › Métodos de inicio de sesión (S45,
  D-035). Read-only: the auth user's identities — "Correo y contraseña",
  Google, Microsoft — each with when it was last used (or linked). Nothing to
  link or unlink here: manual linking is off (link/unlink carry no AAL check),
  and Google or Microsoft attach themselves when their verified email matches
  the account's. New in the port; the legacy page had no such list.

  Usage:
    <SignInMethods identities={user.identities} />
-->
<script lang="ts">
  import Icon from '#lib/components/Icon.svelte';
  import StateEmpty from '#lib/components/StateEmpty.svelte';
  import type { SessionUser } from '#lib/stores/session.svelte.js';
  import AccountPanel from './AccountPanel.svelte';
  import { formatDate, formatDateTime, signInMethods } from './account';

  interface Props {
    identities: SessionUser['identities'];
  }

  let { identities }: Props = $props();

  const methods = $derived(signInMethods(identities));

  function usage(lastUsed: string | null, linkedAt: string | null): string {
    const used = formatDateTime(lastUsed);
    if (used) return `Último uso: ${used}`;
    const linked = formatDate(linkedAt);
    return linked ? `Vinculado el ${linked}` : '';
  }
</script>

<AccountPanel
  title="Métodos de inicio de sesión"
  description="Google o Microsoft se vinculan solos cuando su correo coincide con el tuyo."
>
  {#if methods.length === 0}
    <StateEmpty
      compact
      icon="right-to-bracket"
      message="No encontramos métodos de inicio de sesión en tu cuenta."
    />
  {:else}
    <!-- role="list": Safari drops list semantics under `list-style: none`. -->
    <ul class="methods" role="list">
      {#each methods as method (method.key)}
        {@const meta = usage(method.lastUsed, method.linkedAt)}
        <li class="method">
          <span class="method__icon"><Icon set={method.iconSet} name={method.icon} /></span>
          <span class="method__text">
            <span class="method__label">{method.label}</span>
            {#if meta}<span class="method__meta">{meta}</span>{/if}
          </span>
        </li>
      {/each}
    </ul>
  {/if}
</AccountPanel>

<style>
  .methods {
    display: flex;
    flex-direction: column;
    gap: var(--mg-xs);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .method {
    display: flex;
    align-items: center;
    gap: var(--mg-sm);
  }

  .method__icon {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: var(--radius-md);
    background: rgba(127, 127, 127, 0.12);
    color: var(--color-text);
  }

  .method__text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .method__label {
    color: var(--color-text);
    font-size: var(--fs-sm);
    font-weight: var(--fw-semibold);
  }

  .method__meta {
    color: var(--color-muted);
    font-size: var(--fs-xs);
  }
</style>
