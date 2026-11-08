import { randomUUID } from 'node:crypto';

import { AppError } from '../errors.ts';
import type { Voice } from '../types.ts';
import type { StorageProvider } from '../storage/storage.ts';

export type VoiceInput = {
  userId: string;
  name: string;
  sample: Buffer;
  mimeType: string;
  consent: boolean;
};

export type VoiceServiceDependencies = {
  voices: Map<string, Voice>;
  storage: StorageProvider;
  clock?: () => number;
};

export class VoiceService {
  private readonly voices: Map<string, Voice>;
  private readonly storage: StorageProvider;
  private readonly clock: () => number;

  constructor({ voices, storage, clock }: VoiceServiceDependencies) {
    this.voices = voices;
    this.storage = storage;
    this.clock = clock ?? (() => Date.now());
  }

  create(input: VoiceInput): Voice {
    if (!input.consent) {
      throw new AppError(400, 'consent_required', 'Consent is required to save a voice sample');
    }

    const trimmedName = input.name.trim();
    if (trimmedName.length < 1 || trimmedName.length > 60) {
      throw new AppError(400, 'invalid_name', 'Voice name must be between 1 and 60 characters');
    }

    if (!input.mimeType.startsWith('audio/')) {
      throw new AppError(400, 'invalid_mime_type', 'Voice sample must be audio');
    }

    if (input.sample.length > 5 * 1024 * 1024) {
      throw new AppError(400, 'file_too_large', 'Voice sample must be 5MB or smaller');
    }

    const now = new Date(this.clock()).toISOString();
    const key = `voices/${input.userId}/${randomUUID()}.wav`;
    const saved = this.storage.save(key, input.sample, input.mimeType);

    const voice: Voice = {
      id: randomUUID(),
      userId: input.userId,
      name: trimmedName,
      sampleUrl: saved.url,
      samplePublicId: saved.publicId,
      presetVoiceId: null,
      isPreset: false,
      consentAt: now,
      createdAt: now,
    };

    this.voices.set(voice.id, voice);
    return { ...voice };
  }

  listForUser(userId: string): Voice[] {
    return Array.from(this.voices.values())
      .filter((voice) => voice.userId === userId || voice.isPreset)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  remove(userId: string, voiceId: string): boolean {
    const voice = this.voices.get(voiceId);
    if (!voice) {
      return false;
    }

    if (voice.userId !== userId || voice.isPreset) {
      return false;
    }

    this.storage.remove(voice.samplePublicId ?? '');
    this.voices.delete(voiceId);
    return true;
  }
}
