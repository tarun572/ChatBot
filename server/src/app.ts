import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import multer from 'multer';
import { z, ZodError } from 'zod';
import { join } from 'node:path';

import type { ServerConfig } from './config.ts';
import { AppError } from './errors.ts';
import { MemoryJobRepo, MemoryUsageRepo, memoryVoiceSeed } from './repos/memory.ts';
import { AuthService } from './services/auth.ts';
import { JobService } from './services/jobs.ts';
import { VoiceService } from './services/voice.ts';
import { consume, ipKey } from './services/quota.ts';
import { DiskStorage } from './storage/diskStorage.ts';
import type { StorageProvider } from './storage/storage.ts';
import type { JobRepo, UsageRepo, Voice } from './types.ts';
import { SimpleJwtSigner } from './security/jwtSigner.ts';
import { Worker } from './worker/worker.ts';
import { createMockTtsProvider } from './providers/selector.ts';

export type AppDependencies = {
  config: ServerConfig;
  auth?: AuthService;
  jobs?: JobRepo;
  usage?: UsageRepo;
  voices?: Map<string, Voice>;
  storage?: StorageProvider;
  worker?: Worker;
};

function publicJob(job: import('./types.ts').Job) {
  const { ownerKey: _ownerKey, lockedAt: _lockedAt, audioPublicId: _audioPublicId, ...safe } = job;
  return safe;
}

