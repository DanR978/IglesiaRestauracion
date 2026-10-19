<!--
  PasswordPanel — Mi cuenta › Seguridad › Contraseña (S45, ASVS 5.0 V6).
  Retires account.js changePassword, as fixed by DF-006 (current_password,
  errors by code), on the PasswordField primitive: show/hide, a strength
  meter, a live mismatch check — the legacy had none of the three.

  Two shapes, chosen by the account's sign-in identities:
    change   the account signs in with its email. "Contraseña actual" is sent
             only when typed (GoTrue requires it when "Require current
             password" is on, ASVS 6.2.3); its hint covers an invited account
             that only ever used Google or Microsoft and has no password yet.
    create   Google / Microsoft only: "Crear una contraseña" opens a fresh
             second-factor step first (StepUpDialog), then the form. If GoTrue
             answers that a current password is required after all, the panel
             turns into the change form and asks for it.
  The new password must be "acceptable" on the PasswordField meter before it
  is sent (8+ characters, not predictable). current_password_required /
  current_password_invalid / same_password / weak_password become an inline
  error on their field; anything else is a toast. Success clears the fields,
  says so in a toast and calls onChanged() (the section then offers to close
  the other sessions).

  Usage:
    <PasswordPanel {user} onChanged={offerSignOut} />
-->
<script lang="ts">
  import { tick, untrack } from 'svelte';
  import Button from '#lib/components/Button.svelte';
  import PasswordField from '#lib/components/PasswordField.svelte';
  import { updatePassword } from '#lib/auth/session.js';
  import type { SessionUser } from '#lib/stores/session.svelte.js';
  import { toast } from '#lib/stores/toast.svelte.js';
  import AccountPanel from './AccountPanel.svelte';
  import StepUpDialog from './StepUpDialog.svelte';
  import { hasEmailIdentity, newPasswordProblem, passwordFieldError } from './account';

  interface Props {
    user: SessionUser;
    /** The password changed (or was created). */
    onChanged: () => void;
  }

  let { user, onChanged }: Props = $props();

  /** This page learned the account has a password (it made one, or GoTrue said so). */
  let knownPassword = $state(false);
  const mode = $derived(knownPassword || hasEmailIdentity(user) ? 'change' : 'create');

  /** Create mode: the second-factor step passed, the form is open. */
  let unlocked = $state(false);
  let stepUp = $state(false);

  let current = $state('');
  let next = $state('');
  let repeat = $state('');
  let currentError = $state<string | null>(null);
  let nextError = $state<string | null>(null);
  let saving = $state(false);

  let root = $state<HTMLElement>();
  let currentField = $state<ReturnType<typeof PasswordField>>();
  let nextField = $state<ReturnType<typeof PasswordField>>();
  let repeatField = $state<ReturnType<typeof PasswordField>>();

  // Editing a field clears the refusal it was showing.
  $effect(() => {
    void current;
    untrack(() => (currentError = null));
  });
  $effect(() => {
    void next;
    untrack(() => (nextError = null));
  });

  function resetForm(): void {
    current = '';
    next = '';
    repeat = '';
    currentError = null;
    nextError = null;
  }

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (saving) return;
    currentError = null;
    nextError = null;
    const problem = newPasswordProblem(next);
    if (problem) {
      nextError = problem;
      nextField?.focus();
      return;
    }
    // PasswordField reports the mismatch itself on this submit.
    if (repeat !== next) {
      repeatField?.focus();
      return;
    }

    saving = true;
    const sendCurrent = mode === 'change' && current !== '';
    const res = await updatePassword(
      sendCurrent ? { password: next, current_password: current } : { password: next },
    );
    saving = false;

    if (!res.ok) {
      const code = res.error.code;
      if (mode === 'create' && code === 'current_password_required') {
        knownPassword = true;
        currentError = 'Tu cuenta ya tiene una contraseña. Escribe la actual para cambiarla.';
        await tick();
        currentField?.focus();
        return;
      }
      const fieldError = passwordFieldError(code);
      if (fieldError?.field === 'current' && mode === 'change') {
        currentError = fieldError.message;
        currentField?.focus();
      } else if (fieldError?.field === 'next') {
        nextError = fieldError.message;
        nextField?.focus();
      } else {
        toast.error(res.error.message);
      }
      return;
    }

    const createdFirst = mode === 'create';
    resetForm();
    knownPassword = true;
    unlocked = false;
    toast.success(createdFirst ? 'Contraseña creada' : 'Contraseña actualizada');
    onChanged();
    // The busy button dropped focus; give it back to the form's action.
    await tick();
    if (document.activeElement === document.body) {
      root?.querySelector<HTMLButtonElement>('.pw-form__submit')?.focus();
    }
  }

  async function handleUnlocked(): Promise<void> {
    unlocked = true;
    await tick();
    nextField?.focus();
  }

  function cancelCreate(): void {
    resetForm();
    unlocked = false;
  }
</script>

<AccountPanel
  title="Contraseña"
  description={mode === 'change'
    ? 'Usa al menos 8 caracteres. Una frase larga es más segura y más fácil de recordar.'
    : undefined}
>
  <div bind:this={root}>
    {#if mode === 'create' && !unlocked}
      <p class="pw-intro">
        Entras con Google o Microsoft. Si quieres, crea también una contraseña para entrar con tu
        correo. Antes te pediremos un código de tu app de autenticación.
      </p>
      <Button variant="ghost" icon="key" onclick={() => (stepUp = true)}>
        Crear una contraseña
      </Button>
    {:else}
      <form class="pw-form" novalidate onsubmit={(event) => void submit(event)}>
        <!-- Lets a password manager file the new password under this account. -->
        <input
          type="email"
          name="username"
          autocomplete="username"
          value={user.email ?? ''}
          readonly
          hidden
        />
        {#if mode === 'change'}
          <PasswordField
            bind:this={currentField}
            bind:value={current}
            label="Contraseña actual"
            autocomplete="current-password"
            hint="Déjala vacía solo si nunca creaste una contraseña (entras con Google o Microsoft)."
            error={currentError}
          />
        {/if}
        <PasswordField
          bind:this={nextField}
          bind:value={next}
          label="Nueva contraseña"
          autocomplete="new-password"
          strength
          required
          error={nextError}
        />
        <PasswordField
          bind:this={repeatField}
          bind:value={repeat}
          label="Confirma la nueva contraseña"
          autocomplete="new-password"
          match={next}
          required
        />
        <div class="pw-form__actions">
          <Button type="submit" class="pw-form__submit" loading={saving}>
            {mode === 'change' ? 'Cambiar contraseña' : 'Guardar contraseña'}
          </Button>
          {#if mode === 'create'}
            <Button variant="ghost" disabled={saving} onclick={cancelCreate}>Cancelar</Button>
          {/if}
        </div>
      </form>
    {/if}
  </div>
</AccountPanel>

<StepUpDialog
  bind:open={stepUp}
  description="Para crear tu contraseña, confirma que eres tú con un código de tu app de autenticación."
  onVerified={() => void handleUnlocked()}
/>

<style>
  .pw-intro {
    margin: 0 0 var(--mg-sm);
    color: var(--color-text);
    font-size: var(--fs-sm);
    line-height: 1.5;
  }

  .pw-form {
    display: flex;
    flex-direction: column;
    gap: var(--mg-sm);
    max-width: 28rem;
  }

  .pw-form__actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--mg-xs);
  }
</style>
