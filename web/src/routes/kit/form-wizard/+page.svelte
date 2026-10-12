<script lang="ts">
  // /kit/form-wizard/ — the S21 staging smoke page for FormWizard: every field
  // type (text · textarea · number · money · date · select · choice), a
  // one-step wizard vs a five-step one (the progress strip adapts), showIf,
  // per-step validation, the review screen, and both submit outcomes.
  // Prerendered, no data fetching, noindex.
  import FormWizard from '$lib/components/FormWizard.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import { todayISO } from '$lib/date';
  import type { WizardData, WizardSpec } from '$lib/components/wizard';

  interface IncomeRow {
    amount: number;
    source: string;
    occurred_on: string;
    fund: string | null;
    note: string | null;
  }

  // Lifted from js/pages/admin/treasury-tab.js WIZ.income() — the shape S53
  // ports verbatim, typed.
  const INCOME: WizardSpec<IncomeRow, Record<string, unknown>> = {
    title: 'Nuevo ingreso',
    editTitle: 'Editar ingreso',
    icon: 'arrow-down',
    submitLabel: 'Guardar ingreso',
    steps: [
      {
        label: '¿Cuánto dinero se recibió?',
        hint: 'Escribe la cantidad.',
        fields: [{ id: 'amount', label: 'Monto', type: 'money', required: true }],
      },
      {
        label: '¿De dónde vino?',
        fields: [
          {
            id: 'source',
            label: 'Fuente',
            type: 'select',
            required: true,
            options: [
              { value: '', label: 'Selecciona una fuente…' },
              { value: 'Diezmo', label: 'Diezmo' },
              { value: 'Ofrenda', label: 'Ofrenda' },
              { value: 'Misiones', label: 'Misiones' },
            ],
          },
        ],
      },
      {
        label: '¿Qué día se recibió?',
        fields: [{ id: 'occurred_on', label: 'Fecha', type: 'date', default: todayISO() }],
      },
      {
        label: 'Detalles (opcional)',
        fields: [
          { id: 'fund', label: 'Fondo', type: 'text', placeholder: 'General / Misiones' },
          { id: 'note', label: 'Nota', type: 'textarea' },
        ],
      },
    ],
    toData: (r) => ({
      amount: r.amount,
      source: r.source,
      occurred_on: r.occurred_on,
      fund: r.fund,
      note: r.note,
    }),
    toPayload: (d) => ({
      occurred_on: d.occurred_on || todayISO(),
      source: String(d.source ?? '').trim(),
      fund: String(d.fund ?? '').trim() || null,
      amount: Number(d.amount),
      note: String(d.note ?? '').trim() || null,
    }),
  };

  // WIZ.recurring() — the showIf case: "un ministerio" vs "una persona".
  const RECURRING = {
    title: 'Nuevo pago recurrente',
    icon: 'rotate',
    submitLabel: 'Guardar',
    steps: [
      {
        label: '¿Es para una persona o un ministerio?',
        fields: [
          {
            id: 'target',
            type: 'choice' as const,
            default: 'ministry',
            options: [
              {
                value: 'ministry',
                label: 'Un ministerio',
                desc: 'Va a su presupuesto',
                icon: 'people-group',
              },
              { value: 'person', label: 'Una persona', desc: 'Ej. pastor, músico', icon: 'user' },
            ],
          },
        ],
      },
      {
        label: '¿Cuál?',
        fields: [
          {
            id: 'rmin',
            label: 'Ministerio',
            type: 'select' as const,
            required: true,
            showIf: (d: WizardData) => d.target !== 'person',
            options: [
              { value: '', label: 'Selecciona…' },
              { value: 'm1', label: 'Alabanza' },
              { value: 'm2', label: 'Jóvenes' },
            ],
          },
          {
            id: 'rperson',
            label: 'Nombre de la persona',
            type: 'text' as const,
            required: true,
            placeholder: 'Ej. Pastor Juan, músico',
            showIf: (d: WizardData) => d.target === 'person',
          },
        ],
      },
      {
        label: '¿Cuánto se paga?',
        fields: [{ id: 'amount', label: 'Monto', type: 'money' as const, required: true }],
      },
      {
        label: 'Detalles (opcional)',
        fields: [
          {
            id: 'day_of_month',
            label: 'Día del mes (1–31)',
            type: 'number' as const,
            placeholder: 'ej. 1',
          },
          { id: 'note', label: 'Nota', type: 'textarea' as const },
        ],
      },
    ],
  };

  // WIZ.incomeCat() — a single-step wizard: the strip must show 2 dots, not 4.
  const CATEGORY = {
    title: 'Nueva categoría de ingreso',
    icon: 'tag',
    submitLabel: 'Guardar',
    steps: [
      {
        label: '¿Cómo se llama?',
        fields: [
          {
            id: 'name',
            label: 'Nombre',
            type: 'text' as const,
            required: true,
            placeholder: 'Ofrenda especial',
          },
        ],
      },
    ],
  };

  const EDIT_ROW: IncomeRow = {
    amount: 250.75,
    source: 'Diezmo',
    occurred_on: '2026-08-01',
    fund: 'General',
    note: 'Servicio del domingo',
  };

  let incomeOpen = $state(false);
  let editOpen = $state(false);
  let recurringOpen = $state(false);
  let categoryOpen = $state(false);
  let failOpen = $state(false);

  let lastPayload = $state<string>('—');

  function save(data: WizardData) {
    lastPayload = JSON.stringify(INCOME.toPayload(data), null, 2);
  }
