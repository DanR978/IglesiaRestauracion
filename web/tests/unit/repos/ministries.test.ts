// S40 — repos/ministries. Legacy source: js/pages/admin/ministries.js
// loadMinistries(), which kept only `data` and rendered a failed fetch as
// "No hay ministerios todavía" (PORT-DEBT S44). Staff-only.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/db/client.js', () => import('./mock-client'));

import { mock } from './mock-client';
import { NO_SESSION, OFFLINE, SIGNED_OUT, failure } from './results';
import { describeSessionGate } from './session-gate';
import * as ministries from '#lib/repos/ministries.js';
import { fetchMinistries } from '#lib/repos/ministries.js';

describe('repos/ministries — fetchMinistries', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    mock.reset();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it('reads every ministry by name', async () => {
    const rows = [{ id: 'm1', name: 'Alabanza', color: '#345a65', created_at: null }];
    mock.results.ministries = [{ data: rows }];
    expect(await fetchMinistries()).toEqual({ ok: true, data: rows });
    expect(mock.query().table).toBe('ministries');
    expect(mock.chain()).toEqual(['select', 'order']);
    expect(mock.args('select')).toEqual(['id,name,color,created_at']);
    expect(mock.args('order')).toEqual(['name']);
  });

  it('no ministries is an empty SUCCESS', async () => {
    expect(await fetchMinistries()).toEqual({ ok: true, data: [] });
    expect(warn).not.toHaveBeenCalled();
  });

  it('a failed read is an error, never "no ministries" (PORT-DEBT S44)', async () => {
    mock.results.ministries = [OFFLINE];
    const res = await fetchMinistries();
    expect(res).toEqual(failure('network', 'TypeError: Failed to fetch'));
    expect(res).not.toEqual({ ok: true, data: [] });
    expect(warn).toHaveBeenCalledWith(
      '[ministries] fetchMinistries:',
      'TypeError: Failed to fetch',
    );
  });

  it('signed out is an auth failure and nothing is asked', async () => {
    mock.session = SIGNED_OUT;
    expect(await fetchMinistries()).toEqual(NO_SESSION);
    expect(mock.queries).toHaveLength(0);
  });

  // RLS: `ministries_read_all` is `to authenticated` only, behind the aal2 layer.
  describeSessionGate(ministries, '[ministries]', {
    staffOnly: { fetchMinistries: () => fetchMinistries() },
  });
});
