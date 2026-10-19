/* ============================================================================
 * web/tests/integration/helpers/totp.ts — the authenticator app, in node:crypto
 * ----------------------------------------------------------------------------
 * The integration suite signs in for real, so it needs the six digits a
 * phone would show: HOTP (RFC 4226) over the TOTP time step (RFC 6238), keyed
 * by the base32 secret (RFC 4648) GoTrue hands out at enrollment — the same
 * text the verificar/ and Mi cuenta screens show in groups of four (spaces are
 * ignored, as authenticator apps do). GoTrue's factors are SHA-1, 30 s,
 * 6 digits; the other algorithms exist only so totp.spec.ts can check every
 * RFC 6238 test vector. No dependency: node:crypto only.
 *
 * Usage:
 *   import { totp } from './helpers/totp';
 *   await page.getByLabel('Código de verificación').fill(totp(secret));
 * ========================================================================== */
import { createHmac } from 'node:crypto';

export type HashAlgorithm = 'sha1' | 'sha256' | 'sha512';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 base32 → bytes. Whitespace and `=` padding are ignored; case is not significant. */
export function base32Decode(text: string): Buffer {
  const clean = text.replace(/[\s=]/g, '').toUpperCase();
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of clean) {
    const value = BASE32_ALPHABET.indexOf(char);
    if (value === -1) throw new Error(`base32Decode: "${char}" is not a base32 character`);
    buffer = ((buffer << 5) | value) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >>> bits) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

/** RFC 4226: the HMAC of the 8-byte counter, dynamically truncated to `digits` decimals. */
export function hotp(
  key: Buffer,
  counter: number,
  { digits = 6, algorithm = 'sha1' }: { digits?: number; algorithm?: HashAlgorithm } = {},
): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac(algorithm, key).update(message).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const binary = mac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** digits).padStart(digits, '0');
}

export interface TotpOptions {
  /** Unix time in milliseconds. Defaults to now. */
  time?: number;
  /** The time step in seconds. */
  period?: number;
  digits?: number;
  algorithm?: HashAlgorithm;
}

/** RFC 6238 with a raw key: the code for the time step that contains `time`. */
export function totpFromKey(
  key: Buffer,
  { time = Date.now(), period = 30, digits = 6, algorithm = 'sha1' }: TotpOptions = {},
): string {
  return hotp(key, Math.floor(time / 1000 / period), { digits, algorithm });
}

/** The code an authenticator app shows now for a base32 secret (GoTrue's parameters by default). */
export function totp(secret: string, options: TotpOptions = {}): string {
  const key = base32Decode(secret);
  // An empty key still yields six digits; a secret read before it rendered must fail here.
  if (!key.length) throw new Error('totp: the secret is empty');
  return totpFromKey(key, options);
}
