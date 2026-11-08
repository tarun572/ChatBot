import assert from 'node:assert/strict';
import test from 'node:test';

import { AuthService } from '../src/services/auth.ts';

const fakeJwtSigner = {
  sign(userId: string): string {
    return `token:${userId}`;
  },
  verify(token: string): string | null {
    if (token.startsWith('token:')) {
      return token.slice('token:'.length);
    }
    return null;
  },
};

test('register creates a user and hashes the password', async () => {
  const auth = new AuthService({
    users: new Map(),
    signer: fakeJwtSigner,
    clock: () => Date.now(),
  });

  const result = await auth.register({
    email: 'user@example.com',
    password: 'supersecret',
  });

  assert.equal(result.user.email, 'user@example.com');
  assert.notEqual(result.user.passwordHash, 'supersecret');
  assert.match(result.token, /^token:/);
});

test('login returns a generic 401 for wrong credentials', async () => {
  const auth = new AuthService({
    users: new Map(),
    signer: fakeJwtSigner,
    clock: () => Date.now(),
  });

  await auth.register({
    email: 'user@example.com',
    password: 'supersecret',
  });

  await assert.rejects(
    () =>
      auth.login({
        email: 'user@example.com',
        password: 'wrongpassword',
      }),
    (error: unknown) => {
      assert.ok(error && typeof error === 'object' && 'status' in error);
      const appError = error as { status: number; code: string };
      assert.equal(appError.status, 401);
      assert.equal(appError.code, 'invalid_credentials');
      return true;
    },
  );
});

test('me resolves the signed-in user from the token', async () => {
  const users = new Map();
  const auth = new AuthService({
    users,
    signer: fakeJwtSigner,
    clock: () => Date.now(),
  });

  const created = await auth.register({
    email: 'me@example.com',
    password: 'supersecret',
  });

  const me = await auth.me(created.token);
  assert.equal(me.email, 'me@example.com');
});
