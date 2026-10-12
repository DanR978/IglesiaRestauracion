// S21 — FormWizard.svelte under jsdom: step navigation, per-step validation
// blocking + focus-to-first-invalid, showIf re-evaluation, the ONE review
// screen, and the submit contract (spinner → inline error → stays open, or
// close + onDone with the payload). Also the things the legacy engine never
// did: an adaptive progress strip, Escape/backdrop close, and a
// reference-counted scroll lock.
import { cleanup, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bodyScrollLockDepth } from '$lib/scroll-lock';
import type { WizardData, WizardStep } from '$lib/components/wizard';
import FormWizardHarness from './fixtures/FormWizardHarness.svelte';

/** The treasury "Nuevo ingreso" spec, trimmed to the shapes under test. */
const INCOME_STEPS: WizardStep[] = [
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
        ],
      },
    ],
  },
  {
    label: '¿Qué día se recibió?',
    fields: [{ id: 'occurred_on', label: 'Fecha', type: 'date', default: '2026-08-24' }],
  },
];

/** The treasury "recurrente" head: a choice card that gates the next step. */
const RECURRING_STEPS: WizardStep[] = [
  {
    label: '¿Es para una persona o un ministerio?',
    fields: [
      {
        id: 'target',
        type: 'choice',
        default: 'ministry',
        options: [
          { value: 'ministry', label: 'Un ministerio', desc: 'Va a su presupuesto', icon: 'users' },
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
        type: 'select',
        required: true,
        showIf: (d: WizardData) => d.target !== 'person',
        options: [
          { value: '', label: 'Selecciona…' },
          { value: 'm1', label: 'Alabanza' },
        ],
      },
      {
        id: 'rperson',
        label: 'Nombre de la persona',
        type: 'text',
        required: true,
        showIf: (d: WizardData) => d.target === 'person',
      },
    ],
  },
];

const byText = (c: HTMLElement, sel: string, text: string) =>
  [...c.querySelectorAll<HTMLElement>(sel)].find((el) => el.textContent?.includes(text));
const nav = (c: HTMLElement, text: string) => byText(c, '.wiz__nav button', text)!;
const errorText = (c: HTMLElement) => c.querySelector('.wiz__error')?.textContent?.trim() ?? '';
const dots = (c: HTMLElement) => [...c.querySelectorAll('.wiz__dot')];

function setInput(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function setSelect(el: HTMLSelectElement, value: string) {
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

afterEach(() => {
  // Unmount BEFORE asserting: testing-library's auto-cleanup runs after this
  // hook, and a throwing hook would skip it and cascade into the next test.
  cleanup();
  expect(bodyScrollLockDepth()).toBe(0);
  document.body.style.overflow = '';
});

describe('FormWizard — shell', () => {
  it('renders nothing while closed', () => {
    const { container } = render(FormWizardHarness, { steps: INCOME_STEPS, open: false });
    expect(container.querySelector('.wiz')).toBeNull();
    expect(bodyScrollLockDepth()).toBe(0);
  });

  it('is a labelled modal dialog with a named close control', () => {
    const { container, getByRole } = render(FormWizardHarness, { steps: INCOME_STEPS });
    const dialog = getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.getAttribute('aria-labelledby')).toBe(container.querySelector('.wiz__title')?.id);
    expect(container.querySelector('.wiz__close')).toHaveAttribute('aria-label', 'Cerrar');
  });

  it('takes the reference-counted scroll lock while open and gives it back on close', async () => {
    const { container, getByTestId } = render(FormWizardHarness, { steps: INCOME_STEPS });
    expect(bodyScrollLockDepth()).toBe(1);
    expect(document.body.style.overflow).toBe('hidden');

    container.querySelector<HTMLButtonElement>('.wiz__close')!.click();
    await tick();
    expect(getByTestId('open-state')).toHaveTextContent('cerrado');
    expect(bodyScrollLockDepth()).toBe(0);
    expect(document.body.style.overflow).toBe('');
  });

  it('closes on Escape and on a backdrop click', async () => {
    const onClose = vi.fn();
    const first = render(FormWizardHarness, { steps: INCOME_STEPS, onClose });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick();
    expect(first.getByTestId('open-state')).toHaveTextContent('cerrado');
    expect(onClose).toHaveBeenCalledTimes(1);
    first.unmount();

    const second = render(FormWizardHarness, { steps: INCOME_STEPS, onClose });
    second.container.querySelector<HTMLButtonElement>('.wiz__scrim')!.click();
    await tick();
    expect(second.getByTestId('open-state')).toHaveTextContent('cerrado');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('gives the scrim an accessible name instead of a click handler on a bare div', () => {
    const { container } = render(FormWizardHarness, { steps: INCOME_STEPS });
    const scrim = container.querySelector('.wiz__scrim')!;
    expect(scrim.tagName).toBe('BUTTON');
    expect(scrim).toHaveAttribute('aria-label', 'Cerrar');
  });
});

describe('FormWizard — the progress strip adapts to the step count', () => {
  it('renders steps + 1 dots, never a hard-coded 4', () => {
    const three = render(FormWizardHarness, { steps: INCOME_STEPS });
    expect(dots(three.container)).toHaveLength(4);
    three.unmount();

    const one = render(FormWizardHarness, {
      steps: [{ fields: [{ id: 'name', label: 'Nombre', type: 'text' }] }],
    });
    expect(dots(one.container)).toHaveLength(2);
  });

  it('marks the current dot active and the passed ones done', async () => {
    const { container } = render(FormWizardHarness, { steps: INCOME_STEPS });
    expect(dots(container)[0]).toHaveClass('is-active');

    setInput(container.querySelector<HTMLInputElement>('#' + cssId(container, 'amount'))!, '25');
    nav(container, 'Siguiente').click();
    await tick();

    expect(dots(container)[0]).toHaveClass('is-done');
    expect(dots(container)[1]).toHaveClass('is-active');
  });

  it('exposes the position to assistive tech', () => {
    const { container } = render(FormWizardHarness, { steps: INCOME_STEPS });
    const bar = container.querySelector('.wiz__progress')!;
    expect(bar).toHaveAttribute('role', 'progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '1');
    expect(bar).toHaveAttribute('aria-valuemax', '4');
    expect(bar).toHaveAttribute('aria-valuetext', 'Paso 1 de 4');
  });
});

/** The generated per-instance control id for a field (no global ids — G-009). */
function cssId(container: HTMLElement, fieldId: string): string {
  const wrapper = [...container.querySelectorAll<HTMLElement>('[data-field]')].find(
    (el) => el.dataset.field === fieldId,
  )!;
  return wrapper.querySelector('input, textarea, select')!.id;
}

describe('FormWizard — navigation and validation', () => {
  it('blocks Siguiente on a required field, shows the message inline and focuses it', async () => {
    const { container } = render(FormWizardHarness, { steps: INCOME_STEPS });
    nav(container, 'Siguiente').click();
    await tick();
    await tick();

    expect(errorText(container)).toBe('Por favor completa: Monto.');
    expect(container.querySelector('.wiz__error')).toHaveAttribute('role', 'alert');
    // still on step 1
    expect(container.textContent).toContain('¿Cuánto dinero se recibió?');
    expect(document.activeElement?.id).toBe(cssId(container, 'amount'));
  });

  it('advances once the field is valid, and Atrás goes back', async () => {
    const { container } = render(FormWizardHarness, { steps: INCOME_STEPS });
    setInput(container.querySelector<HTMLInputElement>('#' + cssId(container, 'amount'))!, '25.50');
    nav(container, 'Siguiente').click();
    await tick();
    expect(container.textContent).toContain('¿De dónde vino?');
    expect(errorText(container)).toBe('');

    nav(container, 'Atrás').click();
    await tick();
    expect(container.textContent).toContain('¿Cuánto dinero se recibió?');
    // the value survives the round trip
    expect(container.querySelector<HTMLInputElement>('#' + cssId(container, 'amount'))!.value).toBe(
      '25.50',
    );
  });

  it('has no Atrás on the first step', () => {
    const { container } = render(FormWizardHarness, { steps: INCOME_STEPS });
    expect(byText(container, '.wiz__nav button', 'Atrás')).toBeUndefined();
  });

  it('rejects a negative money amount with money-specific copy', async () => {
    const { container } = render(FormWizardHarness, { steps: INCOME_STEPS });
    setInput(container.querySelector<HTMLInputElement>('#' + cssId(container, 'amount'))!, '-5');
    nav(container, 'Siguiente').click();
    await tick();
    expect(errorText(container)).toBe('El monto no puede ser negativo en: Monto.');
  });

  it('clears the error as soon as the user edits the field', async () => {
    const { container } = render(FormWizardHarness, { steps: INCOME_STEPS });
    nav(container, 'Siguiente').click();
    await tick();
    expect(errorText(container)).not.toBe('');
    setInput(container.querySelector<HTMLInputElement>('#' + cssId(container, 'amount'))!, '10');
    await tick();
    expect(errorText(container)).toBe('');
  });

  it('labels the last step button "Revisar" and the review button with submitLabel', async () => {
    const { container } = render(FormWizardHarness, {
      steps: [{ fields: [{ id: 'name', label: 'Nombre', type: 'text' }] }],
      submitLabel: 'Guardar fondo',
    });
    expect(nav(container, 'Revisar')).toBeTruthy();
    nav(container, 'Revisar').click();
    await tick();
    expect(nav(container, 'Guardar fondo')).toBeTruthy();
  });

  it('applies each field default before the first render', () => {
    const { container } = render(FormWizardHarness, {
      steps: [INCOME_STEPS[2]],
    });
    expect(
      container.querySelector<HTMLInputElement>('#' + cssId(container, 'occurred_on'))!.value,
    ).toBe('2026-08-24');
  });

  it('loads edit-mode data from a spec toData() result', () => {
    const { container } = render(FormWizardHarness, {
      steps: INCOME_STEPS,
      data: { amount: 250.75, source: 'Diezmo', occurred_on: '2026-08-01' },
    });
    expect(container.querySelector<HTMLInputElement>('#' + cssId(container, 'amount'))!.value).toBe(
      '250.75',
    );
  });
});

describe('FormWizard — choice fields are a real radio group', () => {
  it('renders focusable radios, not click-only divs', () => {
    const { container } = render(FormWizardHarness, { steps: RECURRING_STEPS });
    const radios = container.querySelectorAll<HTMLInputElement>('.wiz__card-input');
    expect(radios).toHaveLength(2);
    expect(radios[0].type).toBe('radio');
    // one group name per field instance
    expect(radios[0].name).toBe(radios[1].name);
    expect(radios[0].checked).toBe(true); // the default
    expect(container.querySelector('.wiz__card')).toHaveClass('is-selected');
  });

  it('re-evaluates showIf on the NEXT step when the choice changes', async () => {
    const { container } = render(FormWizardHarness, { steps: RECURRING_STEPS });
    nav(container, 'Siguiente').click();
    await tick();
    // default target=ministry → the ministry select is the visible field
    expect(container.querySelector('[data-field="rmin"]')).not.toBeNull();
    expect(container.querySelector('[data-field="rperson"]')).toBeNull();

    nav(container, 'Atrás').click();
    await tick();
    container.querySelectorAll<HTMLInputElement>('.wiz__card-input')[1].click();
    await tick();
    nav(container, 'Siguiente').click();
    await tick();
    expect(container.querySelector('[data-field="rmin"]')).toBeNull();
    expect(container.querySelector('[data-field="rperson"]')).not.toBeNull();
  });

  it('does not block on a required field hidden by showIf', async () => {
    const { container } = render(FormWizardHarness, { steps: RECURRING_STEPS });
    nav(container, 'Siguiente').click();
    await tick();
    setSelect(container.querySelector<HTMLSelectElement>('#' + cssId(container, 'rmin'))!, 'm1');
    nav(container, 'Revisar').click();
    await tick();
    // reached the review screen: the hidden, required rperson never blocked it
    expect(container.textContent).toContain('Revisa antes de guardar');
  });
});

describe('FormWizard — the ONE review screen', () => {
  async function toReview(container: HTMLElement) {
    setInput(
      container.querySelector<HTMLInputElement>('#' + cssId(container, 'amount'))!,
      '1234.5',
    );
    nav(container, 'Siguiente').click();
    await tick();
    setSelect(
      container.querySelector<HTMLSelectElement>('#' + cssId(container, 'source'))!,
      'Ofrenda',
    );
    nav(container, 'Siguiente').click();
    await tick();
    nav(container, 'Revisar').click();
    await tick();
  }

  it('lists every visible field, type-aware: money as USD, select as its label, date localized', async () => {
    const { container } = render(FormWizardHarness, { steps: INCOME_STEPS });
    await toReview(container);

    const rows = [...container.querySelectorAll('.wiz__review-row')];
    expect(rows).toHaveLength(3);
    const text = (i: number) => rows[i].textContent?.replace(/\s+/g, ' ').trim();
    expect(text(0)).toContain('$1,234.50');
    expect(text(1)).toContain('Ofrenda');
    expect(text(2)).toContain('24 de agosto de 2026');
  });

  it('omits fields hidden by showIf from the review', async () => {
    const { container } = render(FormWizardHarness, { steps: RECURRING_STEPS });
    nav(container, 'Siguiente').click();
    await tick();
    setSelect(container.querySelector<HTMLSelectElement>('#' + cssId(container, 'rmin'))!, 'm1');
    nav(container, 'Revisar').click();
    await tick();

    const labels = [...container.querySelectorAll('.wiz__review-key')].map((el) =>
      el.textContent?.trim(),
    );
    expect(labels).toContain('Ministerio');
    expect(labels).not.toContain('Nombre de la persona');
  });
});

describe('FormWizard — submit', () => {
  const singleStep: WizardStep[] = [
    { fields: [{ id: 'name', label: 'Nombre', type: 'text', required: true }] },
  ];

  async function fillAndReview(container: HTMLElement) {
    setInput(
      container.querySelector<HTMLInputElement>('#' + cssId(container, 'name'))!,
      'Misiones',
    );
    nav(container, 'Revisar').click();
    await tick();
  }

  it('hands onSubmit the collected data and closes + onDone on success', async () => {
    const onSubmit = vi.fn(() => ({}));
    const onDone = vi.fn();
    const { container, getByTestId } = render(FormWizardHarness, {
      steps: singleStep,
      submitLabel: 'Guardar fondo',
      onSubmit,
      onDone,
    });
    await fillAndReview(container);

    nav(container, 'Guardar fondo').click();
    await tick();
    await tick();

    expect(onSubmit).toHaveBeenCalledWith({ name: 'Misiones' });
    expect(onDone).toHaveBeenCalledWith({ name: 'Misiones' });
    expect(getByTestId('open-state')).toHaveTextContent('cerrado');
  });

  it('shows the spinner + Guardando… and disables the button while in flight', async () => {
    let settle: (v: undefined) => void = () => {};
    const onSubmit = vi.fn(() => new Promise<undefined>((r) => (settle = r)));
    const { container } = render(FormWizardHarness, { steps: singleStep, onSubmit });
    await fillAndReview(container);

    const submitBtn = container.querySelector<HTMLButtonElement>('.wiz__btn--submit')!;
    submitBtn.click();
    await tick();
    expect(submitBtn).toBeDisabled();
    expect(submitBtn).toHaveAttribute('aria-busy', 'true');
    expect(submitBtn.textContent).toContain('Guardando…');
    expect(submitBtn.querySelector('.fa-spin')).not.toBeNull();

    settle(undefined);
    await tick();
    await tick();
  });

  it('on { error } it STAYS OPEN, re-enables and shows the message inline', async () => {
    const onDone = vi.fn();
    const { container, getByTestId } = render(FormWizardHarness, {
      steps: singleStep,
      onSubmit: () => ({ error: { message: 'duplicate key value' } }),
      onDone,
    });
    await fillAndReview(container);

    const submitBtn = container.querySelector<HTMLButtonElement>('.wiz__btn--submit')!;
    submitBtn.click();
    await tick();
    await tick();

    expect(getByTestId('open-state')).toHaveTextContent('abierto');
    expect(errorText(container)).toBe('duplicate key value');
    expect(submitBtn).not.toBeDisabled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('catches a THROWN onSubmit and reports human copy when there is no message', async () => {
    const { container, getByTestId } = render(FormWizardHarness, {
      steps: singleStep,
      onSubmit: () => {
        throw new Error('');
      },
    });
    await fillAndReview(container);
    container.querySelector<HTMLButtonElement>('.wiz__btn--submit')!.click();
    await tick();
    await tick();

    expect(errorText(container)).toBe('No se pudo guardar. Intenta de nuevo.');
    expect(getByTestId('open-state')).toHaveTextContent('abierto');
  });

  it('emits no window.__* global and no inline onclick attribute', () => {
    const { container } = render(FormWizardHarness, { steps: INCOME_STEPS });
    expect(container.querySelector('[onclick]')).toBeNull();
    expect(Object.keys(window).some((k) => k.startsWith('__wiz'))).toBe(false);
  });
});
