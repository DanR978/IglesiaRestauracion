<script lang="ts">
  // /kit/form-field/ — the PR-C2 staging smoke page for FormField: label above
  // the control, hint below, the inline error announced after a submit (with
  // focus sent to the first invalid field), the required marker in words,
  // disabled vs read-only, one look for input / select / textarea, and both
  // palettes. Prerendered, no data fetching, noindex.
  import { onMount, tick } from 'svelte';
  import Button from '#lib/components/Button.svelte';
  import FormField from '#lib/components/FormField.svelte';

  /** Set once the page is interactive; the e2e specs wait for it before typing. */
  let hydrated = $state(false);
  onMount(() => (hydrated = true));

  const MINISTRIES = [
    ['', 'Elige un ministerio…'],
    ['alabanza', 'Alabanza'],
    ['jovenes', 'Jóvenes'],
    ['ninos', 'Niños'],
  ] as const;
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  type Key = 'name' | 'email' | 'ministry';

  let name = $state('');
  let email = $state('');
  let ministry = $state('');
  let note = $state('');
  let errors = $state<Record<Key, string | null>>({ name: null, email: null, ministry: null });
  let saved = $state('');
  let form = $state<HTMLFormElement>();

  function validate(): Record<Key, string | null> {
    const mail = email.trim();
    return {
      name: name.trim() ? null : 'Escribe tu nombre.',
      email: !mail
        ? 'Escribe tu correo.'
        : EMAIL.test(mail)
          ? null
          : 'Escribe un correo válido, como nombre@ejemplo.org.',
      ministry: ministry ? null : 'Elige un ministerio.',
    };
  }

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    errors = validate();
    if (Object.values(errors).some(Boolean)) {
      saved = '';
      await tick();
      form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    saved = `Guardado: ${name.trim()} · ${email.trim()}`;
  }

  /** An edit clears that field's error; the next submit re-checks it. */
  function edited(key: Key): void {
    if (errors[key]) errors[key] = null;
  }
</script>

<svelte:head>
  <title>Kit · FormField</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<main class="kit" data-hydrated={hydrated || undefined}>
  <header class="kit__head">
    <h1 class="kit__title">FormField</h1>
    <p class="kit__lede">
      Página de prueba de PR-C2: el único vocabulario de campos del panel. Etiqueta arriba, pista
      debajo y el error en línea, que se anuncia (<code>role="alert"</code>) cuando aparece tras
      enviar. El control es del que lo usa; FormField le pasa <code>id</code>,
      <code>aria-describedby</code>, <code>aria-invalid</code> y <code>aria-required</code>.
    </p>
  </header>

  <section class="kit__section" aria-labelledby="h-form">
    <h2 id="h-form">Un formulario con validación</h2>
    <p class="kit__note">
      Pulsa «Guardar» con todo vacío: cada error aparece debajo de su campo y el foco va al primero.
      Al escribir, el error de ese campo se va.
    </p>

    <form class="form" novalidate bind:this={form} onsubmit={submit}>
      <FormField label="Nombre" hint="Como aparecerá en el panel." error={errors.name} required>
        {#snippet control(attrs)}
          <input
            {...attrs}
            type="text"
            autocomplete="name"
            bind:value={name}
            oninput={() => edited('name')}
          />
        {/snippet}
      </FormField>

      <FormField label="Correo" error={errors.email} required>
        {#snippet control(attrs)}
          <input
            {...attrs}
            type="email"
            autocomplete="email"
            inputmode="email"
            bind:value={email}
            oninput={() => edited('email')}
          />
        {/snippet}
      </FormField>

      <FormField label="Ministerio" error={errors.ministry} required>
        {#snippet control(attrs)}
          <select {...attrs} bind:value={ministry} onchange={() => edited('ministry')}>
            {#each MINISTRIES as [value, label] (value)}
              <option {value}>{label}</option>
            {/each}
          </select>
        {/snippet}
      </FormField>

      <FormField label="Nota" hint="Opcional. Solo la ve el equipo.">
        {#snippet control(attrs)}
          <textarea {...attrs} rows="3" bind:value={note}></textarea>
        {/snippet}
      </FormField>

      <div class="form__actions">
        <Button type="submit" icon="floppy-disk">Guardar</Button>
        <p class="form__status" role="status">{saved}</p>
      </div>
    </form>
  </section>

  <section class="kit__section" aria-labelledby="h-states">
    <h2 id="h-states">Estados</h2>
    <p class="kit__note">
      Deshabilitado y solo lectura no se parecen: el primero se atenúa y no recibe foco; el segundo
      se lee entero, recibe foco y se puede copiar.
    </p>
    <div class="grid">
      <FormField label="Con pista" hint="Aparece en tu perfil.">
        {#snippet control(attrs)}
          <input {...attrs} type="text" value="Ana Morales" />
        {/snippet}
      </FormField>
      <FormField label="Teléfono" error="Escribe un teléfono de 10 dígitos.">
        {#snippet control(attrs)}
          <input {...attrs} type="tel" inputmode="tel" value="555 12" />
        {/snippet}
      </FormField>
      <FormField label="Obligatorio" required hint="La marca es una palabra, no un color.">
        {#snippet control(attrs)}
          <input {...attrs} type="text" />
        {/snippet}
      </FormField>
      <FormField label="Deshabilitado" disabled hint="Se activa al elegir un ministerio.">
        {#snippet control(attrs)}
          <input {...attrs} type="text" value="No disponible" />
        {/snippet}
      </FormField>
      <FormField label="Solo lectura" hint="Se puede seleccionar y copiar.">
        {#snippet control(attrs)}
          <input {...attrs} type="text" readonly value="JBSWY3DPEHPK3PXP" />
        {/snippet}
      </FormField>
      <FormField label="Con texto de ejemplo">
        {#snippet control(attrs)}
          <input {...attrs} type="text" placeholder="Ej. Retiro de jóvenes" />
        {/snippet}
      </FormField>
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-admin" data-surface="admin">
    <h2 id="h-admin">Dentro del panel (<code>data-surface="admin"</code>)</h2>
    <p class="kit__note">El mismo componente en la paleta pizarra (D-014), sobre una tarjeta.</p>
    <div class="card">
      <FormField label="Título del evento" hint="Máximo 80 caracteres." required>
        {#snippet control(attrs)}
          <input {...attrs} type="text" value="Culto de jóvenes" />
        {/snippet}
      </FormField>
      <FormField label="Lugar" error="Escribe dónde será el evento.">
        {#snippet control(attrs)}
          <input {...attrs} type="text" />
        {/snippet}
      </FormField>
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
    max-width: 32rem;
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
    padding: var(--pd-sm);
    border: 1px solid rgba(127, 127, 127, 0.18);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }
</style>
