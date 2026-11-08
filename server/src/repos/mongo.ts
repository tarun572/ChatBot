import type { Job, JobRepo, UsageRecord, UsageRepo } from '../types.ts';

export class MongoJobRepo implements JobRepo {
  constructor(private readonly model: { [key: string]: unknown } = {}) {}

  create(job: Job): Job {
    return job;
  }

  update(job: Job): Job {
    return job;
  }

  findById(id: string): Job | null {
    return null;
  }

  listForUser(userId: string | null): Job[] {
    return [];
  }

  claimNext(now: number): Job | null {
    return null;
  }

  markDone(id: string): Job | null {
    return null;
  }

  markRetryOrFail(id: string, error: string, maxAttempts: number): Job | null {
    return null;
  }

  resetStale(olderThanMs: number, maxAttempts: number): Job[] {
    return [];
  }

  findExpired(now: number): Job[] {
    return [];
  }
}

export class MongoUsageRepo implements UsageRepo {
  constructor(private readonly model: { [key: string]: unknown } = {}) {}

  increment(key: string, date: string, chars: number, delta: number): UsageRecord {
    return { key, date, totalChars: chars, totalCount: delta };
  }
}
