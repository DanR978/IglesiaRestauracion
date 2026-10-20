// ═══════════════════════════════════════════════════════════════════════════
//  supabase/apply-auth-email.mjs
//  Pushes the Auth email templates in supabase/email-templates/ and the Auth
//  settings the admin's security rests on (invite-only accounts, TOTP, token
//  lifetime, security notifications, the redirect allow-list, the Google and
//  Microsoft providers) to the production project through the Management API,
//  so the dashboard never drifts from git.
//
//  Dry run by default: reads the live config, prints what would change (never
//  a secret), changes nothing. Only fields that differ are sent — the PATCH is
//  partial. SMTP is not touched (Resend's Supabase integration owns it). OAuth
//  client secrets are sent only with --rotate-secrets.
//
//  Usage:
//    SUPABASE_ACCESS_TOKEN=sbp_… node supabase/apply-auth-email.mjs           # dry run
//    SUPABASE_ACCESS_TOKEN=sbp_… node supabase/apply-auth-email.mjs --apply
//    (or --token-file <path> instead of the env var)
//    … --secret-file supabase/.env.auth.local [--rotate-secrets] [--apply]  # providers
//    node supabase/apply-auth-email.mjs --help                                # every flag
// ═══════════════════════════════════════════════════════════════════════════

import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
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
  'identity_linked.html':                    'identity_linked_notification',
  'identity_unlinked.html':                  'identity_unlinked_notification',
};

// Asserted on every run. Keys are UpdateAuthConfigBody fields of the
// Management API (PATCH /v1/projects/{ref}/config/auth).
const SETTINGS = {
  site_url: 'https://www.irdlex.org',
  disable_signup: true,                 // invite-only; GoTrue's admin invite ignores this
  mailer_autoconfirm: false,            // "Confirm email" on — see README §4
  mailer_allow_unverified_email_sign_ins: false,
  external_anonymous_users_enabled: false,
  security_manual_linking_enabled: false, // D-035: the link/unlink endpoints stay off
  mfa_totp_enroll_enabled: true,
  mfa_totp_verify_enabled: true,
  jwt_exp: 900,                         // 15-minute access tokens (D-040)
  mailer_otp_exp: 86400,                // invite/reset links live 24 h (the copy says so)
  mailer_notifications_password_changed_enabled: true,
  mailer_notifications_mfa_factor_enrolled_enabled: true,
  mailer_notifications_mfa_factor_unenrolled_enabled: true,
  mailer_notifications_identity_linked_enabled: true,
  mailer_notifications_identity_unlinked_enabled: true,
};

// Raised to this when the live value is lower; a stricter live value is kept.
const MINIMUMS = { password_min_length: 8 };

// Added to whatever the allow-list already holds; nothing is removed.
const REDIRECT_URLS = [
  'https://www.irdlex.org/admin/**',
  'http://localhost:3000/admin/**',
  'https://www.irdlex.org/app/**',
];

// The only keys --secret-file may hold (see .env.auth.local.example).
const FILE_KEYS = [
  'GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET',
  'AZURE_OAUTH_CLIENT_ID', 'AZURE_TENANT_ID', 'AZURE_OAUTH_CLIENT_SECRET',
];

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const GOOGLE_CLIENT_ID = /^\d+-[0-9a-z]+\.apps\.googleusercontent\.com$/;
const SENSITIVE = /secret|_pass$|_token$|_key$/; // never printed, whatever the value
const SECRETS = new Set();                        // every secret read, scrubbed from errors
const MAX_SESSION_HOURS = 8760;

const USAGE = `Usage: node supabase/apply-auth-email.mjs [flags]

Dry run unless --apply. The Management API token comes from SUPABASE_ACCESS_TOKEN
or --token-file; provider values from the environment or --secret-file.

  --apply                      write the changes (default: only print them)
  --token-file <path>          read the access token from a file
  --secret-file <path>         KEY=VALUE lines, see supabase/.env.auth.local.example
  --rotate-secrets             also send the OAuth client secrets (never sent otherwise)
  --require-current-password   password changes must send current_password; only
                               once every admin client sends it (DF-006 and later)
  --hibp                       reject known-leaked passwords (Pro plan)
  --sessions <hours>,<hours>   session time-box and inactivity timeout, 0 = off (Pro plan)
  -h, --help                   show this help

Always asserted: sign-ups off, email confirmation on, unverified-email sign-ins off,
anonymous sign-ins off, manual identity linking off, TOTP enroll + verify on,
password length >= 8, jwt_exp 900, the security notifications on, the repo's email
templates, and these redirect URLs (added, never removed):
  ${REDIRECT_URLS.join('\n  ')}
Google is managed when GOOGLE_OAUTH_CLIENT_ID is set, Microsoft when
AZURE_OAUTH_CLIENT_ID and AZURE_TENANT_ID are; an unset provider is left as it is.`;

