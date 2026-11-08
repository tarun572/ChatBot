import { createHash } from 'node:crypto';

import { AppError } from '../errors.ts';
import type { UsageRepo } from '../types.ts';

export type ConsumeOptions = {
  repo: UsageRepo;
  key: string;
  chars: number;
  limit: number;
  clock?: () => number;
};

export type GlobalCloudOptions = {
  repo: UsageRepo;
  limit: number;
  clock?: () => number;
};

export function todayKey(clock: () => number): string {
  return new Date(clock()).toISOString().slice(0, 10);
}

export function consume({ repo, key, chars, limit, clock = () => Date.now() }: ConsumeOptions): { key: string; date: string; totalCount: number; totalChars: number } {
  if (!key.trim()) {
    throw new AppError(400, 'invalid_quota_key', 'Quota key is required');
  }

  if (!Number.isFinite(chars) || chars <= 0 || chars > 20000) {
    throw new AppError(400, 'invalid_chars', 'Character count must be between 1 and 20000');
  }

  const date = todayKey(clock);
  const record = repo.increment(key, date, chars, 1);

  if (record.totalCount > limit) {
    repo.increment(key, date, chars, -1);
    throw new AppError(429, 'quota_exceeded', `Quota limit exceeded for ${key}`);
  }

  return record;
}

export function tryConsumeGlobalCloud({ repo, limit, clock = () => Date.now() }: GlobalCloudOptions): boolean {
  const date = todayKey(clock);
  const record = repo.increment('global:cloud', date, 0, 1);

  if (record.totalCount > limit) {
    repo.increment('global:cloud', date, 0, -1);
    return false;
  }

  return true;
}

export function ipKey(ip: string): string {
  const hash = createHash('sha256').update(ip).digest('hex').slice(0, 16);
  return `ip:${hash}`;
}
