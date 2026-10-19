// S41 — Inicio in real browsers, inside S37's shell, against `vite preview`.
// What jsdom cannot show: the cards laid out at 360 / 768 / 1280 with real
// content (no sideways scroll — a long ministry name once widened the page),
// axe over the filled page in both themes, and the reads each role makes
// going out over the network for real (an ungated card would show RLS's
// empty answer as a misleading 0).
//
// No backend is contacted: every request off the preview origin and the
// pinned CDN is intercepted; the Supabase API is answered here (counts
// through Content-Range), anything else is aborted and recorded.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { SUPABASE, seedSession } from './helpers/admin-session';

const CDN_ORIGIN = 'https://cdnjs.cloudflare.com';
const USER_ID = '6f1c1d2e-3b4a-4c5d-8e9f-0a1b2c3d4e5f';

type Profile = { role: string; allowed_tabs: string[] };
const DEVELOPER: Profile = {
  role: 'admin',
  allowed_tabs: ['ministries', 'users', 'activity', 'settings'],
};
const TREASURER: Profile = { role: 'treasurer', allowed_tabs: [] };

const day = (offset: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const EVENTS = [
  {
    id: 'e1',
    title: 'Culto de oración',
    date: day(0),
    time: '7:00 PM',
    location: null,
    cancelled: false,
    ministries: { name: 'Intercesión', color: '#5c3d9c' },
  },
  {
    id: 'e2',
    title: 'Reunión de jóvenes con invitados de otras congregaciones',
    date: day(3),
    time: '7:30 PM',
    location: null,
    cancelled: true,
    ministries: { name: 'Jóvenes', color: '#1e6b61' },
  },
  {
    id: 'e3',
    title: 'Estudio bíblico',
    date: day(8),
    time: null,
    location: null,
    cancelled: false,
    ministries: {
      name: 'Ministerio de Damas y Caballeros de la Restauración Divina',
      color: '#a05a10',
    },
  },
];
const AUDIT = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    actor_id: null,
    actor_name: 'Luis García',
    action: 'UPDATE',
    entity: 'gallery_albums',
    entity_id: null,
    label: 'Retiro de jóvenes 2026',
    created_at: new Date(Date.now() - 50 * 60_000).toISOString(),
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    actor_id: null,
    actor_name: 'Sistema',
    action: 'INSERT',
    entity: 'event_registrations',
    entity_id: null,
    label: 'Sofía Hernández',
    created_at: new Date(Date.now() - 3 * 3_600_000).toISOString(),
  },
];

interface Backend {
  /** Requests answered, as "METHOD /path". */
  readonly answered: string[];
  /** Requests to any other origin — aborted. */
  readonly refused: string[];
}

/**
 * Answer the Supabase API for `profile`. `failing` tables answer 500 with
 * PGRST000 ("the database is unreachable" — the network copy); not 503,
 * which postgrest-js retries three times (1 s, 2 s, 4 s) before it fails.
 */
async function fakeBackend(
  page: Page,
  baseURL: string | undefined,
  profile: Profile,
  { failing = new Set<string>() }: { failing?: Set<string> } = {},
): Promise<Backend> {
  const preview = new URL(baseURL ?? 'http://localhost').origin;
  const backend: Backend = { answered: [], refused: [] };
  await page.route(
    (url) => url.origin !== preview && url.origin !== CDN_ORIGIN,
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const call = `${request.method()} ${url.pathname}`;
      if (url.origin !== SUPABASE.origin) {
        backend.refused.push(`${call} @ ${url.origin}`);
        return route.abort();
      }
      backend.answered.push(call);
      const table = url.pathname.replace('/rest/v1/', '');
      if (failing.has(table)) {
        return route.fulfill({
          status: 500,
          json: { code: 'PGRST000', message: 'could not connect' },
        });
      }
      if (request.method() === 'HEAD') {
        const counts: Record<string, number> = {
          // Two date bounds: this month; one: from today on.
          calendar_events: url.searchParams.getAll('date').length > 1 ? 23 : 14,
          events: 2,
          discipleship_interests: 3,
          gallery_albums: 18,
        };
        return route.fulfill({
          status: 200,
          headers: {
            'content-range': `*/${counts[table] ?? 0}`,
            'access-control-allow-origin': '*',
            'access-control-expose-headers': 'Content-Range',
          },
        });
      }
      const lists: Record<string, unknown[]> = {
        profiles: [
          {
            id: USER_ID,
            display_name: 'Ana María López',
            ministry_id: null,
            ministry_ids: [],
            preset_id: null,
            avatar_url: null,
            created_at: '2026-01-01T00:00:00Z',
            ministries: null,
            ...profile,
          },
        ],
        calendar_events: EVENTS,
        fin_income: [{ amount: 1250 }],
        fin_expenses: [{ amount: 980.25, ministry_id: null, label: null }],
        fin_payables: [],
        audit_log: AUDIT,
      };
      if (table in lists) return route.fulfill({ status: 200, json: lists[table] });
      return route.fulfill({ status: 404, json: { message: 'not mocked' } });
    },
  );
  return backend;
}

