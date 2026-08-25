// S21 — DataTable.svelte under jsdom: rows render with the data-label the card
// view reads, sort state DRIVES render order (the legacy sortKey/sortDir were
// dead state), money cells take a --money-* tone, and the loading / empty /
// error states are built in. The card collapse itself is CSS at ≤1100px; what
// JS owns is the sort control that replaces the hidden <thead> — driven by a
// mocked matchMedia here.
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DataTableHarness from './fixtures/DataTableHarness.svelte';
import type { HarnessRow } from './fixtures/rows';

const ROWS: HarnessRow[] = [
  { id: 'a', payee: 'Zulema', cents: 2500, due: '2026-08-02' },
  { id: 'b', payee: 'ábaco', cents: -1000, due: null, tone: 'overdue' },
  { id: 'c', payee: 'Miguel', cents: 12000, due: '2026-01-15', auto: true },
];

/** Every listener a MediaQueryList hands out, so a test can flip the match. */
let mediaListeners: Array<(event: Event) => void> = [];

function mockMatchMedia(matches: boolean) {
  mediaListeners = [];
  const mql = {
    matches,
    media: '(max-width: 1100px)',
    onchange: null,
    addEventListener: (_: string, fn: (event: Event) => void) => void mediaListeners.push(fn),
    removeEventListener: (_: string, fn: (event: Event) => void) => {
      mediaListeners = mediaListeners.filter((l) => l !== fn);
    },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => mql),
  );
  return mql;
}

const rowEls = (c: HTMLElement) =>
  [...c.querySelectorAll('.dt__body .dt__row')].filter(
    (r) => !r.classList.contains('dt__row--state'),
  );
const firstCellText = (row: Element) => row.querySelector('.dt__td')?.textContent?.trim() ?? '';

