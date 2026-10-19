// S52 — repos/treasury/notes: `fin_notes` (treasury-tab.js:542-559). S22b —
// the ReadResult / WriteResult contract: a failed read is `{ ok: false }`,
// never an empty list, and a delete that matched no row is `not_found`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/db/client.js', () => import('./mock-client'));

import { mock } from './mock-client';
import { NOT_FOUND, failure, invalidInput } from './results';
import { createNote, deleteNote, fetchNotes, updateNote } from '#lib/repos/treasury/index.js';

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
    expect(await fetchNotes()).toEqual({ ok: true, data: [note] });
    expect(mock.query().table).toBe('fin_notes');
    expect(mock.chain()).toEqual(['select', 'order', 'order']);
    expect(mock.query().calls.map((c) => c.args)).toEqual([
      ['*'],
      ['pinned', { ascending: false }],
      ['created_at', { ascending: false }],
    ]);
  });

  it('a failed read is an error + warn, never an empty list (D-032)', async () => {
    mock.results.fin_notes = [{ data: null, error: ERR }];
    const res = await fetchNotes();
    expect(res).toEqual(failure('unknown', 'boom'));
    expect(res).not.toEqual({ ok: true, data: [] });
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
    mock.results.fin_notes = [{ count: 1 }];
    expect(await deleteNote('n1')).toEqual({ ok: true, data: undefined });
    expect(mock.chain()).toEqual(['delete', 'eq']);
    expect(mock.args('delete')).toEqual([{ count: 'exact' }]);
  });

  it('a delete that matched no note is not_found (D-027)', async () => {
    mock.results.fin_notes = [{ count: 0 }];
    expect(await deleteNote('n1')).toEqual(NOT_FOUND);
  });

  it('guards a missing id and surfaces write errors', async () => {
    expect(await updateNote('', {})).toEqual(invalidInput('Falta el identificador de la nota.'));
    expect(await deleteNote('')).toEqual(invalidInput('Falta el identificador de la nota.'));
    expect(mock.queries).toHaveLength(0);
    mock.results.fin_notes = [{ data: null, error: ERR }];
    expect(await createNote({ body: 'x' })).toEqual(failure('unknown', 'boom'));
    expect(warn).toHaveBeenCalledWith('[treasury] createNote:', 'boom');
  });
});