function parseArgs(argv) {
  const opts = { apply: false, rotateSecrets: false, requireCurrentPassword: false, hibp: false, help: false };
  const BOOLEAN = {
    '--apply': 'apply', '--rotate-secrets': 'rotateSecrets', '--hibp': 'hibp',
    '--require-current-password': 'requireCurrentPassword', '--help': 'help', '-h': 'help',
  };
  const VALUED = { '--token-file': 'tokenFile', '--secret-file': 'secretFile', '--sessions': 'sessions' };
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = argv[i].split(/=(.*)/s, 2);
    if (flag in BOOLEAN && inline === undefined) {
      opts[BOOLEAN[flag]] = true;
    } else if (flag in VALUED) {
      const value = inline ?? argv[++i];
      if (!value || value.startsWith('-')) throw new Error(`${flag} needs a value.`);
      opts[VALUED[flag]] = value;
    } else {
      // A stray positional argument could be a pasted secret, so it is not echoed.
      throw new Error(flag.startsWith('-') ? `Unknown flag ${flag} (see --help).` : 'Unexpected argument (not shown; see --help).');
    }
  }
  return opts;
}

// Refuses a token or secrets file that git would commit — this repo is public.
function assertNotCommittable(path) {
  const full = resolve(path);
  try {
    execFileSync('git', ['-C', dirname(full), 'check-ignore', '-q', basename(full)], { stdio: 'ignore' });
  } catch (err) {
    if (err.status === 1) throw new Error(`${path} is not ignored by git — keep secrets out of files git could commit.`);
    // 128: outside any work tree; ENOENT: no git — nothing could commit the file.
  }
}

