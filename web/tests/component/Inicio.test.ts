// S41 — Inicio (routes/(admin)/admin/(app)/+page.svelte) with every repo
// mocked and a stand-in session store under the REAL perms store, so each
// role is shaped by the real D-006 oracle:
//   · per-role cards — admin, Desarrollador, treasurer, leader with and
//     without discipulado / galeria / treasury / an ungrantable `activity` —
//     and the repos of hidden cards are never called (an ungated card would
//     show RLS's empty answer as a misleading 0);
//   · nothing is read before the session is `ready`;
//   · each card loads and fails on its own; a failed count is an error with
//     Retry, never 0; a rendering bug in one card leaves the others standing;
//   · coming back to the tab refetches at most once a minute, behind the
//     content; a card that appears with a new role loads on its own.
import { fireEvent, render, within } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Inicio from '../../src/routes/(admin)/admin/(app)/+page.svelte';

const h = vi.hoisted(() => ({
  countCalendarEvents: vi.fn(),
  countUpcomingSpecialEvents: vi.fn(),
  fetchNextCalendarEvents: vi.fn(),
  countPendingInterests: vi.fn(),
  countAlbums: vi.fn(),
  fetchBooksSummary: vi.fn(),
  fetchRecentActivity: vi.fn(),
}));
const double = vi.hoisted(async () => import('../helpers/session-double.svelte'));

vi.mock('#lib/db/client.js', () => ({ supabase: {} }));
vi.mock('#lib/stores/session.svelte.js', async () => ({ session: (await double).session }));
vi.mock('#lib/repos/events.js', () => ({
  countCalendarEvents: h.countCalendarEvents,
  countUpcomingSpecialEvents: h.countUpcomingSpecialEvents,
  fetchNextCalendarEvents: h.fetchNextCalendarEvents,
}));
vi.mock('#lib/repos/discipleship.js', () => ({ countPendingInterests: h.countPendingInterests }));
vi.mock('#lib/repos/gallery.js', () => ({ countAlbums: h.countAlbums }));
vi.mock('#lib/repos/treasury/index.js', () => ({ fetchBooksSummary: h.fetchBooksSummary }));
vi.mock('#lib/repos/activity.js', () => ({ fetchRecentActivity: h.fetchRecentActivity }));

const { resetSession, setStatus, signIn } = await double;

const NETWORK = 'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.';
const ok = <T>(data: T) => ({ ok: true as const, data });
const failed = (message = NETWORK) => ({
  ok: false as const,
  error: { kind: 'network' as const, message },
});
const summary = (balanceCents: number) =>
  ok({ incomeCents: 0, expensesCents: 0, balanceCents, openPayablesCents: 0, byAllocation: {} });

const EVENT = {
  id: 'event-1',
  title: 'Culto dominical',
  date: '2026-10-25',
  time: '10:00 AM',
  location: null,
  cancelled: false,
  ministries: { name: 'Jóvenes', color: '#2a4a9e' },
};
const AUDIT = {
  id: '00000000-0000-4000-8000-000000000001',
  actor_id: null,
  actor_name: 'Luis',
  action: 'INSERT',
  entity: 'gallery_albums',
  entity_id: null,
  label: 'Retiro 2026',
  created_at: new Date().toISOString(),
};

const ALL_TILES = [
  'Próximos eventos',
  'Eventos este mes',
  'Interesados pendientes',
  'Álbumes',
  'Balance',
];

function answerEverything(): void {
  h.countCalendarEvents.mockImplementation(async ({ to }: { to?: string }) => ok(to ? 12 : 7));
  h.countUpcomingSpecialEvents.mockResolvedValue(ok(2));
  h.fetchNextCalendarEvents.mockResolvedValue(ok([EVENT]));
  h.countPendingInterests.mockResolvedValue(ok(3));
  h.countAlbums.mockResolvedValue(ok(14));
  h.fetchBooksSummary.mockResolvedValue(summary(345_000));
  h.fetchRecentActivity.mockResolvedValue(ok([AUDIT]));
}

