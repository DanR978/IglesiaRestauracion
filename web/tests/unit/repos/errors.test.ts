// S22b — repos/errors: the ONE mapping from Supabase / fetch failures to a
// RepoError (ADR-0004, D-032). Samples mirror what the real libraries build
// (postgrest-js, storage-js, auth-js 2.112): postgrest-js resolves a failed
// fetch to `{ message: 'TypeError: …', code: '' }` with response status 0,
// storage-js puts the body's status in `statusCode`, auth-js errors carry a
// snake_case `code` and an HTTP `status`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  REPO_ERROR_MESSAGES,
  fail,
  invalid,
  noCount,
  noRows,
  ok,
  toRepoError,
} from '#lib/repos/errors.js';
import type { RepoErrorKind } from '#lib/repos/types.js';

const authError = (name: string, code: string | undefined, status: number, message = 'x') =>
  Object.assign(new Error(message), { name, code, status, __isAuthError: true });

const storageError = (message: string, status: number, statusCode: string, code?: string) =>
  Object.assign(new Error(message), {
    name: 'StorageApiError',
    status,
    statusCode,
    code,
    __isStorageError: true,
  });

const TOO_MANY = 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.';

describe('repos/errors — toRepoError', () => {
  describe('no answer at all → network', () => {
    it.each([
      {
        label: 'postgrest-js: the fetch rejected (response status 0)',
        raw: { message: 'TypeError: Failed to fetch', details: 'TypeError: …', hint: '', code: '' },
        status: 0,
      },
      {
        label: 'Node / undici during a prerender',
        raw: { message: 'TypeError: fetch failed', code: '' },
        status: 0,
      },
      {
        label: 'Firefox wording, no status passed',
        raw: { message: 'TypeError: NetworkError when attempting to fetch resource.' },
      },
      { label: 'Safari wording, no status passed', raw: { message: 'TypeError: Load failed' } },
      {
        label: 'postgrest-js: an aborted request',
        raw: { message: 'AbortError: The user aborted a request.', code: '' },
        status: 0,
      },
      { label: 'a thrown TypeError', raw: new TypeError('Failed to fetch') },
      {
        label: 'an AbortSignal.timeout()',
        raw: Object.assign(new Error('signal timed out'), { name: 'TimeoutError' }),
      },
      {
        label: 'auth-js: retryable fetch error, offline',
        raw: authError('AuthRetryableFetchError', undefined, 0, 'Failed to fetch'),
      },
      {
        label: 'auth-js: retryable fetch error, gateway 503',
        raw: authError('AuthRetryableFetchError', undefined, 503, 'Service Unavailable'),
      },
      {
        label: 'storage-js: unknown error wrapping a failed fetch',
        raw: Object.assign(new Error('Failed to fetch'), { name: 'StorageUnknownError' }),
      },
      {
        label: 'Chrome: the body read failed (a bare TypeError)',
        raw: new TypeError('network error'),
      },
      {
        label: 'Chrome: the body read failed, as postgrest-js words it',
        raw: { message: 'TypeError: network error', code: '' },
      },
      {
        label: 'WebKit: the connection dropped mid-request',
        raw: new TypeError('The network connection was lost.'),
      },
      {
        label: 'WebKit: the connection dropped, as postgrest-js words it',
        raw: { message: 'TypeError: The network connection was lost.', code: '' },
      },
      {
        label: 'storage-js: a wrapped fetch TypeError, whatever its wording',
        raw: Object.assign(new Error('net::ERR_HTTP2_PROTOCOL_ERROR'), {
          name: 'StorageUnknownError',
          originalError: new TypeError('net::ERR_HTTP2_PROTOCOL_ERROR'),
          __isStorageError: true,
        }),
      },
    ])('$label', ({ raw, status }) => {
      expect(toRepoError(raw, status).kind).toBe('network');
    });

    it('"network error" inside a server message that carries a code is not a dropped connection', () => {
      expect(
        toRepoError({ message: 'could not log the network error for job 7', code: '42501' }).kind,
      ).toBe('forbidden');
      expect(toRepoError({ message: 'upstream network error, retry later' }, 500).kind).toBe(
        'unknown',
      );
    });

    it('a StorageUnknownError wrapping anything but a TypeError is not a network failure', () => {
      const raw = Object.assign(new Error('Unexpected token < in JSON'), {
        name: 'StorageUnknownError',
        originalError: new SyntaxError('Unexpected token < in JSON'),
      });
      expect(toRepoError(raw).kind).toBe('unknown');
    });
  });

  describe('PostgREST and Postgres codes decide on their own', () => {
    it.each([
      { code: 'PGRST116', status: 406, kind: 'not_found' },
      { code: 'PGRST301', status: 401, kind: 'auth' },
      { code: 'PGRST303', status: 401, kind: 'auth' },
      { code: 'PGRST000', status: 503, kind: 'network' },
      { code: 'PGRST003', status: 504, kind: 'network' },
      { code: 'PGRST100', status: 400, kind: 'invalid' },
      // A missing table / RPC is a deploy bug, not "not found", whatever the HTTP status says.
      { code: 'PGRST205', status: 404, kind: 'unknown' },
      { code: 'PGRST202', status: 404, kind: 'unknown' },
      { code: '42P01', status: 404, kind: 'unknown' },
      { code: '42703', status: 400, kind: 'unknown' },
      { code: '42883', status: 404, kind: 'unknown' },
      // RLS and grants — PostgREST answers 401 for anon and 403 for a signed-in role.
      { code: '42501', status: 403, kind: 'forbidden' },
      { code: '42501', status: 401, kind: 'forbidden' },
      { code: '23505', status: 409, kind: 'conflict' },
      { code: '23503', status: 409, kind: 'conflict' },
      { code: '40001', status: 500, kind: 'conflict' },
      { code: '22P02', status: 400, kind: 'invalid' },
      { code: '22001', status: 400, kind: 'invalid' },
      { code: '23502', status: 400, kind: 'invalid' },
      { code: '23514', status: 400, kind: 'invalid' },
      { code: 'P0001', status: 400, kind: 'invalid' },
      { code: 'P0002', status: 400, kind: 'not_found' },
      { code: '08006', status: 503, kind: 'network' },
      { code: '28P01', status: 500, kind: 'auth' },
      { code: '57014', status: 500, kind: 'unknown' },
    ] satisfies { code: string; status: number; kind: RepoErrorKind }[])(
      '$code (HTTP $status) → $kind',
      ({ code, status, kind }) => {
        expect(toRepoError({ message: 'x', code, details: null, hint: null }, status).kind).toBe(
          kind,
        );
      },
    );
  });

  describe('GoTrue (auth-js) errors', () => {
    it.each([
      { code: 'invalid_credentials', status: 400, kind: 'auth' },
      { code: 'session_not_found', status: 403, kind: 'auth' },
      { code: 'refresh_token_not_found', status: 400, kind: 'auth' },
      { code: 'insufficient_aal', status: 403, kind: 'auth' },
      { code: 'mfa_verification_failed', status: 422, kind: 'auth' },
      { code: 'otp_expired', status: 403, kind: 'auth' },
      { code: 'signup_disabled', status: 422, kind: 'forbidden' },
      { code: 'user_banned', status: 403, kind: 'forbidden' },
      { code: 'user_not_found', status: 404, kind: 'not_found' },
      { code: 'email_exists', status: 422, kind: 'conflict' },
      { code: 'mfa_factor_name_conflict', status: 422, kind: 'conflict' },
      { code: 'weak_password', status: 422, kind: 'invalid' },
      { code: 'same_password', status: 422, kind: 'invalid' },
      { code: 'request_timeout', status: 504, kind: 'network' },
      { code: 'over_request_rate_limit', status: 429, kind: 'unknown' },
    ] satisfies { code: string; status: number; kind: RepoErrorKind }[])(
      '$code → $kind',
      ({ code, status, kind }) => {
        expect(toRepoError(authError('AuthApiError', code, status)).kind).toBe(kind);
      },
    );

    it('an unlisted code falls back to its HTTP status', () => {
      const raw = authError('AuthApiError', 'hook_payload_over_size_limit', 413);
      expect(toRepoError(raw).kind).toBe('invalid');
    });

    it('code-less auth-js errors are classified by name, not by their 400/500 status', () => {
      expect(toRepoError(authError('AuthSessionMissingError', undefined, 400)).kind).toBe('auth');
      expect(toRepoError(authError('AuthPKCEGrantCodeExchangeError', undefined, 500)).kind).toBe(
        'auth',
      );
      expect(toRepoError(authError('AuthInvalidJwtError', 'invalid_jwt', 400)).kind).toBe('auth');
      expect(
        toRepoError(
          authError('AuthPKCECodeVerifierMissingError', 'pkce_code_verifier_not_found', 400),
        ).kind,
      ).toBe('auth');
    });
  });

  describe('Storage API errors', () => {
    it('reads the body statusCode before the HTTP status (an upload refused by RLS)', () => {
      const raw = storageError('new row violates row-level security policy', 400, '403');
      expect(toRepoError(raw)).toEqual({
        kind: 'forbidden',
        message: REPO_ERROR_MESSAGES.forbidden,
        detail: '403: new row violates row-level security policy',
      });
    });

    it.each([
      { message: 'Object not found', status: 400, statusCode: '404', kind: 'not_found' },
      { message: 'The resource already exists', status: 400, statusCode: '409', kind: 'conflict' },
      { message: 'Payload too large', status: 413, statusCode: '413', kind: 'invalid' },
      { message: 'Internal Server Error', status: 500, statusCode: '500', kind: 'unknown' },
    ] satisfies { message: string; status: number; statusCode: string; kind: RepoErrorKind }[])(
      'statusCode $statusCode → $kind',
      ({ message, status, statusCode, kind }) => {
        expect(toRepoError(storageError(message, status, statusCode)).kind).toBe(kind);
      },
    );

    it('uses the Storage error code when the body had one', () => {
      expect(toRepoError(storageError('Object not found', 400, '404', 'NoSuchKey')).kind).toBe(
        'not_found',
      );
      expect(toRepoError(storageError('Duplicate', 400, '409', 'KeyAlreadyExists')).kind).toBe(
        'conflict',
      );
      // No `statusCode` in the body: storage-js falls back to the code.
      expect(toRepoError(storageError('jwt expired', 400, 'InvalidJWT')).kind).toBe('auth');
    });

    it('the body status decides even when it maps to nothing — the 400 envelope never does', () => {
      expect(toRepoError(storageError('Internal Server Error', 400, '500')).kind).toBe('unknown');
      expect(toRepoError(storageError('slow down', 400, '429')).message).toBe(TOO_MANY);
    });
  });

  describe('HTTP status alone', () => {
    it.each([
      { status: 401, kind: 'auth' },
      { status: 403, kind: 'forbidden' },
      { status: 404, kind: 'not_found' },
      { status: 409, kind: 'conflict' },
      { status: 400, kind: 'invalid' },
      { status: 422, kind: 'invalid' },
      { status: 408, kind: 'network' },
      { status: 502, kind: 'network' },
      { status: 503, kind: 'network' },
      { status: 504, kind: 'network' },
      { status: 522, kind: 'network' },
      { status: 500, kind: 'unknown' },
      { status: 429, kind: 'unknown' },
      { status: 200, kind: 'unknown' },
    ] satisfies { status: number; kind: RepoErrorKind }[])(
      '$status → $kind',
      ({ status, kind }) => {
        expect(toRepoError({ message: 'x' }, status).kind).toBe(kind);
      },
    );
  });

  describe('copy', () => {
    it('a kind renders its own copy', () => {
      expect(toRepoError({ message: 'x', code: '42501' })).toMatchObject({
        message: REPO_ERROR_MESSAGES.forbidden,
      });
      expect(toRepoError({ message: 'TypeError: Failed to fetch' }, 0)).toMatchObject({
        message: REPO_ERROR_MESSAGES.network,
      });
    });

    it('codes whose kind copy would mislead get their own', () => {
      const cases: [unknown, number | undefined, string][] = [
        [{ code: '23505', message: 'duplicate key' }, 409, 'Ya existe un registro con esos datos.'],
        [
          { code: '23503', message: 'fk violation' },
          409,
          'No se puede completar porque está vinculado a otros datos.',
        ],
        [
          authError('AuthApiError', 'invalid_credentials', 400),
          undefined,
          'Correo o contraseña incorrectos.',
        ],
        [
          authError('AuthApiError', 'weak_password', 422),
          undefined,
          'La contraseña es demasiado débil. Elige una más larga.',
        ],
        [authError('AuthApiError', 'over_email_send_rate_limit', 429), undefined, TOO_MANY],
        // A bare 429 from the gateway has no code: same copy, kind unknown.
        [{ message: 'Too Many Requests' }, 429, TOO_MANY],
      ];
      for (const [raw, status, message] of cases) {
        expect(toRepoError(raw, status).message).toBe(message);
      }
    });

    it('never renders the backend text', () => {
      const raws: [unknown, number | undefined][] = [
        [{ message: 'permission denied for table fin_income', code: '42501' }, 403],
        [
          { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' },
          406,
        ],
        [{ message: 'invalid input syntax for type uuid: "abc"', code: '22P02' }, 400],
        [{ message: 'TypeError: Failed to fetch', code: '' }, 0],
        [storageError('new row violates row-level security policy', 400, '403'), undefined],
        [
          authError('AuthApiError', 'invalid_credentials', 400, 'Invalid login credentials'),
          undefined,
        ],
        [{ message: 'something nobody mapped' }, 500],
      ];
      for (const [raw, status] of raws) {
        const { message, detail } = toRepoError(raw, status);
        const rawText = String((raw as { message: string }).message);
        expect(message).not.toContain(rawText);
        expect(detail).toContain(rawText);
      }
    });

    it('every kind has its own Spanish copy', () => {
      const kinds: RepoErrorKind[] = [
        'network',
        'auth',
        'forbidden',
        'not_found',
        'conflict',
        'invalid',
        'unknown',
      ];
      expect(Object.keys(REPO_ERROR_MESSAGES).sort()).toEqual([...kinds].sort());
      expect(new Set(Object.values(REPO_ERROR_MESSAGES)).size).toBe(kinds.length);
    });
  });

  describe('detail (console only)', () => {
    it('is the code, the raw message and the hint', () => {
      expect(
        toRepoError({
          message: 'permission denied for table events',
          code: '42501',
          hint: 'Grant the required privileges',
        }).detail,
      ).toBe('42501: permission denied for table events (Grant the required privileges)');
      expect(toRepoError({ message: 'boom' }).detail).toBe('boom');
      expect(toRepoError(storageError('Object not found', 400, '404', 'NoSuchKey')).detail).toBe(
        'NoSuchKey: Object not found',
      );
    });

    it('is omitted when the backend gave no text at all', () => {
      expect(toRepoError(undefined)).toEqual({
        kind: 'unknown',
        message: REPO_ERROR_MESSAGES.unknown,
      });
      expect(toRepoError(null)).not.toHaveProperty('detail');
    });
  });

  it('never throws, whatever it is handed', () => {
    for (const raw of [
      undefined,
      null,
      '',
      'boom',
      42,
      true,
      {},
      { message: 42 },
      [],
      new Error(),
    ]) {
      expect(() => toRepoError(raw)).not.toThrow();
      expect(toRepoError(raw).kind).toBe('unknown');
    }
    expect(toRepoError('boom')).toEqual({
      kind: 'unknown',
      message: REPO_ERROR_MESSAGES.unknown,
      detail: 'boom',
    });
  });
});

describe('repos/errors — result helpers', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it('fail() maps, logs the raw detail once under the module tag, returns the failure', () => {
    const res = fail(
      '[gallery]',
      'fetchAlbums',
      { message: 'permission denied', code: '42501' },
      403,
    );
    expect(res).toEqual({
      ok: false,
      error: {
        kind: 'forbidden',
        message: REPO_ERROR_MESSAGES.forbidden,
        detail: '42501: permission denied',
      },
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('[gallery] fetchAlbums:', '42501: permission denied');
  });

  it('fail() logs the copy when the backend gave no text', () => {
    fail('[events]', 'fetchEventById', undefined);
    expect(warn).toHaveBeenCalledWith('[events] fetchEventById:', REPO_ERROR_MESSAGES.unknown);
  });

  it('invalid() refuses before the network: kind invalid, the given copy, nothing logged', () => {
    expect(invalid('Mes inválido.')).toEqual({
      ok: false,
      error: { kind: 'invalid', message: 'Mes inválido.' },
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('noRows() is a logged not_found failure — a write that changed nothing (D-027)', () => {
    expect(noRows('[treasury]', 'deleteFund')).toEqual({
      ok: false,
      error: {
        kind: 'not_found',
        message: REPO_ERROR_MESSAGES.not_found,
        detail: 'no row was affected',
      },
    });
    expect(warn).toHaveBeenCalledWith('[treasury] deleteFund:', 'no row was affected');
  });

  it('noCount() is a logged failure — a head count without a number is never 0 (S40)', () => {
    expect(noCount('[gallery]', 'countAlbums')).toEqual({
      ok: false,
      error: {
        kind: 'unknown',
        message: REPO_ERROR_MESSAGES.unknown,
        detail: 'the response carried no count',
      },
    });
    expect(warn).toHaveBeenCalledWith('[gallery] countAlbums:', 'the response carried no count');
  });

  it('ok() is the success branch, whatever the data', () => {
    expect(ok([])).toEqual({ ok: true, data: [] });
    expect(ok(null)).toEqual({ ok: true, data: null });
    expect(ok(undefined)).toEqual({ ok: true, data: undefined });
  });
});
