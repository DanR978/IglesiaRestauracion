<script lang="ts">
  // acceso/recuperar/ — ask for a password-recovery email (S39). Retires the
  // legacy #forgotCard and auth.js submitForgot(). PRESERVED on purpose
  // (PORT-DEBT S39): the answer never says whether the address has an
  // account — "Si la cuenta existe…" for every outcome except the two that
  // reveal nothing and that the person can act on: too many attempts, and
  // no connection. The email arrives from the sign-in page in memory, and
  // goes back the same way (WCAG 3.3.7) — never through the URL.
  import { resolve } from '$app/paths';
  import { requestPasswordReset } from '#lib/auth/session.js';
  import Alert from '#lib/components/Alert.svelte';
  import Button from '#lib/components/Button.svelte';
  import FormField from '#lib/components/FormField.svelte';
  import AccessHeading from '#lib/components/admin/auth/AccessHeading.svelte';
  import { carriedEmail, carryEmail } from '#lib/components/admin/auth/handoff.js';
  import { isValidEmail } from '#lib/validators.js';

  const SENT = 'Si la cuenta existe, te enviamos un enlace para restablecer tu contraseña.';
  /** Refusals worth telling: they say nothing about the account. */
  const RATE_LIMITS = new Set(['over_email_send_rate_limit', 'over_request_rate_limit']);

  let email = $state(carriedEmail());
  let emailError = $state<string | null>(null);
  let formError = $state<string | null>(null);
  let sending = $state(false);
  let sent = $state(false);
  let emailInput = $state<HTMLInputElement>();

  async function send(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (sending) return;
    formError = null;
    sent = false;
    const address = email.trim();
    emailError = !address
      ? 'Escribe tu correo electrónico.'
      : isValidEmail(address)
        ? null
        : 'Escribe un correo electrónico válido, por ejemplo nombre@ejemplo.com.';
    if (emailError) {
      emailInput?.focus();
      return;
    }
    sending = true;
    const res = await requestPasswordReset(address);
    sending = false;
    if (!res.ok && (res.error.kind === 'network' || RATE_LIMITS.has(res.error.code ?? ''))) {
      formError = res.error.message;
      return;
    }
    sent = true;
  }
</script>

<AccessHeading
  title="¿Olvidaste tu contraseña?"
  lede="Escribe tu correo y te enviaremos un enlace para crear una contraseña nueva."
/>

<form class="recover" novalidate onsubmit={send}>
  <FormField label="Correo electrónico" error={emailError}>
    {#snippet control(attrs)}
      <input
        id={attrs.id}
        class={attrs.class}
        aria-describedby={attrs['aria-describedby']}
        aria-invalid={attrs['aria-invalid']}
        aria-required={attrs['aria-required']}
        disabled={attrs.disabled}
        bind:this={emailInput}
        bind:value={email}
        type="email"
        name="email"
        autocomplete="username"
        inputmode="email"
        autocapitalize="off"
        spellcheck="false"
        oninput={() => (emailError = null)}
      />
    {/snippet}
  </FormField>

  {#if sent}
    <Alert tone="success" message={SENT} />
    <p class="recover__hint">
      Si no lo ves en unos minutos, revisa la carpeta de correo no deseado.
    </p>
  {/if}
  {#if formError}
    <Alert tone="error" message={formError} />
  {/if}

  <Button type="submit" size="full" loading={sending}>Enviar enlace</Button>
</form>

<a class="recover__back" href={resolve('admin/acceso/')} onclick={() => carryEmail(email)}>
  Volver a iniciar sesión
</a>

<style>
  .recover {
    display: flex;
    flex-direction: column;
    gap: var(--mg-md);
  }

  .recover__hint {
    margin: 0;
    color: var(--color-muted);
    font-size: var(--fs-sm);
  }

  .recover__back {
    display: inline-flex;
    align-items: center;
    align-self: center;
    min-height: 2.75rem;
    color: var(--color-accent-ink);
    font-size: var(--fs-sm);
    font-weight: var(--fw-semibold);
    text-decoration: underline;
    text-underline-offset: 0.15em;
  }

  @media (hover: hover) {
    .recover__back:hover {
      color: var(--color-text);
    }
  }
</style>
