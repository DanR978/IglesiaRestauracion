// S17 — ActionSheet.svelte under jsdom: menu/menuitem semantics, the roving
// tabindex and arrow-key ring, Escape closing with focus returned to the
// trigger, the desktop-popover vs bottom-sheet split driven by matchMedia, and
// the grouped/disabled/deferred-action behaviours the four legacy menus needed.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ActionSheet from '$lib/components/ActionSheet.svelte';
import ActionSheetHost from '$lib/components/ActionSheetHost.svelte';
import {
  MOBILE_QUERY,
  closeActionSheet,
  showActionSheet,
} from '$lib/components/action-sheet.svelte';

// ── matchMedia mock ────────────────────────────────────────────────────────
// One stable MediaQueryList per query (svelte's MediaQuery keeps a reference to
// it), so a test can flip the viewport and dispatch `change` like a browser.
type Listener = (event: MediaQueryListEvent) => void;

const lists = new Map<string, MediaQueryList & { _set(matches: boolean): void }>();

function makeList(query: string, matches: boolean) {
  const listeners = new Set<Listener>();
  const list = {
    media: query,
    matches,
    onchange: null,
    addEventListener: (_type: string, fn: Listener) => listeners.add(fn),
    removeEventListener: (_type: string, fn: Listener) => listeners.delete(fn),
    addListener: (fn: Listener) => listeners.add(fn),
    removeListener: (fn: Listener) => listeners.delete(fn),
    dispatchEvent: () => true,
    _set(next: boolean) {
      list.matches = next;
      for (const fn of listeners) fn({ matches: next, media: query } as MediaQueryListEvent);
    },
  };
  return list as unknown as MediaQueryList & { _set(matches: boolean): void };
}

/** ≤640px → bottom sheet. Reduced motion is on so the close timers are 0ms. */
function setViewport(mobile: boolean) {
  lists.get(MOBILE_QUERY)?._set(mobile);
}

let trigger: HTMLButtonElement;

beforeEach(() => {
  lists.clear();
  lists.set(MOBILE_QUERY, makeList(MOBILE_QUERY, false));
  lists.set('(prefers-reduced-motion: reduce)', makeList('(prefers-reduced-motion: reduce)', true));
  vi.stubGlobal('matchMedia', (query: string) => {
    if (!lists.has(query)) lists.set(query, makeList(query, false));
    return lists.get(query)!;
  });

  trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.textContent = 'Acciones';
  // A believable anchor: 32×32 near the top-right of a 1024×768 jsdom viewport.
  trigger.getBoundingClientRect = () =>
    ({ top: 100, left: 900, right: 932, bottom: 132, width: 32, height: 32 }) as DOMRect;
  document.body.append(trigger);
  trigger.focus();
});

