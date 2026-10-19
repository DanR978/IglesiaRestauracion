// S41 — NextEvents, Inicio's "Próximos eventos": static rows (no link, no
// button, no hover affordance — PORT-DEBT S41), the date as day + month with
// the weekday and time under the title, the ministry as a tinted Badge (a
// neutral one when its colour is not a valid hex), "Cancelado" as a status
// Badge; and the loading, empty and error states.
import { render, within } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import NextEvents from '#lib/components/admin/dashboard/NextEvents.svelte';
import { NEXT_EVENTS_LIMIT } from '#lib/components/admin/dashboard/dashboard.js';
import type { NextCalendarEvent } from '#lib/repos/events.js';

vi.mock('#lib/db/client.js', () => ({ supabase: {} }));

let ids = 0;
const event = (over: Partial<NextCalendarEvent> = {}): NextCalendarEvent => ({
  id: `event-${++ids}`,
  title: 'Culto dominical',
  date: '2026-10-25',
  time: '10:00 AM',
  location: null,
  cancelled: false,
  ministries: { name: 'Jóvenes', color: '#2A4A9E' },
  ...over,
});

const onRetry = () => vi.fn(async () => {});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('NextEvents', () => {
  it('is a card with its own h2', () => {
    const { getByRole } = render(NextEvents, { result: null, onRetry: onRetry() });
    expect(getByRole('heading', { level: 2, name: 'Próximos eventos' })).toBeInTheDocument();
  });

  it('loads as a list skeleton the length of the list', () => {
    const { container, getByRole } = render(NextEvents, { result: null, onRetry: onRetry() });
    expect(container.querySelectorAll('.ird-state--list .ird-state__item')).toHaveLength(
      NEXT_EVENTS_LIMIT,
    );
    expect(getByRole('status')).toHaveTextContent('Cargando próximos eventos…');
  });

  it('shows each event: date, weekday and time, title, ministry', () => {
    const { container } = render(NextEvents, {
      result: { ok: true, data: [event()] },
      onRetry: onRetry(),
    });
    const row = container.querySelector('.next__row') as HTMLElement;
    const time = row.querySelector('time');
    expect(time).toHaveAttribute('datetime', '2026-10-25');
    expect(time).toHaveTextContent('25 Oct');
    expect(within(row).getByText('Culto dominical')).toHaveClass('next__title');
    expect(row.querySelector('.next__meta')).toHaveTextContent('Domingo · 10:00 AM');
    const badge = row.querySelector('.ird-badge');
    expect(badge).toHaveClass('ird-badge--tinted');
    expect(badge).toHaveTextContent('Jóvenes');
    expect((badge as HTMLElement).style.getPropertyValue('--tint')).toBe('#2a4a9e');
  });

  it('keeps rows static: nothing to click, no hover style', () => {
    const { container } = render(NextEvents, {
      result: { ok: true, data: [event(), event({ title: 'Oración' })] },
      onRetry: onRetry(),
    });
    expect(container.querySelectorAll('.next__row')).toHaveLength(2);
    expect(container.querySelector('.next a, .next button, .next [tabindex]')).toBeNull();
    const css = readFileSync(
      resolve(process.cwd(), 'src/lib/components/admin/dashboard/NextEvents.svelte'),
      'utf8',
    );
    expect(css).not.toMatch(/:hover|cursor:\s*pointer/);
  });

  it('marks a cancelled event with a status Badge, not by fading it', () => {
    const { container } = render(NextEvents, {
      result: { ok: true, data: [event({ cancelled: true })] },
      onRetry: onRetry(),
    });
    const row = container.querySelector('.next__row');
    expect(row).toHaveClass('next__row--cancelled');
    const status = row?.querySelector('.ird-badge--danger');
    expect(status).toHaveTextContent('Cancelado');
    expect(status?.querySelector('.fa-circle-xmark')).not.toBeNull();
  });

  it('falls back to a neutral ministry Badge when the colour is not a hex', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(NextEvents, {
      result: {
        ok: true,
        data: [
          event({ ministries: { name: 'Damas', color: null } }),
          event({ ministries: { name: 'Varones', color: 'red; background:url(x)' } }),
        ],
      },
      onRetry: onRetry(),
    });
    const badges = [...container.querySelectorAll('.ird-badge')];
    expect(badges.map((b) => b.textContent?.trim())).toEqual(['Damas', 'Varones']);
    for (const badge of badges) {
      expect(badge).toHaveClass('ird-badge--neutral');
      expect((badge as HTMLElement).style.getPropertyValue('--tint')).toBe('');
      expect(badge.querySelector('.fa-church')).not.toBeNull();
    }
    expect(warn).not.toHaveBeenCalled();
  });

  it('shows an event without a ministry or a time with what it has', () => {
    const { container } = render(NextEvents, {
      result: { ok: true, data: [event({ ministries: null, time: null })] },
      onRetry: onRetry(),
    });
    expect(container.querySelector('.ird-badge')).toBeNull();
    expect(container.querySelector('.next__meta')).toHaveTextContent(/^Domingo$/);
  });

  it('says so when nothing is coming', () => {
    const { getByText, container } = render(NextEvents, {
      result: { ok: true, data: [] },
      onRetry: onRetry(),
    });
    expect(getByText('No hay eventos próximos.')).toBeInTheDocument();
    expect(container.querySelector('.ird-state--empty')).not.toBeNull();
  });

  it('shows a failed read as an error with Retry, never as "no events"', () => {
    const message = 'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.';
    const { getByRole, queryByText } = render(NextEvents, {
      result: { ok: false, error: { kind: 'network', message } },
      onRetry: onRetry(),
    });
    expect(getByRole('alert')).toHaveTextContent(message);
    expect(getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(queryByText('No hay eventos próximos.')).toBeNull();
  });
});