/** Let pending reads answer and Svelte write the DOM. */
async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) await new Promise((done) => setTimeout(done, 0));
  await tick();
}

const tiles = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.inicio__tile')];
const tileLabels = (root: HTMLElement) =>
  tiles(root).map((t) => t.querySelector('.kpi__label')?.textContent ?? '(cargando)');
const tileNamed = (root: HTMLElement, label: string) => {
  const found = tiles(root).find((t) => t.querySelector('.kpi__label')?.textContent === label);
  if (!found) throw new Error(`no tile "${label}"`);
  return found;
};
const headings = (root: HTMLElement) =>
  [...root.querySelectorAll('h2')].map((h2) => h2.textContent?.trim());

function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  for (const fn of Object.values(h)) fn.mockReset();
  answerEverything();
  resetSession();
});

afterEach(() => {
  Reflect.deleteProperty(document, 'visibilityState');
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Inicio — the header', () => {
  it('is "Inicio" with a greeting by first name and the one link to the current panel', async () => {
    signIn({ display_name: 'Ana María López' });
    const { getByRole, getByText } = render(Inicio);
    await settle();
    expect(getByRole('heading', { level: 1, name: 'Inicio' })).toBeInTheDocument();
    expect(document.title).toBe('Inicio');
    expect(getByText('Hola, Ana')).toBeInTheDocument();
    const links = [...document.querySelectorAll('a')];
    expect(links).toHaveLength(1);
    expect(getByRole('link', { name: 'Gestionar en el panel actual' })).toHaveAttribute(
      'href',
      '/admin/',
    );
  });

  it('says just "Hola" for an account without a name', async () => {
    signIn({ display_name: null });
    const { getByText } = render(Inicio);
    await settle();
    expect(getByText('Hola')).toBeInTheDocument();
  });
});

describe('Inicio — before the session is ready', () => {
  it('reads nothing and shows no card, then loads once it is', async () => {
    const { container } = render(Inicio);
    await settle();
    for (const fn of Object.values(h)) expect(fn).not.toHaveBeenCalled();
    expect(tiles(container)).toHaveLength(0);
    expect(headings(container)).toEqual([]);

    signIn();
    await settle();
    expect(tileLabels(container)).toEqual(ALL_TILES);
    expect(h.countCalendarEvents).toHaveBeenCalled();
  });

  it('reads nothing for a session that is not ready', async () => {
    signIn();
    setStatus('expired');
    const { container } = render(Inicio);
    await settle();
    expect(tiles(container)).toHaveLength(0);
    for (const fn of Object.values(h)) expect(fn).not.toHaveBeenCalled();
  });
});

