import { randomUUID } from 'node:crypto';

import type { Job, JobRepo, UsageRecord, UsageRepo, Voice } from '../types.ts';

function cloneJob(job: Job): Job {
  return {
    ...job,
    options: { ...job.options },
  };
}

export class MemoryJobRepo implements JobRepo {
  private readonly jobs = new Map<string, Job>();

  create(job: Job): Job {
    const created = cloneJob(job);
    this.jobs.set(created.id, created);
    return cloneJob(created);
  }

  update(job: Job): Job {
    const updated = cloneJob(job);
    this.jobs.set(updated.id, updated);
    return cloneJob(updated);
  }

  findById(id: string): Job | null {
    const job = this.jobs.get(id);
    return job ? cloneJob(job) : null;
  }

  listForUser(userId: string | null): Job[] {
    return Array.from(this.jobs.values())
      .filter((job) => job.userId === userId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((job) => cloneJob(job));
  }

  claimNext(now: number): Job | null {
    const queued = Array.from(this.jobs.values())
      .filter((job) => job.status === 'queued')
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    if (queued.length === 0) {
      return null;
    }

    const next = queued[0];
    const claimed: Job = {
      ...cloneJob(next),
      status: 'processing',
      attempts: next.attempts + 1,
      lockedAt: new Date(now).toISOString(),
      error: null,
    };

    this.jobs.set(claimed.id, claimed);
    return cloneJob(claimed);
  }

  markDone(id: string): Job | null {
    const current = this.jobs.get(id);
    if (!current) {
      return null;
    }

    const updated: Job = {
      ...cloneJob(current),
      status: 'done',
      lockedAt: null,
      finishedAt: new Date().toISOString(),
      error: null,
    };

    this.jobs.set(updated.id, updated);
    return cloneJob(updated);
  }

  markRetryOrFail(id: string, error: string, maxAttempts: number): Job | null {
    const current = this.jobs.get(id);
    if (!current) {
      return null;
    }

    const shouldRetry = current.attempts < maxAttempts;
    const updated: Job = {
      ...cloneJob(current),
      error,
      lockedAt: null,
      finishedAt: shouldRetry ? null : new Date().toISOString(),
      status: shouldRetry ? 'queued' : 'failed',
    };

    this.jobs.set(updated.id, updated);
    return cloneJob(updated);
  }

  resetStale(olderThanMs: number, maxAttempts: number): Job[] {
    const staleJobs = Array.from(this.jobs.values()).filter((job) => {
      if (job.status !== 'processing' || !job.lockedAt) {
        return false;
      }

      return new Date(job.lockedAt).getTime() < olderThanMs;
    });

    return staleJobs.map((job) => {
      const nextStatus = job.attempts < maxAttempts ? 'queued' : 'failed';
      const updated: Job = {
        ...cloneJob(job),
        status: nextStatus,
        lockedAt: null,
        finishedAt: nextStatus === 'failed' ? new Date().toISOString() : null,
        error: nextStatus === 'failed' ? job.error ?? 'stale_job' : job.error,
      };

      this.jobs.set(updated.id, updated);
      return cloneJob(updated);
    });
  }

  findExpired(now: number): Job[] {
    const expired = Array.from(this.jobs.values()).filter(
      (job) => new Date(job.expiresAt).getTime() <= now,
    );

    for (const job of expired) {
      this.jobs.delete(job.id);
    }

    return expired.map((job) => cloneJob(job));
  }
}

export class MemoryUsageRepo implements UsageRepo {
  private readonly usage = new Map<string, UsageRecord>();

  increment(key: string, date: string, chars: number, delta: number): UsageRecord {
    const existing = this.usage.get(`${key}:${date}`) ?? {
      key,
      date,
      totalChars: 0,
      totalCount: 0,
    };

    const next: UsageRecord = {
      key,
      date,
      totalChars: existing.totalChars + chars,
      totalCount: existing.totalCount + delta,
    };

    this.usage.set(`${key}:${date}`, next);
    return { ...next };
  }
}

export const memoryVoiceSeed: Voice[] = [
  {
    id: randomUUID(),
    userId: null,
    name: 'Preset Voice',
    sampleUrl: '',
    samplePublicId: null,
    presetVoiceId: 'preset-voice',
    isPreset: true,
    consentAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  },
];
