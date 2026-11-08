export type JobStatus = 'queued' | 'processing' | 'done' | 'failed';

export type JobOptions = {
  speed: number;
  lineGapMs: number;
};

export type Job = {
  id: string;
  ownerKey: string;
  userId: string | null;
  voiceId: string;
  text: string;
  options: JobOptions;
  status: JobStatus;
  attempts: number;
  error: string | null;
  provider: string | null;
  audioUrl: string | null;
  audioPublicId: string | null;
  lockedAt: string | null;
  createdAt: string;
  finishedAt: string | null;
  expiresAt: string;
};

export type Voice = {
  id: string;
  userId: string | null;
  name: string;
  sampleUrl: string;
  samplePublicId: string | null;
  presetVoiceId: string | null;
  isPreset: boolean;
  consentAt: string | null;
  createdAt: string;
};

export type UsageRecord = {
  key: string;
  date: string;
  totalChars: number;
  totalCount: number;
};

export type JobRepo = {
  create(job: Job): Job;
  update(job: Job): Job;
  findById(id: string): Job | null;
  listForUser(userId: string | null): Job[];
  claimNext(now: number): Job | null;
  markDone(id: string): Job | null;
  markRetryOrFail(id: string, error: string, maxAttempts: number): Job | null;
  resetStale(olderThanMs: number, maxAttempts: number): Job[];
  findExpired(now: number): Job[];
};

export type UsageRepo = {
  increment(key: string, date: string, chars: number, delta: number): UsageRecord;
};
