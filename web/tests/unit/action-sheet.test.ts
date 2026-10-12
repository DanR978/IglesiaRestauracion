// S17 — the non-visual half of the ActionSheet: popover geometry (parity with
// the legacy positionPopover math), section/roving-index building, the icon
// guard, and the one-at-a-time singleton showActionSheet()/closeActionSheet().
import { afterEach, describe, expect, it } from 'vitest';
import {
  ACTION_DEFER_MS,
  CLOSE_MS,
  DEFAULT_CANCEL_LABEL,
  MOBILE_QUERY,
  POPOVER_FALLBACK_HEIGHT,
  POPOVER_FALLBACK_WIDTH,
  TRIGGER_GAP,
  VIEWPORT_GUTTER,
  actionSheet,
  buildSections,
  closeActionSheet,
  countRows,
  iconName,
  isMobileViewport,
  popoverPosition,
  showActionSheet,
  type SheetAction,
} from '$lib/components/action-sheet.svelte';

const VIEWPORT = { width: 1280, height: 800 };
const box = (top: number, left: number, w = 32, h = 32) => ({
  top,
  left,
  right: left + w,
  bottom: top + h,
});

describe('popoverPosition — the legacy anchoring, exactly', () => {
  it('right-aligns to the trigger and sits TRIGGER_GAP below it', () => {
    const pos = popoverPosition(box(200, 900), { width: 240, height: 200 }, VIEWPORT);
    expect(pos).toEqual({ top: 200 + 32 + TRIGGER_GAP, left: 932 - 240, flipped: false });
  });

  it('flips above the trigger when it would overflow the viewport bottom', () => {
    // bottom = 700, +8 +200 = 908 > 800 - 12
    const pos = popoverPosition(box(668, 900), { width: 240, height: 200 }, VIEWPORT);
    expect(pos.flipped).toBe(true);
    expect(pos.top).toBe(668 - 200 - TRIGGER_GAP);
  });

  it('clamps to the top gutter when even the flipped position overflows', () => {
    const pos = popoverPosition(box(760, 900), { width: 240, height: 900 }, VIEWPORT);
    expect(pos.flipped).toBe(true);
    expect(pos.top).toBe(VIEWPORT_GUTTER);
  });

  it('clamps inside the left gutter when the trigger is near the left edge', () => {
    const pos = popoverPosition(box(100, 8), { width: 240, height: 200 }, VIEWPORT);
    expect(pos.left).toBe(VIEWPORT_GUTTER);
  });

  it('clamps inside the right gutter when the trigger is near the right edge', () => {
    const pos = popoverPosition(box(100, 1270), { width: 240, height: 200 }, VIEWPORT);
    expect(pos.left).toBe(1280 - 240 - VIEWPORT_GUTTER);
  });

  it('falls back to the legacy pre-measure size when the panel measures 0', () => {
    const pos = popoverPosition(box(100, 900), { width: 0, height: 0 }, VIEWPORT);
    expect(pos.left).toBe(932 - POPOVER_FALLBACK_WIDTH);
    expect(POPOVER_FALLBACK_HEIGHT).toBe(200);
  });

  it('never returns a position outside the gutters for a realistic panel', () => {
    for (const top of [0, 120, 400, 780]) {
      for (const left of [0, 40, 640, 1279]) {
        const pos = popoverPosition(box(top, left), { width: 280, height: 260 }, VIEWPORT);
        expect(pos.top).toBeGreaterThanOrEqual(VIEWPORT_GUTTER);
        expect(pos.left).toBeGreaterThanOrEqual(VIEWPORT_GUTTER);
        expect(pos.left + 280).toBeLessThanOrEqual(VIEWPORT.width - VIEWPORT_GUTTER);
      }
    }
  });
});

describe('iconName — the legacy `fa-` prefix, and nothing untrusted', () => {
  it('accepts both call shapes', () => {
    expect(iconName('fa-pen')).toBe('pen');
    expect(iconName('pen')).toBe('pen');
    expect(iconName('fa-arrow-right-arrow-left')).toBe('arrow-right-arrow-left');
    expect(iconName('  fa-trash  ')).toBe('trash');
  });

  it('drops anything that is not a kebab token (no class injection)', () => {
    for (const bad of ['pen fa-spin', 'Pen', '<img>', '', 'fa-', 'a--b', undefined]) {
      expect(iconName(bad), JSON.stringify(bad)).toBeUndefined();
    }
  });
});

