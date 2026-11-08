import { randomUUID } from 'node:crypto';

import { AppError } from '../errors.ts';
import type { Job, JobRepo } from '../types.ts';

export type JobServiceDependencies = {
  repo: JobRepo;
  clock?: () => number;
  ttlDays?: number;
};

export type CreateJobInput = {
  ownerKey: string;
  userId: string | null;
  voiceId: string;
  text: string;
  speed?: number;
  lineGapMs?: number;
};

export class JobService {
  private readonly repo: JobRepo;
  private readonly clock: () => number;
  private readonly ttlDays: number;

  constructor({ repo, clock, ttlDays = 7 }: JobServiceDependencies) {
    this.repo = repo;
    this.clock = clock ?? (() => Date.now());
    this.ttlDays = ttlDays;
  }

  createForUser(input: CreateJobInput): Job {
    const cleanedText = input.text.trim();
    if (!cleanedText) {
      throw new AppError(400, 'empty_text', 'Text cannot be empty');
    }

    const now = this.clock();
    const speed = Math.min(Math.max(input.speed ?? 1, 0.7), 1.3);
    const lineGapMs = Math.min(Math.max(input.lineGapMs ?? 350, 0), 2000);

    const job: Job = {
      id: randomUUID(),
      ownerKey: input.ownerKey,
      userId: input.userId,
      voiceId: input.voiceId,
      text: cleanedText,
      options: { speed, lineGapMs },
      status: 'queued',
      attempts: 0,
      error: null,
      provider: null,
      audioUrl: null,
      audioPublicId: null,
      lockedAt: null,
      createdAt: new Date(now).toISOString(),
      finishedAt: null,
      expiresAt: new Date(now + this.ttlDays * 24 * 60 * 60 * 1000).toISOString(),
    };

    return this.repo.create(job);
  }
}
