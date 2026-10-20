<!--
  AccountFacts — what the account is, each fact once (S45, PORT-DEBT S45).
  Retires the legacy wall of `<input disabled>` (renderProfileSection), the
  "Cuenta" key/value list (renderAccountSection) and the hero badges
  (renderHero), which between them showed the email three times, the role
  twice and a hard-coded green "Activa" that could never be false.

    Correo                    the auth user's email · an administrator owns it
    Rol                       the access preset's name when the account may
                              read it, else the role (Badge) · admin-owned
    Ministerios               the ministries the account leads · admin-owned
    Miembro desde             when the account was created
    Último inicio de sesión   the last sign-in, any method

  The fabricated fields are gone: Usuario (an "@handle" cut from the email —
  no such thing exists), Zona horaria (this browser's, not the account's) and
  Idioma (always "Español"). ReadonlyField draws each fact as text, with a
  lock note where an administrator owns the value.

  The ministries' names come from the shared ministries store, read only when
  the account leads one (aal2): a panel skeleton while it loads, then the
  facts, with an error + Retry in the Ministerios field alone if it failed.

  Usage:
    <AccountFacts {user} {profile} />
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import Badge from '#lib/components/Badge.svelte';
  import ReadonlyField from '#lib/components/ReadonlyField.svelte';
  import StateError from '#lib/components/StateError.svelte';
  import StateLoading from '#lib/components/StateLoading.svelte';
  import type { OwnProfile } from '#lib/repos/profiles.js';
  import { ministries } from '#lib/stores/ministries.svelte.js';
  import type { SessionUser } from '#lib/stores/session.svelte.js';
  import AccountPanel from './AccountPanel.svelte';
  import { formatDate, formatDateTime, ministryIdsOf, roleName } from './account';

  interface Props {
    user: SessionUser;
    profile: OwnProfile;
  }

  let { user, profile }: Props = $props();

  const ids = $derived(ministryIdsOf(profile));
  const role = $derived(roleName(profile));

  // Only an account that leads a ministry needs the list. load() reads the
  // store's own status; untracked, so a failed load waits for Retry instead
  // of re-running this effect into a request loop.
  $effect(() => {
    if (ids.length > 0) untrack(() => void ministries.load());
  });

  const listStatus = $derived(
    ids.length === 0
      ? 'none'
      : ministries.status === 'ready'
        ? 'ready'
        : ministries.status === 'error'
          ? 'error'
          : 'loading',
  );
  // A ministry deleted since it was assigned is simply not listed.
  const led = $derived(ids.flatMap((id) => ministries.byId(id) ?? []));
</script>

<AccountPanel title="Datos de la cuenta">
  {#if listStatus === 'loading'}
    <StateLoading shape="detail" rows={5} label="Cargando los datos de tu cuenta…" />
  {:else}
    <div class="facts">
      <ReadonlyField
        label="Correo"
        value={user.email ?? null}
        note="Lo gestiona un administrador."
      />
      <ReadonlyField label="Rol" note="Lo asigna un administrador.">
        {#if profile.role}
          <Badge role={profile.role} label={role ?? undefined} />
        {:else}
          Sin rol asignado
        {/if}
      </ReadonlyField>
      <ReadonlyField label="Ministerios" note="Los asigna un administrador.">
        {#if listStatus === 'error'}
          <StateError
            compact
            message={ministries.error?.message}
            onRetry={() => ministries.load({ force: true })}
          />
        {:else if led.length === 0}
          Ninguno asignado
        {:else}
          <!-- role="list": Safari drops list semantics under `list-style: none`. -->
          <ul class="facts__ministries" role="list">
            {#each led as ministry (ministry.id)}
              <li>
                {#if ministry.color}
                  <Badge tint={ministry.color} label={ministry.name} />
                {:else}
                  <Badge icon="people-group" label={ministry.name} />
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </ReadonlyField>
      <ReadonlyField label="Miembro desde" value={formatDate(user.created_at)} />
      <ReadonlyField label="Último inicio de sesión" value={formatDateTime(user.last_sign_in_at)} />
    </div>
  {/if}
</AccountPanel>

<style>
  /* Two columns where there is room, one on a phone — pure CSS (G-010). */
  .facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr));
    gap: var(--mg-md);
  }

  .facts__ministries {
    display: flex;
    flex-wrap: wrap;
    gap: var(--mg-xxs) var(--mg-xs);
    margin: 0;
    padding: 0;
    list-style: none;
  }
</style>