export function createApp({ config, auth, jobs, usage, voices, storage, worker }: AppDependencies): express.Express {
  const app = express();
  const jobRepo = jobs ?? new MemoryJobRepo();
  const usageRepo = usage ?? new MemoryUsageRepo();
  const voiceMap = voices ?? new Map(memoryVoiceSeed.map((voice) => [voice.id, voice]));
  const files = storage ?? new DiskStorage({
    uploadDir: process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads'),
    publicBaseUrl: process.env.PUBLIC_BASE_URL ?? `http://localhost:${config.port}`,
  });
  const authService = auth ?? new AuthService({ users: new Map(), signer: new SimpleJwtSigner(config.jwtSecret) });
  const voiceService = new VoiceService({ voices: voiceMap, storage: files });
  const jobService = new JobService({ repo: jobRepo });
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
  const demoVoices = (): Voice[] => Array.from(voiceMap.values()).filter((voice) => voice.isPreset);
  const resolveUser = async (req: Request) => {
    const header = req.header('authorization') ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match) throw new AppError(401, 'unauthorized', 'Authentication required');
    return authService.me(match[1]);
  };

  app.disable('x-powered-by');
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.use(
    cors({
      origin: config.corsOrigin.length > 0 ? config.corsOrigin : true,
      credentials: true,
    }),
  );

  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  app.post('/api/auth/register', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z.object({ email: z.string().email(), password: z.string().min(8) }).parse(req.body);
      const result = await authService.register(body);
      res.status(201).json({ token: result.token, user: { id: result.user.id, email: result.user.email } });
    } catch (error) { next(error); }
  });

  app.post('/api/auth/login', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
      const result = await authService.login(body);
      res.json({ token: result.token, user: { id: result.user.id, email: result.user.email } });
    } catch (error) { next(error); }
  });

  app.get('/api/auth/me', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await resolveUser(req);
      res.json({ id: user.id, email: user.email });
    } catch (error) { next(error); }
  });

  app.get('/api/voices', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await resolveUser(req);
      res.json(voiceService.listForUser(user.id));
    } catch (error) { next(error); }
  });

  app.post('/api/voices', upload.single('sample'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await resolveUser(req);
      const sample = req.file;
      if (!sample) throw new AppError(400, 'sample_required', 'Voice sample is required');
      const voice = voiceService.create({
        userId: user.id,
        name: String(req.body.name ?? ''),
        sample: sample.buffer,
        mimeType: sample.mimetype,
        consent: req.body.consent === 'true',
      });
      res.status(201).json(voice);
    } catch (error) { next(error); }
  });

  app.delete('/api/voices/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await resolveUser(req);
      if (!voiceService.remove(user.id, String(req.params.id ?? ''))) throw new AppError(404, 'voice_not_found', 'Voice not found');
      res.status(204).end();
    } catch (error) { next(error); }
  });

  app.get('/api/demo/voices', (_req: Request, res: Response) => res.json(demoVoices()));

  app.post('/api/demo/generate', (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z.object({ voiceId: z.string(), text: z.string(), speed: z.number().optional(), lineGapMs: z.number().optional() }).parse(req.body);
      const voice = demoVoices().find((entry) => entry.id === body.voiceId);
      if (!voice) throw new AppError(404, 'voice_not_found', 'Preset voice not found');
      const ownerKey = ipKey(req.ip ?? 'unknown');
      consume({ repo: usageRepo, key: ownerKey, chars: body.text.trim().length, limit: Number(process.env.DEMO_DAILY_LIMIT ?? 3) });
      const job = jobService.createForUser({ ...body, ownerKey, userId: null });
      res.status(202).json(publicJob(job));
    } catch (error) { next(error); }
  });

  app.get('/api/demo/jobs/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const job = jobRepo.findById(String(req.params.id ?? ''));
      if (!job || job.userId !== null || job.ownerKey !== ipKey(req.ip ?? 'unknown')) throw new AppError(404, 'job_not_found', 'Job not found');
      res.json(publicJob(job));
    } catch (error) { next(error); }
  });

  app.post('/api/jobs', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await resolveUser(req);
      const body = z.object({ voiceId: z.string(), text: z.string(), speed: z.number().optional(), lineGapMs: z.number().optional() }).parse(req.body);
      if (!voiceService.listForUser(user.id).some((voice) => voice.id === body.voiceId)) throw new AppError(404, 'voice_not_found', 'Voice not found');
      consume({ repo: usageRepo, key: `user:${user.id}`, chars: body.text.trim().length, limit: Number(process.env.USER_DAILY_LIMIT ?? 10) });
      const job = jobService.createForUser({ ...body, ownerKey: user.id, userId: user.id });
      res.status(202).json(publicJob(job));
    } catch (error) { next(error); }
  });

  app.get('/api/jobs', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await resolveUser(req);
      res.json(jobRepo.listForUser(user.id).map(publicJob));
    } catch (error) { next(error); }
  });

  app.get('/api/jobs/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await resolveUser(req);
      const job = jobRepo.findById(String(req.params.id ?? ''));
      if (!job || job.userId !== user.id) throw new AppError(404, 'job_not_found', 'Job not found');
      res.json(publicJob(job));
    } catch (error) { next(error); }
  });

  if (process.env.STORAGE !== 'cloudinary') app.use('/files', express.static(process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads')));
  void worker;

  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      error: {
        code: 'not_found',
        message: 'Route not found',
      },
    });
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof AppError) {
      return res.status(error.status).json({
        error: {
          code: error.code,
          message: error.message,
        },
      });
    }

    if (error instanceof ZodError) {
      return res.status(400).json({
        error: {
          code: 'validation_error',
          message: error.issues.map((issue) => issue.message).join(', '),
        },
      });
    }

    if (error instanceof multer.MulterError) {
      return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
        error: { code: 'upload_error', message: error.code === 'LIMIT_FILE_SIZE' ? 'Upload exceeds the 5MB limit' : 'Invalid upload' },
      });
    }

    if (error instanceof SyntaxError && 'body' in error) {
      return res.status(400).json({
        error: {
          code: 'invalid_json',
          message: 'Request body is not valid JSON',
        },
      });
    }

    const message = error instanceof Error ? error.message : 'Internal server error';

    return res.status(500).json({
      error: {
        code: 'internal_error',
        message,
      },
    });
  });

  return app;
}
