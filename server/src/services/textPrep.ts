export type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'pause'; ms: number };

export type PrepareTextOptions = {
  lineGapMs?: number;
  stanzaGapMs?: number;
  maxChunk?: number;
  maxPauseMs?: number;
};

const PAUSE_PATTERN = /\[(?:pause|Pause)\s+(\d+(?:\.\d+)?)\s*(ms|s)?\]/gi;

function parsePauseValue(raw: string): number {
  const match = raw.trim().toLowerCase();
  if (match.endsWith('ms')) {
    return Number.parseFloat(match.slice(0, -2));
  }
  if (match.endsWith('s')) {
    return Number.parseFloat(match.slice(0, -1)) * 1000;
  }
  return Number.parseFloat(match);
}

export function prepareText(raw: string, options: PrepareTextOptions = {}): Segment[] {
  const lineGapMs = options.lineGapMs ?? 350;
  const stanzaGapMs = options.stanzaGapMs ?? lineGapMs * 2;
  const maxPauseMs = options.maxPauseMs ?? 5000;
  const text = raw.trim();

  const segments: Segment[] = [];
  let working = text.replace(/\r/g, '');
  working = working.replace(/\n{2,}/g, `\n\n`);

  const pauseRegex = /\[(?:pause|Pause)\s+([^\]]+)\]/gi;
  const chunks: string[] = [];
  let lastIndex = 0;

  for (const match of working.matchAll(pauseRegex)) {
    const start = match.index ?? 0;
    const before = working.slice(lastIndex, start);
    if (before.trim()) {
      chunks.push(before);
    }

    const value = match[1] ?? '0';
    const ms = Math.min(Math.max(parsePauseValue(value), 0), maxPauseMs);
    chunks.push(`__PAUSE__:${ms}`);
    lastIndex = start + match[0].length;
  }

  const trailing = working.slice(lastIndex);
  if (trailing.trim()) {
    chunks.push(trailing);
  }

  for (const chunk of chunks) {
    if (chunk.startsWith('__PAUSE__:')) {
      const ms = Number.parseInt(chunk.split(':')[1] ?? '0', 10);
      if (ms > 0) {
        segments.push({ kind: 'pause', ms });
      }
      continue;
    }

    const lines = chunk.split(/\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i].trim();
      if (!line) {
        if (i < lines.length - 1) {
          segments.push({ kind: 'pause', ms: stanzaGapMs });
        }
        continue;
      }

      segments.push({ kind: 'text', text: line });

      if (i < lines.length - 1) {
        segments.push({ kind: 'pause', ms: lineGapMs });
      }
    }
  }

  const merged: Segment[] = [];
  for (const segment of segments) {
    if (segment.kind === 'pause' && merged.length > 0 && merged[merged.length - 1].kind === 'pause') {
      merged[merged.length - 1] = {
        kind: 'pause',
        ms: Math.min((merged[merged.length - 1] as { kind: 'pause'; ms: number }).ms + segment.ms, maxPauseMs),
      };
      continue;
    }

    merged.push(segment);
  }

  return merged.filter((segment) => !(segment.kind === 'pause' && segment.ms <= 0));
}
