// ═══════════════════════════════════════════════════════════════════════════
//  supabase/apply-auth-email.mjs
//  Pushes the Auth email templates in supabase/email-templates/ and the
//  email-related Auth settings to the production project through the
//  Management API, so the dashboard never drifts from git.
//
//  Dry run by default: reads the live config, prints what would change (never
//  a secret), changes nothing. Only fields that differ are sent — the PATCH is
//  partial. SMTP is not touched (Resend's Supabase integration owns it).
//
//  Usage:
//    SUPABASE_ACCESS_TOKEN=sbp_… node supabase/apply-auth-email.mjs           # dry run
//    SUPABASE_ACCESS_TOKEN=sbp_… node supabase/apply-auth-email.mjs --apply
//    (or --token-file <path> instead of the env var)
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_REF = 'snqwxgyhfiinouewxgiy';
const API = `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`;
const TEMPLATE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'email-templates');

// Template file → Management API field prefix. The subject is read from the
// file's "Suggested subject:" header comment, so it lives next to the HTML.
const TEMPLATES = {
  'invite.html':                             'invite',
  'recovery.html':                           'recovery',
  'confirmation.html':                       'confirmation',
  'magic_link.html':                         'magic_link',
  'email_change.html':                       'email_change',
  'reauthentication.html':                   'reauthentication',
  'password_changed_notification.html':      'password_changed_notification',
  'mfa_factor_enrolled_notification.html':   'mfa_factor_enrolled_notification',
  'mfa_factor_unenrolled_notification.html': 'mfa_factor_unenrolled_notification',
};

const SETTINGS = {
  site_url: 'https://www.irdlex.org',
  disable_signup: true,                 // invite-only; GoTrue's admin invite ignores this
  mailer_autoconfirm: false,            // "Confirm email" on — see README §4
  external_anonymous_users_enabled: false,
  mailer_otp_exp: 86400,                // invite/reset links live 24 h (the copy says so)
  mailer_notifications_password_changed_enabled: true,
};

// Added to whatever the allow-list already holds; nothing is removed.
const REDIRECT_URLS = ['https://www.irdlex.org/admin/**', 'http://localhost:3000/admin/**'];

function readToken() {
  const i = process.argv.indexOf('--token-file');
  const token = i > -1 ? readFileSync(process.argv[i + 1], 'utf8').trim() : process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error('Set SUPABASE_ACCESS_TOKEN or pass --token-file <path>.');
  return token;
}

function loadTemplates() {
  const fields = {};
  for (const [file, key] of Object.entries(TEMPLATES)) {
    const html = readFileSync(join(TEMPLATE_DIR, file), 'utf8').replace(/\r\n/g, '\n');
    const subject = html.match(/Suggested subject:\s*(.+)/)?.[1].trim();
    if (!subject) throw new Error(`${file}: no "Suggested subject:" line in the header comment.`);
    if (html.includes('{{ .ConfirmationURL }}')) {
      throw new Error(`${file}: uses {{ .ConfirmationURL }} — mail scanners burn it; link with token_hash.`);
    }
    fields[`mailer_subjects_${key}`] = subject;
    fields[`mailer_templates_${key}_content`] = html;
  }
  return fields;
}

async function api(token, method, body) {
  const res = await fetch(API, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} config/auth → ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

function show(value) {
  if (typeof value !== 'string') return JSON.stringify(value);
  return value.length > 70 ? `${value.length} chars` : JSON.stringify(value);
}

const token = readToken();
const apply = process.argv.includes('--apply');
const current = await api(token, 'GET');

const wanted = { ...SETTINGS, ...loadTemplates() };
const allow = (current.uri_allow_list || '').split(',').map(s => s.trim()).filter(Boolean);
const mergedAllow = [...allow, ...REDIRECT_URLS.filter(u => !allow.includes(u))];
wanted.uri_allow_list = mergedAllow.join(',');

const patch = {};
for (const [key, value] of Object.entries(wanted)) {
  if (current[key] !== value) patch[key] = value;
}

console.log(`SMTP: ${current.smtp_host ? `${current.smtp_host}:${current.smtp_port} as ${current.smtp_admin_email}` : 'NOT configured (built-in mailer)'}`);
if (!Object.keys(patch).length) {
  console.log('Auth email config already matches the repo. Nothing to do.');
  process.exit(0);
}
for (const [key, value] of Object.entries(patch)) {
  console.log(`  ${key}: ${show(current[key] ?? null)} → ${show(value)}`);
}
if (!apply) {
  console.log('Dry run — re-run with --apply to write these.');
  process.exit(0);
}

const after = await api(token, 'PATCH', patch);
const drift = Object.keys(patch).filter(k => after[k] !== patch[k]);
if (drift.length) throw new Error(`PATCH returned different values for: ${drift.join(', ')}`);
console.log(`Applied ${Object.keys(patch).length} field(s).`);
