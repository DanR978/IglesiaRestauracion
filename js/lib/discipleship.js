// js/lib/discipleship.js
// ─────────────────────────────────────────────────────────────────────────────
// Typed Supabase queries + helpers for the Discipulado feature.
// Matches v1 conventions: import { sb } from /js/lib/supabase.js, export
// flat async functions that always resolve to a value (never throw to caller).
// ─────────────────────────────────────────────────────────────────────────────

import { sb } from '/js/lib/supabase.js';

/* ── Constants ─────────────────────────────────────────────────────────────── */

export const LEVELS = [
  { n: 1, label: 'Fundamentos',  blurb: 'Tu primer paso. Quién es Jesús, qué creemos, y la base del evangelio.' },
  { n: 2, label: 'Crecimiento',  blurb: 'La vida del creyente — oración, lectura bíblica, comunidad y obediencia.' },
  { n: 3, label: 'Discípulo',    blurb: 'Carácter cristiano, doctrina sólida y cómo aplicar la Palabra en cada área.' },
  { n: 4, label: 'Servidor',     blurb: 'Dones espirituales, servir en la iglesia, y comenzar a ministrar a otros.' },
  { n: 5, label: 'Multiplicador',blurb: 'Liderar un grupo, hacer discípulos, y reproducir la fe en nuevos creyentes.' },
];

export const WEEKDAYS = [
  { value: 'domingo',   label: 'Domingo'   },
  { value: 'lunes',     label: 'Lunes'     },
  { value: 'martes',    label: 'Martes'    },
  { value: 'miércoles', label: 'Miércoles' },
  { value: 'jueves',    label: 'Jueves'    },
  { value: 'viernes',   label: 'Viernes'   },
  { value: 'sábado',    label: 'Sábado'    },
];

export const STATUS_LABEL = {
  open:      'Abierto',
  active:    'En curso',
  completed: 'Finalizado',
  cancelled: 'Cancelado',
};

export const GENDERS = [
  { value: 'masculino',    label: 'Masculino'      },
  { value: 'femenino',     label: 'Femenino'       },
  { value: 'no-especifica', label: 'Prefiero no decir' },
];

export const AGE_LABEL = {
  teen:          'Adolescente',
  'young-adult': 'Joven adulto',
  adult:         'Adulto',
  senior:        'Adulto mayor',
};

/**
 * Combine raw status + start date + capacity into a single display status.
 *   open        — accepting signups, hasn't started, has room
 *   full        — accepting signups but at capacity (waitlist)
 *   in_progress — already started (either status='active' OR starts_on is past)
 *   completed
 *   cancelled
 *
 * The pastor can still create a group with status='active' explicitly, OR
 * leave status='open' and set starts_on in the past — both render as in_progress.
 */
