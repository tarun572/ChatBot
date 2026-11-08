import assert from 'node:assert/strict';
import test from 'node:test';

import { consume, tryConsumeGlobalCloud, ipKey } from '../src/services/quota.ts';
import { MemoryUsageRepo } from '../src/repos/memory.ts';

const makeClock = (value: number) => () => value;

test('consume enforces the per-key daily limit', () => {
  const repo = new MemoryUsageRepo();

  assert.doesNotThrow(() => consume({ repo, key: 'demo:user', chars: 200, limit: 3, clock: makeClock(1700000000000) }));
  assert.doesNotThrow(() => consume({ repo, key: 'demo:user', chars: 200, limit: 3, clock: makeClock(1700000000000) }));
  assert.doesNotThrow(() => consume({ repo, key: 'demo:user', chars: 200, limit: 3, clock: makeClock(1700000000000) }));

  assert.throws(() => consume({ repo, key: 'demo:user', chars: 200, limit: 3, clock: makeClock(1700000000000) }), /429|limit/i);
});

test('global cloud quota allows a limited number of cloud synths', () => {
  const repo = new MemoryUsageRepo();

  assert.equal(tryConsumeGlobalCloud({ repo, limit: 2, clock: makeClock(1700000000000) }), true);
  assert.equal(tryConsumeGlobalCloud({ repo, limit: 2, clock: makeClock(1700000000000) }), true);
  assert.equal(tryConsumeGlobalCloud({ repo, limit: 2, clock: makeClock(1700000000000) }), false);
});

test('ipKey hashes the client IP before storage', () => {
  const hashed = ipKey('203.0.113.5');
  assert.match(hashed, /^ip:/);
  assert.notEqual(hashed, 'ip:203.0.113.5');
});
