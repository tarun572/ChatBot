import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { MemoryJobRepo, MemoryUsageRepo } from '../src/repos/memory.ts';
import { DiskStorage } from '../src/storage/diskStorage.ts';
import { AuthService } from '../src/services/auth.ts';
import { VoiceService } from '../src/services/voice.ts';
import { createMockTtsProvider } from '../src/providers/selector.ts';
import { Worker } from '../src/worker/worker.ts';

const config = loadConfig({
  PORT: '3001',
  JWT_SECRET: 'a-very-secure-secret',
  CLIENT_ORIGIN: 'http://localhost:5173',
  NODE_ENV: 'development',
});

test('health route responds successfully', () => {
  const app = createApp({ config });
  assert.ok(app !== null);
  const route = app._router.stack.some((layer: { route?: { path?: string } }) => layer.route?.path === '/api/health');
  assert.equal(route, true);
});

test('auth service rejects missing bearer tokens generically', async () => {
  const auth = new AuthService({ users: new Map() });
  await assert.rejects(() => auth.me('bad-token'), /invalid_token|Authentication/i);
});

test('voice service rejects consent missing', () => {
  const service = new VoiceService({
    voices: new Map(),
    storage: new DiskStorage({ uploadDir: mkdtempSync(path.join(tmpdir(), 'versevoice-api-')), publicBaseUrl: 'http://localhost:3000' }),
  });

  assert.throws(() => service.create({
    userId: 'user-1',
    name: 'demo',
    sample: Buffer.from('abc'),
    mimeType: 'audio/wav',
    consent: false,
  }), /consent_required|Consent/i);
});

test('worker processes a queued job', async () => {
  const repo = new MemoryJobRepo();
  const storage = new DiskStorage({ uploadDir: mkdtempSync(path.join(tmpdir(), 'versevoice-worker-')), publicBaseUrl: 'http://localhost:3000' });
const worker = new Worker({ repo, storage, provider: createMockTtsProvider(), isWorkerEnabled: true });
  repo.create({
    id: 'job-api-1',
    ownerKey: 'owner-1',
    userId: 'u-1',
    voiceId: 'v-1',
    text: 'hello world',
    options: { speed: 1, lineGapMs: 250 },
    status: 'queued',
    attempts: 0,
    error: null,
    provider: null,
    audioUrl: null,
    audioPublicId: null,
    lockedAt: null,
    createdAt: new Date().toISOString(),
    finishedAt: null,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  });

  assert.equal(await worker.tick(), true);
  assert.equal(repo.findById('job-api-1')?.status, 'done');
});

const apiPath = '../src/api.ts';
const baseClient = '../src/client.ts';
void apiPath;
void baseClient;
