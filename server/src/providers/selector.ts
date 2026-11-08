import { AppError } from '../errors.ts';
import { encodeWav } from '../worker/wav.ts';
import type { TtsProvider, TtsRequest } from './tts.ts';

export class MockTtsProvider implements TtsProvider {
  name = 'mock';

  synthesize({ text }: TtsRequest): Buffer {
    const words = text.trim().split(/\s+/).filter(Boolean);
    const samples: number[] = [];

    for (const word of words) {
      const tone = Math.max(100, (word.length * 70) % 400);
      for (let i = 0; i < 120; i += 1) {
        const value = Math.sin((i / 10) * (tone / 100)) * 12000;
        samples.push(Math.max(-32768, Math.min(32767, Math.round(value))));
      }
    }

    const pcm = Buffer.alloc(samples.length * 2);
    samples.forEach((sample, index) => pcm.writeInt16LE(sample, index * 2));
    return encodeWav(pcm, 1, 16000, 16);
  }
}

export type FetchFunction = typeof fetch;

export class CloudTtsProvider implements TtsProvider {
  name = 'cloud';

  constructor(private readonly apiKey: string, private readonly fetchImpl: FetchFunction = fetch, private readonly timeoutMs = 30000) {}

  async synthesize({ text, presetVoiceId, speed = 1 }: TtsRequest): Promise<Buffer> {
    if (!this.apiKey || !presetVoiceId) throw new AppError(400, 'provider_input_missing', 'Cloud TTS requires an API key and preset voice');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(presetVoiceId)}?output_format=pcm_16000`, {
        method: 'POST',
        headers: { 'xi-api-key': this.apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: { speed } }),
        signal: controller.signal,
      });
      if (!response.ok) throw new AppError(502, 'cloud_tts_failed', `Cloud TTS returned HTTP ${response.status}`);
      return encodeWav(Buffer.from(await response.arrayBuffer()), 1, 16000, 16);
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class XttsProvider implements TtsProvider {
  name = 'xtts';

  constructor(private readonly serviceUrl: string, private readonly apiKey: string, private readonly language = 'en', private readonly fetchImpl: FetchFunction = fetch, private readonly timeoutMs = 60000) {}

  async synthesize({ text, voiceSampleUrl, speed = 1 }: TtsRequest): Promise<Buffer> {
    if (!this.serviceUrl || !this.apiKey || !voiceSampleUrl) throw new AppError(400, 'provider_input_missing', 'XTTS requires a service URL, API key, and voice sample');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.serviceUrl.replace(/\/$/, '')}/synthesize`, {
        method: 'POST',
        headers: { 'X-API-KEY': this.apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({ text, speaker_wav_url: voiceSampleUrl, language: this.language, speed }),
        signal: controller.signal,
      });
      if (!response.ok) throw new AppError(502, 'xtts_failed', `XTTS service returned HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createMockTtsProvider(): TtsProvider {
  return new MockTtsProvider();
}

export type SelectorOptions = {
  provider: 'mock' | 'cloud' | 'xtts' | 'auto';
  cloudApiKey?: string;
  xttsServiceUrl?: string;
  xttsApiKey?: string;
  language?: string;
  fetchImpl?: FetchFunction;
};

export function createSelector(options: SelectorOptions): TtsProvider {
  if (options.provider === 'mock' || options.provider === 'auto') {
    return createMockTtsProvider();
  }
  if (options.provider === 'cloud') return new CloudTtsProvider(options.cloudApiKey ?? '', options.fetchImpl);
  return new XttsProvider(options.xttsServiceUrl ?? '', options.xttsApiKey ?? '', options.language, options.fetchImpl);
}
