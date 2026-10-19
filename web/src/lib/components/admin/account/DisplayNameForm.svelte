<!--
  DisplayNameForm — the account's display name (S45). Retires account.js
  saveProfile / updateDirtyGuard / beforeUnload.

  The draft follows the stored name until the person edits it; from then on
  it is theirs, and "dirty" means it differs from the stored name once
  normalised (normalizeDisplayName: 2–80 characters, control characters out,
  spaces collapsed — the rule the server applies). Saving runs the
  set_my_display_name RPC, then session.refresh() so the sidebar follows,
  then a toast; a refused name is an inline error, a failed save a toast.

  The unsaved-changes guard is a beforeNavigate hook: leaving for another
  page asks "¿Salir sin guardar los cambios?" (ConfirmDialog); closing or
  reloading the tab gets the browser's own prompt. It lets through what keeps
  this page — a shallow navigation (the shell's drawer) and a same-page query
  change (another section of Mi cuenta keeps the draft) — and a session that
  has ended, which has nowhere to save to.

  What the legacy got wrong and this does not: a migration-detail error
  string shown to volunteers ("…set_my_display_name…"), a beforeunload guard
  only, and a dirty check that disagreed with what the server would store.

  Usage:
    <DisplayNameForm name={profile.display_name} />
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { beforeNavigate, goto, type BeforeNavigate } from '$app/navigation';
  import Button from '#lib/components/Button.svelte';
  import FormField from '#lib/components/FormField.svelte';
  import {
    DISPLAY_NAME_LENGTH,
    normalizeDisplayName,
    setDisplayName,
  } from '#lib/repos/profiles.js';
  import { confirm } from '#lib/stores/confirm.svelte.js';
  import { session } from '#lib/stores/session.svelte.js';
  import { toast } from '#lib/stores/toast.svelte.js';

  interface Props {
    /** The stored display name (profiles.display_name). */
    name: string | null;
  }

  let { name }: Props = $props();

  const stored = $derived(name ?? '');

  let draft = $state('');
  /** The person has edited the draft since it last followed the stored name. */
  let edited = $state(false);
  let error = $state<string | null>(null);
  let saving = $state(false);
  let input = $state<HTMLInputElement>();

  // Follow the stored name (a save, another tab) until the person edits.
  $effect.pre(() => {
    const next = stored;
    untrack(() => {
      if (!edited) draft = next;
    });
  });

  const dirty = $derived(edited && (normalizeDisplayName(draft) ?? draft.trim()) !== stored);

  function handleInput(): void {
    edited = true;
    error = null;
  }

  function discard(): void {
    edited = false;
    error = null;
    draft = stored;
  }

  async function save(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (saving || !dirty) return;
    const clean = normalizeDisplayName(draft);
    if (clean === null) {
      error = `Escribe un nombre de entre ${DISPLAY_NAME_LENGTH.min} y ${DISPLAY_NAME_LENGTH.max} caracteres.`;
      input?.focus();
      return;
    }
    saving = true;
    const res = await setDisplayName(clean);
    if (res.ok) {
      // What the server stored, shown even if the refresh below fails in transit.
      draft = res.data;
      edited = false;
      await session.refresh();
      toast.success('Nombre actualizado');
    } else {
      toast.error(res.error.message);
    }
    saving = false;
    // The busy button dropped focus; the field is where to continue.
    if (document.activeElement === document.body) input?.focus();
  }

  /* ── The unsaved-changes guard ─────────────────────────────────────────── */

  /** The navigation waiting on the question; the latest one wins. */
  let waiting: BeforeNavigate | null = null;

  async function askToLeave(): Promise<void> {
    const leave = await confirm(
      '¿Salir sin guardar los cambios?',
      'Cambiaste tu nombre visible y todavía no lo guardas.',
      { confirmLabel: 'Salir sin guardar', cancelLabel: 'Seguir editando' },
    );
    const navigation = waiting;
    waiting = null;
    if (!leave || !navigation?.to) return;
    discard(); // not dirty any more, so the repeat below passes the guard
    const target = navigation.to.url;
    if (navigation.type === 'popstate' && navigation.delta) {
      history.go(navigation.delta);
    } else if (navigation.willUnload) {
      location.assign(target.href);
    } else {
      // The router's own target, already resolved: re-run the navigation the guard held.
      // eslint-disable-next-line svelte/no-navigation-without-resolve
      await goto(target);
    }
  }

  beforeNavigate((navigation) => {
    if (!dirty || navigation.shallow) return;
    const { from, to } = navigation;
    // Another section of Mi cuenta: same page, the draft stays.
    if (from && to && from.url.pathname === to.url.pathname) return;
    // Signed out meanwhile: there is nothing left to save to.
    if (session.status !== 'ready') return;
    navigation.cancel();
    // Closing or reloading the tab: cancel() made the browser ask.
    if (navigation.type === 'leave') return;
    const asking = waiting !== null;
    waiting = navigation;
    if (!asking) void askToLeave();
  });
</script>

<form class="name-form" novalidate onsubmit={(event) => void save(event)}>
  <FormField
    label="Nombre visible"
    hint="Así te ven los demás en el panel y en el registro de actividad."
    {error}
    required
  >
    {#snippet control(attrs)}
      <input
        id={attrs.id}
        class={attrs.class}
        aria-describedby={attrs['aria-describedby']}
        aria-invalid={attrs['aria-invalid']}
        aria-required={attrs['aria-required']}
        disabled={attrs.disabled}
        bind:this={input}
        bind:value={draft}
        oninput={handleInput}
        readonly={saving}
        type="text"
        name="display_name"
        autocomplete="name"
        autocapitalize="words"
        spellcheck="false"
      />
    {/snippet}
  </FormField>
  <div class="name-form__actions">
    <Button type="submit" loading={saving} disabled={!dirty}>Guardar cambios</Button>
    {#if dirty}
      <Button variant="ghost" disabled={saving} onclick={discard}>Descartar cambios</Button>
    {/if}
  </div>
</form>

<style>
  .name-form {
    display: flex;
    flex-direction: column;
    gap: var(--mg-sm);
    max-width: 32rem;
  }

  .name-form__actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--mg-xs);
  }
</style>
