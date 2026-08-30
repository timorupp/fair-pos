/**
 * Password hashing and verification using Node's built-in scrypt implementation.
 * No external dependencies required.
 */
import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const SALT_BYTES = 16;
const KEY_BYTES = 64;

/**
 * Hashes a plaintext password with a random per-password salt.
 *
 * @param password - The user-supplied plaintext password.
 * @returns A string of the form `<saltHex>:<keyHex>` ready to be stored in `user.password_hash`.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES).toString('hex');
  const key = (await scryptAsync(password, salt, KEY_BYTES)) as Buffer;
  return `${salt}:${key.toString('hex')}`;
}

/**
 * Constant-time comparison of a plaintext password against a stored hash.
 *
 * @param password - The user-supplied plaintext password to check.
 * @param hash - The stored `<salt>:<key>` string from the DB.
 * @returns `true` when the password matches, `false` otherwise.
 */
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
