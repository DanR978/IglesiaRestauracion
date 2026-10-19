/* ============================================================================
 * web/src/lib/repos/discipleship.ts — Discipulado groups, interests, members,
 * messages (S22)
 * ----------------------------------------------------------------------------
 * Port of the query half of legacy `js/lib/discipleship.js`. Reads return a
 * `ReadResult` and writes a `WriteResult` (ADR-0004); neither throws, and a
 * failed read is `{ ok: false, error }` — never an empty list. Failures are
 * logged with the `[discipulado]` tag.
 *
 * G-006: `submitInterest` is the ONE anon write here. `discipleship_interests`
 * is anon INSERT-only (it holds contact info — staff read it), so the insert
 * must NOT chain `.select()`: PostgREST would try to read the new row back,
 * RLS would deny it, and a row that saved fine would surface as "violates
 * row-level security policy". The public form only needs "it succeeded".
 *
 * Usage:
 *   import { fetchPublicGroups, submitInterest } from '#lib/repos/discipleship.js';
 *   const res = await submitInterest(form);
 *   if (!res.ok) showError(res.error.message);
 * ========================================================================== */

import { browser } from '$app/env';
import { supabase } from '#lib/db/client.js';
import type { Tables, TablesInsert } from '#lib/db/database.types.js';
import { slugify } from '#lib/slug.js';
import { fail, invalid, noRows, ok } from './errors';
import type { ChangeHandler, ReadResult, Unsubscribe, WriteResult } from './types';

const TAG = '[discipulado]';

export type DiscipleshipGroup = Tables<'discipleship_groups'>;
export type DiscipleshipGroupInsert = TablesInsert<'discipleship_groups'>;
export type DiscipleshipInterest = Tables<'discipleship_interests'>;
export type DiscipleshipInterestInsert = TablesInsert<'discipleship_interests'>;
export type DiscipleshipMember = Tables<'discipleship_members'>;
export type DiscipleshipMemberInsert = TablesInsert<'discipleship_members'>;
export type DiscipleshipMessage = Tables<'discipleship_messages'>;

/* ── Read: groups ──────────────────────────────────────────────────────── */

/** Published groups still taking people (open or running), soonest start first. */
export async function fetchPublicGroups(): Promise<ReadResult<DiscipleshipGroup[]>> {
  const { data, error, status } = await supabase
    .from('discipleship_groups')
    .select('*')
    .eq('is_published', true)
    .in('status', ['open', 'active'])
    .order('starts_on', { ascending: true, nullsFirst: false });
  if (error) return fail(TAG, 'fetchPublicGroups', error, status);
  return ok(data ?? []);
}

/** Every group for the admin list, newest start first. */
export async function fetchAllGroups(): Promise<ReadResult<DiscipleshipGroup[]>> {
  const { data, error, status } = await supabase
    .from('discipleship_groups')
    .select('*')
    .order('starts_on', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) return fail(TAG, 'fetchAllGroups', error, status);
  return ok(data ?? []);
}

/** One group by id regardless of publication (admin editor); `null` when none. */
export async function fetchGroupById(id: string): Promise<ReadResult<DiscipleshipGroup | null>> {
  if (!id) return ok(null);
  const { data, error, status } = await supabase
    .from('discipleship_groups')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) return fail(TAG, 'fetchGroupById', error, status);
  return ok(data);
}

export type GroupLookup = { id?: string | null; slug?: string | null };

/** One published group by id and/or slug (both apply when both are given); `null` when none. */
export async function fetchPublicGroupBy({ id, slug }: GroupLookup = {}): Promise<
  ReadResult<DiscipleshipGroup | null>
> {
  if (!id && !slug) return ok(null);
  let q = supabase.from('discipleship_groups').select('*').eq('is_published', true);
  if (id) q = q.eq('id', id);
  if (slug) q = q.eq('slug', slug);
  const { data, error, status } = await q.maybeSingle();
  if (error) return fail(TAG, 'fetchPublicGroupBy', error, status);
  return ok(data);
}

/* ── Write: groups (staff only via RLS) ────────────────────────────────── */

export type GroupUpsert = Partial<DiscipleshipGroupInsert> & { id?: string };

