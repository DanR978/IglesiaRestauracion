<script lang="ts">
  // /kit/password-field/ — the PR-C2 staging smoke page for PasswordField: the
  // sign-in pair (username + current-password), the set-password pair (strength
  // meter + confirm with "Las contraseñas no coinciden."), the show/hide toggle,
  // paste, the variants, and both palettes. Prerendered, no data fetching,
  // nothing is sent anywhere, noindex.
  import { onMount } from 'svelte';
  import Button from '#lib/components/Button.svelte';
  import FormField from '#lib/components/FormField.svelte';
  import PasswordField from '#lib/components/PasswordField.svelte';
  import { scorePassword } from '#lib/components/password-field.js';

  /** Set once the page is interactive; the e2e specs wait for it before typing. */
  let hydrated = $state(false);
  onMount(() => (hydrated = true));

  let email = $state('');
  let password = $state('');
  let loginError = $state<string | null>(null);
  let loginStatus = $state('');

  let next = $state('');
  let confirm = $state('');
  let nextError = $state<string | null>(null);
  let setStatus = $state('');
  let nextField = $state<ReturnType<typeof PasswordField>>();

  function signIn(event: SubmitEvent): void {
    event.preventDefault();
    loginStatus = '';
    // A demo: never a real request. The copy is the one S39 shows for a
    // refused sign-in — it does not say which of the two was wrong.
    loginError = email.trim() && password ? null : 'Escribe tu correo y tu contraseña para entrar.';
    if (!loginError) loginStatus = 'Listo: aquí S39 llamaría a Supabase Auth.';
  }

  function setPassword(event: SubmitEvent): void {
    event.preventDefault();
    setStatus = '';
    const score = scorePassword(next);
    nextError = score.acceptable
      ? null
      : 'Elige una contraseña más segura (mira la guía de abajo).';
    if (nextError) {
      nextField?.focus();
      return;
    }
    // The confirm field reports its own mismatch on this same submit.
    if (next !== confirm) return;
    setStatus = 'Contraseña aceptada (demo, no se guardó nada).';
  }
</script>

<svelte:head>
  <title>Kit · PasswordField</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<main class="kit" data-hydrated={hydrated || undefined}>
  <header class="kit__head">
    <h1 class="kit__title">PasswordField</h1>
    <p class="kit__lede">
      Página de prueba de PR-C2. Contraseña sobre FormField: botón para mostrar u ocultar (un
      <code>&lt;button aria-pressed&gt;</code> real, siempre visible), guía de seguridad para contraseñas
      nuevas y aviso cuando la confirmación no coincide. Pegar siempre funciona (WCAG 3.3.8).
    </p>
  </header>

  <section class="kit__section" aria-labelledby="h-login">
    <h2 id="h-login">Iniciar sesión</h2>
    <p class="kit__note">
      <code>autocomplete="username"</code> + <code>"current-password"</code>, para que el gestor de
      contraseñas rellene los dos.
    </p>
    <form class="form" novalidate onsubmit={signIn}>
      <FormField label="Correo">
        {#snippet control(attrs)}
          <input
            id={attrs.id}
            class={attrs.class}
            aria-describedby={attrs['aria-describedby']}
            aria-invalid={attrs['aria-invalid']}
            aria-required={attrs['aria-required']}
            disabled={attrs.disabled}
            type="email"
            autocomplete="username"
            inputmode="email"
            bind:value={email}
          />
        {/snippet}
      </FormField>
      <PasswordField
        autocomplete="current-password"
        bind:value={password}
        error={loginError}
        name="password"
      />
      <div class="form__actions">
        <Button type="submit" icon="right-to-bracket">Entrar</Button>
        <p class="form__status" role="status">{loginStatus}</p>
      </div>
    </form>
  </section>

  <section class="kit__section" aria-labelledby="h-new">
    <h2 id="h-new">Nueva contraseña</h2>
    <p class="kit__note">
      La guía nombra el nivel con palabras («Débil», «Aceptable», «Fuerte»); las barras solo lo
      acompañan. La confirmación avisa al salir del campo o al enviar, nunca mientras escribes.
    </p>
    <form class="form" novalidate onsubmit={setPassword}>
      <PasswordField
        bind:this={nextField}
        label="Nueva contraseña"
        autocomplete="new-password"
        strength
        required
        bind:value={next}
        error={nextError}
      />
      <PasswordField
        label="Confirma la contraseña"
        autocomplete="new-password"
        required
        match={next}
        bind:value={confirm}
      />
      <div class="form__actions">
        <Button type="submit" icon="key">Guardar contraseña</Button>
        <p class="form__status" role="status">{setStatus}</p>
      </div>
    </form>
  </section>

  <section class="kit__section" aria-labelledby="h-variants">
    <h2 id="h-variants">Variantes</h2>
    <div class="grid">
      <PasswordField label="Sin botón de mostrar" toggle={false} value="secreta-1" />
      <PasswordField label="Deshabilitada" disabled value="secreta-1" />
      <PasswordField
        label="Con error"
        value="secreta-1"
        error="La contraseña actual no es correcta."
      />
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-admin" data-surface="admin">
    <h2 id="h-admin">Dentro del panel (<code>data-surface="admin"</code>)</h2>
    <div class="card">
      <PasswordField
        label="Contraseña actual"
        autocomplete="current-password"
        hint="La pedimos antes de cambiarla."
      />
      <PasswordField label="Nueva contraseña" autocomplete="new-password" strength />
    </div>
  </section>
</main>

<style>
  .kit {
    max-width: 64rem;
    margin: 0 auto;
    padding: var(--pd-md);
    font-family: var(--font-base);
    font-size: var(--fs-base);
    line-height: 1.5;
  }
  .kit__title {
    font-size: var(--fs-2xl);
    font-weight: var(--fw-bold);
  }
  .kit__lede,
  .kit__note {
    color: var(--color-muted);
    font-size: var(--fs-sm);
  }
  .kit__section {
    margin-top: var(--mg-lg);
  }
  .kit__section > h2 {
    margin-bottom: var(--mg-sm);
    font-size: var(--fs-lg);
    font-weight: var(--fw-semibold);
  }
  code {
    font-size: 0.85em;
  }

  .form {
    display: grid;
    gap: var(--mg-md);
    max-width: 28rem;
  }
  .form__actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--mg-sm);
  }
  .form__status {
    margin: 0;
    color: var(--color-text);
    font-size: var(--fs-sm);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
    gap: var(--mg-md);
  }

  .card {
    display: grid;
    gap: var(--mg-md);
    max-width: 28rem;
    padding: var(--pd-sm);
    border: 1px solid rgba(127, 127, 127, 0.18);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }
</style>
