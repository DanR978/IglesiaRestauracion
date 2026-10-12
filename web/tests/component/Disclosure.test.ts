// S21 — Disclosure.svelte under jsdom: the toggle contract (aria-expanded +
// aria-controls + the `hidden` panel), the active state that stays visible while
// COLLAPSED, and refresh() reloading content without re-toggling (the fix for
// the discipleship "call the opener twice" hack).
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import DisclosureHarness from './fixtures/DisclosureHarness.svelte';

const trigger = (c: HTMLElement) => c.querySelector<HTMLButtonElement>('.disclosure__trigger')!;
const panel = (c: HTMLElement) => c.querySelector<HTMLElement>('.disclosure__panel')!;

describe('Disclosure — toggle contract', () => {
  it('starts collapsed: aria-expanded="false" and a hidden panel', () => {
    const { container } = render(DisclosureHarness, { label: 'Filtros' });
    expect(trigger(container)).toHaveAttribute('aria-expanded', 'false');
    expect(panel(container)).toHaveAttribute('hidden');
  });

  it('expands and collapses on click, flipping aria-expanded and hidden', async () => {
    const { container } = render(DisclosureHarness, { label: 'Filtros' });

    trigger(container).click();
    await tick();
    expect(trigger(container)).toHaveAttribute('aria-expanded', 'true');
    expect(panel(container)).not.toHaveAttribute('hidden');
    expect(trigger(container)).toHaveClass('is-active');

    trigger(container).click();
    await tick();
    expect(trigger(container)).toHaveAttribute('aria-expanded', 'false');
    expect(panel(container)).toHaveAttribute('hidden');
    expect(trigger(container)).not.toHaveClass('is-active');
  });

  it('is a real <button> whose aria-controls points at the panel it labels', () => {
    const { container } = render(DisclosureHarness, { label: 'Compartir / QR' });
    const btn = trigger(container);
    const body = panel(container);
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.type).toBe('button');
    expect(btn.getAttribute('aria-controls')).toBe(body.id);
    expect(body.getAttribute('aria-labelledby')).toBe(btn.id);
    expect(body).toHaveAttribute('role', 'region');
  });

  it('gives every instance its OWN ids — no shared global element id (G-009)', () => {
    const { container } = render(DisclosureHarness, { label: 'Uno', second: 'Dos' });
    const [a, b] = container.querySelectorAll<HTMLElement>('.disclosure__panel');
    expect(a.id).not.toBe('');
    expect(a.id).not.toBe(b.id);
  });

  it('honours an explicit panelId', () => {
    const { container } = render(DisclosureHarness, { label: 'Filtros', panelId: 'mi-panel' });
    expect(panel(container).id).toBe('mi-panel');
    expect(trigger(container)).toHaveAttribute('aria-controls', 'mi-panel');
  });

  it('does nothing when disabled', async () => {
    const { container } = render(DisclosureHarness, { label: 'Filtros', disabled: true });
    expect(trigger(container)).toBeDisabled();
    trigger(container).click();
    await tick();
    expect(trigger(container)).toHaveAttribute('aria-expanded', 'false');
    expect(panel(container)).toHaveAttribute('hidden');
  });

  it('reports each toggle through onToggle and writes back through bind:open', async () => {
    const onToggle = vi.fn();
    const { container, getByTestId } = render(DisclosureHarness, { label: 'Filtros', onToggle });
    trigger(container).click();
    await tick();
    expect(onToggle).toHaveBeenLastCalledWith(true);
    expect(getByTestId('open-state')).toHaveTextContent('abierto');
    trigger(container).click();
    await tick();
    expect(onToggle).toHaveBeenLastCalledWith(false);
    expect(getByTestId('open-state')).toHaveTextContent('cerrado');
  });

  it('can be opened by the parent through bind:open', async () => {
    const { container, getByTestId } = render(DisclosureHarness, { label: 'Filtros' });
    getByTestId('open-externally').click();
    await tick();
    expect(trigger(container)).toHaveAttribute('aria-expanded', 'true');
    expect(panel(container)).not.toHaveAttribute('hidden');
  });
});

describe('Disclosure — the active state is visible WHILE COLLAPSED', () => {
  it('shows the count badge and the summary on the collapsed trigger', () => {
    const { container, getByText } = render(DisclosureHarness, {
      label: 'Filtros',
      count: 3,
      summary: 'Este mes · Misiones',
    });
    expect(panel(container)).toHaveAttribute('hidden');
    expect(container.querySelector('.disclosure__count')).toHaveTextContent('3');
    expect(getByText('Este mes · Misiones')).toBeInTheDocument();
  });

  it('hides the badge when nothing is applied', () => {
    const { container } = render(DisclosureHarness, { label: 'Filtros', count: 0 });
    expect(container.querySelector('.disclosure__count')).toBeNull();
  });
});

describe('Disclosure — content loading', () => {
  it('calls onLoad the FIRST time it opens, and not again on re-open', async () => {
    const onLoad = vi.fn();
    const { container } = render(DisclosureHarness, { label: 'Miembros', onLoad });
    expect(onLoad).not.toHaveBeenCalled();

    trigger(container).click();
    await tick();
    expect(onLoad).toHaveBeenCalledTimes(1);

    trigger(container).click();
    await tick();
    trigger(container).click();
    await tick();
    expect(onLoad).toHaveBeenCalledTimes(1);
  });

  it('refresh() reloads WITHOUT toggling — an open panel stays open', async () => {
    const onLoad = vi.fn();
    const { container, getByTestId } = render(DisclosureHarness, {
      label: 'Miembros',
      open: true,
      onLoad,
    });
    await tick();
    expect(onLoad).toHaveBeenCalledTimes(1); // the initial lazy load

    getByTestId('refresh').click();
    await tick();
    await tick();
    expect(onLoad).toHaveBeenCalledTimes(2);
    expect(trigger(container)).toHaveAttribute('aria-expanded', 'true');
    expect(panel(container)).not.toHaveAttribute('hidden');
  });

  it('refresh() works while COLLAPSED and does not open the panel', async () => {
    const onLoad = vi.fn();
    const { container, getByTestId } = render(DisclosureHarness, { label: 'Miembros', onLoad });
    getByTestId('refresh').click();
    await tick();
    await tick();
    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(panel(container)).toHaveAttribute('hidden');
  });

  it('marks the panel aria-busy while onLoad is in flight', async () => {
    let settle: () => void = () => {};
    const onLoad = () => new Promise<void>((r) => (settle = r));
    const { container } = render(DisclosureHarness, { label: 'Miembros', onLoad });

    trigger(container).click();
    await tick();
    expect(panel(container)).toHaveAttribute('aria-busy', 'true');

    settle();
    await tick();
    await tick();
    expect(panel(container)).not.toHaveAttribute('aria-busy');
  });
});
