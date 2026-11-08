import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { MemoryJobRepo } from '../src/repos/memory.ts';
import { DiskStorage } from '../src/storage/diskStorage.ts';
import { createMockTtsProvider, createSelector } from '../src/providers/selector.ts';
import type { Job } from '../src/types.ts';
import { Worker } from '../src/worker/worker.ts';
import { encodeWav } from '../src/worker/wav.ts';

const makeJob = (overrides: Partial<Job> = {}): Job => ({
  id: 'job-1',
  ownerKey: 'owner-1',
  userId: 'user-1',
  voiceId: 'voice-1',
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
  ...overrides,
});

test('wav encoder creates a valid riff header', () => {
  const wav = encodeWav(Buffer.from([0, 0, 0, 0]), 1, 8000, 1);
  assert.ok(wav.subarray(0, 4).toString('ascii') === 'RIFF');
  assert.ok(wav.subarray(8, 12).toString('ascii') === 'WAVE');
});

test('selector picks mock provider for a preset voice', async () => {
  const provider = createSelector({ provider: 'mock' });
  const result = await provider.synthesize({ text: 'hello', voiceSampleUrl: 'sample.wav', presetVoiceId: 'voice-a', speed: 1 });
  assert.ok(result.length > 0);
});

test('worker completes a queued job and saves audio output', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'versevoice-worker-'));
  const storage = new DiskStorage({ uploadDir: tempDir, publicBaseUrl: 'http://localhost:3000' });
  const repo = new MemoryJobRepo();
  repo.create(makeJob());

  const worker = new Worker({
    repo,
    storage,
    provider: createMockTtsProvider(),
    clock: () => Date.now(),
    isWorkerEnabled: true,
    maxAttempts: 3,
  });

  const result = await worker.tick();
  assert.equal(result, true);
  const job = repo.findById('job-1');
  assert.equal(job?.status, 'done');
  assert.ok(job?.audioUrl?.includes('/files/'));
});
