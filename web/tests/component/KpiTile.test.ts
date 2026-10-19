// S41 — KpiTile, one Inicio figure in its three states: a one-card skeleton
// while loading; the figure, what it counts and its honest scope; and on a
// failed read what it counts plus StateError with the Spanish copy and Retry
// — never a 0. Emphasis is glyph + words + tint, never colour alone.
import { fireEvent, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import KpiTile from '#lib/components/admin/dashboard/KpiTile.svelte';
import { PENDING_ATTENTION, type TileValue } from '#lib/components/admin/dashboard/dashboard.js';
import type { ReadResult } from '#lib/repos/types.js';

vi.mock('#lib/db/client.js', () => ({ supabase: {} }));

const NETWORK = 'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.';

const props = (result: ReadResult<TileValue> | null, onRetry = vi.fn(async () => {})) => ({
  label: 'Interesados pendientes',
  scope: 'Discipulado · por contactar',
  icon: 'hand-holding-heart',
  result,
  onRetry,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('KpiTile — loading', () => {
  it('is a one-card skeleton that names what it is loading', () => {
    const { container, getByRole } = render(KpiTile, props(null));
    expect(container.querySelectorAll('.ird-state--card-grid .ird-state__card')).toHaveLength(1);
    expect(container.querySelector('.ird-state')).toHaveAttribute('aria-busy', 'true');
    expect(getByRole('status')).toHaveTextContent('Cargando interesados pendientes…');
    expect(container.querySelector('.ird-card')).toBeNull();
  });
});

describe('KpiTile — a figure', () => {
  it('shows the figure, what it counts and its scope, in a static Card', () => {
    const { container, getByText } = render(KpiTile, props({ ok: true, data: { text: '0' } }));
    const card = container.querySelector('.ird-card');
    expect(card).toHaveClass('ird-card--static');
    expect(card?.tagName).toBe('DIV');
    expect(container.querySelector('.kpi__value')).toHaveTextContent('0');
    expect(getByText('Interesados pendientes')).toHaveClass('kpi__label');
    expect(getByText('Discipulado · por contactar')).toHaveClass('kpi__scope');
    expect(container.querySelector('.ird-badge')).toBeNull();
    expect(container.querySelector('a, button')).toBeNull();
  });

  it('marks a waiting figure with a warning glyph and words — not colour alone', () => {
    const { container } = render(
      KpiTile,
      props({ ok: true, data: { text: '3', tone: 'warn', attention: PENDING_ATTENTION } }),
    );
    expect(container.querySelector('.kpi')).toHaveClass('kpi--warn');
    const attention = container.querySelector('.kpi__attention');
    expect(attention?.textContent?.trim()).toBe(PENDING_ATTENTION);
    const glyph = attention?.querySelector('.fa-triangle-exclamation');
    expect(glyph).toHaveAttribute('aria-hidden', 'true');
    // A line that wraps, not a nowrap pill: five tiles at 1280px are ~150px wide.
    expect(container.querySelector('.ird-badge')).toBeNull();
  });

  it('tones a negative money figure and sizes it to the tile', () => {
    const { container } = render(
      KpiTile,
      props({ ok: true, data: { text: '-$125.50', money: true, tone: 'negative' } }),
    );
    expect(container.querySelector('.kpi')).toHaveClass('kpi--negative');
    expect(container.querySelector('.kpi__value')).toHaveClass('kpi__value--money');
    expect(container.querySelector('.kpi__value')).toHaveTextContent('-$125.50');
  });
});

describe('KpiTile — a failed read', () => {
  it('keeps the label and scope and shows the Spanish copy with Retry — never a 0', () => {
    const { container, getByRole, getByText } = render(
      KpiTile,
      props({ ok: false, error: { kind: 'network', message: NETWORK } }),
    );
    expect(getByText('Interesados pendientes')).toBeInTheDocument();
    expect(getByText('Discipulado · por contactar')).toBeInTheDocument();
    expect(getByRole('alert')).toHaveTextContent(NETWORK);
    expect(container.querySelector('.kpi__value')).toBeNull();
    expect(container.textContent).not.toMatch(/\b0\b/);
    expect(getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('Retry runs the read and shows progress until it settles', async () => {
    let settle!: () => void;
    const onRetry = vi.fn(() => new Promise<void>((resolve) => (settle = resolve)));
    const { getByRole } = render(
      KpiTile,
      props({ ok: false, error: { kind: 'network', message: NETWORK } }, onRetry),
    );
    const retry = getByRole('button', { name: 'Reintentar' });
    await fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledOnce();
    expect(retry).toHaveAttribute('aria-busy', 'true');
    settle();
    await vi.waitFor(() => expect(retry).not.toHaveAttribute('aria-busy'));
  });

  it('renders backend-looking copy as text', async () => {
    const raw = '<img src=x onerror="alert(1)"> violates row-level security';
    const { container, getByRole } = render(
      KpiTile,
      props({ ok: false, error: { kind: 'unknown', message: raw } }),
    );
    await tick();
    expect(getByRole('alert').textContent).toBe(raw);
    expect(container.querySelector('img')).toBeNull();
  });
});
