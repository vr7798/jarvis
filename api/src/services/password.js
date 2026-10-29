import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${hash.toString('hex')}`;
}

export async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || password.length > 1024) return false;
  const [scheme, salt, expected] = encoded.split(':');
  if (scheme !== 'scrypt' || !/^[a-f0-9]{128}$/.test(expected || '')) return false;
  const hash = await scrypt(password, salt, 64);
  return timingSafeEqual(hash, Buffer.from(expected, 'hex'));
}
