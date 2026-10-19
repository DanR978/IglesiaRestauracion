// S38 — auth/mfa: the port of js/pages/admin/mfa.js as fixed by DF-006
// (fix/DF-006-mandatory-mfa): status from a fresh factor list, a unique
// friendly name per enrollment, a challenge that accepts a code from ANY
// verified TOTP factor, Realtime re-authenticated after a verify, an
// additive replace that never leaves the account without a factor, and a
// cancel that only removes a still-unverified factor.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/db/client.js', () => import('./auth-client'));

import {
  auth,
  authError,
  factor,
  listFactorsAnswer,
  realtime,
  resetAuthClient,
} from './auth-client';
import {
  beginChallenge,
  beginEnroll,
  cancelEnroll,
  listFactors,
  mfaStatus,
  removeFactor,
  submitCode,
} from '#lib/auth/mfa.js';

const mfa = auth.mfa;
const aal = (currentLevel: string, nextLevel: string) => ({
  data: { currentLevel, nextLevel, currentAuthenticationMethods: [] },
  error: null,
});
const factors = (...list: ReturnType<typeof factor>[]) => listFactorsAnswer(list);
const failed = (code: string, status = 400) => ({ data: null, error: authError(code, status) });

describe('auth/mfa', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(async () => {
    resetAuthClient();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await cancelEnroll(); // no flow carried over from the previous test
    resetAuthClient();
  });
  afterEach(() => {
    warn.mockRestore();
    vi.useRealTimers();
  });

  describe('mfaStatus', () => {
    it('aal2 is ok, without reading the factors', async () => {
      expect(await mfaStatus()).toEqual({ ok: true, data: 'ok' });
      expect(mfa.listFactors).not.toHaveBeenCalled();
    });

    it('aal1 with a verified factor (any type) is a challenge', async () => {
      mfa.getAuthenticatorAssuranceLevel.mockResolvedValueOnce(aal('aal1', 'aal2') as never);
      mfa.listFactors.mockResolvedValueOnce(factors(factor('p', 'verified', 'phone')) as never);
      expect(await mfaStatus()).toEqual({ ok: true, data: 'challenge' });
    });

    it('aal1 with no verified factor is an enrollment — from the fresh list, not the cached level', async () => {
      mfa.getAuthenticatorAssuranceLevel.mockResolvedValueOnce(aal('aal1', 'aal2') as never);
      mfa.listFactors.mockResolvedValueOnce(factors(factor('u', 'unverified')) as never);
      expect(await mfaStatus()).toEqual({ ok: true, data: 'enroll' });
    });

    it('a failed read is a failure, never a status', async () => {
      mfa.getAuthenticatorAssuranceLevel.mockResolvedValueOnce(aal('aal1', 'aal1') as never);
      mfa.listFactors.mockResolvedValueOnce(failed('session_not_found', 403) as never);
      expect((await mfaStatus()).ok).toBe(false);
    });
  });

  describe('beginEnroll', () => {
    it('clears half-finished factors, then enrolls TOTP with a unique friendly name', async () => {
      mfa.listFactors.mockResolvedValueOnce(
        factors(factor('old-u', 'unverified'), factor('f-1', 'verified')) as never,
      );
      const res = await beginEnroll();
      expect(res).toEqual({
        ok: true,
        data: {
          factorId: 'f-new',
          qrCode: 'data:image/svg+xml;utf-8,<svg/>',
          secret: 'SECRET',
          uri: 'otpauth://x',
        },
      });
      expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: 'old-u' });
      expect(mfa.unenroll).not.toHaveBeenCalledWith({ factorId: 'f-1' });
      const [{ factorType, friendlyName }] = mfa.enroll.mock.calls[0] as unknown as [
        { factorType: string; friendlyName: string },
      ];
      expect(factorType).toBe('totp');
      expect(friendlyName).toMatch(/^IRD \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [a-z0-9]{1,4}$/);
    });

    it('two enrollments never share a name', async () => {
      await beginEnroll();
      await beginEnroll();
      const names = mfa.enroll.mock.calls.map(
        (c) => (c as unknown as [{ friendlyName: string }])[0].friendlyName,
      );
      expect(new Set(names).size).toBe(2);
    });

    it('keeps insufficient_aal as the code: a verified factor must be proved first', async () => {
      mfa.enroll.mockResolvedValueOnce(failed('insufficient_aal', 403) as never);
      const res = await beginEnroll();
      expect(res.ok === false && res.error.code).toBe('insufficient_aal');
    });
  });

  describe('beginChallenge + submitCode (challenge)', () => {
    it('ok(false) when there is no verified TOTP factor — enroll instead', async () => {
      mfa.listFactors.mockResolvedValueOnce(factors(factor('u', 'unverified')) as never);
      expect(await beginChallenge()).toEqual({ ok: true, data: false });
    });

    it('accepts a code from ANY verified factor (the second device too)', async () => {
      mfa.listFactors.mockResolvedValueOnce(
        factors(factor('phone-a', 'verified'), factor('phone-b', 'verified')) as never,
      );
      expect(await beginChallenge()).toEqual({ ok: true, data: true });
      mfa.challengeAndVerify
        .mockResolvedValueOnce(failed('mfa_verification_failed', 422) as never)
        .mockResolvedValueOnce({ data: {}, error: null } as never);
      expect(await submitCode(' 123456 ')).toEqual({ ok: true, data: { leftover: [] } });
      expect(mfa.challengeAndVerify.mock.calls).toEqual([
        [{ factorId: 'phone-a', code: '123456' }],
        [{ factorId: 'phone-b', code: '123456' }],
      ]);
    });

    it('hands Realtime the aal2 token after a verify', async () => {
      await beginChallenge();
      await submitCode('123456');
      expect(realtime.setAuth).toHaveBeenCalledWith('token-aal2');
    });

    it('stops at the first error that is not a wrong code (rate limit, network…)', async () => {
      mfa.listFactors.mockResolvedValueOnce(
        factors(factor('a', 'verified'), factor('b', 'verified')) as never,
      );
      await beginChallenge();
      mfa.challengeAndVerify.mockResolvedValueOnce(failed('over_request_rate_limit', 429) as never);
      const res = await submitCode('123456');
      expect(res.ok === false && res.error.code).toBe('over_request_rate_limit');
      expect(mfa.challengeAndVerify).toHaveBeenCalledTimes(1);
    });

    it('a wrong code on every factor is mfa_verification_failed, in Spanish', async () => {
      await beginChallenge();
      mfa.challengeAndVerify.mockResolvedValue(failed('mfa_verification_failed', 422) as never);
      const res = await submitCode('000000');
      expect(res.ok === false && res.error).toMatchObject({
        code: 'mfa_verification_failed',
        message: 'Código incorrecto o expirado. Revisa tu app e inténtalo de nuevo.',
      });
    });

    it('a challenge whose preparation failed is prepared again on submit', async () => {
      mfa.listFactors.mockResolvedValueOnce(failed('request_timeout', 504) as never);
      expect((await beginChallenge()).ok).toBe(false);
      expect(await submitCode('123456')).toEqual({ ok: true, data: { leftover: [] } });
      expect(mfa.listFactors).toHaveBeenCalledTimes(2);
    });

    it('refuses anything but six digits, before the network', async () => {
      await beginChallenge();
      for (const code of ['12345', '1234567', 'abcdef', '12 3456']) {
        expect(await submitCode(code)).toEqual({
          ok: false,
          error: { kind: 'invalid', message: 'Escribe el código de 6 dígitos.', code: null },
        });
      }
      expect(mfa.challengeAndVerify).not.toHaveBeenCalled();
    });

    it('a code with no step prepared is mfa_step_not_ready', async () => {
      const res = await submitCode('123456');
      expect(res.ok === false && res.error.code).toBe('mfa_step_not_ready');
    });
  });

  describe('enrollment and the additive replace', () => {
    it('verifies the new factor, then removes the ones it replaces', async () => {
      mfa.listFactors.mockResolvedValueOnce(factors(factor('old', 'verified')) as never);
      await beginEnroll({ replace: true });
      expect(await submitCode('123456')).toEqual({ ok: true, data: { leftover: [] } });
      expect(mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: 'f-new', code: '123456' });
      expect(mfa.unenroll).toHaveBeenLastCalledWith({ factorId: 'old' });
      expect(realtime.setAuth).toHaveBeenCalledWith('token-aal2');
    });

    it('without replace ("add device") the old factors stay', async () => {
      mfa.listFactors.mockResolvedValueOnce(factors(factor('old', 'verified')) as never);
      await beginEnroll();
      await submitCode('123456');
      expect(mfa.unenroll).not.toHaveBeenCalled();
    });

    it('a failed verify removes nothing', async () => {
      mfa.listFactors.mockResolvedValueOnce(factors(factor('old', 'verified')) as never);
      await beginEnroll({ replace: true });
      mfa.challengeAndVerify.mockResolvedValueOnce(failed('mfa_verification_failed', 422) as never);
      expect((await submitCode('000000')).ok).toBe(false);
      expect(mfa.unenroll).not.toHaveBeenCalled();
    });

    it('retries a removal once; one that still fails is reported as leftover', async () => {
      vi.useFakeTimers();
      mfa.listFactors.mockResolvedValueOnce(factors(factor('old', 'verified')) as never);
      await beginEnroll({ replace: true });
      mfa.unenroll.mockResolvedValue(failed('request_timeout', 504) as never);
      const pending = submitCode('123456');
      await vi.advanceTimersByTimeAsync(1000);
      expect(await pending).toEqual({ ok: true, data: { leftover: ['old'] } });
      expect(mfa.unenroll).toHaveBeenCalledTimes(2);
    });

    it('a factor already gone counts as removed', async () => {
      mfa.listFactors.mockResolvedValueOnce(factors(factor('old', 'verified')) as never);
      await beginEnroll({ replace: true });
      mfa.unenroll.mockResolvedValueOnce(failed('mfa_factor_not_found', 404) as never);
      expect(await submitCode('123456')).toEqual({ ok: true, data: { leftover: [] } });
    });

    it('a cancel that lands while the code is being checked keeps the old factors', async () => {
      mfa.listFactors.mockResolvedValueOnce(factors(factor('old', 'verified')) as never);
      await beginEnroll({ replace: true });
      let finishVerify: (v: unknown) => void = () => {};
      mfa.challengeAndVerify.mockReturnValueOnce(
        new Promise((settle) => (finishVerify = settle)) as never,
      );
      const verifying = submitCode('123456');
      // The verify landed server-side: the new factor is now verified.
      mfa.listFactors.mockResolvedValueOnce(
        factors(factor('old', 'verified'), factor('f-new', 'verified')) as never,
      );
      await cancelEnroll();
      finishVerify({ data: {}, error: null });
      expect(await verifying).toEqual({ ok: true, data: { leftover: [] } });
      expect(mfa.unenroll).not.toHaveBeenCalled();
    });
  });

  describe('cancelEnroll', () => {
    it('removes the new factor while it is still unverified', async () => {
      await beginEnroll();
      mfa.listFactors.mockResolvedValueOnce(factors(factor('f-new', 'unverified')) as never);
      expect(await cancelEnroll()).toEqual({ ok: true, data: undefined });
      expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: 'f-new' });
    });

    it('keeps it once the server lists it verified (it may be the only one)', async () => {
      await beginEnroll();
      mfa.listFactors.mockResolvedValueOnce(factors(factor('f-new', 'verified')) as never);
      await cancelEnroll();
      expect(mfa.unenroll).not.toHaveBeenCalled();
    });

    it('with nothing in progress it does nothing', async () => {
      expect(await cancelEnroll()).toEqual({ ok: true, data: undefined });
      expect(mfa.listFactors).not.toHaveBeenCalled();
    });

    it('clears the flow: a later code has no step', async () => {
      await beginEnroll();
      mfa.listFactors.mockResolvedValueOnce(factors(factor('f-new', 'unverified')) as never);
      await cancelEnroll();
      const res = await submitCode('123456');
      expect(res.ok === false && res.error.code).toBe('mfa_step_not_ready');
    });
  });

  describe('listFactors / removeFactor (Mi cuenta)', () => {
    it('lists every factor, verified or not', async () => {
      mfa.listFactors.mockResolvedValueOnce(
        factors(factor('a', 'verified'), factor('b', 'unverified')) as never,
      );
      const res = await listFactors();
      expect(res.ok && res.data.map((f) => f.id)).toEqual(['a', 'b']);
    });

    it('never removes the last verified factor', async () => {
      mfa.listFactors.mockResolvedValueOnce(factors(factor('a', 'verified')) as never);
      expect(await removeFactor('a')).toEqual({
        ok: false,
        error: {
          kind: 'invalid',
          message: 'Debes conservar al menos un dispositivo de verificación.',
          code: null,
        },
      });
      expect(mfa.unenroll).not.toHaveBeenCalled();
    });

    it('removes one of two, or an unverified leftover', async () => {
      mfa.listFactors.mockResolvedValueOnce(
        factors(factor('a', 'verified'), factor('b', 'verified')) as never,
      );
      expect(await removeFactor('b')).toEqual({ ok: true, data: undefined });
      mfa.listFactors.mockResolvedValueOnce(
        factors(factor('a', 'verified'), factor('u', 'unverified')) as never,
      );
      expect(await removeFactor('u')).toEqual({ ok: true, data: undefined });
      expect(mfa.unenroll.mock.calls).toEqual([[{ factorId: 'b' }], [{ factorId: 'u' }]]);
    });

    it('an unknown factor is not_found', async () => {
      const res = await removeFactor('ghost');
      expect(res.ok === false && res.error.kind).toBe('not_found');
    });

    it('removal below aal2 keeps GoTrue code insufficient_aal (S45 steps up first)', async () => {
      mfa.listFactors.mockResolvedValueOnce(
        factors(factor('a', 'verified'), factor('b', 'verified')) as never,
      );
      mfa.unenroll.mockResolvedValueOnce(failed('insufficient_aal', 403) as never);
      const res = await removeFactor('b');
      expect(res.ok === false && res.error.code).toBe('insufficient_aal');
    });
  });
});
