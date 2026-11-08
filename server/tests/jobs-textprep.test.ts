import assert from 'node:assert/strict';
import test from 'node:test';

import { MemoryJobRepo } from '../src/repos/memory.ts';
import { JobService } from '../src/services/jobs.ts';
import { prepareText } from '../src/services/textPrep.ts';

test('prepareText converts line breaks and pause tags into segments', () => {
  const segments = prepareText('Hello\n[Pause 1s]\nWorld', { lineGapMs: 250, maxPauseMs: 5000 });

  assert.equal(segments.some((segment) => segment.kind === 'pause'), true);
  assert.equal(segments[0].kind, 'text');
  assert.equal(segments[segments.length - 1].kind, 'text');
});

test('job service creates user jobs with clipped options and expiry', () => {
  const repo = new MemoryJobRepo();
  const service = new JobService({
    repo,
    clock: () => new Date('2026-01-01T00:00:00.000Z').getTime(),
    ttlDays: 7,
  });

  const job = service.createForUser({
    ownerKey: 'owner-1',
    userId: 'u-1',
    voiceId: 'voice-1',
    text: 'hello world',
    speed: 10,
    lineGapMs: 99999,
  });

  assert.equal(job.status, 'queued');
  assert.equal(job.options.speed, 1.3);
  assert.equal(job.options.lineGapMs, 2000);
  assert.ok(job.expiresAt > job.createdAt);
});