describe('buildSections', () => {
  const flat: SheetAction[] = [
    { label: 'Editar', icon: 'fa-pen' },
    { label: 'Eliminar', icon: 'fa-trash', variant: 'danger' },
  ];

  it('makes one unlabelled section when no groups are declared', () => {
    const sections = buildSections(flat);
    expect(sections).toHaveLength(1);
    expect(sections[0].label).toBeUndefined();
    expect(sections[0].rows.map((r) => r.action.label)).toEqual(['Editar', 'Eliminar']);
    expect(countRows(sections)).toBe(2);
  });

  it('numbers rows across sections for the roving tabindex, marking each first row', () => {
    const sections = buildSections(
      [
        { label: 'Grupo A', group: 'move' },
        { label: 'Grupo B', group: 'move' },
        { label: 'Remover', variant: 'danger' },
      ],
      [{ id: 'move', label: 'Mover a otro grupo' }],
    );
    expect(sections.map((s) => s.label)).toEqual(['Mover a otro grupo', undefined]);
    expect(sections.flatMap((s) => s.rows).map((r) => r.index)).toEqual([0, 1, 2]);
    expect(sections.flatMap((s) => s.rows).map((r) => r.first)).toEqual([true, false, true]);
  });

  it('renders declared groups first and the ungrouped rows last, whatever the array order', () => {
    const sections = buildSections(
      [
        { label: 'Remover', variant: 'danger' },
        { label: 'Grupo A', group: 'move' },
      ],
      [{ id: 'move', label: 'Mover a otro grupo' }],
    );
    expect(sections[0].rows.map((r) => r.action.label)).toEqual(['Grupo A']);
    expect(sections[1].rows.map((r) => r.action.label)).toEqual(['Remover']);
  });

  it('keeps an empty declared group only when it carries a fallback', () => {
    const withFallback = buildSections(
      [{ label: 'Remover' }],
      [{ id: 'move', label: 'Mover a otro grupo', empty: 'No hay otros grupos todavía.' }],
    );
    expect(withFallback).toHaveLength(2);
    expect(withFallback[0].rows).toHaveLength(0);
    expect(withFallback[0].empty).toBe('No hay otros grupos todavía.');
    // …and the ungrouped rows still start at 0.
    expect(withFallback[1].rows[0].index).toBe(0);

    const without = buildSections([{ label: 'Remover' }], [{ id: 'move', label: 'Mover' }]);
    expect(without).toHaveLength(1);
  });

  it('treats an undeclared group id as ungrouped rather than dropping the row', () => {
    const sections = buildSections([{ label: 'Huérfana', group: 'nope' }], [{ id: 'move' }]);
    expect(countRows(sections)).toBe(1);
    expect(sections[0].label).toBeUndefined();
  });

  it('sanitises each row icon once, at build time', () => {
    const sections = buildSections([
      { label: 'Editar', icon: 'fa-pen' },
      { label: 'Sospechosa', icon: 'pen fa-spin' },
    ]);
    expect(sections[0].rows.map((r) => r.icon)).toEqual(['pen', undefined]);
  });
});

describe('isMobileViewport', () => {
  const original = window.matchMedia;
  afterEach(() => {
    window.matchMedia = original;
  });

  it('asks for the canonical 640px breakpoint', () => {
    expect(MOBILE_QUERY).toBe('(max-width: 640px)');
    let asked = '';
    window.matchMedia = ((q: string) => {
      asked = q;
      return { matches: true, media: q } as MediaQueryList;
    }) as typeof window.matchMedia;
    expect(isMobileViewport()).toBe(true);
    expect(asked).toBe(MOBILE_QUERY);
  });

  it('reports desktop when matchMedia is missing (server / prerender)', () => {
    // @ts-expect-error — deliberately modelling an environment without it.
    delete window.matchMedia;
    expect(isMobileViewport()).toBe(false);
  });
});

describe('the showActionSheet singleton', () => {
  afterEach(() => {
    closeActionSheet();
  });

  it('starts closed and publishes the request it is given', () => {
    expect(actionSheet.current).toBeNull();
    showActionSheet({ title: 'Evento', actions: [{ label: 'Editar' }] });
    expect(actionSheet.current?.title).toBe('Evento');
    expect(actionSheet.current?.actions).toHaveLength(1);
  });

  it('replaces the open sheet — only one at a time', () => {
    showActionSheet({ title: 'Primera', actions: [{ label: 'A' }] });
    const first = actionSheet.current?.key;
    showActionSheet({ title: 'Segunda', actions: [{ label: 'B' }] });
    expect(actionSheet.current?.title).toBe('Segunda');
    expect(actionSheet.current?.key).not.toBe(first);
  });

  it('ignores a request with no actions (legacy returned early)', () => {
    showActionSheet({ title: 'Vacía', actions: [] });
    expect(actionSheet.current).toBeNull();
  });

  it('only closes the request whose key is given', () => {
    showActionSheet({ actions: [{ label: 'A' }] });
    const stale = (actionSheet.current?.key ?? 0) - 1;
    closeActionSheet(stale);
    expect(actionSheet.current).not.toBeNull();
    closeActionSheet(actionSheet.current?.key);
    expect(actionSheet.current).toBeNull();
  });
});

describe('timing constants stay in step with the CSS', () => {
  it('keeps the legacy 240ms close and 60ms action defer', () => {
    expect(CLOSE_MS).toBe(240);
    expect(ACTION_DEFER_MS).toBe(60);
    expect(DEFAULT_CANCEL_LABEL).toBe('Cancelar');
  });
});