beforeEach(() => {
  // Desktop table by default; the card-mode cases opt in.
  mockMatchMedia(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('DataTable — rows', () => {
  it('renders one row per record with an accessible caption', () => {
    const { container } = render(DataTableHarness, { rows: ROWS });
    expect(rowEls(container)).toHaveLength(3);
    expect(container.querySelector('.dt__caption')).toHaveTextContent('Cuentas por pagar');
  });

  it('puts data-label on every cell so the card view reads "label : value"', () => {
    const { container } = render(DataTableHarness, { rows: ROWS });
    const cells = [...rowEls(container)[0].querySelectorAll('.dt__td')];
    expect(cells.map((c) => c.getAttribute('data-label'))).toEqual([
      'Beneficiario',
      'Monto',
      'Vence',
      null, // the actions column opts out with hideLabel
    ]);
    expect(cells[3]).toHaveClass('dt__td--nolabel');
  });

  it('formats a money column as USD and tints it from the SIGN, via tokens only', () => {
    const { container } = render(DataTableHarness, { rows: ROWS });
    const rows = rowEls(container);
    const money = (row: Element) => row.querySelectorAll('.dt__td')[1];

    expect(money(rows[0])).toHaveTextContent('$25.00');
    expect(money(rows[0])).toHaveClass('dt__td--pos', 'dt__td--num', 'dt__td--end');
    expect(money(rows[1])).toHaveTextContent('-$10.00');
    expect(money(rows[1])).toHaveClass('dt__td--neg');
    expect(money(rows[1])).not.toHaveClass('dt__td--pos');
  });

  it('renders a rich cell snippet (the row kebab) instead of text', () => {
    const { getByTestId } = render(DataTableHarness, { rows: ROWS });
    expect(getByTestId('kebab-a')).toHaveAttribute('aria-label', 'Acciones');
  });

  it('marks overdue rows and auto-generated rows distinctly', () => {
    const { container } = render(DataTableHarness, { rows: ROWS });
    const rows = rowEls(container);
    expect(rows[1]).toHaveClass('dt__row--overdue');
    expect(rows[2]).toHaveClass('dt__row--system');
    // The system marker carries a NAME, not just a colour.
    expect(rows[2].querySelector('.dt__system')).toHaveAttribute(
      'title',
      'Generado automáticamente',
    );
    expect(rows[0]).not.toHaveClass('dt__row--overdue', 'dt__row--system');
  });
});

describe('DataTable — sorting actually drives render order', () => {
  it('sorts on a header click and cycles asc → desc', async () => {
    const { container, getByTestId } = render(DataTableHarness, { rows: ROWS });
    const header = container.querySelectorAll<HTMLButtonElement>('.dt__sort')[0];

    header.click();
    await tick();
    expect(rowEls(container).map(firstCellText)).toEqual(['ábaco', 'Miguel', 'Zulema']);
    expect(getByTestId('sort-state')).toHaveTextContent('payee:asc');

    header.click();
    await tick();
    expect(rowEls(container).map(firstCellText)).toEqual(['Zulema', 'Miguel', 'ábaco']);
    expect(getByTestId('sort-state')).toHaveTextContent('payee:desc');
  });

  it('reports the sort state through aria-sort on the header cell', async () => {
    const { container } = render(DataTableHarness, { rows: ROWS });
    const th = container.querySelectorAll('.dt__th')[0];
    expect(th).toHaveAttribute('aria-sort', 'none');
    container.querySelectorAll<HTMLButtonElement>('.dt__sort')[0].click();
    await tick();
    expect(th).toHaveAttribute('aria-sort', 'ascending');
  });

  it('starts a NEW column ascending rather than keeping the old direction', async () => {
    const { container, getByTestId } = render(DataTableHarness, {
      rows: ROWS,
      sortKey: 'payee',
      sortDir: 'desc',
    });
    container.querySelectorAll<HTMLButtonElement>('.dt__sort')[1].click();
    await tick();
    expect(getByTestId('sort-state')).toHaveTextContent('cents:asc');
    expect(rowEls(container).map(firstCellText)).toEqual(['ábaco', 'Zulema', 'Miguel']);
  });

  it('renders in source order while nothing is sorted', () => {
    const { container } = render(DataTableHarness, { rows: ROWS });
    expect(rowEls(container).map(firstCellText)).toEqual(['Zulema', 'ábaco', 'Miguel']);
  });

  it('does not offer a sort control on a non-sortable column', () => {
    const { container } = render(DataTableHarness, { rows: ROWS });
    const headers = container.querySelectorAll('.dt__th');
    expect(headers[3].querySelector('.dt__sort')).toBeNull();
    expect(headers[3]).not.toHaveAttribute('aria-sort');
  });
});

describe('DataTable — card mode (matchMedia ≤1100px)', () => {
  it('keeps the desktop table free of the mobile sort picker', () => {
    const { container } = render(DataTableHarness, { rows: ROWS });
    expect(container.querySelector('.dt__sortpicker')).toBeNull();
  });

  it('surfaces a labelled sort select once the card breakpoint matches', () => {
    mockMatchMedia(true);
    const { container } = render(DataTableHarness, { rows: ROWS });
    const select = container.querySelector<HTMLSelectElement>('.dt__sortpicker-select');
    expect(select).not.toBeNull();
    // Only sortable columns; "Acciones" is not one of them.
    expect([...select!.options].map((o) => o.textContent?.trim())).toEqual([
      'Sin ordenar',
      'Beneficiario',
      'Monto',
      'Vence',
    ]);
    const label = container.querySelector('.dt__sortpicker-label');
    expect(label).toHaveAttribute('for', select!.id);
  });

  it('reacts when the viewport crosses the breakpoint', async () => {
    const mql = mockMatchMedia(false);
    const { container } = render(DataTableHarness, { rows: ROWS });
    expect(container.querySelector('.dt__sortpicker')).toBeNull();

    mql.matches = true;
    mediaListeners.forEach((fn) => fn(new Event('change')));
    await tick();
    expect(container.querySelector('.dt__sortpicker')).not.toBeNull();
  });

  it('the card-mode direction toggle flips sortDir and is disabled until a key is picked', async () => {
    mockMatchMedia(true);
    const { container, getByTestId } = render(DataTableHarness, { rows: ROWS });
    const dir = container.querySelector<HTMLButtonElement>('.dt__sortdir')!;
    expect(dir).toBeDisabled();

    container.querySelectorAll<HTMLButtonElement>('.dt__sort')[0].click();
    await tick();
    expect(dir).not.toBeDisabled();
    dir.click();
    await tick();
    expect(getByTestId('sort-state')).toHaveTextContent('payee:desc');
    expect(dir).toHaveAttribute('aria-label', 'Orden descendente');
  });

  it('never renders a horizontal scroller — the legacy overflow-x strip is rejected', () => {
    const { container } = render(DataTableHarness, { rows: ROWS });
    for (const el of container.querySelectorAll<HTMLElement>('*')) {
      expect(el.style.overflowX).toBe('');
    }
    expect(container.querySelector('[class*="tablewrap"]')).toBeNull();
  });
});

describe('DataTable — loading / empty / error (all three, always)', () => {
  it('renders a table skeleton, not a spinner string, and hides it from AT', () => {
    const { container } = render(DataTableHarness, { state: 'loading', loadingRows: 4 });
    const skeletons = container.querySelectorAll('.dt__row--skeleton');
    expect(skeletons).toHaveLength(4);
    expect(skeletons[0]).toHaveAttribute('aria-hidden', 'true');
    expect(skeletons[0].querySelectorAll('.dt__skel')).toHaveLength(4);
    expect(container.textContent).not.toContain('Cargando');
    // The header stays put so the layout does not jump when data lands.
    expect(container.querySelectorAll('.dt__th')).toHaveLength(4);
  });

  it('renders a calm empty state with a primary-action slot', () => {
    const { container, getByTestId } = render(DataTableHarness, {
      rows: [],
      withEmptyAction: true,
    });
    const empty = container.querySelector('.dt__state--empty');
    expect(empty).toHaveTextContent('No hay cuentas por pagar.');
    expect(getByTestId('empty-cta')).toBeInTheDocument();
    expect(container.querySelector('.dt__state--error')).toBeNull();
  });

  it('renders an error state that is DISTINCT from empty, with human copy and a retry', async () => {
    const onRetry = vi.fn();
    const { container, getByRole } = render(DataTableHarness, { state: 'error', onRetry });

    const error = container.querySelector('.dt__state--error');
    expect(error).toHaveAttribute('role', 'alert');
    expect(error).toHaveTextContent('No pudimos cargar las cuentas. Revisa tu conexión.');
    expect(container.querySelector('.dt__state--empty')).toBeNull();

    getByRole('button', { name: /Reintentar/ }).click();
    await tick();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('a failed fetch never renders as "nothing here"', () => {
    const { container } = render(DataTableHarness, { rows: [], state: 'error', onRetry: () => {} });
    expect(container.querySelector('.dt__state--error')).not.toBeNull();
    expect(container.textContent).not.toContain('No hay cuentas por pagar.');
  });

  it('renders the toolbar slot above the table', () => {
    const { getByTestId } = render(DataTableHarness, { rows: ROWS, withToolbar: true });
    expect(getByTestId('search')).toBeInTheDocument();
  });
});
