import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { MemoryJobRepo, MemoryUsageRepo, memoryVoiceSeed } from './repos/memory.ts';
import { DiskStorage } from './storage/diskStorage.ts';
import { AuthService } from './services/auth.ts';
import { SimpleJwtSigner } from './security/jwtSigner.ts';
import { Worker } from './worker/worker.ts';
import { createSelector } from './providers/selector.ts';

const config = loadConfig(process.env);
const jobs = new MemoryJobRepo();
const usage = new MemoryUsageRepo();
const voices = new Map(memoryVoiceSeed.map((voice) => [voice.id, voice]));
const storage = new DiskStorage({
  uploadDir: process.env.UPLOAD_DIR ?? 'uploads',
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? `http://localhost:${config.port}`,
});
const auth = new AuthService({ users: new Map(), signer: new SimpleJwtSigner(config.jwtSecret) });
const provider = createSelector({
  provider: (process.env.TTS_PROVIDER as 'mock' | 'cloud' | 'xtts' | 'auto' | undefined) ?? 'mock',
  cloudApiKey: process.env.CLOUD_TTS_API_KEY,
  xttsServiceUrl: process.env.XTTS_SERVICE_URL,
  xttsApiKey: process.env.XTTS_API_KEY,
  language: process.env.XTTS_LANGUAGE,
});
const worker = new Worker({
  repo: jobs,
  storage,
  provider,
  isWorkerEnabled: process.env.RUN_WORKER !== 'false',
  maxAttempts: Number(process.env.MAX_ATTEMPTS ?? 3),
  staleAfterMs: Number(process.env.STALE_AFTER_MS ?? 300000),
});
const app = createApp({ config, jobs, usage, voices, storage, auth, worker });

const server = app.listen(config.port, () => {
  console.log(`VerseVoice server listening on port ${config.port}`);
});

worker.start(Number(process.env.WORKER_INTERVAL_MS ?? 2000));

function shutdown(): void {
  worker.stop();
  server.close(() => process.exit(0));
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
