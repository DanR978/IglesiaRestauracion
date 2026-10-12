// S52 — repos/treasury/notes: `fin_notes` (treasury-tab.js:542-559).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/db/client', () => import('./mock-client'));

import { mock } from './mock-client';
import { createNote, deleteNote, fetchNotes, updateNote } from '$lib/repos/treasury';

const ERR = { message: 'boom' };
const note = {
  id: 'n1',
  body: 'Pagar al músico el viernes',
  ministry_id: null,
  pinned: true,
  created_by: null,
  created_at: '2026-08-01T12:00:00Z',
};

describe('repos/treasury/notes', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    mock.reset();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it('lists pinned first, then newest', async () => {
    mock.results.fin_notes = [{ data: [note] }];
    expect(await fetchNotes()).toEqual([note]);
    expect(mock.query().table).toBe('fin_notes');
    expect(mock.chain()).toEqual(['select', 'order', 'order']);
    expect(mock.query().calls.map((c) => c.args)).toEqual([
      ['*'],
      ['pinned', { ascending: false }],
      ['created_at', { ascending: false }],
    ]);
  });

  it('[] + warn on error', async () => {
    mock.results.fin_notes = [{ data: null, error: ERR }];
    expect(await fetchNotes()).toEqual([]);
    expect(warn).toHaveBeenCalledWith('[treasury] fetchNotes:', 'boom');
  });

  it('create / update / delete shapes (WIZ.notes.toPayload)', async () => {
    mock.results.fin_notes = [{ data: note }];
    expect(await createNote({ body: note.body, ministry_id: null, pinned: true })).toEqual({
      ok: true,
      data: note,
    });
    expect(mock.chain()).toEqual(['insert', 'select', 'single']);
    expect(mock.args('insert')).toEqual([{ body: note.body, ministry_id: null, pinned: true }]);

    mock.reset();
    mock.results.fin_notes = [{ data: note }];
    await updateNote('n1', { pinned: false });
    expect(mock.chain()).toEqual(['update', 'eq', 'select', 'single']);
    expect(mock.args('eq')).toEqual(['id', 'n1']);

    mock.reset();
    expect(await deleteNote('n1')).toEqual({ ok: true, data: undefined });
    expect(mock.chain()).toEqual(['delete', 'eq']);
  });

  it('guards a missing id and surfaces write errors', async () => {
    expect(await updateNote('', {})).toEqual({
      ok: false,
      error: 'Falta el identificador de la nota.',
    });
    expect(await deleteNote('')).toEqual({
      ok: false,
      error: 'Falta el identificador de la nota.',
    });
    expect(mock.queries).toHaveLength(0);
    mock.results.fin_notes = [{ data: null, error: ERR }];
    expect(await createNote({ body: 'x' })).toEqual({ ok: false, error: 'boom' });
    expect(warn).toHaveBeenCalledWith('[treasury] createNote:', 'boom');
  });
});
