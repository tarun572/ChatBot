import assert from 'node:assert/strict';
import test from 'node:test';

import { MemoryJobRepo } from '../src/repos/memory.ts';
import type { Job } from '../src/types.ts';

function makeJob(overrides: Partial<Job> = {}): Job {
  const now = Date.now();

  return {
    id: `job-${Math.random().toString(36).slice(2)}`,
    ownerKey: 'owner-1',
    userId: null,
    voiceId: 'voice-1',
    text: 'hello world',
    options: { speed: 1, lineGapMs: 350 },
    status: 'queued',
    attempts: 0,
    error: null,
    provider: null,
    audioUrl: null,
    audioPublicId: null,
    lockedAt: null,
    createdAt: new Date(now).toISOString(),
    finishedAt: null,
    expiresAt: new Date(now + 86400000).toISOString(),
    ...overrides,
  };
}

test('claimNext returns the oldest queued job first', () => {
  const repo = new MemoryJobRepo();
  const first = repo.create(makeJob({ text: 'first' }));
  const second = repo.create(makeJob({ text: 'second' }));

  const claimedFirst = repo.claimNext(Date.now());
  assert.equal(claimedFirst?.id, first.id);
  assert.equal(claimedFirst?.status, 'processing');

  const claimedSecond = repo.claimNext(Date.now());
  assert.equal(claimedSecond?.id, second.id);
  assert.equal(claimedSecond?.status, 'processing');
});

test('markRetryOrFail requeues jobs before the retry limit', () => {
  const repo = new MemoryJobRepo();
  const job = repo.create(makeJob({ attempts: 0 }));
  repo.claimNext(Date.now());

  const updated = repo.markRetryOrFail(job.id, 'temporary-error', 3);
  assert.equal(updated?.status, 'queued');
  assert.equal(updated?.attempts, 1);
  assert.equal(updated?.error, 'temporary-error');
});

test('resetStale moves stale processing jobs back to queued', () => {
  const repo = new MemoryJobRepo();
  const job = repo.create(
    makeJob({
      status: 'processing',
      attempts: 1,
      lockedAt: new Date(Date.now() - 600000).toISOString(),
    }),
  );

  const reset = repo.resetStale(Date.now(), 300000);
  assert.equal(reset.length, 1);
  assert.equal(reset[0].id, job.id);
  assert.equal(reset[0].status, 'queued');
  assert.equal(reset[0].attempts, 1);
});
