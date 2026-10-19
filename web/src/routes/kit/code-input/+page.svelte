<script lang="ts">
  // /kit/code-input/ — the PR-C2 staging smoke page for CodeInput: one real
  // one-time-code input drawn as six boxes, typing, paste ("123 456",
  // "123-456"), an autofill-style fill, keyboard editing, onComplete exactly
  // once per code, the error that clears on edit, and the disabled / loading
  // states, in both palettes. The "verification" is a local timer — nothing is
  // sent anywhere. Prerendered, noindex.
  import { onMount } from 'svelte';
  import CodeInput from '#lib/components/CodeInput.svelte';

  /** Set once the page is interactive; the e2e specs wait for it before typing. */
  let hydrated = $state(false);
  onMount(() => (hydrated = true));

  /** The demo accepts this code; anything else is "not valid". */
  const DEMO_CODE = '123456';

  let code = $state('');
  let error = $state<string | null>(null);
  let verifying = $state(false);
  let verified = $state('');
  let completions = $state(0);
  let lastCode = $state('');

  function verify(next: string): void {
    completions += 1;
    lastCode = next;
    verified = '';
    verifying = true;
    setTimeout(() => {
      verifying = false;
      if (next === DEMO_CODE) {
        verified = 'Código correcto. Ya puedes continuar.';
      } else {
        error = 'El código no es válido. Revisa tu app de autenticación e inténtalo de nuevo.';
      }
    }, 600);
  }
</script>

<svelte:head>
  <title>Kit · CodeInput</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<main class="kit" data-hydrated={hydrated || undefined}>
  <header class="kit__head">
    <h1 class="kit__title">CodeInput</h1>
    <p class="kit__lede">
      Página de prueba de PR-C2. El código de 6 dígitos de la verificación en dos pasos: UN solo
      <code>&lt;input autocomplete="one-time-code"&gt;</code> (para el autocompletado de iOS y Android,
      los gestores de contraseñas, pegar y los lectores de pantalla) dibujado como seis casillas.
    </p>
  </header>

  <section class="kit__section" aria-labelledby="h-verify">
    <h2 id="h-verify">Verificar</h2>
    <p class="kit__note">
      Escribe o pega un código. Esta demo acepta <code>{DEMO_CODE}</code>; cualquier otro muestra el
      error, que desaparece al editar.
    </p>
    <div class="card">
      <CodeInput
        bind:value={code}
        bind:error
        loading={verifying}
        name="code"
        hint="Escribe el código de 6 dígitos que muestra tu app de autenticación."
        onComplete={verify}
      />
      <p class="card__status" role="status">{verified}</p>
    </div>

    <dl class="facts">
      <div class="facts__row">
        <dt>valor</dt>
        <dd data-testid="code-value">{code || '—'}</dd>
      </div>
      <div class="facts__row">
        <dt>onComplete llamado</dt>
        <dd data-testid="code-completions">{completions}</dd>
      </div>
      <div class="facts__row">
        <dt>último código</dt>
        <dd data-testid="code-last">{lastCode || '—'}</dd>
      </div>
    </dl>
  </section>

  <section class="kit__section" aria-labelledby="h-states">
    <h2 id="h-states">Estados</h2>
    <div class="grid">
      <CodeInput label="Vacío" />
      <CodeInput label="Con error" value="111111" error="El código caducó. Pide uno nuevo." />
      <CodeInput label="Verificando" value="482915" loading />
      <CodeInput label="Deshabilitado" value="482915" disabled hint="Espera 30 segundos." />
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-admin" data-surface="admin">
    <h2 id="h-admin">Dentro del panel (<code>data-surface="admin"</code>)</h2>
    <div class="card">
      <CodeInput
        label="Código de tu nuevo dispositivo"
        hint="Lo muestra la app después de escanear el código QR."
      />
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

  .card {
    display: grid;
    gap: var(--mg-sm);
    max-width: 26rem;
    padding: var(--pd-sm);
    border: 1px solid rgba(127, 127, 127, 0.18);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }
  .card__status {
    margin: 0;
    color: var(--color-text);
    font-size: var(--fs-sm);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
    gap: var(--mg-md);
  }

  .facts {
    margin: var(--mg-sm) 0 0;
    padding: var(--pd-sm);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    font-size: var(--fs-sm);
  }
  .facts__row {
    display: grid;
    grid-template-columns: minmax(0, 12rem) minmax(0, 1fr);
    gap: var(--mg-xs);
    padding: var(--mg-xxs) 0;
  }
  .facts__row dt {
    color: var(--color-muted);
  }
  .facts__row dd {
    margin: 0;
    font-variant-numeric: tabular-nums;
  }
</style>
