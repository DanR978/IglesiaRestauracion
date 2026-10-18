// js/lib/leaders.js
// ─────────────────────────────────────────────────────────────────────────────
// Repository for the "Nuestros Líderes" directory: the public /lideres/ page
// and the admin Líderes tab both go through here; neither touches sb.from().
//
//   • Public read — the leaders_directory() RPC. The tables are admin-only
//     (20261017000001_leaders_directory.sql); the RPC returns public fields,
//     plus contact only for leaders who opted in.
//   • Admin — table reads/writes, guarded by RLS (is_admin() and is_aal2()).
//   • Photos — re-encoded client-side to a small JPEG in the public `leaders`
//     bucket. Rows store the object path; photoUrl() derives the URL.
//
// Contact rule (the table CHECKs enforce the same): only an is_leader member
// may opt in, and an email/phone is stored only while opted in.
//
// Usage:
//   import { fetchDirectory, photoUrl } from '/js/lib/leaders.js';
//   const { data, error } = await fetchDirectory();        // data: section[]
//   const res = await saveMember(member, { original, file }); // { ok, id } | { error, conflict? }
// ─────────────────────────────────────────────────────────────────────────────

import { sb } from '/js/lib/supabase.js';
import { optimizeImage } from '/js/lib/image-optimizer.js';
import { normalizeUSPhone } from '/js/lib/validators.js';

