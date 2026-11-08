export type TtsRequest = {
  text: string;
  voiceSampleUrl?: string | null;
  language?: string;
};

export class TtsCore {
  apiKey: string;
  allowedHosts: string[];

  constructor({ apiKey, allowedHosts }: { apiKey: string; allowedHosts: string[] }) {
    this.apiKey = apiKey;
    this.allowedHosts = allowedHosts;
  }

  synthesize({ text, voiceSampleUrl }: TtsRequest): Buffer {
    if (!text.trim()) {
      return Buffer.alloc(0);
    }

    if (voiceSampleUrl && !isAllowedUrl(voiceSampleUrl, this.allowedHosts)) {
      throw new Error('Voice sample URL is not allowed');
    }

    return createDummyWav();
  }
}

export function createDummyWav(): Buffer {
  return Buffer.from('RIFFWAVE', 'ascii');
}

export function isAllowedUrl(url: string, allowedHosts: string[]): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return allowedHosts.some((allowed) => host === allowed.toLowerCase() || host.endsWith(`.${allowed.toLowerCase()}`));
  } catch {
    return false;
  }
}
