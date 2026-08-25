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
 *   import { fetchNotes, createNote } from '$lib/repos/treasury';
 * ========================================================================== */

import { supabase } from '$lib/db/client';
import type { WriteResult } from '../types';
import {
  warnRead,
  writeFail,
  writeOk,
  type NoteInsert,
  type NoteRow,
  type NoteUpdate,
} from './shared';

/** Notes, pinned first then newest (`treasury-tab.js:543-544`). */
export async function fetchNotes(): Promise<NoteRow[]> {
  const { data, error } = await supabase
    .from('fin_notes')
    .select('*')
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) {
    warnRead('fetchNotes', error.message);
    return [];
  }
  return data ?? [];
}

export async function createNote(input: NoteInsert): Promise<WriteResult<NoteRow>> {
  const { data, error } = await supabase.from('fin_notes').insert(input).select().single();
  if (error) return writeFail('createNote', error.message);
  return writeOk(data);
}

export async function updateNote(id: string, patch: NoteUpdate): Promise<WriteResult<NoteRow>> {
  if (!id) return writeFail('updateNote', 'Falta el identificador de la nota.');
  const { data, error } = await supabase
    .from('fin_notes')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) return writeFail('updateNote', error.message);
  return writeOk(data);
}

export async function deleteNote(id: string): Promise<WriteResult> {
  if (!id) return writeFail('deleteNote', 'Falta el identificador de la nota.');
  const { error } = await supabase.from('fin_notes').delete().eq('id', id);
  if (error) return writeFail('deleteNote', error.message);
  return writeOk(undefined);
}
