// S21 — the FormWizard step machine (src/lib/components/wizard.ts): defaults,
// showIf visibility, per-step validation and the ONE review renderer. These are
// the rules FormWizard.svelte only drives; keeping them here means S49/S50/S53
// can trust the contract without mounting a component.
import { describe, expect, it } from 'vitest';
import {
  EMPTY_DISPLAY,
  allVisibleFields,
  applyDefaults,
  formatFieldValue,
  isBlank,
  reviewIcon,
  submitErrorMessage,
  validateAll,
  validateField,
  validateStep,
  visibleFields,
  type WizardData,
  type WizardField,
  type WizardSpec,
  type WizardStep,
} from '$lib/components/wizard';

const field = (f: Partial<WizardField> & Pick<WizardField, 'id' | 'type'>): WizardField => f;

describe('isBlank', () => {
  it('treats null, undefined, "" and whitespace as blank — legacy String(v).trim()', () => {
    for (const v of [null, undefined, '', '   ', '\t']) expect(isBlank(v)).toBe(true);
  });

  it('treats 0 and "0" as filled (a zero amount is an answer)', () => {
    expect(isBlank(0)).toBe(false);
    expect(isBlank('0')).toBe(false);
  });
});

describe('applyDefaults', () => {
  const steps: WizardStep[] = [
    { fields: [field({ id: 'amount', type: 'money' })] },
    {
      fields: [
        field({ id: 'occurred_on', type: 'date', default: '2026-08-24' }),
        field({ id: 'status', type: 'choice', default: 'paid' }),
      ],
    },
  ];

  it('fills only the fields the caller left unset', () => {
    expect(applyDefaults(steps, { amount: '25', status: 'pending' })).toEqual({
      amount: '25',
      status: 'pending',
      occurred_on: '2026-08-24',
    });
  });

  it('does not mutate the caller data (legacy mutated cfg.data in place)', () => {
    const data: WizardData = {};
    const out = applyDefaults(steps, data);
    expect(data).toEqual({});
    expect(out).toEqual({ occurred_on: '2026-08-24', status: 'paid' });
  });

  it('works with no data argument at all', () => {
    expect(applyDefaults(steps)).toEqual({ occurred_on: '2026-08-24', status: 'paid' });
  });
});

describe('showIf visibility', () => {
  // The real treasury "recurring" shape: ministry vs person.
  const step: WizardStep = {
    fields: [
      field({ id: 'rmin', type: 'select', showIf: (d) => d.target !== 'person' }),
      field({ id: 'rperson', type: 'text', showIf: (d) => d.target === 'person' }),
      field({ id: 'note', type: 'textarea' }),
    ],
  };

  it('re-evaluates against the CURRENT data, both ways', () => {
    expect(visibleFields(step, { target: 'ministry' }).map((f) => f.id)).toEqual(['rmin', 'note']);
    expect(visibleFields(step, { target: 'person' }).map((f) => f.id)).toEqual(['rperson', 'note']);
  });

  it('allVisibleFields walks every step in order', () => {
    const steps = [step, { fields: [field({ id: 'amount', type: 'money' })] }];
    expect(allVisibleFields(steps, { target: 'person' }).map((f) => f.id)).toEqual([
      'rperson',
      'note',
      'amount',
    ]);
  });
});

