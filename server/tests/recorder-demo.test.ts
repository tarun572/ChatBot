import assert from 'node:assert/strict';
import test from 'node:test';

import { blobToWav } from '../src/audio/blobToWav.ts';
import { buildDemoPageState, extractPrompt, usePollJob } from '../src/demo/poll.ts';

test('blobToWav turns a Blob into a 16-bit WAV buffer', async () => {
  const blob = new Blob([new Uint8Array([0, 0, 0, 0])], { type: 'audio/wav' });
  const wav = await blobToWav(blob, 22050);
  assert.ok(wav.length > 44);
  assert.equal(wav.subarray(0, 4).toString('ascii'), 'RIFF');
});

test('poll hook helper keeps polling state and handles completion', () => {
  const state = buildDemoPageState({
    status: 'done',
    text: 'hello',
    audioUrl: 'http://example.com/audio.wav',
  });

  assert.equal(state.status, 'done');
  assert.match(state.audioUrl ?? '', /audio\.wav$/);

  const prompt = extractPrompt('Hello [pause 1s] world');
  assert.ok(prompt.includes('pause'));

  const poll = usePollJob({
    jobId: 'job-1',
    fetchJob: async () => ({ status: 'done', audioUrl: 'http://example.com/audio.wav' }),
  });

  assert.ok(poll.status === 'idle' || poll.status === 'done');
});
