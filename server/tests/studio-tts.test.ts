import assert from 'node:assert/strict';
import test from 'node:test';

import { createStudioState, renderStudioSummary } from '../src/studio/studio.ts';
import type { StudioSession } from '../src/studio/studio.ts';
import { TtsCore, createDummyWav, isAllowedUrl } from '../src/tts/ttsCore.ts';

test('studio state can track user session and voice list', () => {
  const state = createStudioState({
    user: { id: 'u1', email: 'a@example.com' },
    voices: [{ id: 'v1', name: 'Voice A', isPreset: false }],
  });

  assert.equal(state.user.email, 'a@example.com');
  assert.equal(state.voices.length, 1);
  assert.equal(renderStudioSummary(state), '1 voices');
});

test('tts core validates sample URLs and outputs dummy wav', () => {
  assert.equal(isAllowedUrl('https://example.com/sample.wav', ['example.com']), true);
  assert.equal(isAllowedUrl('https://evil.com/x.wav', ['example.com']), false);

  const wav = createDummyWav();
  assert.ok(wav.length > 0);

  const core = new TtsCore({ apiKey: 'secret', allowedHosts: ['example.com'] });
  const result = core.synthesize({ text: 'hello', voiceSampleUrl: 'https://example.com/sample.wav' });
  assert.ok(result.length > 0);
});