describe('Inicio — what each role sees (D-006)', () => {
  const LIST = 'Próximos eventos';
  const ACTIVITY = 'Actividad reciente';

  it.each([
    {
      who: 'Administrador',
      profile: { role: 'admin', allowed_tabs: [] },
      tiles: ALL_TILES,
      lists: [LIST],
      untouched: ['fetchRecentActivity'],
    },
    {
      who: 'Desarrollador',
      profile: { role: 'admin', allowed_tabs: ['ministries', 'users', 'activity', 'settings'] },
      tiles: ALL_TILES,
      lists: [LIST, ACTIVITY],
      untouched: [],
    },
    {
      who: 'Tesorería',
      profile: { role: 'treasurer', allowed_tabs: ['discipulado', 'galeria', 'activity'] },
      tiles: ['Próximos eventos', 'Eventos este mes', 'Balance'],
      lists: [LIST],
      untouched: ['countPendingInterests', 'countAlbums', 'fetchRecentActivity'],
    },
    {
      who: 'a leader without grants',
      profile: { role: 'ministry_leader', allowed_tabs: [] },
      tiles: ['Próximos eventos', 'Eventos este mes'],
      lists: [LIST],
      untouched: [
        'countPendingInterests',
        'countAlbums',
        'fetchBooksSummary',
        'fetchRecentActivity',
      ],
    },
    {
      who: 'a leader with discipulado',
      profile: { role: 'ministry_leader', allowed_tabs: ['discipulado'] },
      tiles: ['Próximos eventos', 'Eventos este mes', 'Interesados pendientes'],
      lists: [LIST],
      untouched: ['countAlbums', 'fetchBooksSummary', 'fetchRecentActivity'],
    },
    {
      who: 'a leader with galeria',
      profile: { role: 'ministry_leader', allowed_tabs: ['galeria'] },
      tiles: ['Próximos eventos', 'Eventos este mes', 'Álbumes'],
      lists: [LIST],
      untouched: ['countPendingInterests', 'fetchBooksSummary', 'fetchRecentActivity'],
    },
    {
      who: 'a leader with their ministry’s treasury (never the church books)',
      profile: { role: 'ministry_leader', allowed_tabs: ['treasury'] },
      tiles: ['Próximos eventos', 'Eventos este mes'],
      lists: [LIST],
      untouched: ['fetchBooksSummary', 'fetchRecentActivity'],
    },
    {
      who: 'a leader with a stored `activity` key it cannot be granted',
      profile: { role: 'ministry_leader', allowed_tabs: ['activity', 'users'] },
      tiles: ['Próximos eventos', 'Eventos este mes'],
      lists: [LIST],
      untouched: ['fetchRecentActivity'],
    },
    {
      who: 'an unknown role',
      profile: { role: 'pastor', allowed_tabs: ['discipulado', 'activity'] },
      tiles: [],
      lists: [],
      untouched: Object.keys(h),
    },
  ])('$who', async ({ profile, tiles: expected, lists, untouched }) => {
    signIn(profile);
    const { container } = render(Inicio);
    await settle();
    expect(tileLabels(container)).toEqual(expected);
    expect(headings(container).filter((text) => text !== 'Resumen')).toEqual(lists);
    for (const name of untouched) {
      expect(h[name as keyof typeof h], name).not.toHaveBeenCalled();
    }
  });

  it('reads the activity feed eight rows at a time', async () => {
    signIn({ allowed_tabs: ['activity'] });
    render(Inicio);
    await settle();
    expect(h.fetchRecentActivity).toHaveBeenCalledWith({ limit: 8 });
    expect(h.fetchNextCalendarEvents).toHaveBeenCalledWith(
      6,
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
  });
});

describe('Inicio — figures and states', () => {
  it('shows each figure with its scope; the waiting interests get words, not colour alone', async () => {
    signIn({ allowed_tabs: ['activity'] });
    const { container } = render(Inicio);
    await settle();
    const value = (label: string) =>
      tileNamed(container, label).querySelector('.kpi__value')?.textContent;
    expect(value('Próximos eventos')).toBe('9');
    expect(value('Eventos este mes')).toBe('12');
    expect(value('Interesados pendientes')).toBe('3');
    expect(value('Álbumes')).toBe('14');
    expect(value('Balance')).toBe('$3,450.00');
    expect(
      tileNamed(container, 'Interesados pendientes').querySelector('.kpi__attention'),
    ).toHaveTextContent('Requiere atención');
    expect(tileNamed(container, 'Balance')).toHaveTextContent('Este mes · libros de la iglesia');
    expect(container.querySelector('.next__title')).toHaveTextContent('Culto dominical');
    expect(container.querySelector('.feed__text')).toHaveTextContent(
      'Luis creó un álbum de galería “Retiro 2026”',
    );
  });

  it('shows a slow card as a skeleton while the others are already there', async () => {
    let answer!: (value: unknown) => void;
    h.countAlbums.mockReturnValue(new Promise((done) => (answer = done)));
    signIn();
    const { container } = render(Inicio);
    await settle();
    const albums = tiles(container)[3];
    expect(albums.querySelector('.ird-state--loading')).not.toBeNull();
    expect(tileNamed(container, 'Balance').querySelector('.kpi__value')).toHaveTextContent(
      '$3,450.00',
    );
    answer(ok(14));
    await settle();
    expect(tileNamed(container, 'Álbumes').querySelector('.kpi__value')).toHaveTextContent('14');
  });

  it('a failed count is an error with Retry — never 0 — and Retry recovers it', async () => {
    h.countPendingInterests.mockResolvedValueOnce(failed()).mockResolvedValueOnce(ok(0));
    signIn();
    const { container } = render(Inicio);
    await settle();
    const tile = tileNamed(container, 'Interesados pendientes');
    expect(within(tile).getByRole('alert')).toHaveTextContent(NETWORK);
    expect(tile.querySelector('.kpi__value')).toBeNull();
    expect(tileNamed(container, 'Álbumes').querySelector('.kpi__value')).toHaveTextContent('14');

    await fireEvent.click(within(tile).getByRole('button', { name: 'Reintentar' }));
    await settle();
    const recovered = tileNamed(container, 'Interesados pendientes');
    expect(recovered.querySelector('.kpi__value')).toHaveTextContent('0');
    expect(recovered.querySelector('.kpi__attention')).toBeNull();
    expect(h.countPendingInterests).toHaveBeenCalledTimes(2);
  });

  it('a failed list is an error with Retry, not "no events"', async () => {
    h.fetchNextCalendarEvents.mockResolvedValueOnce(failed()).mockResolvedValueOnce(ok([]));
    signIn();
    const { container, getByText } = render(Inicio);
    await settle();
    const card = container.querySelector('.inicio__lists') as HTMLElement;
    expect(within(card).getByRole('alert')).toHaveTextContent(NETWORK);
    await fireEvent.click(within(card).getByRole('button', { name: 'Reintentar' }));
    await settle();
    expect(getByText('No hay eventos próximos.')).toBeInTheDocument();
  });

  it('keeps the page standing when one card fails to render, and Retry refetches it', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = {
      ...EVENT,
      get date(): string {
        throw new Error('render bug');
      },
    };
    h.fetchNextCalendarEvents.mockResolvedValueOnce(ok([broken]));
    signIn();
    const { container } = render(Inicio);
    await settle();
    const lists = container.querySelector('.inicio__lists') as HTMLElement;
    expect(within(lists).getByRole('alert')).toBeInTheDocument();
    expect(tileNamed(container, 'Balance').querySelector('.kpi__value')).toHaveTextContent(
      '$3,450.00',
    );
    expect(log).toHaveBeenCalledWith('[inicio] a card failed to render:', expect.any(Error));

    await fireEvent.click(within(lists).getByRole('button', { name: 'Reintentar' }));
    await settle();
    expect(h.fetchNextCalendarEvents).toHaveBeenCalledTimes(2);
    expect(within(lists).queryByRole('alert')).toBeNull();
    expect(lists.querySelector('.next__title')).toHaveTextContent('Culto dominical');
  });
});

