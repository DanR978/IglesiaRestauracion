<script lang="ts">
  // /kit/readonly-field/ — the PR-C2 staging smoke page for ReadonlyField: the
  // "your data, an administrator's to change" pattern Mi cuenta uses instead
  // of a wall of disabled inputs — static, unfocusable values, the lock note,
  // the em dash + "Sin dato" for a missing value, a rich value, alignment
  // beside an editable field, and both palettes. Prerendered, noindex.
  import { onMount } from 'svelte';
  import FormField from '#lib/components/FormField.svelte';
  import ReadonlyField from '#lib/components/ReadonlyField.svelte';

  /** Set once the page is interactive; the e2e specs wait for it before typing. */
  let hydrated = $state(false);
  onMount(() => (hydrated = true));

  const MINISTRIES = ['Alabanza', 'Jóvenes', 'Escuela dominical'];

  let displayName = $state('Ana Morales');
</script>

<svelte:head>
  <title>Kit · ReadonlyField</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<main class="kit" data-hydrated={hydrated || undefined}>
  <header class="kit__head">
    <h1 class="kit__title">ReadonlyField</h1>
    <p class="kit__lede">
      Página de prueba de PR-C2. Un dato tuyo que gestiona un administrador: texto, no un control.
      No recibe foco, no parece un campo apagado y dice quién lo gestiona. Reemplaza la pared de
      <code>&lt;input disabled&gt;</code> de Mi cuenta.
    </p>
  </header>

  <section class="kit__section" aria-labelledby="h-profile">
    <h2 id="h-profile">Mi cuenta · Perfil</h2>
    <div class="card">
      <FormField label="Nombre visible" hint="Así te ven los demás en el panel.">
        {#snippet control(attrs)}
          <input
            id={attrs.id}
            class={attrs.class}
            aria-describedby={attrs['aria-describedby']}
            aria-invalid={attrs['aria-invalid']}
            aria-required={attrs['aria-required']}
            disabled={attrs.disabled}
            type="text"
            autocomplete="name"
            bind:value={displayName}
          />
        {/snippet}
      </FormField>
      <ReadonlyField
        label="Correo"
        value="ana.morales@irdlex.org"
        note="El correo lo gestiona un administrador."
      />
      <ReadonlyField label="Rol" value="Líder de ministerio" />
      <ReadonlyField label="Ministerios">
        <ul class="chips" role="list">
          {#each MINISTRIES as name (name)}
            <li class="chips__item">{name}</li>
          {/each}
        </ul>
      </ReadonlyField>
      <ReadonlyField label="Miembro desde" value="14 de marzo de 2024" />
      <ReadonlyField label="Último inicio de sesión" value={null} />
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-row">
    <h2 id="h-row">Junto a un campo editable</h2>
    <p class="kit__note">
      El valor ocupa la misma altura que un control, así que en una fila de dos columnas el texto
      queda a la misma altura que el del campo. A 640px o menos, una sola columna.
    </p>
    <div class="row">
      <FormField label="Teléfono">
        {#snippet control(attrs)}
          <input
            id={attrs.id}
            class={attrs.class}
            aria-describedby={attrs['aria-describedby']}
            aria-invalid={attrs['aria-invalid']}
            aria-required={attrs['aria-required']}
            disabled={attrs.disabled}
            type="tel"
            inputmode="tel"
            autocomplete="tel"
            value="859 555 0142"
          />
        {/snippet}
      </FormField>
      <ReadonlyField label="Usuario" value="amorales" />
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-admin" data-surface="admin">
    <h2 id="h-admin">Dentro del panel (<code>data-surface="admin"</code>)</h2>
    <div class="card">
      <ReadonlyField
        label="Correo"
        value="pastor@irdlex.org"
        note="El correo lo gestiona un administrador."
      />
      <ReadonlyField label="Zona horaria" value="" />
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
    gap: var(--mg-md);
    max-width: 32rem;
    padding: var(--pd-sm);
    border: 1px solid rgba(127, 127, 127, 0.18);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--mg-xs);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .chips__item {
    padding: 0.15rem 0.65rem;
    border-radius: var(--radius-full);
    background: var(--status-neutral-bg);
    font-size: var(--fs-sm);
  }

  .row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--mg-md);
    max-width: 40rem;
  }
  @media (max-width: 640px) {
    .row {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
