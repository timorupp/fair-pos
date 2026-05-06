/**
 * Password hashing and verification using Node's built-in scrypt implementation.
 * No external dependencies required.
 */
import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const SALT_BYTES = 16;
const KEY_BYTES = 64;

/** Hashes a plaintext password with a random salt. Returns "salt:hash" string. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES).toString('hex');
  const key = (await scryptAsync(password, salt, KEY_BYTES)) as Buffer;
  return `${salt}:${key.toString('hex')}`;
}

/** Returns true if the plaintext password matches the stored "salt:hash" string. */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const separatorIndex = hash.indexOf(':');
  if (separatorIndex === -1) return false;
  const salt = hash.slice(0, separatorIndex);
  const storedKey = hash.slice(separatorIndex + 1);
  const key = (await scryptAsync(password, salt, KEY_BYTES)) as Buffer;
  const storedKeyBuffer = Buffer.from(storedKey, 'hex');
  if (key.length !== storedKeyBuffer.length) return false;
  return timingSafeEqual(key, storedKeyBuffer);
}