describe('validateField', () => {
  it('requires a required field and names it in Spanish', () => {
    const f = field({ id: 'source', type: 'text', label: 'Fuente', required: true });
    expect(validateField(f, {})).toBe('Por favor completa: Fuente.');
    expect(validateField(f, { source: 'Ofrenda' })).toBeNull();
  });

  it('falls back to "este campo" when a required field has no label', () => {
    expect(validateField(field({ id: 'x', type: 'text', required: true }), {})).toBe(
      'Por favor completa: este campo.',
    );
  });

  it('lets an optional blank field through', () => {
    expect(validateField(field({ id: 'note', type: 'textarea' }), { note: '' })).toBeNull();
  });

  it('accepts a valid money amount, including 0 and a grouped string', () => {
    const f = field({ id: 'amount', type: 'money', label: 'Monto', required: true });
    expect(validateField(f, { amount: '0' })).toBeNull();
    expect(validateField(f, { amount: '1,234.56' })).toBeNull();
    expect(validateField(f, { amount: 25.5 })).toBeNull();
  });

  it('rejects unparseable and negative money (D-003 via $lib/money)', () => {
    const f = field({ id: 'amount', type: 'money', label: 'Monto', required: true });
    expect(validateField(f, { amount: 'abc' })).toBe('Escribe un monto válido en: Monto.');
    expect(validateField(f, { amount: '-5' })).toBe('El monto no puede ser negativo en: Monto.');
  });

  it('rejects a non-numeric number and a malformed date', () => {
    expect(validateField(field({ id: 'd', type: 'number', label: 'Día' }), { d: 'x' })).toBe(
      'Escribe un número válido en: Día.',
    );
    expect(
      validateField(field({ id: 'due', type: 'date', label: 'Fecha' }), { due: '24/08/2026' }),
    ).toBe('Escribe una fecha válida en: Fecha.');
    expect(
      validateField(field({ id: 'due', type: 'date', label: 'Fecha' }), { due: '2026-08-24' }),
    ).toBeNull();
  });
});

describe('validateStep / validateAll', () => {
  const step: WizardStep = {
    fields: [
      field({ id: 'a', type: 'text', label: 'Uno', required: true }),
      field({ id: 'b', type: 'text', label: 'Dos', required: true }),
    ],
  };

  it('returns the FIRST offending field so the caller can focus it', () => {
    const bad = validateStep(step, { b: 'ok' });
    expect(bad?.field.id).toBe('a');
    expect(bad?.message).toBe('Por favor completa: Uno.');
  });

  it('never blocks on a field hidden by showIf', () => {
    const conditional: WizardStep = {
      fields: [
        field({
          id: 'rperson',
          type: 'text',
          label: 'Persona',
          required: true,
          showIf: (d) => d.target === 'person',
        }),
      ],
    };
    expect(validateStep(conditional, { target: 'ministry' })).toBeNull();
    expect(validateStep(conditional, { target: 'person' })?.field.id).toBe('rperson');
  });

  it('validateAll reports the first bad field across every step', () => {
    const steps: WizardStep[] = [
      { fields: [field({ id: 'z', type: 'money', label: 'Monto', required: true })] },
      step,
    ];
    expect(validateAll(steps, {})?.field.id).toBe('z');
    expect(validateAll(steps, { z: '10' })?.field.id).toBe('a');
    expect(validateAll(steps, { z: '10', a: 'x' })?.message).toBe('Por favor completa: Dos.');
    expect(validateAll(steps, { z: '10', a: 'x', b: 'y' })).toBeNull();
  });
});

describe('formatFieldValue — the ONE review renderer (legacy had three)', () => {
  it('renders a blank as the em dash', () => {
    expect(formatFieldValue(field({ id: 'n', type: 'text' }), {})).toBe(EMPTY_DISPLAY);
    expect(formatFieldValue(field({ id: 'n', type: 'text' }), { n: '  ' })).toBe(EMPTY_DISPLAY);
  });

  it('renders money as USD through formatUSD', () => {
    const f = field({ id: 'amount', type: 'money' });
    expect(formatFieldValue(f, { amount: '1234.5' })).toBe('$1,234.50');
    expect(formatFieldValue(f, { amount: 0 })).toBe('$0.00');
  });

  it('falls back to the raw text when money cannot be parsed', () => {
    expect(formatFieldValue(field({ id: 'amount', type: 'money' }), { amount: 'abc' })).toBe('abc');
  });

  it('renders a choice/select as the OPTION LABEL, not the stored value', () => {
    const options = [
      { value: 'paid', label: 'Pagado' },
      { value: 'pending', label: 'Pendiente' },
    ];
    expect(formatFieldValue(field({ id: 's', type: 'choice', options }), { s: 'paid' })).toBe(
      'Pagado',
    );
    expect(formatFieldValue(field({ id: 's', type: 'select', options }), { s: 'pending' })).toBe(
      'Pendiente',
    );
    expect(formatFieldValue(field({ id: 's', type: 'select', options }), { s: 'other' })).toBe(
      'other',
    );
  });

  it('renders a YYYY-MM-DD date in Spanish, read as a LOCAL calendar date (G-002)', () => {
    // new Date('2026-03-01') is UTC and renders as 28 February west of GMT —
    // the formatter must build the Date from the parts instead.
    expect(formatFieldValue(field({ id: 'd', type: 'date' }), { d: '2026-03-01' })).toBe(
      '1 de marzo de 2026',
    );
  });

  it('leaves a malformed date as-is rather than printing "Invalid Date"', () => {
    expect(formatFieldValue(field({ id: 'd', type: 'date' }), { d: 'mañana' })).toBe('mañana');
  });
});

