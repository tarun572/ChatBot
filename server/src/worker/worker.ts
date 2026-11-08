import { AppError } from '../errors.ts';
import type { JobRepo } from '../types.ts';
import type { StorageProvider } from '../storage/storage.ts';
import type { TtsProvider } from '../providers/tts.ts';
import { prepareText } from '../services/textPrep.ts';
import { joinWav } from './wav.ts';

export type WorkerDependencies = {
  repo: JobRepo;
  storage: StorageProvider;
  provider: TtsProvider;
  clock?: () => number;
  isWorkerEnabled?: boolean;
  maxAttempts?: number;
  staleAfterMs?: number;
};

export class Worker {
  private readonly repo: JobRepo;
  private readonly storage: StorageProvider;
  private readonly provider: TtsProvider;
  private readonly clock: () => number;
  private readonly isWorkerEnabled: boolean;
  private readonly maxAttempts: number;
  private readonly staleAfterMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;

  constructor({ repo, storage, provider, clock, isWorkerEnabled = true, maxAttempts = 3, staleAfterMs = 300000 }: WorkerDependencies) {
    this.repo = repo;
    this.storage = storage;
    this.provider = provider;
    this.clock = clock ?? (() => Date.now());
    this.isWorkerEnabled = isWorkerEnabled;
    this.maxAttempts = maxAttempts;
    this.staleAfterMs = staleAfterMs;
  }

  async tick(): Promise<boolean> {
    if (!this.isWorkerEnabled) {
      return false;
    }

    const next = this.repo.claimNext(this.clock());
    if (!next) {
      return false;
    }

    try {
      const segments = prepareText(next.text, { lineGapMs: next.options.lineGapMs, maxPauseMs: 5000 });
      const parts: Array<{ wav: Buffer } | { silenceMs: number }> = [];
      for (const segment of segments) {
        if (segment.kind === 'pause') {
          parts.push({ silenceMs: segment.ms });
        } else {
          parts.push({ wav: await this.provider.synthesize({ text: segment.text, speed: next.options.speed }) });
        }
      }

      const wav = joinWav(parts);
      const saved = this.storage.save(`audio/${next.id}.wav`, wav, 'audio/wav');
      const updated = this.repo.markDone(next.id);

      if (!updated) {
        throw new AppError(500, 'job_missing', 'Job is no longer available');
      }

      this.repo.update({
        ...updated,
        audioUrl: saved.url,
        audioPublicId: saved.publicId,
        provider: this.provider.name,
      });

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_worker_error';
      const updated = this.repo.markRetryOrFail(next.id, message, this.maxAttempts);
      return updated !== null;
    }
  }

  sweep(): void {
    const now = this.clock();
    this.repo.resetStale(now - this.staleAfterMs, this.maxAttempts);
    for (const job of this.repo.findExpired(now)) {
      if (job.audioPublicId) this.storage.remove(job.audioPublicId);
    }
  }

  start(intervalMs: number): void {
    if (!this.isWorkerEnabled || this.timer) return;
    this.timer = setInterval(() => {
      if (this.busy) return;
      this.busy = true;
      void (async () => {
        try {
          this.sweep();
          while (await this.tick()) { /* drain queued jobs */ }
        } finally {
          this.busy = false;
        }
      })();
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
