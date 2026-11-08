import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { DiskStorage } from '../src/storage/diskStorage.ts';
import { VoiceService } from '../src/services/voice.ts';

test('disk storage saves files under the upload directory and exposes a public URL', () => {
  const uploadDir = mkdtempSync(path.join(tmpdir(), 'versevoice-'));
  const storage = new DiskStorage({ uploadDir, publicBaseUrl: 'http://localhost:3000' });

  const saved = storage.save('voices/u1/sample.wav', Buffer.from('hello world'), 'audio/wav');

  assert.equal(saved.publicId, 'voices/u1/sample.wav');
  assert.match(saved.url, /http:\/\/localhost:3000\/files\/voices\/u1\/sample\.wav$/);
  assert.equal(readFileSync(path.join(uploadDir, 'voices', 'u1', 'sample.wav'), 'utf8'), 'hello world');
});

test('voice service creates, lists, and removes user voices', async () => {
  const service = new VoiceService({
    voices: new Map(),
    storage: new DiskStorage({ uploadDir: mkdtempSync(path.join(tmpdir(), 'versevoice-voices-')), publicBaseUrl: 'http://localhost:3000' }),
    clock: () => Date.now(),
  });

  const voice = await service.create({
    userId: 'user-1',
    name: 'My Sample',
    sample: Buffer.from('voice-data'),
    mimeType: 'audio/wav',
    consent: true,
  });

  assert.equal(voice.userId, 'user-1');
  assert.equal(voice.name, 'My Sample');
  assert.equal(service.listForUser('user-1').length, 1);
  assert.equal(service.remove('user-1', voice.id), true);
  assert.equal(service.listForUser('user-1').length, 0);
});
