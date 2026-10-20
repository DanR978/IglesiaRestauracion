// S39 — the OAuth callback (D-035): what GoTrue sends back to acceso/oauth/
// and the Spanish each failure shows. Mapped by GoTrue's code, never by its
// English description, which reaches the console only.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CALLBACK_COPY,
  callbackErrorMessage,
  readCallback,
} from '#lib/components/admin/auth/oauth-callback.js';

const params = (query: string) => new URLSearchParams(query);

describe('callbackErrorMessage', () => {
  it('signup_disabled: no invitation, or the provider did not confirm the email', () => {
    expect(callbackErrorMessage('signup_disabled', 'access_denied')).toBe(
      'Esta cuenta no tiene una invitación vigente, o el proveedor no confirmó tu correo. Pide una invitación al administrador.',
    );
    expect(callbackErrorMessage('provider_email_needs_verification', 'access_denied')).toBe(
      CALLBACK_COPY.noInvitation,
    );
  });

  it('access_denied without a GoTrue code: the person cancelled at the provider', () => {
    expect(callbackErrorMessage(null, 'access_denied')).toBe('Cancelaste el inicio de sesión.');
  });

  it.each([
    'bad_oauth_state',
    'bad_oauth_callback',
    'flow_state_not_found',
    'flow_state_expired',
    'bad_code_verifier',
  ])('%s: the attempt expired', (code) => {
    expect(callbackErrorMessage(code, 'invalid_request')).toBe(
      'El enlace de inicio de sesión expiró. Inténtalo de nuevo.',
    );
  });

  it('a missing code verifier: open it in the browser that started', () => {
    expect(callbackErrorMessage('pkce_code_verifier_not_found')).toBe(
      'Abre el enlace en el mismo navegador donde iniciaste sesión.',
    );
  });

  it('a suspended account says so', () => {
    expect(callbackErrorMessage('user_banned', 'access_denied')).toBe(
      'Esta cuenta está suspendida. Contacta al administrador.',
    );
  });

  it.each([
    ['a provider error', null, 'server_error'],
    ['an unknown GoTrue code', 'something_new', 'access_denied'],
    ['nothing at all', null, null],
  ])('%s gets the generic message', (_label, code, error) => {
    expect(callbackErrorMessage(code, error)).toBe(CALLBACK_COPY.generic);
  });
});

describe('readCallback', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it('a code to exchange', () => {
    expect(readCallback(params('code=0f1e2d&state=x'))).toEqual({ kind: 'code', code: '0f1e2d' });
  });

  it('nothing at all', () => {
    expect(readCallback(params(''))).toEqual({ kind: 'none' });
  });

  it('a GoTrue refusal maps by error_code', () => {
    expect(
      readCallback(
        params(
          'error=access_denied&error_code=signup_disabled&error_description=Signups+not+allowed+for+this+instance',
        ),
      ),
    ).toEqual({ kind: 'error', code: 'signup_disabled', message: CALLBACK_COPY.noInvitation });
  });

  it('a provider cancel has no error_code', () => {
    expect(
      readCallback(params('error=access_denied&error_description=The+user+denied+the+request')),
    ).toEqual({ kind: 'error', code: 'access_denied', message: CALLBACK_COPY.cancelled });
  });

  it('an error wins over a code', () => {
    expect(readCallback(params('code=abc&error=server_error')).kind).toBe('error');
  });

  it('logs the raw description and never puts it in the message', () => {
    const outcome = readCallback(
      params('error=server_error&error_description=Unable+to+exchange+external+code%3A+4%2F0Ab'),
    );
    expect(outcome.kind === 'error' && outcome.message).toBe(CALLBACK_COPY.generic);
    expect(warn).toHaveBeenCalledWith(
      '[acceso] oauth:',
      'server_error: Unable to exchange external code: 4/0Ab',
    );
  });
});