afterEach(() => {
  trigger.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const EDIT_DELETE = [
  { label: 'Editar', icon: 'fa-pen', onClick: vi.fn() },
  { label: 'Eliminar', icon: 'fa-trash', variant: 'danger' as const, onClick: vi.fn() },
];

async function open(props: Record<string, unknown> = {}) {
  const result = render(ActionSheet, {
    open: true,
    trigger,
    actions: EDIT_DELETE,
    ...props,
  });
  const menu = await waitFor(() => result.getByRole('menu'));
  // Opening is two ticks deep (mount → measure → place → focus), so wait for
  // focus to land rather than racing it.
  await waitFor(() => expect(menu.contains(document.activeElement)).toBe(true));
  return { ...result, menu };
}

const labels = (menu: HTMLElement) =>
  within(menu)
    .getAllByRole('menuitem')
    .map((el) => el.textContent?.trim());

describe('ActionSheet — menu semantics', () => {
  it('is a role=menu of role=menuitem rows, named after its header', async () => {
    const { menu } = await open({ title: 'Estudio Bíblico', subtitle: 'Domingo, 12 de octubre' });
    expect(menu).toHaveAttribute('aria-label', 'Estudio Bíblico · Domingo, 12 de octubre');
    expect(menu).toHaveAttribute('aria-orientation', 'vertical');
    expect(labels(menu)).toEqual(['Editar', 'Eliminar']);
  });

  it('falls back to a generic Spanish name when there is no header', async () => {
    const { menu } = await open();
    expect(menu).toHaveAttribute('aria-label', 'Acciones');
  });

  it('renders the header once, hidden from assistive tech (the menu already says it)', async () => {
    const { menu } = await open({ title: 'Evento', subtitle: 'Sábado' });
    const header = menu.querySelector('.act-sheet__header');
    expect(header).toHaveAttribute('aria-hidden', 'true');
    expect(header?.textContent).toContain('Evento');
    expect(header?.textContent).toContain('Sábado');
  });

  it('renders labels as text — a label containing markup is never parsed', async () => {
    const { menu } = await open({
      actions: [{ label: '<img src=x onerror=alert(1)>Editar' }],
    });
    const item = within(menu).getByRole('menuitem');
    expect(item.querySelector('img')).toBeNull();
    expect(item.textContent).toContain('<img src=x onerror=alert(1)>Editar');
  });

  it('renders the row icon and drops one that is not a Font Awesome name', async () => {
    const { menu } = await open({
      actions: [
        { label: 'Editar', icon: 'fa-pen' },
        { label: 'Sospechosa', icon: 'pen fa-spin' },
      ],
    });
    const [first, second] = within(menu).getAllByRole('menuitem');
    expect(first.querySelector('i')).toHaveClass('fas', 'fa-pen');
    expect(second.querySelector('i')).toBeNull();
  });

  it('applies the variant class to the row', async () => {
    const { menu } = await open({
      actions: [
        { label: 'Editar' },
        { label: 'Cancelar evento', variant: 'warn' },
        { label: 'Eliminar', variant: 'danger' },
      ],
    });
    const rows = within(menu).getAllByRole('menuitem');
    expect(rows[0]).toHaveClass('act-sheet__row--default');
    expect(rows[1]).toHaveClass('act-sheet__row--warn');
    expect(rows[2]).toHaveClass('act-sheet__row--danger');
  });
});

describe('ActionSheet — keyboard', () => {
  it('moves focus into the sheet on open, onto the first row', async () => {
    const { menu } = await open();
    const rows = within(menu).getAllByRole('menuitem');
    expect(document.activeElement).toBe(rows[0]);
    expect(rows[0]).toHaveAttribute('tabindex', '0');
    expect(rows[1]).toHaveAttribute('tabindex', '-1');
  });

  it('walks the rows with Up/Down and wraps at both ends', async () => {
    const { menu } = await open({
      actions: [{ label: 'Uno' }, { label: 'Dos' }, { label: 'Tres' }],
    });
    const rows = within(menu).getAllByRole('menuitem');

    await fireEvent.keyDown(rows[0], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(rows[1]);
    await fireEvent.keyDown(rows[1], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(rows[2]);
    await fireEvent.keyDown(rows[2], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(rows[0]);
    await fireEvent.keyDown(rows[0], { key: 'ArrowUp' });
    expect(document.activeElement).toBe(rows[2]);
  });

  it('jumps to the ends with Home and End', async () => {
    const { menu } = await open({
      actions: [{ label: 'Uno' }, { label: 'Dos' }, { label: 'Tres' }],
    });
    const rows = within(menu).getAllByRole('menuitem');

    await fireEvent.keyDown(rows[0], { key: 'End' });
    expect(document.activeElement).toBe(rows[2]);
    await fireEvent.keyDown(rows[2], { key: 'Home' });
    expect(document.activeElement).toBe(rows[0]);
  });

  it('keeps the roving tabindex on whichever row has focus', async () => {
    const { menu } = await open();
    const rows = within(menu).getAllByRole('menuitem');
    await fireEvent.keyDown(rows[0], { key: 'ArrowDown' });
    await waitFor(() => expect(rows[1]).toHaveAttribute('tabindex', '0'));
    expect(rows[0]).toHaveAttribute('tabindex', '-1');
  });

  it('Escape closes the sheet and returns focus to the trigger', async () => {
    const { menu } = await open();
    expect(document.activeElement).not.toBe(trigger);

    await fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.activeElement).toBe(trigger);
    await waitFor(() => expect(menu.isConnected).toBe(false));
  });

  it('Tab dismisses the menu instead of letting focus wander behind it', async () => {
    const { menu } = await open();
    const rows = within(menu).getAllByRole('menuitem');
    await fireEvent.keyDown(rows[0], { key: 'Tab' });
    expect(document.activeElement).toBe(trigger);
    await waitFor(() => expect(menu.isConnected).toBe(false));
  });
});

describe('ActionSheet — activation', () => {
  it('runs the action after the close has started, then unmounts', async () => {
    const onClick = vi.fn();
    const { menu } = await open({ actions: [{ label: 'Editar', onClick }] });

    await fireEvent.click(within(menu).getByRole('menuitem'));
    expect(document.activeElement).toBe(trigger);
    await waitFor(() => expect(onClick).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(menu.isConnected).toBe(false));
  });

  it('survives an action that throws (the sheet still closes)', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { menu } = await open({
      actions: [
        {
          label: 'Rota',
          onClick: () => {
            throw new Error('boom');
          },
        },
      ],
    });

    await fireEvent.click(within(menu).getByRole('menuitem'));
    await waitFor(() => expect(error).toHaveBeenCalled());
    await waitFor(() => expect(menu.isConnected).toBe(false));
  });

  it('a disabled row is focusable and announced, but does nothing', async () => {
    const onClick = vi.fn();
    const { menu } = await open({
      actions: [{ label: 'Marcar pagado', disabled: true, onClick }, { label: 'Editar' }],
    });
    const [disabled] = within(menu).getAllByRole('menuitem');

    expect(disabled).toHaveAttribute('aria-disabled', 'true');
    expect(disabled).not.toHaveAttribute('disabled');

    await fireEvent.click(disabled);
    expect(onClick).not.toHaveBeenCalled();
    expect(menu.isConnected).toBe(true);
  });

  it('closes when the backdrop is clicked', async () => {
    const { container, menu } = await open();
    const backdrop = container.querySelector('.act-sheet-backdrop');
    expect(backdrop).toHaveAttribute('aria-hidden', 'true');
    expect(backdrop).toHaveAttribute('tabindex', '-1');

    await fireEvent.click(backdrop!);
    expect(document.activeElement).toBe(trigger);
    await waitFor(() => expect(menu.isConnected).toBe(false));
  });
});

describe('ActionSheet — desktop popover', () => {
  it('anchors right-aligned below the trigger and marks itself positioned', async () => {
    const { menu } = await open();
    expect(menu).toHaveClass('act-sheet--popover', 'is-positioned');
    expect(menu).not.toHaveClass('act-sheet--mobile');
    // 932 (trigger right) − 240 (pre-measure fallback width under jsdom) = 692.
    expect(menu.style.getPropertyValue('--act-sheet-left')).toBe('692px');
    expect(menu.style.getPropertyValue('--act-sheet-top')).toBe('140px');
  });

  it('has no Cancelar row on desktop', async () => {
    const { menu } = await open();
    expect(within(menu).queryByRole('menuitem', { name: 'Cancelar' })).toBeNull();
  });

  it('repositions on scroll and on resize', async () => {
    const { menu } = await open();
    expect(menu.style.getPropertyValue('--act-sheet-top')).toBe('140px');

    trigger.getBoundingClientRect = () =>
      ({ top: 300, left: 500, right: 532, bottom: 332, width: 32, height: 32 }) as DOMRect;
    await fireEvent.scroll(document);
    await waitFor(() => expect(menu.style.getPropertyValue('--act-sheet-top')).toBe('340px'));
    expect(menu.style.getPropertyValue('--act-sheet-left')).toBe('292px');

    trigger.getBoundingClientRect = () =>
      ({ top: 700, left: 500, right: 532, bottom: 732, width: 32, height: 32 }) as DOMRect;
    await fireEvent(window, new Event('resize'));
    // 768 (jsdom height) − 12 gutter: 740 + 200 overflows, so it flips above.
    await waitFor(() => expect(menu).toHaveClass('act-sheet--up'));
    expect(menu.style.getPropertyValue('--act-sheet-top')).toBe('492px');
  });

  it('stops listening once it has closed', async () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const { menu } = await open();
    await fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(menu.isConnected).toBe(false));
    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function), { capture: true });
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function));
  });
});