async function openInicio(page: Page): Promise<void> {
  await page.goto('/admin/');
  await expect(page.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible();
  await expect(page.locator('.ird-state--loading')).toHaveCount(0);
}

const tileTexts = (page: Page) =>
  page
    .locator('.inicio__tile')
    .evaluateAll((tiles) =>
      tiles.map((tile) => [
        tile.querySelector('.kpi__label')?.textContent?.trim(),
        tile.querySelector('.kpi__value')?.textContent?.trim() ?? null,
      ]),
    );

const scrollsSideways = (page: Page): Promise<boolean> =>
  page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

for (const width of [360, 768, 1280]) {
  test.describe(`a Desarrollador at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('every card, filled, and nothing scrolls sideways', async ({ page, baseURL }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await seedSession(page, { userId: USER_ID });
      const backend = await fakeBackend(page, baseURL, DEVELOPER);
      await openInicio(page);

      expect(await tileTexts(page)).toEqual([
        ['Próximos eventos', '16'],
        ['Eventos este mes', '23'],
        ['Interesados pendientes', '3'],
        ['Álbumes', '18'],
        ['Balance', '$269.75'],
      ]);
      await expect(page.locator('.kpi__attention')).toHaveText('Requiere atención');
      await expect(page.getByText('Hola, Ana')).toBeVisible();
      await expect(page.locator('.next__row')).toHaveCount(3);
      await expect(page.locator('.next__row--cancelled .ird-badge--danger')).toHaveText(
        'Cancelado',
      );
      await expect(page.locator('.feed__text').first()).toHaveText(
        'Luis García editó un álbum de galería “Retiro de jóvenes 2026”',
      );
      await expect(
        page.getByRole('link', { name: 'Gestionar en el panel actual' }),
      ).toHaveAttribute('href', '/admin/');
      expect(await scrollsSideways(page)).toBe(false);
      expect(backend.refused).toEqual([]);
      expect(errors).toEqual([]);
    });
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`axe over the filled page: no serious or critical violations (${theme})`, async ({
    page,
    baseURL,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await seedSession(page, { userId: USER_ID, theme });
    await fakeBackend(page, baseURL, DEVELOPER, { failing: new Set(['gallery_albums']) });
    await openInicio(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    // One card in its error state too, so its colours are measured.
    await expect(page.locator('.inicio__tile [role="alert"]')).toHaveCount(1);
    const { violations } = await new AxeBuilder({ page }).analyze();
    const blocking = violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
    expect(blocking).toEqual([]);
  });
}

test('a treasurer: the calendar counts and the Balance — the hidden cards are never read', async ({
  page,
  baseURL,
}) => {
  await seedSession(page, { userId: USER_ID });
  const backend = await fakeBackend(page, baseURL, TREASURER);
  await openInicio(page);
  expect(await tileTexts(page)).toEqual([
    ['Próximos eventos', '16'],
    ['Eventos este mes', '23'],
    ['Balance', '$269.75'],
  ]);
  await expect(page.getByRole('heading', { level: 2, name: 'Actividad reciente' })).toHaveCount(0);
  for (const hidden of ['discipleship_interests', 'gallery_albums', 'audit_log']) {
    expect(
      backend.answered.filter((call) => call.endsWith(`/${hidden}`)),
      hidden,
    ).toEqual([]);
  }
});

test('a failed count shows its error with Retry, and Retry brings the figure', async ({
  page,
  baseURL,
}) => {
  const failing = new Set(['discipleship_interests']);
  await seedSession(page, { userId: USER_ID });
  await fakeBackend(page, baseURL, DEVELOPER, { failing });
  await openInicio(page);
  const tile = page.locator('.inicio__tile').nth(2);
  await expect(tile.getByRole('alert')).toContainText('No pudimos conectar con el servidor.');
  await expect(tile.locator('.kpi__value')).toHaveCount(0);

  failing.clear();
  await tile.getByRole('button', { name: 'Reintentar' }).click();
  await expect(tile.locator('.kpi__value')).toHaveText('3');
  await expect(tile.getByRole('alert')).toHaveCount(0);
});
