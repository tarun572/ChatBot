export function encodeWav(samples: Buffer, channels: number, sampleRate: number, bitDepth: number): Buffer {
  const blockAlign = channels * (bitDepth / 8);
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitDepth, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataSize, 40);

  samples.copy(buffer, 44);
  return buffer;
}

export function parseWav(buffer: Buffer): { channels: number; sampleRate: number; bitDepth: number; samples: Buffer } {
  if (buffer.length < 44 || buffer.subarray(0, 4).toString('ascii') !== 'RIFF' || buffer.subarray(8, 12).toString('ascii') !== 'WAVE') {
    throw new Error('Invalid WAV file');
  }

  let offset = 12;
  let channels = 0;
  let sampleRate = 0;
  let bitDepth = 0;
  let samples: Buffer | null = null;
  while (offset + 8 <= buffer.length) {
    const name = buffer.subarray(offset, offset + 4).toString('ascii');
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > buffer.length) throw new Error('Invalid WAV chunk size');
    if (name === 'fmt ' && size >= 16) {
      if (buffer.readUInt16LE(start) !== 1) throw new Error('Only PCM WAV is supported');
      channels = buffer.readUInt16LE(start + 2);
      sampleRate = buffer.readUInt32LE(start + 4);
      bitDepth = buffer.readUInt16LE(start + 14);
    }
    if (name === 'data') samples = buffer.subarray(start, start + size);
    offset = start + size + (size % 2);
  }
  if (!channels || !sampleRate || !bitDepth || !samples) throw new Error('WAV is missing PCM format or data');

  return {
    channels,
    sampleRate,
    bitDepth,
    samples,
  };
}

export function joinWav(items: Array<{ wav: Buffer } | { silenceMs: number }>): Buffer {
  const first = items.find((item): item is { wav: Buffer } => 'wav' in item);
  if (!first) return encodeWav(Buffer.alloc(0), 1, 16000, 16);
  const format = parseWav(first.wav);
  const chunks: Buffer[] = [];
  for (const item of items) {
    if ('silenceMs' in item) {
      const frameBytes = format.channels * (format.bitDepth / 8);
      chunks.push(Buffer.alloc(Math.ceil(item.silenceMs * format.sampleRate / 1000) * frameBytes));
      continue;
    }
    const parsed = parseWav(item.wav);
    if (parsed.channels !== format.channels || parsed.sampleRate !== format.sampleRate || parsed.bitDepth !== format.bitDepth) {
      throw new Error('WAV format mismatch');
    }
    chunks.push(parsed.samples);
  }
  return encodeWav(Buffer.concat(chunks), format.channels, format.sampleRate, format.bitDepth);
}
