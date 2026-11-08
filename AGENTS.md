# AGENTS.md - VerseVoice

Work protocol: do ONE step per request. Run tests. Reply in <=5 lines (files changed, test result, next step). Don't echo files back. Ask only if blocked. Don't edit outside the step.

## Goal
Free-tier web app: user records a voice sample once, pastes a poem, gets audio in that voice. Public no-signup demo uses a preset voice.

## Stack
- client: React 18, Vite, TS, Redux Toolkit
- server: Node 22, Express, TS (ESM, run with tsx, imports end in `.ts`)
- db: MongoDB (Mongoose) + in-memory mode (`DB_MODE=memory|mongo`)
- files: Cloudinary + local disk (`STORAGE=local|cloudinary`)
- tts-service: Python FastAPI (Hugging Face Docker Space)
- tests: node:test (server), unittest (python). CI: GitHub Actions

## Rules
- Layers: routes -> services -> repos/providers. Services depend on interfaces, injected via constructor.
- TS: no enum, no ctor param props, `import type` for types.
- Small pure functions; inject clock and fetch for tests.
- Secrets via env only, never logged. Validate input (zod in routes).
- Errors: `AppError(status, code, message)` -> `{error:{code,message}}`.
- Every step ships tests. Free tiers only; caps enforced in code.

## Layout
```
server/src: config.ts errors.ts types.ts app.ts index.ts
  middleware/ routes/ services/ repos/{memory,mongo}.ts
  providers/{tts,mockTts,cloudTts,xttsTts,selector}.ts
  storage/{storage,diskStorage,cloudinaryStorage}.ts
  security/{passwords,jwtSigner}.ts  worker/{textPrep,wav,jobWorker}.ts
server/tests/*.test.ts
client/src: api.ts audio.ts types.ts store/ hooks/ components/ pages/
tts-service/: tts_core.py engines.py main.py Dockerfile tests
.github/workflows/ci.yml
```

## Contracts
```
Job{id,ownerKey,userId|null,voiceId,text,options{speed,lineGapMs},status:queued|processing|done|failed,
    attempts,error,provider,audioUrl,audioPublicId,lockedAt,createdAt,finishedAt,expiresAt}
Voice{id,userId|null,name,sampleUrl,samplePublicId,presetVoiceId,isPreset,consentAt,createdAt}
JobRepo: create findById listForUser claimNext(now)[atomic: oldest queued->processing, attempts+1]
  markDone markRetryOrFail(id,err,max)[queued if attempts<max else failed] resetStale(olderThan,max)
  findExpired(now) delete
UsageRepo: increment(key,date,chars,delta)->record
StorageProvider: save(key,buf,contentType)->{url,publicId}; remove(publicId)
TTSProvider: name; synthesize({text,voiceSampleUrl,presetVoiceId,speed})->Buffer (always PCM WAV)
Segment: {kind:'text',text}|{kind:'pause',ms}
```

## API
```
GET  /api/health
POST /api/auth/register|login   GET /api/auth/me
GET|POST /api/voices (multipart: sample,name,consent)   DELETE /api/voices/:id
POST /api/jobs ->202  GET /api/jobs  GET|DELETE /api/jobs/:id        (Bearer JWT)
POST /api/demo/generate ->202  GET /api/demo/jobs/:id  GET /api/demo/voices   (no auth, IP-keyed)
```

## Env
`PORT CLIENT_ORIGIN JWT_SECRET DB_MODE MONGODB_URI STORAGE PUBLIC_BASE_URL UPLOAD_DIR CLOUDINARY_{CLOUD_NAME,API_KEY,API_SECRET}
TTS_PROVIDER=mock|cloud|xtts|auto CLOUD_TTS_API_KEY XTTS_SERVICE_URL XTTS_API_KEY XTTS_LANGUAGE PRESET_VOICES="Name:id,..."
DEMO_DAILY_LIMIT=3 USER_DAILY_LIMIT=10 DEMO_MAX_CHARS=500 USER_MAX_CHARS=2000 GLOBAL_DAILY_CLOUD_CAP=30
JOB_TTL_DAYS=7 WORKER_INTERVAL_MS=2000 MAX_ATTEMPTS=3 STALE_AFTER_MS=300000 RUN_WORKER=true`
Client: `VITE_API_URL`. TTS service: `API_KEY TTS_ENGINE=dummy|xtts ALLOWED_SAMPLE_HOSTS`.

## Steps (say "do step N")

**0 Skeleton.** Monorepo, git, .gitignore, package.json (scripts dev/start/test=`tsx --test "tests/*.test.ts"`/typecheck), tsconfig (allowImportingTsExtensions, noEmit, strict, verbatimModuleSyntax). `loadConfig(env)` pure; collects ALL errors; rejects default JWT secret in production. `createApp(deps)`: helmet (CORP cross-origin), cors allow-list, json 100kb, rate limit 120/min, /api/health, 404, central error handler (AppError, ZodError, multer size). Done: server runs, config tests pass.

**1 Types+repos.** types.ts per Contracts. repos/memory.ts (Maps, randomUUID, return copies). repos/mongo.ts (Mongoose; claimNext=findOneAndUpdate sort createdAt; resetStale=updateMany pipeline; usage=upsert $inc). Tests (memory): claim order, retry vs fail, stale reset.