function readSecretFile(path) {
  assertNotCommittable(path);
  const values = {};
  const content = readFileSync(path, 'utf8');
  const lines = (content.charCodeAt(0) === 0xfeff ? content.slice(1) : content).split(/\r?\n/); // Notepad may add a BOM
  lines.forEach((line, i) => {
    const text = line.trim();
    if (!text || text.startsWith('#')) return;
    const match = text.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (!match) throw new Error(`${path}:${i + 1}: expected KEY=VALUE.`);
    const [, key, raw] = match;
    if (!FILE_KEYS.includes(key)) {
      throw new Error(`${path}:${i + 1}: ${key} is not read from this file (allowed: ${FILE_KEYS.join(', ')}).`);
    }
    values[key] = raw.trim().replace(/^(['"])(.*)\1$/, '$2');
  });
  return values;
}

function makeReader(fileValues, file) {
  return key => {
    const fromEnv = process.env[key]?.trim() ?? '';
    const fromFile = fileValues[key] ?? '';
    for (const value of [fromEnv, fromFile]) if (key.endsWith('_SECRET') && value) SECRETS.add(value);
    if (fromEnv && fromFile && fromEnv !== fromFile) {
      throw new Error(`${key} is set both in the environment and in ${file}, with different values — unset one.`);
    }
    const value = fromEnv || fromFile;
    if (/^<.*>$/.test(value)) throw new Error(`${key} still holds the example placeholder — fill it in or leave it empty.`);
    if (/\s/.test(value)) throw new Error(`${key} contains whitespace — keep comments on their own line.`);
    return value;
  };
}

function providerConfigs(read) {
  const providers = [];

  const googleId = read('GOOGLE_OAUTH_CLIENT_ID');
  const googleSecret = read('GOOGLE_OAUTH_CLIENT_SECRET');
  if (googleSecret && !googleId) throw new Error('GOOGLE_OAUTH_CLIENT_SECRET is set without GOOGLE_OAUTH_CLIENT_ID.');
  if (googleId) {
    if (!GOOGLE_CLIENT_ID.test(googleId)) {
      throw new Error('GOOGLE_OAUTH_CLIENT_ID is not a Google OAuth client ID (<digits>-<id>.apps.googleusercontent.com).');
    }
    providers.push({
      name: 'Google', detail: `client ${googleId}`, idKey: 'external_google_client_id',
      secretKey: 'external_google_secret', secretVar: 'GOOGLE_OAUTH_CLIENT_SECRET', secret: googleSecret,
      settings: { external_google_enabled: true, external_google_client_id: googleId, external_google_email_optional: false },
    });
  }

  // Entra issues lower-case GUIDs, and GoTrue compares the token's aud and iss with these strings.
  const azureId = read('AZURE_OAUTH_CLIENT_ID').toLowerCase();
  const tenant = read('AZURE_TENANT_ID').toLowerCase();
  const azureSecret = read('AZURE_OAUTH_CLIENT_SECRET');
  if (azureSecret && !azureId) throw new Error('AZURE_OAUTH_CLIENT_SECRET is set without AZURE_OAUTH_CLIENT_ID.');
  if (azureId || tenant) {
    if (!azureId || !tenant) throw new Error('Microsoft needs both AZURE_OAUTH_CLIENT_ID and AZURE_TENANT_ID.');
    for (const [key, value] of [['AZURE_OAUTH_CLIENT_ID', azureId], ['AZURE_TENANT_ID', tenant]]) {
      if (!GUID.test(value) || /^[0-]+$/.test(value)) {
        throw new Error(`${key} must be the GUID from Entra → App registrations → Overview (never "common" or "organizations").`);
      }
    }
    providers.push({
      name: 'Microsoft', detail: `tenant ${tenant}`, idKey: 'external_azure_client_id',
      secretKey: 'external_azure_secret', secretVar: 'AZURE_OAUTH_CLIENT_SECRET', secret: azureSecret,
      settings: {
        external_azure_enabled: true,
        external_azure_client_id: azureId,
        // A tenant URL makes GoTrue accept only ID tokens issued by this tenant.
        external_azure_url: `https://login.microsoftonline.com/${tenant}`,
        external_azure_email_optional: false,
      },
    });
  }
  return providers;
}

function parseSessions(value) {
  const parts = value.split(',').map(s => s.trim());
  const hours = parts.map(Number);
  if (parts.length !== 2 || parts.some(p => !/^\d+(\.\d+)?$/.test(p)) || hours.some(h => h > MAX_SESSION_HOURS)) {
    throw new Error(`--sessions takes <timeboxHours>,<inactivityHours>, each 0–${MAX_SESSION_HOURS} (0 = off).`);
  }
  return { sessions_timebox: hours[0], sessions_inactivity_timeout: hours[1] };
}

function optInSettings(opts) {
  const settings = {};
  if (opts.requireCurrentPassword) settings.security_update_password_require_current_password = true;
  if (opts.hibp) settings.password_hibp_enabled = true;
  if (opts.sessions) Object.assign(settings, parseSessions(opts.sessions));
  return settings;
}

function readToken(tokenFile) {
  if (tokenFile) assertNotCommittable(tokenFile);
  const token = tokenFile ? readFileSync(tokenFile, 'utf8').trim() : process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (!token) throw new Error('Set SUPABASE_ACCESS_TOKEN or pass --token-file <path>.');
  SECRETS.add(token);
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

// The API reports a provider secret only as a hex HMAC-SHA256 keyed by the
// project ref (what `supabase config push` diffs against), so a local secret
// can be compared with the live one without either being shown or sent.
function secretState(live, local) {
  if (!live) return 'none';
  if (!local) return 'set';
  if (live === local || live === createHmac('sha256', PROJECT_REF).update(local).digest('hex')) return 'match';
  return /^[0-9a-f]{64}$/.test(live) ? 'differs' : 'set';
}

function planSecrets(providers, current, patch, rotate) {
  const secretPatch = {};
  for (const p of providers) {
    const state = secretState(current[p.secretKey], p.secret);
    if (rotate) {
      if (!p.secret) throw new Error(`--rotate-secrets: ${p.secretVar} is not set.`);
      if (state !== 'match') secretPatch[p.secretKey] = p.secret;
    } else if (state === 'none') {
      throw new Error(`${p.name}: the project has no client secret yet — set ${p.secretVar} and add --rotate-secrets.`);
    } else if (p.idKey in patch && current[p.idKey]) {
      throw new Error(`${p.name}: the client ID changes — add --rotate-secrets so the new client's secret goes with it.`);
    }
  }
  return secretPatch;
}

function show(key, value) {
  if (SENSITIVE.test(key)) return value ? '«hidden»' : 'null';
  if (typeof value !== 'string') return JSON.stringify(value);
  return value.length > 70 ? `${value.length} chars` : JSON.stringify(value);
}

function scrub(text) {
  let out = String(text);
  for (const secret of SECRETS) out = out.split(secret).join('«hidden»');
  return out;
}

function secretNote(p, state, rotating) {
  switch (state) {
    case 'none': return 'no client secret live';
    case 'match': return `the live client secret matches ${p.secretVar}`;
    case 'differs': return `the live client secret differs from ${p.secretVar}${rotating ? '' : ' (add --rotate-secrets to send it)'}`;
    default: return p.secret ? `a client secret is live (not comparable with ${p.secretVar})` : 'a client secret is live';
  }
}

function report(providers, current, opts) {
  for (const p of providers) {
    const note = secretNote(p, secretState(current[p.secretKey], p.secret), opts.rotateSecrets);
    console.log(`${p.name}: managed (${p.detail}); ${note}.`);
  }
  for (const [name, idVar, flag] of [['Google', 'GOOGLE_OAUTH_CLIENT_ID', 'external_google_enabled'],
                                     ['Microsoft', 'AZURE_OAUTH_CLIENT_ID', 'external_azure_enabled']]) {
    if (!providers.some(p => p.name === name)) {
      console.log(`${name}: not managed (${idVar} unset); live: ${current[flag] ? 'enabled' : 'disabled'}.`);
    }
  }

  const onOff = value => (value ? 'on' : 'off');
  const hours = value => (value ? `${value} h` : 'off');
  console.log('Opt-in settings (changed only by their flag):');
  console.log(`  require current password: ${onOff(current.security_update_password_require_current_password)}   --require-current-password`);
  console.log(`  leaked-password check:    ${onOff(current.password_hibp_enabled)}   --hibp (Pro)`);
  console.log(`  session time-box / idle:  ${hours(current.sessions_timebox)} / ${hours(current.sessions_inactivity_timeout)}   --sessions (Pro)`);
  if (opts.hibp || opts.sessions) {
    console.log('Note: --hibp and --sessions need the Pro plan; on Free the API may refuse the whole PATCH,');
    console.log('      so apply the base settings first and these in a run of their own.');
  }
  if (opts.sessions) console.log('Note: --sessions applies to both admins: /admin and /app share one session.');
  if (opts.requireCurrentPassword) {
    console.log('Note: --require-current-password: a signed-in password change must send current_password');
    console.log('      (accounts without a password and sessions opened from an emailed link are exempt).');
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(USAGE);
    return;
  }

  // Everything local is validated before the token is read or the API called.
  const fileValues = opts.secretFile ? readSecretFile(opts.secretFile) : {};
  const providers = providerConfigs(makeReader(fileValues, opts.secretFile));
  if (opts.rotateSecrets && !providers.length) {
    throw new Error('--rotate-secrets: no provider configured (GOOGLE_OAUTH_CLIENT_ID, or AZURE_OAUTH_CLIENT_ID + AZURE_TENANT_ID).');
  }
  const wanted = { ...SETTINGS, ...optInSettings(opts), ...loadTemplates() };
  for (const p of providers) Object.assign(wanted, p.settings);

  const token = readToken(opts.tokenFile);
  const current = await api(token, 'GET');

  for (const [key, min] of Object.entries(MINIMUMS)) wanted[key] = Math.max(current[key] ?? 0, min);
  const allow = (current.uri_allow_list || '').split(',').map(s => s.trim()).filter(Boolean);
  const addedUrls = REDIRECT_URLS.filter(u => !allow.includes(u));
  wanted.uri_allow_list = [...allow, ...addedUrls].join(',');

  const patch = {};
  for (const [key, value] of Object.entries(wanted)) {
    if (current[key] !== value) patch[key] = value;
  }
  const secretPatch = planSecrets(providers, current, patch, opts.rotateSecrets);

  console.log(`${opts.apply ? 'Applying to' : 'Dry run against'} project ${PROJECT_REF}.`);
  console.log(`SMTP: ${current.smtp_host ? `${current.smtp_host}:${current.smtp_port} as ${current.smtp_admin_email}` : 'NOT configured (built-in mailer)'}`);
  report(providers, current, opts);

  const keys = Object.keys(patch);
  const secretKeys = Object.keys(secretPatch);
  if (!keys.length && !secretKeys.length) {
    console.log('Auth config already matches the repo. Nothing to do.');
    return;
  }
  console.log('Changes:');
  for (const key of keys) {
    if (key === 'uri_allow_list') {
      console.log(`  uri_allow_list: + ${addedUrls.join(', ') || 'nothing (only re-joined)'}`);
    } else {
      console.log(`  ${key}: ${show(key, current[key] ?? null)} → ${show(key, patch[key])}`);
    }
  }
  for (const key of secretKeys) {
    const p = providers.find(x => x.secretKey === key);
    console.log(`  ${key}: ${show(key, current[key])} → «value of ${p.secretVar}»`);
  }
  if (!opts.apply) {
    console.log('Dry run — re-run with --apply to write these.');
    return;
  }

  const after = await api(token, 'PATCH', { ...patch, ...secretPatch });
  const drift = keys.filter(k => after[k] !== patch[k]);
  const unstored = secretKeys.filter(k => !after[k]);
  if (drift.length || unstored.length) {
    throw new Error(`PATCH returned different values for: ${[...drift, ...unstored].join(', ')}`);
  }
  console.log(`Applied ${keys.length + secretKeys.length} field(s).`);
}

main().catch(err => {
  const cause = err?.cause ? ` (${err.cause.message ?? err.cause})` : '';
  console.error(`apply-auth-email: ${scrub(`${err?.message ?? err}${cause}`)}`);
  process.exitCode = 1;
});
