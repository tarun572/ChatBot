export async function blobToWav(blob: Blob, sampleRate = 22050): Promise<Buffer> {
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = Buffer.from(arrayBuffer);

  if (bytes.length === 0) {
    return Buffer.alloc(44, 0);
  }

  const channels = 1;
  const bitDepth = 16;
  const blockAlign = channels * (bitDepth / 8);
  const byteRate = sampleRate * blockAlign;
  const dataSize = bytes.length;
  const wav = Buffer.alloc(44 + dataSize);

  wav.write('RIFF', 0, 'ascii');
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write('WAVE', 8, 'ascii');
  wav.write('fmt ', 12, 'ascii');
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(channels, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(byteRate, 28);
  wav.writeUInt16LE(blockAlign, 32);
  wav.writeUInt16LE(bitDepth, 34);
  wav.write('data', 36, 'ascii');
  wav.writeUInt32LE(dataSize, 40);

  bytes.copy(wav, 44);
  return wav;
}
