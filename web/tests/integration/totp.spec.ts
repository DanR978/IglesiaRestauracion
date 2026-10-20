// The suite's authenticator (helpers/totp.ts) against the published test
// vectors, before any spec trusts it with a real sign-in: base32 (RFC 4648
// §10), HOTP (RFC 4226 Appendix D) and TOTP (RFC 6238 Appendix B — every row,
// all three algorithms, 8 digits). No browser, no stack: playwright.integration.config.ts
// runs this file as its own project, and the browser specs depend on it, so a
// broken helper fails here instead of as "wrong code" at the second factor.
import { expect, test } from '@playwright/test';
import { base32Decode, hotp, totp, totpFromKey, type HashAlgorithm } from './helpers/totp';

test('base32 decodes the RFC 4648 §10 vectors, ignoring padding, spaces and case', () => {
  const vectors: Array<[string, string]> = [
    ['', ''],
    ['MY======', 'f'],
    ['MZXQ====', 'fo'],
    ['MZXW6===', 'foo'],
    ['MZXW6YQ=', 'foob'],
    ['MZXW6YTB', 'fooba'],
    ['MZXW6YTBOI======', 'foobar'],
  ];
  for (const [encoded, plain] of vectors) {
    expect(base32Decode(encoded).toString('ascii'), encoded).toBe(plain);
  }
  // The screens show the secret in groups of four.
  expect(base32Decode('mzxw 6ytb oi').toString('ascii')).toBe('foobar');
  expect(() => base32Decode('MZXW1')).toThrow(/not a base32 character/);
});

test('HOTP matches RFC 4226 Appendix D', () => {
  const key = Buffer.from('12345678901234567890', 'ascii');
  const expected = [
    '755224',
    '287082',
    '359152',
    '969429',
    '338314',
    '254676',
    '287922',
    '162583',
    '399871',
    '520489',
  ];
  expect(expected.map((_, counter) => hotp(key, counter))).toEqual(expected);
});

test('TOTP matches every RFC 6238 Appendix B vector', () => {
  // The RFC's reference implementation keys each hash with a seed of its own length.
  const keys: Record<HashAlgorithm, Buffer> = {
    sha1: Buffer.from('12345678901234567890', 'ascii'),
    sha256: Buffer.from('12345678901234567890123456789012', 'ascii'),
    sha512: Buffer.from(
      '1234567890123456789012345678901234567890123456789012345678901234',
      'ascii',
    ),
  };
  const vectors: Array<[number, string, string, string]> = [
    // seconds, SHA-1, SHA-256, SHA-512
    [59, '94287082', '46119246', '90693936'],
    [1111111109, '07081804', '68084774', '25091201'],
    [1111111111, '14050471', '67062674', '99943326'],
    [1234567890, '89005924', '91819424', '93441116'],
    [2000000000, '69279037', '90698825', '38618901'],
    [20000000000, '65353130', '77737706', '47863826'],
  ];
  for (const [seconds, ...codes] of vectors) {
    const algorithms: HashAlgorithm[] = ['sha1', 'sha256', 'sha512'];
    algorithms.forEach((algorithm, i) => {
      const code = totpFromKey(keys[algorithm], { time: seconds * 1000, digits: 8, algorithm });
      expect(code, `${algorithm} at ${seconds}s`).toBe(codes[i]);
    });
  }
});

test('totp() reads a base32 secret with GoTrue’s parameters (SHA-1, 30 s, 6 digits)', () => {
  // The RFC 6238 SHA-1 seed, base32-encoded as an enrollment would show it.
  const secret = 'GEZD GNBV GY3T QOJQ GEZD GNBV GY3T QOJQ';
  expect(totp(secret, { time: 59_000 })).toBe('287082');
  expect(totp(secret, { time: 1_111_111_109_000 })).toBe('081804');
  // A step boundary: 29.999 s and 30 s are different steps.
  expect(totp(secret, { time: 29_999 })).toBe(hotp(base32Decode(secret), 0));
  expect(totp(secret, { time: 30_000 })).toBe(hotp(base32Decode(secret), 1));
});