**2 Auth.** scrypt hasher (random salt, timingSafeEqual). JwtSigner (sub=userId, 7d; verify->id|null). AuthService(register: valid email, pw>=8, dup->409; login: same generic 401; me; authenticate). requireAuth (Bearer -> req.userId). Fakes for tests.

**3 Storage+voices.** diskStorage (UPLOAD_DIR, block `..`, url=PUBLIC_BASE_URL/files/path). cloudinaryStorage (upload_stream, resource_type 'video', destroy). VoiceService: create (consent true, name 1-60, mime audio/*, <=5MB, key voices/<userId>/<uuid>), list (own+presets), remove (owner only, not presets, delete file), ensurePresets (idempotent). multer memory, field `sample`. Serve /files only if STORAGE=local.

**4 Quota.** consume(key,kind,chars): 400 if empty/too long; increment(+1); if count>limit -> increment(-1), 429. tryConsumeGlobalCloud(): key `global:cloud`, same pattern, returns bool. UTC date, injectable clock. ipKey(ip)=`ip:`+sha256[0..16].

**5 Jobs+demo.** createForUser (voice own or preset else 404; quota; options: speed clamp 0.7-1.3 def 1, lineGapMs clamp 0-2000 def 350; expiresAt=now+TTL). createDemo (preset voices only). getOwned(ownerKey,id) else 404. listForUser paged. remove deletes audio. toPublicJob hides ownerKey/lockedAt/audioPublicId.

**6 textPrep+wav.** `prepareText(raw,{lineGapMs,stanzaGapMs=2x,maxChunk=250,maxPauseMs=5000})`: newline->pause lineGap; blank line->stanzaGap; `[pause 1s|500ms]`->pause; merge pauses (cap); trim leading/trailing pauses; split long text at `. ! ? ।` then words. wav.ts: encodeWav, parseWav (RIFF chunks, PCM only), silence, joinWav(items) (throw on format mismatch).

**7 Providers.** mock: sine beep per word (no accounts needed). cloud: ElevenLabs-style TTS for preset voice id, request raw 16kHz PCM, wrap in WAV (verify current docs + free-plan rules). xtts: POST `{text,speaker_wav_url,language,speed}` to `XTTS_SERVICE_URL/synthesize`, header X-API-KEY, timeout. Injectable fetch. selector(mode): mock|cloud|xtts fixed; auto = preset->cloud while global cap allows else throw; cloned->xtts else throw 'cloning not configured'.

**8 Worker.** `tick()`: claimNext -> voice -> provider -> prepareText -> synthesize text segments -> joinWav -> storage.save(`audio/<id>`) -> markDone; any error -> markRetryOrFail. `sweep()`: resetStale, delete expired jobs+audio. `start(ms)`: setInterval, busy flag (no overlap), drain queue; `stop()`. Boot from index.ts if RUN_WORKER. Tests: success->valid WAV, retries then failed, stale, expired.

**9 API tests.** node:test + built-in fetch, port 0, memory repos, temp local storage, mock provider, fake signer. Cover: health, auth flow, 401, voice upload+job+tick+audio fetch, demo 4th call 429, no-consent 400.

**10 Client base.** Vite config, api.ts (VITE_API_URL, Bearer, JSON/FormData, ApiError with "server may be waking up" message), authSlice (token in localStorage; login/register/restore/logout), studioSlice (voices, jobs thunks), types.ts.

**11 Recorder.** `blobToWav(blob,22050)`: AudioContext decode -> OfflineAudioContext mono resample -> 16-bit WAV. Recorder component: MediaRecorder, timer, auto-stop 60s, preview, read-aloud passage, permission-denied message, file picker alternative.

**12 Demo page.** `usePollJob(jobId,fetchJob)`: 1.5s start, backoff to 5s, stop on done/failed, cleanup, fetchJob in ref. PoemEditor (counter, insert `[pause 1s]`, line-gap slider), JobResult (status, audio, download, error). DemoPage: sample original poem, preset voice, 429 message.

**13 Studio.** AuthPage, StudioPage (My Voices: list/delete/create with mandatory consent checkbox "This is my own voice" + Recorder; New Voice-Over; History), App header (email, logout). One styles.css, mobile-friendly.

**14 TTS service.** tts_core.py (stdlib only): check_api_key (hmac.compare_digest), is_allowed_url (http/https, host == or subdomain of allow-list, deny if empty), dummy_wav, download_sample (size cap, timeout). engines.XttsEngine (lazy load XTTS v2; model licence is non-commercial). main.py FastAPI: /health, POST /synthesize (X-API-KEY, validate, lock around model, audio/wav). Dockerfile (port 7860), requirements(+xtts), Space README front matter, unittest.

**15 CI.** Jobs: server (Node 22: install, typecheck, test), client (install, build), tts-service (Python 3.12: `unittest discover`). Use `npm install` until lockfiles are committed, then `npm ci`.

**16 Deploy docs.** Atlas (free cluster, user, network access, URI), Cloudinary, HF Space (secrets API_KEY, ALLOWED_SAMPLE_HOSTS), Render (root server, NODE_VERSION=22, start `npm start`, env), Vercel (root client, VITE_API_URL). Smoke checklist, cold-start note, "verify current free limits".

**17 README.** Problem, demo link, features, Mermaid architecture, stack, run locally (mock mode), tests, env table, design trade-offs, limitations, 3 resume bullets.

## Done-checks (every step)
Tests pass; typecheck clean; no secrets in code; one commit `step N: <what>`.
