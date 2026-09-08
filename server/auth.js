import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const HASH_KEY_LENGTH = 64;

export function validateCredentials(nickname, password) {
  return typeof nickname === 'string'
    && /^[a-zA-Z0-9_]{2,20}$/.test(nickname)
    && typeof password === 'string'
    && password.length >= 8
    && password.length <= 128;
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt, HASH_KEY_LENGTH);
  return `${salt.toString('hex')}:${derivedKey.toString('hex')}`;
}

export async function verifyPassword(password, storedHash) {
  const [saltHex, keyHex] = String(storedHash).split(':');
  if (!saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createSession(user) {
  return {
    token: randomBytes(32).toString('hex'),
    userId: user.id,
    nickname: user.nickname,
    isAdmin: user.is_admin === true,
  };
}

export function createAccountId() {
  return randomUUID();
}