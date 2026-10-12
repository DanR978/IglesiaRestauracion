// S22 — the subscribe* helpers in the browser: channel name, postgres_changes
// filter, and teardown via removeChannel (no leaked channel — G-003-adjacent).
// $app/environment is re-mocked here so `browser` is true.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/db/client', () => import('./mock-client'));
vi.mock('$app/environment', () => ({
  browser: true,
  dev: false,
  building: false,
  version: 'test',
}));

import { mock } from './mock-client';
import { subscribeEvents } from '$lib/repos/events';
import { subscribeAlbums, subscribePhotos } from '$lib/repos/gallery';
import { subscribeGroups, subscribeInterests } from '$lib/repos/discipleship';

const changes = (table: string, filter?: string) => ({
  event: '*',
  schema: 'public',
  table,
  ...(filter ? { filter } : {}),
});

describe('repos realtime (browser=true)', () => {
  beforeEach(() => mock.reset());

  it.each([
    ['subscribeEvents', () => subscribeEvents(() => {}), 'events-changes', changes('events')],
    [
      'subscribeAlbums',
      () => subscribeAlbums(() => {}),
      'gallery-albums',
      changes('gallery_albums'),
    ],
    [
      'subscribePhotos',
      () => subscribePhotos('alb', () => {}),
      'gallery-photos-alb',
      changes('gallery_photos', 'album_id=eq.alb'),
    ],
    [
      'subscribeGroups',
      () => subscribeGroups(() => {}),
      'discipleship-groups',
      changes('discipleship_groups'),
    ],
    [
      'subscribeInterests',
      () => subscribeInterests(() => {}),
      'discipleship-interests',
      changes('discipleship_interests'),
    ],
  ])('%s subscribes with the legacy channel + filter and tears down', (_n, run, name, filter) => {
    const off = run();
    expect(mock.channels).toHaveLength(1);
    const ch = mock.channels[0];
    expect(ch.name).toBe(name);
    expect(ch.subscribed).toBe(true);
    expect(ch.on[0]).toEqual(['postgres_changes', filter, expect.any(Function)]);
    expect(mock.removed).toEqual([]);
    off();
    expect(mock.removed).toEqual([name]);
  });

  it('forwards the change payload to the handler', () => {
    const handler = vi.fn();
    subscribeEvents(handler);
    const cb = mock.channels[0].on[0] as [string, unknown, (p: unknown) => void];
    cb[2]({ eventType: 'INSERT' });
    expect(handler).toHaveBeenCalledWith({ eventType: 'INSERT' });
  });
});