export function displayStatus(group) {
  if (!group) return 'cancelled';
  const raw = group.status;
  if (raw === 'cancelled') return 'cancelled';
  if (raw === 'completed') return 'completed';
  if (raw === 'active')    return 'in_progress';

  // raw === 'open' — auto-promote to in_progress if the start date has passed
  if (group.starts_on) {
    const today = new Date();
    const todayKey =
      `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (group.starts_on < todayKey) return 'in_progress';
  }

  // Still 'open' — check capacity
  const capacity = group.capacity;
  const filled   = group.member_count ?? 0;
  if (capacity != null && filled >= capacity) return 'full';
  return 'open';
}

export const DISPLAY_STATUS_LABEL = {
  open:        'Abierto',
  full:        'Lleno · Lista de espera',
  in_progress: 'En curso',
  completed:   'Finalizado',
  cancelled:   'Cancelado',
};

export function spotsRemaining(group) {
  if (!group?.capacity) return null;
  return Math.max(0, group.capacity - (group.member_count ?? 0));
}

/* ── Read: groups ──────────────────────────────────────────────────────────── */

export async function fetchPublicGroups() {
  if (!sb) {
    console.warn('[discipulado] fetchPublicGroups: Supabase client not configured');
    return [];
  }
  const { data, error } = await sb
    .from('discipleship_groups')
    .select('*')
    .eq('is_published', true)
    .in('status', ['open', 'active'])
    .order('starts_on', { ascending: true, nullsFirst: false });
  if (error) {
    console.error('[discipulado] fetchPublicGroups error:', error.message, error);
    return [];
  }
  console.info(`[discipulado] fetched ${data?.length ?? 0} public group(s)`,
    data?.map(g => ({ id: g.id, name: g.name, status: g.status, is_published: g.is_published })));
  return data ?? [];
}

export async function fetchAllGroups() {
  if (!sb) return [];
  const { data, error } = await sb
    .from('discipleship_groups')
    .select('*')
    .order('starts_on', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) { console.warn('[discipulado] fetchAllGroups:', error.message); return []; }
  return data ?? [];
}

export async function fetchGroupById(id) {
  if (!sb || !id) return null;
  const { data, error } = await sb.from('discipleship_groups').select('*').eq('id', id).maybeSingle();
  if (error) { console.warn('[discipulado] fetchGroupById:', error.message); return null; }
  return data;
}

export async function fetchPublicGroupBy({ id, slug } = {}) {
  if (!sb) return null;
  if (!id && !slug) return null;
  let q = sb.from('discipleship_groups').select('*').eq('is_published', true);
  if (id)   q = q.eq('id', id);
  if (slug) q = q.eq('slug', slug);
  const { data, error } = await q.maybeSingle();
  if (error) { console.warn('[discipulado] fetchPublicGroupBy:', error.message); return null; }
  return data;
}

/* ── Write: groups (staff only via RLS) ────────────────────────────────────── */

export async function upsertGroup(group) {
  if (!sb) return { error: 'no-supabase' };
  const payload = { ...group };
  if (!payload.slug && payload.name) {
    payload.slug = payload.name
      .toLowerCase()
      .normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '')
      .slice(0, 80);
  }
  const fn = payload.id ? sb.from('discipleship_groups').update(payload).eq('id', payload.id)
                        : sb.from('discipleship_groups').insert(payload);
  const { data, error } = await fn.select().single();
  if (error) { console.warn('[discipulado] upsertGroup:', error.message); return { error: error.message }; }
  return { data };
}

export async function deleteGroup(id) {
  if (!sb) return { error: 'no-supabase' };
  const { error } = await sb.from('discipleship_groups').delete().eq('id', id);
  if (error) return { error: error.message };
  return { ok: true };
}

export async function markGroupCompleted(id) {
  return upsertGroup({ id, status: 'completed' });
}

/* ── Interests (public can insert) ─────────────────────────────────────────── */

export async function submitInterest(payload) {
  if (!sb) {
    return { error: 'No pudimos conectar con el servidor. Si estás viendo el sitio desde "VS Code Show Preview", ciérralo y abre la página en http://localhost:3000 (después de correr `npm run dev`).' };
  }
  const row = {
    full_name:        (payload.full_name        || '').trim(),
    email:            (payload.email            || '').trim() || null,
    phone:            (payload.phone            || '').trim() || null,
    preferred_day:    payload.preferred_day || null,
    preferred_time:   payload.preferred_time || null,
    experience_level: payload.experience_level ? Number(payload.experience_level) : null,
    message:          (payload.message || '').trim() || null,
    source:           payload.source || 'public_form',
    // v2 fields (group-detail signup)
    target_group_id:    payload.target_group_id || null,
    can_host:           typeof payload.can_host === 'boolean' ? payload.can_host : null,
    home_address:       (payload.home_address || '').trim() || null,
    has_transportation: typeof payload.has_transportation === 'boolean' ? payload.has_transportation : null,
    bringing_family:    (payload.bringing_family || '').trim() || null,
    age_range:          payload.age_range || null,
    gender:             payload.gender || null,
  };
  if (!row.full_name) return { error: 'Por favor escribe tu nombre.' };
  if (!row.email && !row.phone) return { error: 'Necesitamos al menos un correo o teléfono para contactarte.' };

  const { data, error } = await sb.from('discipleship_interests').insert(row).select().single();
  if (error) { console.warn('[discipulado] submitInterest:', error.message); return { error: error.message }; }
  return { data };
}

/** Public production domain — used for QR codes regardless of where the admin runs. */
export const PUBLIC_BASE = 'https://www.irdlex.org';

/**
 * Build a public-facing URL for a group. Used in QR codes and "Copiar enlace",
 * so it MUST point at the real production domain — never localhost or a preview URL.
 * The `origin` argument is escape-hatch only (e.g. for testing on a staging host).
 */
export function groupPublicUrl(group, origin) {
  const base = origin || PUBLIC_BASE;
  if (group?.slug) return `${base}/discipulado/grupo/?slug=${encodeURIComponent(group.slug)}`;
  if (group?.id)   return `${base}/discipulado/grupo/?id=${encodeURIComponent(group.id)}`;
  return `${base}/discipulado`;
}

export async function fetchInterests({ status } = {}) {
  if (!sb) return [];
  let q = sb.from('discipleship_interests').select('*').order('created_at', { ascending: false });
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) { console.warn('[discipulado] fetchInterests:', error.message); return []; }
  return data ?? [];
}

export async function updateInterestStatus(id, status, assignedGroupId = null) {
  if (!sb) return { error: 'no-supabase' };
  const patch = { status };
  if (status === 'placed' && assignedGroupId) patch.assigned_group_id = assignedGroupId;
  if (status !== 'placed') patch.assigned_group_id = null;
  if (status === 'approved' || status === 'placed') patch.contacted_at = new Date().toISOString();
  const { data, error } = await sb.from('discipleship_interests').update(patch).eq('id', id).select().single();
  if (error) return { error: error.message };
  return { data };
}

/* ── Members ───────────────────────────────────────────────────────────────── */

export async function fetchMembers(groupId) {
  if (!sb || !groupId) return [];
  const { data, error } = await sb
    .from('discipleship_members')
    .select('*')
    .eq('group_id', groupId)
    .order('role', { ascending: true })
    .order('full_name', { ascending: true });
  if (error) { console.warn('[discipulado] fetchMembers:', error.message); return []; }
  return data ?? [];
}

export async function addMember(member) {
  if (!sb) return { error: 'no-supabase' };
  const { data, error } = await sb.from('discipleship_members').insert(member).select().single();
  if (error) return { error: error.message };
  return { data };
}

export async function removeMember(id) {
  if (!sb) return { error: 'no-supabase' };
  const { error } = await sb.from('discipleship_members').delete().eq('id', id);
  if (error) return { error: error.message };
  return { ok: true };
}

/* ── Messages ──────────────────────────────────────────────────────────────── */

export async function fetchMessages(groupId, limit = 25) {
  if (!sb || !groupId) return [];
  const { data, error } = await sb
    .from('discipleship_messages')
    .select('*')
    .eq('group_id', groupId)
    .order('sent_at', { ascending: false })
    .limit(limit);
  if (error) { console.warn('[discipulado] fetchMessages:', error.message); return []; }
  return data ?? [];
}

export async function sendMessage({ groupId, subject, body }) {
  if (!sb) return { error: 'no-supabase' };
  if (!body || !body.trim()) return { error: 'El mensaje no puede estar vacío.' };
  const { data, error } = await sb.from('discipleship_messages')
    .insert({ group_id: groupId, subject: (subject || null), body: body.trim() })
    .select().single();
  if (error) return { error: error.message };
  return { data };
}

/* ── Realtime subscriptions ────────────────────────────────────────────────── */

export function subscribeGroups(onChange) {
  if (!sb) return () => {};
  const ch = sb.channel('discipleship-groups')
    .on('postgres_changes',
       { event: '*', schema: 'public', table: 'discipleship_groups' },
       onChange)
    .subscribe();
  return () => { try { ch.unsubscribe(); } catch (_) {} };
}

export function subscribeInterests(onChange) {
  if (!sb) return () => {};
  const ch = sb.channel('discipleship-interests')
    .on('postgres_changes',
       { event: '*', schema: 'public', table: 'discipleship_interests' },
       onChange)
    .subscribe();
  return () => { try { ch.unsubscribe(); } catch (_) {} };
}

/* ── Display helpers ───────────────────────────────────────────────────────── */

const DAY_LABEL = Object.fromEntries(WEEKDAYS.map(w => [w.value, w.label]));

export function formatSchedule(group) {
  if (!group) return '';
  const day  = DAY_LABEL[group.meeting_day] || '';
  const time = group.meeting_time ? formatTime(group.meeting_time) : '';
  if (day && time) return `${day} · ${time}`;
  return day || time || 'Por definir';
}

export function formatTime(hms) {
  // accepts '19:00:00' or '19:00'
  const [hStr, mStr] = String(hms).split(':');
  const h24 = Number(hStr) || 0;
  const m   = String(mStr ?? '00').padStart(2, '0');
  const am  = h24 < 12;
  const h12 = ((h24 + 11) % 12) + 1;
  return `${h12}:${m} ${am ? 'AM' : 'PM'}`;
}

export function formatDateRange(group) {
  if (!group?.starts_on) return '';
  const start = new Date(group.starts_on + 'T00:00');
  const fmt = (d) => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  if (!group.ends_on) return `Inicia el ${fmt(start)}`;
  const end = new Date(group.ends_on + 'T00:00');
  return `${fmt(start)} → ${fmt(end)}`;
}

export function levelMeta(n) {
  return LEVELS.find(l => l.n === Number(n)) ?? LEVELS[0];
}
