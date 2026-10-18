import { randomBytes, randomInt, scrypt, timingSafeEqual, createHash, type ScryptOptions } from 'node:crypto';

// scrypt from Node's standard library: no native dependency, runs the same locally and on serverless.
const PARAMS = { N: 32768, r: 8, p: 1, keylen: 32 };
const MAXMEM = 64 * 1024 * 1024;

function scryptAsync(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const { N, r, p, keylen } = PARAMS;
  const key = await scryptAsync(password, salt, keylen, { N, r, p, maxmem: MAXMEM });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, saltB64, keyB64] = stored.split('$');
  if (scheme !== 'scrypt' || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64url');
  const key = await scryptAsync(password, Buffer.from(saltB64, 'base64url'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: MAXMEM,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** A hash that never matches, used to keep login timing the same for unknown emails. */
export const DUMMY_HASH = `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${'A'.repeat(22)}$${'A'.repeat(43)}`;

// No look-alike characters (0/O, 1/l/I) so temporary passwords can be read out or typed easily.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

export function generatePassword(length = 14): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

export function passwordProblem(password: string, email?: string): string | null {
  if (password.length < 10) return 'Password must be at least 10 characters';
  if (password.length > 200) return 'Password is too long';
  if (email && password.toLowerCase() === email.toLowerCase()) return 'Password must not be your email address';
  return null;
}

export function newSessionToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