/** Insert (no `id`) or update (with `id`); derives `slug` from the name when missing. */
export async function upsertGroup(group: GroupUpsert): Promise<WriteResult<DiscipleshipGroup>> {
  const payload: GroupUpsert = { ...group };
  if (!payload.slug && payload.name) payload.slug = slugify(payload.name);
  const query = payload.id
    ? supabase.from('discipleship_groups').update(payload).eq('id', payload.id)
    : supabase.from('discipleship_groups').insert(payload as DiscipleshipGroupInsert);
  const { data, error, status } = await query.select().single();
  if (error) return fail(TAG, 'upsertGroup', error, status);
  return ok(data);
}

export async function deleteGroup(id: string): Promise<WriteResult> {
  const { error, status, count } = await supabase
    .from('discipleship_groups')
    .delete({ count: 'exact' })
    .eq('id', id);
  if (error) return fail(TAG, 'deleteGroup', error, status);
  if (!count) return noRows(TAG, 'deleteGroup');
  return ok(undefined);
}

export function markGroupCompleted(id: string): Promise<WriteResult<DiscipleshipGroup>> {
  return upsertGroup({ id, status: 'completed' });
}

/* ── Interests (public can insert) ─────────────────────────────────────── */

/** What the public interest popup / group signup wizard collect. */
export type InterestSubmission = {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  preferred_day?: string | null;
  preferred_time?: string | null;
  experience_level?: number | string | null;
  message?: string | null;
  source?: string | null;
  // v2 fields (group-detail signup)
  target_group_id?: string | null;
  can_host?: boolean | null;
  home_address?: string | null;
  has_transportation?: boolean | null;
  bringing_family?: string | null;
  age_range?: string | null;
  gender?: string | null;
};

const trimOrNull = (v: string | null | undefined): string | null => (v ?? '').trim() || null;

/**
 * Anon insert into `discipleship_interests` — NO `.select()` (G-006). On
 * success returns the normalised row that was sent, since anon cannot read
 * it back.
 */
export async function submitInterest(
  payload: InterestSubmission,
): Promise<WriteResult<DiscipleshipInterestInsert>> {
  const row: DiscipleshipInterestInsert = {
    full_name: (payload.full_name ?? '').trim(),
    email: trimOrNull(payload.email),
    phone: trimOrNull(payload.phone),
    preferred_day: payload.preferred_day || null,
    preferred_time: payload.preferred_time || null,
    experience_level: payload.experience_level ? Number(payload.experience_level) : null,
    message: trimOrNull(payload.message),
    source: payload.source || 'public_form',
    target_group_id: payload.target_group_id || null,
    can_host: typeof payload.can_host === 'boolean' ? payload.can_host : null,
    home_address: trimOrNull(payload.home_address),
    has_transportation:
      typeof payload.has_transportation === 'boolean' ? payload.has_transportation : null,
    bringing_family: trimOrNull(payload.bringing_family),
    age_range: payload.age_range || null,
    gender: payload.gender || null,
  };
  if (!row.full_name) return invalid('Por favor escribe tu nombre.');
  if (!row.email && !row.phone) {
    return invalid('Necesitamos al menos un correo o teléfono para contactarte.');
  }

  const { error, status } = await supabase.from('discipleship_interests').insert(row);
  if (error) return fail(TAG, 'submitInterest', error, status);
  return ok(row);
}

/** Interests newest first, optionally by status (staff only via RLS). */
export async function fetchInterests({ status }: { status?: string | null } = {}): Promise<
  ReadResult<DiscipleshipInterest[]>
> {
  let q = supabase
    .from('discipleship_interests')
    .select('*')
    .order('created_at', { ascending: false });
  if (status) q = q.eq('status', status);
  const res = await q;
  if (res.error) return fail(TAG, 'fetchInterests', res.error, res.status);
  return ok(res.data ?? []);
}

export type InterestStatus = 'new' | 'contacted' | 'approved' | 'placed' | 'archived' | string;

