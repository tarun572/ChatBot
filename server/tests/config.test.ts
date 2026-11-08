import assert from 'node:assert/strict';
import test from 'node:test';

import { loadConfig } from '../src/config.ts';

test('loadConfig accepts a valid development configuration', () => {
  const config = loadConfig({
    PORT: '4000',
    JWT_SECRET: 'a-very-secure-secret',
    CLIENT_ORIGIN: 'http://localhost:5173',
    NODE_ENV: 'development',
  });

  assert.equal(config.port, 4000);
  assert.deepEqual(config.corsOrigin, ['http://localhost:5173']);
  assert.equal(config.jwtSecret, 'a-very-secure-secret');
});

test('loadConfig rejects insecure production secrets', () => {
  assert.throws(
    () =>
      loadConfig({
        PORT: '3000',
        JWT_SECRET: 'change-me',
        CLIENT_ORIGIN: 'https://example.com',
        NODE_ENV: 'production',
      }),
    /JWT_SECRET/i,
  );
});

test('loadConfig aggregates missing required config', () => {
  let thrown: Error | undefined;

  try {
    loadConfig({
      PORT: '',
      NODE_ENV: 'development',
    });
  } catch (error) {
    thrown = error as Error;
  }

  assert.ok(thrown instanceof Error);
  assert.match(thrown.message, /JWT_SECRET/i);
  assert.match(thrown.message, /CLIENT_ORIGIN/i);
  assert.match(thrown.message, /PORT/i);
});