const BUCKET     = 'leaders';
const T_SECTIONS = 'leader_sections';
const T_MEMBERS  = 'leader_members';
// Cards draw the photo at 84px (168px on retina); 480px leaves room to crop.
// JPEG has no alpha, so a cut-out headshot is flattened onto white, not black.
const PHOTO_OPTS = { maxWidth: 480, quality: 0.86, thumbWidth: 96, background: '#ffffff' };
const ICON_RE    = /^fa-[a-z0-9-]{1,40}$/;
// Stricter than validators.js on purpose: mirrors leader_members_contact_email_check
// (20261018000001) — no ? & = % , # that would add header fields to the mailto:.
const EMAIL_RE   = /^[A-Za-z0-9._+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
const NO_DB      = 'Supabase no está configurado.';
const CONFLICT   = 'Esta persona cambió en otra sesión mientras la editabas. Cierra y vuelve a abrirla para ver los datos actuales.';

// The fields the person modal shows. An update lands only if the row still
// holds what the modal opened with — otherwise a stale tab could re-publish
// contact a leader withdrew, or point the row at a photo that was replaced.
const GUARDED = ['section_id', 'name', 'role', 'photo_path', 'is_leader', 'contact_opt_in', 'contact_email', 'contact_phone'];

const SECTION_COLS = 'id,name,icon,verse_text,verse_ref,sort_order';
const MEMBER_COLS  = 'id,section_id,name,role,photo_path,is_leader,contact_opt_in,contact_email,contact_phone,sort_order';

export const SECTION_ICONS = [
  'fa-hands-praying', 'fa-dove', 'fa-shield-halved', 'fa-child-reaching', 'fa-fire', 'fa-bullhorn',
  'fa-church', 'fa-cross', 'fa-book-bible', 'fa-person-praying', 'fa-heart', 'fa-hand-holding-heart',
  'fa-people-group', 'fa-user-group', 'fa-children', 'fa-hands-holding-child', 'fa-baby', 'fa-seedling',
  'fa-music', 'fa-guitar', 'fa-microphone', 'fa-share-nodes', 'fa-camera', 'fa-handshake',
  'fa-globe', 'fa-house', 'fa-mug-hot', 'fa-star',
];

export const ROLE_SUGGESTIONS = ['Pastor principal', 'Pastora', 'Líder', 'Maestro', 'Maestra'];

/** Public URL for a stored photo path ('' when there is none). */
export function photoUrl(path) {
  if (!sb || !path) return '';
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/* ── Public read ──────────────────────────────────────────────────────────── */

/** Sections in page order, each with its `members`. Contact fields are null
 *  unless that leader opted in. */
export async function fetchDirectory() {
  if (!sb) return { error: NO_DB };
  const { data, error } = await sb.rpc('leaders_directory');
  if (error) {
    console.warn('[leaders] fetchDirectory:', error.message);
    return { error: error.message };
  }
  return { data: Array.isArray(data) ? data : [] };
}

/* ── Admin reads ──────────────────────────────────────────────────────────── */

export async function fetchAdminDirectory() {
  if (!sb) return { error: NO_DB };
  const [s, m] = await Promise.all([
    sb.from(T_SECTIONS).select(SECTION_COLS).order('sort_order').order('created_at').order('id'),
    sb.from(T_MEMBERS).select(MEMBER_COLS).order('sort_order').order('created_at').order('id'),
  ]);
  const error = s.error || m.error;
  if (error) {
    console.warn('[leaders] fetchAdminDirectory:', error.message);
    return { error: error.message };
  }
  const bySection = new Map((s.data ?? []).map(sec => [sec.id, { ...sec, members: [] }]));
  (m.data ?? []).forEach(mem => bySection.get(mem.section_id)?.members.push(mem));
  return { data: [...bySection.values()] };
}

/* ── Admin writes ─────────────────────────────────────────────────────────── */

function _msg(error) {
  // .single() on an update/delete that RLS filtered to zero rows.
  if (error?.code === 'PGRST116') return 'No se encontró el registro, o tu cuenta no puede editarlo.';
  if (error?.code === '42501')    return 'Tu cuenta no tiene permiso para editar los líderes.';
  return error?.message || 'Ocurrió un error.';
}

const stripQuotes = (v) => String(v ?? '').trim().replace(/^["“”«»]+|["“”«»]+$/g, '').trim();

export async function saveSection(section) {
  if (!sb) return { error: NO_DB };
  const name = String(section.name ?? '').trim();
  if (!name) return { error: 'Escribe el nombre de la sección.' };
  const row = {
    name,
    icon:       ICON_RE.test(section.icon || '') ? section.icon : SECTION_ICONS[0],
    verse_text: stripQuotes(section.verse_text) || null,
    verse_ref:  String(section.verse_ref ?? '').trim() || null,
  };
  if (Number.isInteger(section.sort_order)) row.sort_order = section.sort_order;

  const q = section.id
    ? sb.from(T_SECTIONS).update(row).eq('id', section.id)
    : sb.from(T_SECTIONS).insert(row);
  const { data, error } = await q.select('id').single();
  if (error) {
    console.warn('[leaders] saveSection:', error.message);
    return { error: _msg(error) };
  }
  return { ok: true, id: data.id };
}

/** Deletes the section, its members (FK cascade) and their photos. */
export async function deleteSection(id) {
  if (!sb) return { error: NO_DB };
  // Read the photo paths first — the cascade removes the rows that hold them.
  const { data: photos } = await sb.from(T_MEMBERS).select('photo_path')
    .eq('section_id', id).not('photo_path', 'is', null);
  const { data, error } = await sb.from(T_SECTIONS).delete().eq('id', id).select('id');
  if (error) {
    console.warn('[leaders] deleteSection:', error.message);
    return { error: _msg(error) };
  }
  if (!data?.length) return { error: _msg({ code: 'PGRST116' }) };
  await _removePhotos((photos ?? []).map(p => p.photo_path));
  return { ok: true };
}

/** Validates + normalizes a member into a row that satisfies the table CHECKs. */
function _memberRow(m) {
  const name = String(m.name ?? '').trim();
  if (!name) return { error: 'Escribe el nombre de la persona.' };
  if (!m.section_id) return { error: 'Elige la sección.' };

  const is_leader      = !!m.is_leader;
  const contact_opt_in = is_leader && !!m.contact_opt_in;
  let contact_email = null;
  let contact_phone = null;
  if (contact_opt_in) {
    const email = String(m.contact_email ?? '').trim();
    const phone = String(m.contact_phone ?? '').trim();
    if (!email && !phone) return { error: 'Agrega un correo o un teléfono, o desactiva «Mostrar contacto».' };
    if (email && (email.length > 254 || !EMAIL_RE.test(email))) return { error: 'El correo no es válido.' };
    if (phone && !normalizeUSPhone(phone)) return { error: 'El teléfono no es válido. Usa un número de 10 dígitos.' };
    contact_email = email || null;
    contact_phone = phone ? normalizeUSPhone(phone) : null;
  }

  const row = {
    section_id: m.section_id,
    name,
    role: String(m.role ?? '').trim(),
    is_leader,
    contact_opt_in,
    contact_email,
    contact_phone,
  };
  if (Number.isInteger(m.sort_order)) row.sort_order = m.sort_order;
  return { row };
}

/**
 * Insert a member, or update one when `original` (the row as loaded) is given;
 * the update only lands if the row still matches `original` on GUARDED.
 * `file` replaces the photo, `clearPhoto` removes it; the replaced object is
 * deleted only after the row saved. photo_path is written only when it changes.
 * @returns {Promise<{ok: true, id: string} | {error: string, conflict?: true}>}
 */
export async function saveMember(member, { original = null, file = null, clearPhoto = false } = {}) {
  if (!sb) return { error: NO_DB };
  const { row, error: invalid } = _memberRow(member);
  if (invalid) return { error: invalid };

  const previous = original?.photo_path || null;
  let uploaded = null;
  if (file) {
    const up = await _uploadPhoto(file);
    if (up.error) return { error: up.error };
    row.photo_path = uploaded = up.path;
  } else if (clearPhoto) {
    row.photo_path = null;
  }

  let q;
  if (original) {
    q = sb.from(T_MEMBERS).update(row).eq('id', original.id);
    for (const col of GUARDED) q = original[col] == null ? q.is(col, null) : q.eq(col, original[col]);
  } else {
    q = sb.from(T_MEMBERS).insert(row);
  }
  const { data, error } = await q.select('id').single();
  if (error) {
    console.warn('[leaders] saveMember:', error.message);
    if (uploaded) await _removePhotos([uploaded]);
    return original && error.code === 'PGRST116' ? { error: CONFLICT, conflict: true } : { error: _msg(error) };
  }
  if (previous && 'photo_path' in row && previous !== row.photo_path) await _removePhotos([previous]);
  return { ok: true, id: data.id };
}

export async function deleteMember(id) {
  if (!sb) return { error: NO_DB };
  const { data, error } = await sb.from(T_MEMBERS).delete().eq('id', id).select('id,photo_path');
  if (error) {
    console.warn('[leaders] deleteMember:', error.message);
    return { error: _msg(error) };
  }
  if (!data?.length) return { error: _msg({ code: 'PGRST116' }) };
  await _removePhotos(data.map(r => r.photo_path));
  return { ok: true };
}

/** Persist a new order. `items` is the full list in its new order; only rows
 *  whose position changed are written (each write is an audit-log row). */
async function _reorder(table, items) {
  const writes = items
    .map((it, i) => ({ id: it.id, from: it.sort_order, to: i }))
    .filter(w => w.from !== w.to)
    .map(w => sb.from(table).update({ sort_order: w.to }).eq('id', w.id));
  const failed = (await Promise.all(writes)).find(r => r.error);
  if (failed) {
    console.warn('[leaders] reorder:', failed.error.message);
    return { error: _msg(failed.error) };
  }
  return { ok: true };
}

export async function reorderSections(items) {
  return sb ? _reorder(T_SECTIONS, items) : { error: NO_DB };
}

export async function reorderMembers(items) {
  return sb ? _reorder(T_MEMBERS, items) : { error: NO_DB };
}

/* ── Photos ───────────────────────────────────────────────────────────────── */

// crypto.randomUUID arrived in Safari 15.4; the name only has to be unguessable.
function _objectName() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
}

async function _uploadPhoto(file) {
  let opt;
  try {
    opt = await optimizeImage(file, PHOTO_OPTS);
  } catch (e) {
    console.warn('[leaders] uploadPhoto:', e?.message);
    return { error: 'No se pudo procesar la imagen. Prueba con una foto JPG o PNG.' };
  }
  const path = `${_objectName()}.jpg`;
  const { error } = await sb.storage.from(BUCKET).upload(path, opt.main, {
    contentType: 'image/jpeg', cacheControl: '31536000', upsert: false,
  });
  if (error) {
    console.warn('[leaders] uploadPhoto:', error.message);
    return { error: error.message };
  }
  return { path };
}

async function _removePhotos(paths) {
  const list = paths.filter(Boolean);
  if (!list.length) return;
  const { error } = await sb.storage.from(BUCKET).remove(list);
  if (error) console.warn('[leaders] removePhotos:', error.message);
}
