// PR-C2 — SegmentedControl under jsdom: a radiogroup named by its visible
// label (aria-labelledby), one native radio per option sharing one name (the
// browser's arrow-key behaviour comes with that — proven in the e2e spec),
// exactly one checked, two-way `value`, onChange, icons decorative, the
// disabled state, per-instance names, and the style rules.
import { fireEvent, render } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { SegmentedOption } from '#lib/components/segmented-control.js';
import SegmentedControlHarness from './fixtures/SegmentedControlHarness.svelte';

const THEME: SegmentedOption[] = [
  { value: 'light', label: 'Claro', icon: 'sun' },
  { value: 'dark', label: 'Oscuro', icon: 'moon' },
  { value: 'system', label: 'Sistema', icon: 'circle-half-stroke' },
];

const radios = (c: HTMLElement) => [...c.querySelectorAll<HTMLInputElement>('input[type="radio"]')];

function styleBlock(): string {
  const src = readFileSync(
    resolve(process.cwd(), 'src/lib/components/SegmentedControl.svelte'),
    'utf8',
  );
  return src
    .slice(src.indexOf('<style>'), src.indexOf('</style>'))
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('SegmentedControl — radiogroup semantics', () => {
  it('is a radiogroup named by the visible label', () => {
    const { container, getByRole } = render(SegmentedControlHarness, {
      options: THEME,
      value: 'system',
    });
    const group = getByRole('radiogroup', { name: 'Tema' });
    const label = container.querySelector('.ird-seg__label')!;
    expect(group).toHaveAttribute('aria-labelledby', label.id);
    expect(label).toBeVisible();
  });

  it('renders one native radio per option, sharing ONE name', () => {
    const { container } = render(SegmentedControlHarness, { options: THEME, value: 'light' });
    const all = radios(container);
    expect(all).toHaveLength(3);
    expect(new Set(all.map((r) => r.name)).size).toBe(1);
    expect(all[0].name).not.toBe('');
  });

  it('names each radio by its text; the icon is decorative', () => {
    const { getByRole } = render(SegmentedControlHarness, { options: THEME, value: 'light' });
    const oscuro = getByRole('radio', { name: 'Oscuro' });
    expect(oscuro.closest('label')!.querySelector('.icon')).toHaveAttribute('aria-hidden', 'true');
  });

  it('checks exactly one option — the value', () => {
    const { container, getByRole } = render(SegmentedControlHarness, {
      options: THEME,
      value: 'dark',
    });
    expect(radios(container).filter((r) => r.checked)).toHaveLength(1);
    expect(getByRole('radio', { name: 'Oscuro' })).toBeChecked();
    expect(container.querySelectorAll('.ird-seg__option.is-checked')).toHaveLength(1);
  });
});

describe('SegmentedControl — choosing', () => {
  it('a click selects: value written back, onChange called, one still checked', async () => {
    const onChange = vi.fn();
    const { container, getByRole, getByTestId } = render(SegmentedControlHarness, {
      options: THEME,
      value: 'system',
      onChange,
    });
    await fireEvent.click(getByRole('radio', { name: 'Oscuro' }));
    expect(onChange).toHaveBeenCalledWith('dark');
    expect(getByTestId('value')).toHaveTextContent('dark');
    expect(radios(container).filter((r) => r.checked)).toHaveLength(1);
    expect(getByRole('radio', { name: 'Oscuro' }).closest('label')).toHaveClass('is-checked');
    expect(getByRole('radio', { name: 'Sistema' }).closest('label')).not.toHaveClass('is-checked');
  });

  it('a click on the segment (the label) selects its radio', async () => {
    const { getByText, getByTestId } = render(SegmentedControlHarness, {
      options: THEME,
      value: 'light',
    });
    await fireEvent.click(getByText('Sistema'));
    expect(getByTestId('value')).toHaveTextContent('system');
  });

  it('follows a value set by the parent', async () => {
    const { getByRole, rerender } = render(SegmentedControlHarness, {
      options: THEME,
      value: 'light',
    });
    await rerender({ options: THEME, value: 'system' });
    expect(getByRole('radio', { name: 'Sistema' })).toBeChecked();
    expect(getByRole('radio', { name: 'Claro' })).not.toBeChecked();
  });
});

describe('SegmentedControl — variants', () => {
  it('hideLabel keeps the group named, for screen readers only', () => {
    const { container, getByRole } = render(SegmentedControlHarness, {
      options: THEME,
      value: 'light',
      label: 'Período',
      hideLabel: true,
    });
    expect(getByRole('radiogroup', { name: 'Período' })).toBeInTheDocument();
    expect(container.querySelector('.ird-seg__label')).toHaveClass('ird-seg__label--hidden');
  });

  it('disabled disables every radio', () => {
    const { container } = render(SegmentedControlHarness, {
      options: THEME,
      value: 'light',
      disabled: true,
    });
    for (const r of radios(container)) expect(r).toBeDisabled();
    expect(container.querySelector('.ird-seg')).toHaveClass('is-disabled');
  });

  it('marks keyboard use, so the ring follows focus where WebKit skips :focus-visible', async () => {
    const { container, getByRole } = render(SegmentedControlHarness, {
      options: THEME,
      value: 'light',
    });
    const group = container.querySelector('.ird-seg__group')!;
    expect(group).not.toHaveClass('is-keyboard');
    await fireEvent.keyDown(getByRole('radio', { name: 'Claro' }), { key: 'ArrowRight' });
    expect(group).toHaveClass('is-keyboard');
    await fireEvent.pointerDown(getByRole('radio', { name: 'Oscuro' }));
    expect(group).not.toHaveClass('is-keyboard');
  });

  it('takes an explicit name, and two instances never share one', () => {
    const named = render(SegmentedControlHarness, { options: THEME, value: 'light', name: 'tema' });
    expect(radios(named.container)[0].name).toBe('tema');

    const { container } = render(SegmentedControlHarness, {
      options: THEME,
      value: 'light',
      second: true,
    });
    const groups = container.querySelectorAll('[role="radiogroup"]');
    const first = groups[0].querySelector('input')!.name;
    const second = groups[1].querySelector('input')!.name;
    expect(first).not.toBe(second);
  });
});

describe('SegmentedControl — styles', () => {
  const css = styleBlock();

  it('gives every segment a 44px target that the radio covers', () => {
    expect(css).toMatch(/\.ird-seg__option\s*\{[^}]*min-height:\s*2\.75rem/);
    expect(css).toMatch(/\.ird-seg__input\s*\{[^}]*inset:\s*0[^}]*opacity:\s*0/);
  });

  it('draws the focus ring on the segment, and the checked state beyond colour', () => {
    expect(css).toMatch(
      /\.ird-seg__option:has\(\.ird-seg__input:focus-visible\),\s*\.ird-seg__group\.is-keyboard \.ird-seg__option:has\(\.ird-seg__input:focus\)\s*\{[^}]*outline:\s*2px solid var\(--color-focus\)/,
    );
    expect(css).toMatch(/\.is-checked\s*\{[^}]*border-color:\s*var\(--color-text\)/);
  });

  it('is token-only, hover inside (hover: hover), reduced motion guarded', () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).not.toMatch(/font-size:\s*[\d.]+(px|rem)/);
    expect(css).toMatch(/@media \(hover: hover\)/);
    expect(css).toMatch(/cubic-bezier\(0\.22, 1, 0\.36, 1\)/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*transition:\s*none/);
  });
});
