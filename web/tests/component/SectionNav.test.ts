// PR-C2 — SectionNav under jsdom: the two modes (links with aria-current="page"
// in the natural tab order; buttons with aria-current="true", one tab stop and
// Arrow/Home/End roving focus), selection written back through bind:current,
// the pure helpers (mode, key map, bar arithmetic), and the style rules — a
// 900px pill bar that scrolls by itself with 44px targets.
import { fireEvent, render } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  centredScrollLeft,
  rovingTarget,
  sectionNavMode,
  type SectionNavItem,
} from '#lib/components/section-nav.js';
import SectionNavHarness from './fixtures/SectionNavHarness.svelte';

const LINKS: SectionNavItem[] = [
  { id: 'perfil', label: 'Perfil', icon: 'user', href: '?seccion=perfil' },
  { id: 'seguridad', label: 'Seguridad', icon: 'shield-halved', href: '?seccion=seguridad' },
  { id: 'preferencias', label: 'Preferencias', icon: 'sliders', href: '?seccion=preferencias' },
];
const TABS: SectionNavItem[] = LINKS.map(({ id, label, icon }) => ({ id, label, icon }));

function styleBlock(): string {
  const src = readFileSync(resolve(process.cwd(), 'src/lib/components/SectionNav.svelte'), 'utf8');
  return src
    .slice(src.indexOf('<style>'), src.indexOf('</style>'))
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('SectionNav — link mode', () => {
  it('is a named nav landmark holding a list of links', () => {
    const { getByRole } = render(SectionNavHarness, {
      items: LINKS,
      current: 'perfil',
      label: 'Secciones de Mi cuenta',
    });
    const nav = getByRole('navigation', { name: 'Secciones de Mi cuenta' });
    // role="list" survives `list-style: none` in Safari.
    expect(nav.querySelector('ul')).toHaveAttribute('role', 'list');
    const links = nav.querySelectorAll('a');
    expect(links).toHaveLength(3);
    expect([...links].map((a) => a.getAttribute('href'))).toEqual([
      '?seccion=perfil',
      '?seccion=seguridad',
      '?seccion=preferencias',
    ]);
  });

  it('marks ONLY the current item, with aria-current="page"', () => {
    const { getByRole } = render(SectionNavHarness, { items: LINKS, current: 'seguridad' });
    expect(getByRole('link', { name: 'Seguridad' })).toHaveAttribute('aria-current', 'page');
    expect(getByRole('link', { name: 'Perfil' })).not.toHaveAttribute('aria-current');
    expect(getByRole('link', { name: 'Preferencias' })).not.toHaveAttribute('aria-current');
  });

  it('leaves the links in the natural tab order (no roving tabindex)', () => {
    const { container } = render(SectionNavHarness, { items: LINKS, current: 'perfil' });
    for (const a of container.querySelectorAll('a')) expect(a).not.toHaveAttribute('tabindex');
  });

  it('names each item by its label; the icon is decorative', () => {
    const { getByRole } = render(SectionNavHarness, { items: LINKS, current: 'perfil' });
    const link = getByRole('link', { name: 'Perfil' });
    expect(link.querySelector('.icon')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('SectionNav — button mode', () => {
  it('renders real buttons; the current one has aria-current="true"', () => {
    const { getByRole, getAllByRole } = render(SectionNavHarness, {
      items: TABS,
      current: 'perfil',
    });
    const buttons = getAllByRole('button').filter((b) => b.classList.contains('ird-snav__item'));
    expect(buttons).toHaveLength(3);
    for (const b of buttons) expect(b).toHaveAttribute('type', 'button');
    expect(getByRole('button', { name: 'Perfil' })).toHaveAttribute('aria-current', 'true');
    expect(getByRole('button', { name: 'Seguridad' })).not.toHaveAttribute('aria-current');
  });

  it('has ONE tab stop — the current item', () => {
    const { getByRole } = render(SectionNavHarness, { items: TABS, current: 'seguridad' });
    expect(getByRole('button', { name: 'Seguridad' })).toHaveAttribute('tabindex', '0');
    expect(getByRole('button', { name: 'Perfil' })).toHaveAttribute('tabindex', '-1');
    expect(getByRole('button', { name: 'Preferencias' })).toHaveAttribute('tabindex', '-1');
  });

  it('moves focus and the tab stop with the arrows, wrapping, plus Home/End', async () => {
    const { getByRole } = render(SectionNavHarness, { items: TABS, current: 'perfil' });
    const [perfil, seguridad, preferencias] = ['Perfil', 'Seguridad', 'Preferencias'].map((name) =>
      getByRole('button', { name }),
    );
    perfil.focus();

    await fireEvent.keyDown(perfil, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(seguridad);
    expect(seguridad).toHaveAttribute('tabindex', '0');
    expect(perfil).toHaveAttribute('tabindex', '-1');

    await fireEvent.keyDown(seguridad, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(preferencias);
    await fireEvent.keyDown(preferencias, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(perfil); // wraps

    await fireEvent.keyDown(perfil, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(preferencias);
    await fireEvent.keyDown(preferencias, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(seguridad);

    await fireEvent.keyDown(seguridad, { key: 'Home' });
    expect(document.activeElement).toBe(perfil);
    await fireEvent.keyDown(perfil, { key: 'End' });
    expect(document.activeElement).toBe(preferencias);
  });

  it('moving focus does not select; a click (or Enter/Space) does', async () => {
    const onSelect = vi.fn();
    const { getByRole, getByTestId } = render(SectionNavHarness, {
      items: TABS,
      current: 'perfil',
      onSelect,
    });
    const perfil = getByRole('button', { name: 'Perfil' });
    perfil.focus();
    await fireEvent.keyDown(perfil, { key: 'ArrowDown' });
    expect(onSelect).not.toHaveBeenCalled();
    expect(getByTestId('current')).toHaveTextContent('perfil');

    await fireEvent.click(getByRole('button', { name: 'Seguridad' }));
    expect(onSelect).toHaveBeenCalledWith('seguridad');
    expect(getByTestId('current')).toHaveTextContent('seguridad');
    expect(getByRole('button', { name: 'Seguridad' })).toHaveAttribute('aria-current', 'true');
    expect(getByRole('button', { name: 'Perfil' })).not.toHaveAttribute('aria-current');
  });

  it('does not re-select the current item', async () => {
    const onSelect = vi.fn();
    const { getByRole } = render(SectionNavHarness, { items: TABS, current: 'perfil', onSelect });
    await fireEvent.click(getByRole('button', { name: 'Perfil' }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('ignores keys it does not own (Tab, letters) without preventing them', async () => {
    const { getByRole } = render(SectionNavHarness, { items: TABS, current: 'perfil' });
    const perfil = getByRole('button', { name: 'Perfil' });
    perfil.focus();
    expect(await fireEvent.keyDown(perfil, { key: 'Tab' })).toBe(true);
    expect(await fireEvent.keyDown(perfil, { key: 'a' })).toBe(true);
    expect(document.activeElement).toBe(perfil);
  });

  it('hands the tab stop back to the current item when focus leaves', async () => {
    const { getByRole, getByTestId } = render(SectionNavHarness, {
      items: TABS,
      current: 'perfil',
    });
    const perfil = getByRole('button', { name: 'Perfil' });
    perfil.focus();
    await fireEvent.keyDown(perfil, { key: 'End' });
    expect(getByRole('button', { name: 'Preferencias' })).toHaveAttribute('tabindex', '0');

    await fireEvent.focusOut(getByRole('button', { name: 'Preferencias' }), {
      relatedTarget: getByTestId('outside'),
    });
    expect(perfil).toHaveAttribute('tabindex', '0');
    expect(getByRole('button', { name: 'Preferencias' })).toHaveAttribute('tabindex', '-1');
  });

  it('keeps one tab stop even with no current item', () => {
    const { container } = render(SectionNavHarness, { items: TABS });
    const stops = container.querySelectorAll('.ird-snav__item[tabindex="0"]');
    expect(stops).toHaveLength(1);
    expect(stops[0]).toHaveTextContent('Perfil');
  });
});

describe('SectionNav — the pure helpers', () => {
  it('uses links only when every item has an href', () => {
    expect(sectionNavMode(LINKS)).toBe('links');
    expect(sectionNavMode(TABS)).toBe('buttons');
    expect(sectionNavMode([LINKS[0], TABS[1]])).toBe('buttons');
    expect(sectionNavMode([{ id: 'x', label: 'X', href: '' }])).toBe('buttons');
    expect(sectionNavMode([])).toBe('buttons');
  });

  it('maps keys to the next focus target, wrapping, or null', () => {
    expect(rovingTarget('ArrowDown', 0, 3)).toBe(1);
    expect(rovingTarget('ArrowRight', 2, 3)).toBe(0);
    expect(rovingTarget('ArrowUp', 0, 3)).toBe(2);
    expect(rovingTarget('ArrowLeft', 1, 3)).toBe(0);
    expect(rovingTarget('Home', 2, 3)).toBe(0);
    expect(rovingTarget('End', 0, 3)).toBe(2);
    expect(rovingTarget('Enter', 0, 3)).toBeNull();
    expect(rovingTarget('ArrowDown', 0, 0)).toBeNull();
  });

  it('centres an item in the bar, clamped to what can scroll', () => {
    // bar 300 wide, content 900: an item at 500 (120 wide) centres at 410.
    expect(centredScrollLeft(500, 120, 300, 900)).toBe(410);
    expect(centredScrollLeft(10, 100, 300, 900)).toBe(0);
    expect(centredScrollLeft(850, 50, 300, 900)).toBe(600);
    expect(centredScrollLeft(100, 50, 300, 200)).toBe(0);
  });
});

describe('SectionNav — styles', () => {
  const css = styleBlock();

  it('turns into a horizontally scrolling pill bar at ≤900px, with 44px targets', () => {
    const bar = css.slice(css.indexOf('@media (max-width: 900px)'));
    expect(bar).toMatch(/\.ird-snav__list\s*\{[^}]*flex-direction:\s*row[^}]*overflow-x:\s*auto/);
    expect(bar).toMatch(/\.ird-snav__item\s*\{[^}]*min-height:\s*2\.75rem/);
    expect(bar).toMatch(/border-radius:\s*var\(--radius-full\)/);
    expect(css).toMatch(/\.ird-snav\s*\{[^}]*min-width:\s*0/);
  });

  it('keeps desktop targets at 40px (≥24px) and the active state beyond colour', () => {
    expect(css).toMatch(/\.ird-snav__item\s*\{[^}]*min-height:\s*2\.5rem/);
    expect(css).toMatch(
      /\.ird-snav__item\[aria-current\]\s*\{[^}]*border-color:\s*var\(--color-text\)[^}]*background:\s*var\(--color-dark\)/,
    );
  });

  it('is token-only with a visible focus ring, hover inside (hover: hover), reduced motion', () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).not.toMatch(/font-size:\s*[\d.]+(px|rem)/);
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--color-focus\)/);
    expect(css).toMatch(
      /@media \(hover: hover\)\s*\{\s*\.ird-snav__item:not\(\[aria-current\]\):hover/,
    );
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*transition:\s*none/);
  });
});