</script>

<svelte:head>
  <title>Kit · FormWizard</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<main class="kit">
  <header class="kit__head">
    <h1 class="kit__title">FormWizard</h1>
    <p class="kit__lede">
      Página de prueba de S21. Un solo motor para todos los asistentes del panel. La barra de
      progreso se adapta al número de pasos (<code>pasos + 1</code>), la validación es por paso y en
      línea, y la pantalla de revisión es una sola.
    </p>
  </header>

  <section class="kit__section">
    <h2>Casos</h2>
    <div class="row">
      <button type="button" class="cta" onclick={() => (incomeOpen = true)}>
        <Icon name="arrow-down" /> Nuevo ingreso (4 pasos + revisión)
      </button>
      <button type="button" class="cta" onclick={() => (editOpen = true)}>
        <Icon name="pen" /> Editar ingreso (modo edición)
      </button>
      <button type="button" class="cta" onclick={() => (recurringOpen = true)}>
        <Icon name="rotate" /> Pago recurrente (<code>showIf</code>)
      </button>
      <button type="button" class="cta" onclick={() => (categoryOpen = true)}>
        <Icon name="tag" /> Categoría (1 paso → 2 puntos)
      </button>
      <button type="button" class="cta cta--danger" onclick={() => (failOpen = true)}>
        <Icon name="triangle-exclamation" /> Guardado que falla
      </button>
    </div>
  </section>

  <section class="kit__section">
    <h2>Último <code>toPayload()</code></h2>
    <pre class="payload">{lastPayload}</pre>
  </section>

  <section class="kit__section">
    <h2>Qué comprobar a mano</h2>
    <ul class="checklist">
      <li>Escape y clic en el fondo cierran; el foco vuelve al botón que abrió.</li>
      <li>Sin monto, «Siguiente» no avanza: el error sale en línea y el foco va al campo.</li>
      <li>En «Pago recurrente», cambiar la tarjeta cambia el campo del paso siguiente.</li>
      <li>En la revisión: el monto sale en USD, la fuente con su etiqueta, la fecha en español.</li>
      <li>«Guardado que falla» deja el asistente abierto y muestra el error debajo.</li>
      <li>A 360px no hay desplazamiento horizontal y los campos miden 16px.</li>
    </ul>
  </section>
</main>

<div data-surface="admin">
  <FormWizard
    bind:open={incomeOpen}
    title={INCOME.title}
    icon={INCOME.icon}
    submitLabel={INCOME.submitLabel}
    steps={INCOME.steps}
    onSubmit={() => undefined}
    onDone={save}
  />

  <FormWizard
    bind:open={editOpen}
    title={INCOME.editTitle ?? INCOME.title}
    icon={INCOME.icon}
    submitLabel="Guardar cambios"
    steps={INCOME.steps}
    data={INCOME.toData(EDIT_ROW)}
    onSubmit={() => undefined}
    onDone={save}
  />

  <FormWizard
    bind:open={recurringOpen}
    title={RECURRING.title}
    icon={RECURRING.icon}
    submitLabel={RECURRING.submitLabel}
    steps={RECURRING.steps}
    onSubmit={() => undefined}
    onDone={(d) => (lastPayload = JSON.stringify(d, null, 2))}
  />

  <FormWizard
    bind:open={categoryOpen}
    title={CATEGORY.title}
    icon={CATEGORY.icon}
    submitLabel={CATEGORY.submitLabel}
    steps={CATEGORY.steps}
    onSubmit={() => undefined}
    onDone={(d) => (lastPayload = JSON.stringify(d, null, 2))}
  />

  <FormWizard
    bind:open={failOpen}
    title="Guardado que falla"
    icon="triangle-exclamation"
    submitLabel="Guardar"
    steps={CATEGORY.steps}
    onSubmit={() => ({ error: { message: 'No se pudo guardar: la categoría ya existe.' } })}
  />
</div>

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
  .kit__lede {
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

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--mg-xs);
  }

  .cta {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 2.75rem;
    padding: 0.5rem 1.1rem;
    border: 0;
    border-radius: var(--radius-md);
    background: var(--color-dark);
    color: var(--color-white);
    box-shadow: var(--shadow-sm);
    font: inherit;
    font-size: var(--fs-btn);
    font-weight: var(--fw-semibold);
    cursor: pointer;
  }
  .cta:hover {
    filter: brightness(1.08);
    box-shadow: var(--shadow-md);
  }
  .cta--danger {
    background: var(--color-danger);
  }

  .payload {
    max-width: 100%;
    margin: 0;
    padding: var(--pd-sm);
    overflow-x: auto;
    border: 1px solid var(--gray-40);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text);
    font-size: var(--fs-xs);
  }

  .checklist {
    margin: 0;
    padding-inline-start: 1.2rem;
    color: var(--color-muted);
    font-size: var(--fs-sm);
  }
  .checklist li {
    margin-block-end: 0.25rem;
  }
</style>