/** Move an interest through the pipeline; `placed` records the group, others clear it. */
export async function updateInterestStatus(
  id: string,
  status: InterestStatus,
  assignedGroupId: string | null = null,
): Promise<WriteResult<DiscipleshipInterest>> {
  const patch: Partial<DiscipleshipInterest> = { status };
  if (status === 'placed' && assignedGroupId) patch.assigned_group_id = assignedGroupId;
  if (status !== 'placed') patch.assigned_group_id = null;
  if (status === 'approved' || status === 'placed') patch.contacted_at = new Date().toISOString();
  const res = await supabase
    .from('discipleship_interests')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (res.error) return fail(TAG, 'updateInterestStatus', res.error, res.status);
  return ok(res.data);
}

/* ── Members ───────────────────────────────────────────────────────────── */

/** A group's roster, leaders first then by name. */
export async function fetchMembers(groupId: string): Promise<ReadResult<DiscipleshipMember[]>> {
  if (!groupId) return ok([]);
  const { data, error, status } = await supabase
    .from('discipleship_members')
    .select('*')
    .eq('group_id', groupId)
    .order('role', { ascending: true })
    .order('full_name', { ascending: true });
  if (error) return fail(TAG, 'fetchMembers', error, status);
  return ok(data ?? []);
}

export async function addMember(
  member: DiscipleshipMemberInsert,
): Promise<WriteResult<DiscipleshipMember>> {
  const { data, error, status } = await supabase
    .from('discipleship_members')
    .insert(member)
    .select()
    .single();
  if (error) return fail(TAG, 'addMember', error, status);
  return ok(data);
}

export async function removeMember(id: string): Promise<WriteResult> {
  const { error, status, count } = await supabase
    .from('discipleship_members')
    .delete({ count: 'exact' })
    .eq('id', id);
  if (error) return fail(TAG, 'removeMember', error, status);
  if (!count) return noRows(TAG, 'removeMember');
  return ok(undefined);
}

/** Move a member to another group (admin member-card kebab). */
export async function moveMember(
  memberId: string,
  newGroupId: string,
): Promise<WriteResult<DiscipleshipMember>> {
  if (!memberId || !newGroupId) return invalid('Falta el miembro o el grupo de destino.');
  const { data, error, status } = await supabase
    .from('discipleship_members')
    .update({ group_id: newGroupId })
    .eq('id', memberId)
    .select()
    .single();
  if (error) return fail(TAG, 'moveMember', error, status);
  return ok(data);
}

/* ── Messages ──────────────────────────────────────────────────────────── */

/** A group's most recent messages, newest first. */
export async function fetchMessages(
  groupId: string,
  limit = 25,
): Promise<ReadResult<DiscipleshipMessage[]>> {
  if (!groupId) return ok([]);
  const { data, error, status } = await supabase
    .from('discipleship_messages')
    .select('*')
    .eq('group_id', groupId)
    .order('sent_at', { ascending: false })
    .limit(limit);
  if (error) return fail(TAG, 'fetchMessages', error, status);
  return ok(data ?? []);
}

export type MessageDraft = { groupId: string; subject?: string | null; body: string };

export async function sendMessage({
  groupId,
  subject,
  body,
}: MessageDraft): Promise<WriteResult<DiscipleshipMessage>> {
  if (!body || !body.trim()) return invalid('El mensaje no puede estar vacío.');
  const { data, error, status } = await supabase
    .from('discipleship_messages')
    .insert({ group_id: groupId, subject: subject || null, body: body.trim() })
    .select()
    .single();
  if (error) return fail(TAG, 'sendMessage', error, status);
  return ok(data);
}

/* ── Realtime ──────────────────────────────────────────────────────────── */

/** Any change to `discipleship_groups`. No-op during prerender. */
export function subscribeGroups(onChange: ChangeHandler<DiscipleshipGroup>): Unsubscribe {
  if (!browser) return () => {};
  const ch = supabase
    .channel('discipleship-groups')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'discipleship_groups' },
      onChange,
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(ch);
  };
}

/** Any change to `discipleship_interests` (staff). No-op during prerender. */
export function subscribeInterests(onChange: ChangeHandler<DiscipleshipInterest>): Unsubscribe {
  if (!browser) return () => {};
  const ch = supabase
    .channel('discipleship-interests')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'discipleship_interests' },
      onChange,
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(ch);
  };
}
