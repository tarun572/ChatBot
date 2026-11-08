import { randomBytes, timingSafeEqual } from 'node:crypto';
import { pbkdf2Sync } from 'node:crypto';

const ITERATIONS = 120_000;
const KEY_LENGTH = 64;
const DIGEST = 'sha512';

export type PasswordHasher = {
  hash(password: string): string;
  verify(password: string, hash: string): boolean;
};

export const passwordHasher: PasswordHasher = {
  hash(password: string): string {
    const salt = randomBytes(16).toString('hex');
    const hash = pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString('hex');
    return `pbkdf2_sha512$${ITERATIONS}$${salt}$${hash}`;
  },

  verify(password: string, hash: string): boolean {
    const parts = hash.split('$');
    if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha512') {
      return false;
    }

    const iterations = Number.parseInt(parts[1], 10);
    const salt = parts[2];
    const expected = parts[3];
    const derived = pbkdf2Sync(password, salt, iterations, KEY_LENGTH, DIGEST).toString('hex');

    const expectedBuffer = Buffer.from(expected, 'hex');
    const derivedBuffer = Buffer.from(derived, 'hex');
    if (expectedBuffer.length !== derivedBuffer.length) {
      return false;
    }

    return timingSafeEqual(expectedBuffer, derivedBuffer);
  },
};
