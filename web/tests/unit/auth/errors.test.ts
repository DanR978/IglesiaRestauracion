// S38 — auth/errors: GoTrue code → Spanish copy (retires the DF-006
// js/pages/admin/auth-errors.js map) plus the OAuth callback codes (D-035).
// The copy is chosen by `code`, never by GoTrue's English message, and raw
// text never reaches `message`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTH_ERRORS,
  authErrorFromParams,
  authFail,
  authInvalid,
  toAuthError,
} from '#lib/auth/errors.js';
import { REPO_ERROR_MESSAGES } from '#lib/repos/errors.js';

const authError = (code: string | undefined, status = 400, message = 'English text from GoTrue') =>
  Object.assign(new Error(message), { name: 'AuthApiError', code, status, __isAuthError: true });

describe('auth/errors', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  describe('the legacy DF-006 codes keep their meaning', () => {
    it.each([
      ['invalid_credentials', 'Correo o contraseña incorrectos.', 'auth'],
      ['email_not_confirmed', 'Tu cuenta aún no está activada. Revisa tu correo.', 'auth'],
      ['user_banned', 'Esta cuenta está suspendida. Contacta al administrador.', 'forbidden'],
      [
        'mfa_verification_failed',
        'Código incorrecto o expirado. Revisa tu app e inténtalo de nuevo.',
        'auth',
      ],
      [
        'mfa_challenge_expired',
        'El código expiró. Escribe el código que muestra ahora tu app.',
        'auth',
      ],
      ['insufficient_aal', 'Confirma tu identidad con el código de tu app para continuar.', 'auth'],
      ['weak_password', 'La contraseña es muy débil. Usa al menos 8 caracteres.', 'invalid'],
      ['same_password', 'La nueva contraseña debe ser distinta de la actual.', 'invalid'],
      ['current_password_required', 'Escribe tu contraseña actual.', 'invalid'],
      [
        'too_many_enrolled_mfa_factors',
        'Tienes demasiados dispositivos registrados. Contacta al administrador.',
        'conflict',
      ],
      ['session_expired', 'Tu sesión expiró. Inicia sesión de nuevo.', 'auth'],
    ])('%s → %j (%s)', (code, message, kind) => {
      expect(toAuthError(authError(code))).toMatchObject({ code, message, kind });
    });

    it('GoTrue says current_password_invalid (not "…mismatch") for a wrong current password', () => {
      expect(toAuthError(authError('current_password_invalid'))).toMatchObject({
        kind: 'invalid',
        message: 'La contraseña actual no es correcta.',
      });
    });
  });

  describe('OAuth (D-035)', () => {
    it.each([
      ['signup_disabled', 'forbidden'],
      ['access_denied', 'forbidden'],
      ['provider_email_needs_verification', 'forbidden'],
      ['bad_oauth_state', 'auth'],
      ['bad_oauth_callback', 'auth'],
      ['flow_state_expired', 'auth'],
      ['flow_state_not_found', 'auth'],
      ['bad_code_verifier', 'auth'],
      ['pkce_code_verifier_not_found', 'auth'],
      ['validation_failed', 'invalid'],
    ])('%s has its own Spanish copy (%s)', (code, kind) => {
      const error = toAuthError(authError(code));
      expect(error.kind).toBe(kind);
      expect(error.message).toBe(AUTH_ERRORS[code].message);
      expect(error.message).not.toMatch(/English|GoTrue/);
    });

    it('signup_disabled says the account was not invited — no detail on why', () => {
      expect(AUTH_ERRORS.signup_disabled.message).toBe(
        'No hay ninguna cuenta invitada con ese correo. Entra con el correo con el que te invitaron.',
      );
    });

    it('a missing PKCE verifier asks to start again in the same browser', () => {
      expect(toAuthError(authError('pkce_code_verifier_not_found')).message).toMatch(
        /mismo navegador/,
      );
    });
  });

  describe('two-step verification codes', () => {
    it.each(Object.keys(AUTH_ERRORS).filter((code) => code.startsWith('mfa_')))(
      '%s is mapped to Spanish copy',
      (code) => {
        expect(toAuthError(authError(code)).message).toBe(AUTH_ERRORS[code].message);
      },
    );
  });

  describe('fallbacks', () => {
    it('an unmapped code falls back to the copy of its kind', () => {
      expect(toAuthError(authError('some_new_code', 403))).toMatchObject({
        kind: 'forbidden',
        message: REPO_ERROR_MESSAGES.forbidden,
        code: 'some_new_code',
      });
    });

    it('a dropped connection is network, with no code', () => {
      const offline = Object.assign(new Error('Failed to fetch'), {
        name: 'AuthRetryableFetchError',
        status: 0,
      });
      expect(toAuthError(offline)).toMatchObject({
        kind: 'network',
        message: REPO_ERROR_MESSAGES.network,
        code: null,
      });
    });

    it('a rate limit keeps the "Demasiados intentos" copy', () => {
      expect(toAuthError(authError('over_request_rate_limit', 429)).message).toBe(
        'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
      );
    });

    it('the raw English text stays in `detail`, never in `message`', () => {
      const error = toAuthError(authError('invalid_credentials', 400, 'Invalid login credentials'));
      expect(error.detail).toBe('invalid_credentials: Invalid login credentials');
      expect(error.message).not.toContain('Invalid');
    });
  });

  describe('helpers', () => {
    it('authFail logs the raw detail once under [auth] and returns the failure', () => {
      const res = authFail('signInWithPassword', authError('invalid_credentials', 400, 'nope'));
      expect(res.ok).toBe(false);
      expect(res.error.code).toBe('invalid_credentials');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith('[auth] signInWithPassword:', 'invalid_credentials: nope');
    });

    it('authInvalid refuses before the network: kind invalid, no code, nothing logged', () => {
      expect(authInvalid('Escribe tu correo.')).toEqual({
        ok: false,
        error: { kind: 'invalid', message: 'Escribe tu correo.', code: null },
      });
      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe('authErrorFromParams (OAuth callback / email link URL)', () => {
    it('reads error_code first, then error', () => {
      const params = new URLSearchParams(
        'error=access_denied&error_code=signup_disabled&error_description=Signups+not+allowed',
      );
      expect(authErrorFromParams(params)).toMatchObject({
        code: 'signup_disabled',
        kind: 'forbidden',
        message: AUTH_ERRORS.signup_disabled.message,
      });
      expect(authErrorFromParams(new URLSearchParams('error=access_denied'))?.code).toBe(
        'access_denied',
      );
    });

    it('the provider description goes to the console only', () => {
      const error = authErrorFromParams(
        new URLSearchParams('error=server_error&error_description=AADSTS50020:+user+x@y'),
      );
      expect(error?.message).toBe(REPO_ERROR_MESSAGES.unknown);
      expect(error?.message).not.toContain('AADSTS');
      expect(warn).toHaveBeenCalledWith('[auth] callback:', 'server_error: AADSTS50020: user x@y');
    });

    it('an expired email link has its own copy', () => {
      expect(
        authErrorFromParams(new URLSearchParams('error=access_denied&error_code=otp_expired'))
          ?.message,
      ).toBe('El enlace expiró o ya se usó. Pide uno nuevo.');
    });

    it('no error in the URL is null', () => {
      expect(authErrorFromParams(new URLSearchParams('code=abc'))).toBeNull();
      expect(warn).not.toHaveBeenCalled();
    });
  });
});