describe('reviewIcon', () => {
  it('maps each type to the legacy glyph', () => {
    expect(reviewIcon(field({ id: 'a', type: 'money' }))).toBe('dollar-sign');
    expect(reviewIcon(field({ id: 'a', type: 'number' }))).toBe('dollar-sign');
    expect(reviewIcon(field({ id: 'a', type: 'date' }))).toBe('calendar-day');
    expect(reviewIcon(field({ id: 'a', type: 'choice' }))).toBe('list');
    expect(reviewIcon(field({ id: 'a', type: 'select' }))).toBe('list');
    expect(reviewIcon(field({ id: 'a', type: 'text' }))).toBe('pen');
  });
});

describe('submitErrorMessage', () => {
  it('reads nothing from a success result', () => {
    expect(submitErrorMessage(undefined)).toBeNull();
    expect(submitErrorMessage(null)).toBeNull();
    expect(submitErrorMessage({})).toBeNull();
    expect(submitErrorMessage({ error: null })).toBeNull();
  });

  it('reads a Supabase-shaped { error: { message } }', () => {
    expect(submitErrorMessage({ error: { message: 'duplicate key' } })).toBe('duplicate key');
  });

  it('accepts a bare string error', () => {
    expect(submitErrorMessage({ error: 'Sin permiso' })).toBe('Sin permiso');
  });

  it('falls back to human copy when the error carries no message', () => {
    expect(submitErrorMessage({ error: {} })).toBe('No se pudo guardar. Intenta de nuevo.');
    expect(submitErrorMessage({ error: { message: '   ' } })).toBe(
      'No se pudo guardar. Intenta de nuevo.',
    );
  });
});

describe('WizardSpec — the treasury WIZ shape stays assignable (S53 ports verbatim)', () => {
  interface IncomeRow {
    amount: number;
    source: string;
    occurred_on: string;
  }

  // Lifted from js/pages/admin/treasury-tab.js WIZ.income().
  const income: WizardSpec<IncomeRow, Record<string, unknown>> = {
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
            ],
          },
        ],
      },
      {
        label: '¿Qué día se recibió?',
        fields: [{ id: 'occurred_on', label: 'Fecha', type: 'date', default: '2026-08-24' }],
      },
    ],
    toData: (r) => ({ amount: r.amount, source: r.source, occurred_on: r.occurred_on }),
    toPayload: (d) => ({
      occurred_on: d.occurred_on || '2026-08-24',
      source: String(d.source ?? '').trim(),
      amount: Number(d.amount),
    }),
  };

  it('round-trips a row through toData → defaults → toPayload', () => {
    const row: IncomeRow = { amount: 250.75, source: 'Diezmo', occurred_on: '2026-08-01' };
    const data = applyDefaults(income.steps, income.toData(row));
    expect(validateAll(income.steps, data)).toBeNull();
    expect(income.toPayload(data)).toEqual({
      occurred_on: '2026-08-01',
      source: 'Diezmo',
      amount: 250.75,
    });
  });

  it('a new row picks up the date default and still validates', () => {
    const data = applyDefaults(income.steps, {});
    expect(data.occurred_on).toBe('2026-08-24');
    expect(validateAll(income.steps, data)?.field.id).toBe('amount');
  });
});
