// S39 — where a finished sign-in step leads, for every session status, and
// the navigation that gets there (replacing the history entry, so Back never
// lands on a spent link or a callback).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({ goto: vi.fn() }));
vi.mock('$app/navigation', () => nav);

import { destinationFor, leaveTo, withNext } from '#lib/components/admin/auth/destination.js';

const HOME = '/admin/';
const CUENTA = '/admin/cuenta/';

describe('withNext', () => {
  it('carries `next`, encoded', () => {
    expect(withNext('/admin/acceso/verificar/', '/admin/cuenta/?tab=seguridad')).toBe(
      '/admin/acceso/verificar/?next=%2Fadmin%2Fcuenta%2F%3Ftab%3Dseguridad',
    );
  });

  it('leaves Inicio off — every sign-in lands there anyway', () => {
    expect(withNext('/admin/acceso/verificar/', HOME)).toBe('/admin/acceso/verificar/');
  });
});

describe('destinationFor', () => {
  it.each([
    ['ready', HOME, HOME],
    ['ready', CUENTA, CUENTA],
    ['needs-mfa', CUENTA, '/admin/acceso/verificar/?next=%2Fadmin%2Fcuenta%2F'],
    ['needs-enroll', HOME, '/admin/acceso/verificar/'],
    ['forbidden', CUENTA, '/admin/acceso/sin-acceso/'],
    ['signed-out', CUENTA, '/admin/acceso/?next=%2Fadmin%2Fcuenta%2F'],
    ['expired', HOME, '/admin/acceso/'],
  ] as const)('%s with next %s → %s', (status, next, to) => {
    expect(destinationFor(status, next)).toBe(to);
  });

  it.each(['error', 'loading'] as const)('%s stays (the page shows Retry)', (status) => {
    expect(destinationFor(status, CUENTA)).toBeNull();
  });
});

describe('leaveTo', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    nav.goto.mockReset();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it('replaces the history entry', async () => {
    nav.goto.mockResolvedValue(undefined);
    await leaveTo('/admin/acceso/verificar/');
    expect(nav.goto).toHaveBeenCalledWith('/admin/acceso/verificar/', { replace: true });
  });

  it('a navigation superseded by a newer one is not an error', async () => {
    nav.goto.mockRejectedValue(new Error('navigation aborted'));
    await expect(leaveTo(HOME)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith('[acceso] leaveTo:', 'navigation aborted');
  });
});
