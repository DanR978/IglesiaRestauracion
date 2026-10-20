// js/pages/admin/auth-errors.js
// ─────────────────────────────────────────────────────────────────────────────
// Spanish messages for Supabase Auth errors, shared by the sign-in and MFA
// screens (auth.js) and Mi cuenta (account.js). Error codes first (stable),
// message substrings as a fallback for older responses. Raw text never reaches
// the screen — only the console.
//
// Its own module rather than an export of auth.js: for a few minutes after a
// deploy a browser may still hold the previous auth.js, and a module importing
// a name that copy lacks fails to load (blank panel).
//
// Usage:
//   import { spanishError } from './auth-errors.js';
//   setErr('authError', spanishError(error));
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_ERROR_ES = {
  invalid_credentials:           'Correo o contraseña incorrectos.',
  email_not_confirmed:           'Tu cuenta aún no ha sido activada. Revisa tu correo.',
  over_request_rate_limit:       'Demasiados intentos. Espera unos minutos e intenta de nuevo.',
  over_email_send_rate_limit:    'Demasiados intentos. Espera unos minutos e intenta de nuevo.',
  mfa_verification_failed:       'Código incorrecto o expirado. Revisa tu app e intenta de nuevo.',
  mfa_challenge_expired:         'El código expiró. Escribe el código que muestra ahora tu app.',
  mfa_verification_rejected:     'No se pudo verificar el código. Intenta de nuevo.',
  mfa_factor_name_conflict:      'No se pudo registrar el dispositivo. Intenta de nuevo.',
  too_many_enrolled_mfa_factors: 'Tienes demasiados dispositivos registrados. Contacta al administrador.',
  insufficient_aal:              'Confirma tu identidad con el código de tu app para continuar.',
  weak_password:                 'La contraseña es muy débil. Usa al menos 8 caracteres.',
  same_password:                 'La nueva contraseña debe ser distinta a la anterior.',
  current_password_required:     'Escribe tu contraseña actual.',
  current_password_invalid:      'La contraseña actual no es correcta.',
  session_not_found:             'Tu sesión expiró. Vuelve a abrir el enlace o pide uno nuevo.',
  session_expired:               'Tu sesión expiró. Inicia sesión de nuevo.',
  mfa_step_not_ready:            'No se pudo preparar la verificación. Intenta de nuevo.',
  user_banned:                   'Esta cuenta está suspendida. Contacta al administrador.',
};

export function spanishError(err) {
  if (err?.code && AUTH_ERROR_ES[err.code]) return AUTH_ERROR_ES[err.code];
  const m = (err?.message || String(err) || '').toLowerCase();
  if (m.includes('invalid login') || m.includes('invalid credentials'))
    return 'Correo o contraseña incorrectos.';
  if (m.includes('email not confirmed'))
    return 'Tu cuenta aún no ha sido activada. Revisa tu correo.';
  if (m.includes('too many') || m.includes('rate limit'))
    return 'Demasiados intentos. Espera unos minutos e intenta de nuevo.';
  if (m.includes('totp') || m.includes('invalid code') ||
      m.includes('challenge') || m.includes('factor'))
    return 'Código incorrecto o expirado. Revisa tu app e intenta de nuevo.';
  if (m.includes('weak password') || m.includes('at least') || m.includes('6 characters'))
    return 'La contraseña es muy débil. Usa al menos 8 caracteres.';
  if (m.includes('different from the old') || m.includes('should be different'))
    return 'La nueva contraseña debe ser distinta a la anterior.';
  if (m.includes('network') || m.includes('failed to fetch'))
    return 'Error de conexión. Revisa tu internet e intenta de nuevo.';
  if (m.includes('not allowed') || m.includes('disabled'))
    return 'Esta operación no está permitida.';
  if (m.includes('session missing') || m.includes('session not found') ||
      m.includes('session_not_found'))
    return 'Tu sesión expiró. Vuelve a abrir el enlace o pide uno nuevo.';
  console.warn('[auth] unmapped error:', err?.code || '', err?.message || err);
  return 'Ocurrió un error inesperado. Intenta de nuevo.';
}
