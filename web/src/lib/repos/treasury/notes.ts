/* ============================================================================
 * web/src/lib/repos/treasury/notes.ts — `fin_notes` (treasury reminders)
 * ----------------------------------------------------------------------------
 * Ported from `treasury-tab.js` `renderNotes` (:542-559) and the generic list
 * wiring at `:576-603` (`WIZ.notes`).
 *
 * `fin_notes` holds no money and no date filter — the month picker does not
 * scope it (PORT-DEBT S53: the picker's scope is dishonest; S53 owns the fix,
 * not this layer). The rows are plain text, so `sanitizeHtml` is not involved:
 * `body` renders as text, never as HTML (D-005).
 *
 * Usage:
 *   import { fetchNotes, createNote } from '#lib/repos/treasury/index.js';
 *   const res = await fetchNotes();
 *   if (res.ok) render(res.data);
 * ========================================================================== */

import { supabase } from '#lib/db/client.js';
import { fail, invalid, noRows, ok } from '../errors';
import { requireSession } from '../session';
import type { ReadResult, WriteResult } from '../types';
import { TAG, type NoteInsert, type NoteRow, type NoteUpdate } from './shared';

/** Notes, pinned first then newest (`treasury-tab.js:543-544`). */
export async function fetchNotes(): Promise<ReadResult<NoteRow[]>> {
  const denied = await requireSession(TAG, 'fetchNotes');
  if (denied) return denied;
  const { data, error, status } = await supabase
    .from('fin_notes')
    .select('*')
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) return fail(TAG, 'fetchNotes', error, status);
  return ok(data ?? []);
}

export async function createNote(input: NoteInsert): Promise<WriteResult<NoteRow>> {
  const denied = await requireSession(TAG, 'createNote');
  if (denied) return denied;
  const { data, error, status } = await supabase.from('fin_notes').insert(input).select().single();
  if (error) return fail(TAG, 'createNote', error, status);
  return ok(data);
}

export async function updateNote(id: string, patch: NoteUpdate): Promise<WriteResult<NoteRow>> {
  const denied = await requireSession(TAG, 'updateNote');
  if (denied) return denied;
  if (!id) return invalid('Falta el identificador de la nota.');
  const { data, error, status } = await supabase
    .from('fin_notes')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) return fail(TAG, 'updateNote', error, status);
  return ok(data);
}

export async function deleteNote(id: string): Promise<WriteResult> {
  const denied = await requireSession(TAG, 'deleteNote');
  if (denied) return denied;
  if (!id) return invalid('Falta el identificador de la nota.');
  const { error, status, count } = await supabase
    .from('fin_notes')
    .delete({ count: 'exact' })
    .eq('id', id);
  if (error) return fail(TAG, 'deleteNote', error, status);
  if (!count) return noRows(TAG, 'deleteNote');
  return ok(undefined);
}