describe('Inicio — layout', () => {
  // jsdom has no layout, so the rules are read from the page's own style block.
  // Found at 360px with real data: an implicit `auto` column grows to a nowrap
  // Badge's full width (a long ministry name) and widens the page.
  const css = readFileSync(
    resolve(process.cwd(), 'src/routes/(admin)/admin/(app)/+page.svelte'),
    'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = (selector: string) =>
    css.match(new RegExp(`\\n\\s*${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`))?.[1] ?? '';

  it('lays the tiles out in pure CSS — no autoBalance (G-010)', () => {
    expect(rule('.inicio__tiles')).toMatch(
      /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*180px\),\s*1fr\)\)/,
    );
  });

  it('never lets a card’s content widen the page past its column', () => {
    expect(rule('.inicio')).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    expect(rule('.inicio__tile')).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  });
});

describe('Inicio — keeping the figures current', () => {
  it('refetches on return to the tab at most once a minute, behind the content', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-19T14:00:00Z'));
    signIn({ allowed_tabs: ['activity'] });
    const { container } = render(Inicio);
    await settle();
    const calls = () => Object.values(h).reduce((n, fn) => n + fn.mock.calls.length, 0);
    const first = calls();
    expect(first).toBe(8); // two calendar counts + special + 3 tiles + 2 lists

    vi.setSystemTime(new Date('2026-10-19T14:00:59Z'));
    setVisibility('visible');
    await settle();
    expect(calls()).toBe(first);

    vi.setSystemTime(new Date('2026-10-19T14:01:00Z'));
    setVisibility('hidden');
    await settle();
    expect(calls()).toBe(first);

    h.countAlbums.mockResolvedValue(failed());
    let answer!: (value: unknown) => void;
    h.countPendingInterests.mockReturnValue(new Promise((done) => (answer = done)));
    setVisibility('visible');
    await settle();
    expect(calls()).toBe(first * 2);
    // Behind the content: no skeleton while the refresh runs…
    expect(container.querySelectorAll('.ird-state--loading')).toHaveLength(0);
    // …and a failed refresh keeps the last good figure.
    expect(tileNamed(container, 'Álbumes').querySelector('.kpi__value')).toHaveTextContent('14');
    answer(ok(5));
    await settle();
    expect(
      tileNamed(container, 'Interesados pendientes').querySelector('.kpi__value'),
    ).toHaveTextContent('5');

    setVisibility('visible');
    await settle();
    expect(calls()).toBe(first * 2);
  });

  it('measures the minute from the first load, not from a return before it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-19T14:00:00Z'));
    render(Inicio);
    setVisibility('visible');
    await settle();

    vi.setSystemTime(new Date('2026-10-19T14:00:30Z'));
    signIn();
    await settle();
    expect(h.countAlbums).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2026-10-19T14:01:10Z'));
    setVisibility('visible');
    await settle();
    expect(h.countAlbums).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2026-10-19T14:01:30Z'));
    setVisibility('visible');
    await settle();
    expect(h.countAlbums).toHaveBeenCalledTimes(2);
  });

  it('counts a new month after the page was left open across the month end', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 31, 23, 30));
    signIn();
    render(Inicio);
    await settle();
    expect(h.countCalendarEvents).toHaveBeenCalledWith({ from: '2026-10-01', to: '2026-10-31' });
    expect(h.fetchBooksSummary).toHaveBeenLastCalledWith({
      start: '2026-10-01',
      end: '2026-10-31',
    });

    vi.setSystemTime(new Date(2026, 10, 1, 8, 0));
    setVisibility('visible');
    await settle();
    expect(h.countCalendarEvents).toHaveBeenCalledWith({ from: '2026-11-01', to: '2026-11-30' });
    expect(h.countCalendarEvents).toHaveBeenCalledWith({ from: '2026-11-01' });
    expect(h.fetchBooksSummary).toHaveBeenLastCalledWith({
      start: '2026-11-01',
      end: '2026-11-30',
    });
  });

  it('loads a card that appears when the role changes, and only that one', async () => {
    signIn({ role: 'treasurer' });
    const { container } = render(Inicio);
    await settle();
    expect(tileLabels(container)).toEqual(['Próximos eventos', 'Eventos este mes', 'Balance']);
    const before = h.countCalendarEvents.mock.calls.length;

    signIn({ role: 'admin' });
    await settle();
    expect(tileLabels(container)).toEqual(ALL_TILES);
    expect(h.countPendingInterests).toHaveBeenCalledTimes(1);
    expect(h.countAlbums).toHaveBeenCalledTimes(1);
    expect(h.countCalendarEvents.mock.calls.length).toBe(before);
  });
});