describe('ActionSheet — bottom sheet at ≤640px', () => {
  it('renders as a bottom sheet with an explicit Cancelar row', async () => {
    setViewport(true);
    const { menu } = await open();
    expect(menu).toHaveClass('act-sheet--mobile');
    expect(menu).not.toHaveClass('act-sheet--popover');

    const cancel = within(menu).getByRole('menuitem', { name: 'Cancelar' });
    expect(cancel).toHaveClass('act-sheet__cancel');
    // The cancel row is the last stop in the arrow-key ring.
    const rows = within(menu).getAllByRole('menuitem');
    expect(rows.at(-1)).toBe(cancel);
    await fireEvent.keyDown(rows[0], { key: 'End' });
    expect(document.activeElement).toBe(cancel);
  });

  it('Cancelar closes without running anything', async () => {
    setViewport(true);
    const onClick = vi.fn();
    const { menu } = await open({ actions: [{ label: 'Editar', onClick }] });

    await fireEvent.click(within(menu).getByRole('menuitem', { name: 'Cancelar' }));
    expect(document.activeElement).toBe(trigger);
    await waitFor(() => expect(menu.isConnected).toBe(false));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('honours cancelLabel={false}', async () => {
    setViewport(true);
    const { menu } = await open({ cancelLabel: false });
    expect(within(menu).queryByRole('menuitem', { name: 'Cancelar' })).toBeNull();
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(2);
  });

  it('dims the page (only the bottom sheet gets a scrim)', async () => {
    setViewport(true);
    const { container } = await open();
    expect(container.querySelector('.act-sheet-backdrop')).toHaveClass(
      'act-sheet-backdrop--mobile',
    );
  });

  it('switches to the bottom sheet when the viewport crosses 640px while open', async () => {
    const { menu } = await open();
    expect(menu).toHaveClass('act-sheet--popover');

    setViewport(true);
    await fireEvent(window, new Event('resize'));
    await waitFor(() => expect(menu).toHaveClass('act-sheet--mobile'));
    expect(within(menu).getByRole('menuitem', { name: 'Cancelar' })).toBeTruthy();
  });
});

describe('ActionSheet — grouped items', () => {
  const GROUPS = [
    { id: 'move', label: 'Mover a otro grupo', empty: 'No hay otros grupos todavía.' },
  ];

  it('renders a labelled role=group, a separator, then the ungrouped rows', async () => {
    const { menu } = await open({
      actions: [
        { label: 'Nivel 1', description: 'Fundamentos', group: 'move' },
        { label: 'Nivel 2', description: 'Crecimiento', group: 'move' },
        { label: 'Remover del grupo', variant: 'danger' as const },
      ],
      groups: GROUPS,
    });

    const group = within(menu).getByRole('group', { name: 'Mover a otro grupo' });
    expect(within(group).getAllByRole('menuitem')).toHaveLength(2);
    expect(within(menu).getAllByRole('separator')).toHaveLength(1);
    expect(labels(menu)).toEqual([
      'Nivel 1 Fundamentos',
      'Nivel 2 Crecimiento',
      'Remover del grupo',
    ]);
  });

  it('shows the empty fallback when the group has no rows, and still numbers the rest', async () => {
    const { menu } = await open({
      actions: [{ label: 'Remover del grupo', variant: 'danger' as const }],
      groups: GROUPS,
    });

    const group = within(menu).getByRole('group', { name: 'Mover a otro grupo' });
    expect(within(group).queryAllByRole('menuitem')).toHaveLength(0);
    expect(group.textContent).toContain('No hay otros grupos todavía.');

    const rows = within(menu).getAllByRole('menuitem');
    expect(rows).toHaveLength(1);
    expect(document.activeElement).toBe(rows[0]);
  });
});

describe('ActionSheet — the trigger', () => {
  it('marks the trigger while open and restores its attributes on close', async () => {
    const { menu } = await open();
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(menu.isConnected).toBe(false));
    expect(trigger).not.toHaveAttribute('aria-haspopup');
    expect(trigger).not.toHaveAttribute('aria-expanded');
  });

  it('does not open at all while `open` is false', () => {
    const { queryByRole } = render(ActionSheet, { open: false, trigger, actions: EDIT_DELETE });
    expect(queryByRole('menu')).toBeNull();
    expect(trigger).not.toHaveAttribute('aria-expanded');
  });
});

describe('showActionSheet + ActionSheetHost — the imperative path', () => {
  afterEach(() => {
    closeActionSheet();
  });

  it('opens the singleton for a non-component caller and closes it again', async () => {
    render(ActionSheetHost);
    expect(screen.queryByRole('menu')).toBeNull();

    showActionSheet({ trigger, title: 'Movimiento', actions: [{ label: 'Editar' }] });
    const menu = await waitFor(() => screen.getByRole('menu'));
    expect(menu).toHaveAttribute('aria-label', 'Movimiento');

    closeActionSheet();
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('keeps only one sheet open', async () => {
    render(ActionSheetHost);
    showActionSheet({ trigger, title: 'Primera', actions: [{ label: 'A' }] });
    await waitFor(() => screen.getByRole('menu'));

    showActionSheet({ trigger, title: 'Segunda', actions: [{ label: 'B' }] });
    await waitFor(() => expect(screen.getByRole('menu')).toHaveAttribute('aria-label', 'Segunda'));
    expect(screen.getAllByRole('menu')).toHaveLength(1);
    expect(screen.getAllByRole('menuitem').map((el) => el.textContent?.trim())).toEqual(['B']);
  });

  it('a sheet opened BY an action survives the previous sheet closing', async () => {
    render(ActionSheetHost);
    showActionSheet({
      trigger,
      title: 'Primera',
      actions: [
        {
          label: 'Abrir otra',
          onClick: () => showActionSheet({ trigger, title: 'Segunda', actions: [{ label: 'B' }] }),
        },
      ],
    });
    await waitFor(() => screen.getByRole('menu'));

    await fireEvent.click(screen.getByRole('menuitem', { name: 'Abrir otra' }));
    await waitFor(() => expect(screen.getByRole('menu')).toHaveAttribute('aria-label', 'Segunda'));
    // The first sheet's 240ms close timer must not tear the successor down.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getAllByRole('menu')).toHaveLength(1);
    expect(screen.getByRole('menu')).toHaveAttribute('aria-label', 'Segunda');
  });
});
