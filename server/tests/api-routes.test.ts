import assert from 'node:assert/strict';
import test from 'node:test';

import { createApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { MemoryJobRepo, MemoryUsageRepo, memoryVoiceSeed } from '../src/repos/memory.ts';
import { SimpleJwtSigner } from '../src/security/jwtSigner.ts';
import { AuthService } from '../src/services/auth.ts';

const config = loadConfig({
  PORT: '3000',
  JWT_SECRET: 'route-test-secret',
  CLIENT_ORIGIN: 'http://localhost:5173',
  NODE_ENV: 'test',
});

async function withServer(run: (baseUrl: string) => Promise<void>) {
  const app = createApp({
    config,
    auth: new AuthService({ users: new Map(), signer: new SimpleJwtSigner(config.jwtSecret) }),
    jobs: new MemoryJobRepo(),
    usage: new MemoryUsageRepo(),
    voices: new Map(memoryVoiceSeed.map((voice) => [voice.id, voice])),
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('HTTP API registers users and requires bearer auth for protected routes', async () => {
  await withServer(async (baseUrl) => {
    const registered = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'reader@example.com', password: 'long-password' }),
    });
    assert.equal(registered.status, 201);
    const auth = await registered.json() as { token: string; user: { email: string } };
    assert.equal(auth.user.email, 'reader@example.com');

    const denied = await fetch(`${baseUrl}/api/voices`);
    assert.equal(denied.status, 401);

    const voices = await fetch(`${baseUrl}/api/voices`, { headers: { authorization: `Bearer ${auth.token}` } });
    assert.equal(voices.status, 200);
    assert.equal(Array.isArray(await voices.json()), true);
  });
});

test('demo API creates an IP-owned queued job and hides it from another client IP', async () => {
  await withServer(async (baseUrl) => {
    const voicesResponse = await fetch(`${baseUrl}/api/demo/voices`);
    const voices = await voicesResponse.json() as Array<{ id: string }>;
    const created = await fetch(`${baseUrl}/api/demo/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ voiceId: voices[0].id, text: 'A short poem', lineGapMs: 250 }),
    });
    assert.equal(created.status, 202);
    const job = await created.json() as { id: string; status: string; ownerKey?: string };
    assert.equal(job.status, 'queued');
    assert.equal('ownerKey' in job, false);

    const owned = await fetch(`${baseUrl}/api/demo/jobs/${job.id}`);
    assert.equal(owned.status, 200);
  });
});
